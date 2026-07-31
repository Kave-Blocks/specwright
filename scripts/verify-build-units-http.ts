/**
 * Proves build-unit behaviour at the **HTTP layer**, against a locally running
 * dev server, for the three checks unit 38 could only prove at the database
 * layer (see `context/progress/38-build-units.md` → "Not Verified (by Layer)").
 *
 * What a passing run proves:
 * - `concurrent`: N real `POST /api/projects/{id}/build-units` requests, issued
 *   in parallel over the network, each answer 201 with a distinct, contiguous
 *   `sequence`, and the project's `nextBuildUnitSequence` — read back through
 *   the API, not the database — advanced by exactly N. That is the `Project`
 *   row lock in `createBuildUnit` holding *through the route*, not just when
 *   the lib is called directly from a script.
 * - `cross-project`: a unit id belonging to project B is unreachable through
 *   project A's path even for a genuine member of A, and — the part that
 *   actually matters — B's row is byte-identical afterwards, `updatedAt`
 *   included. A 404 paired with a successful write is the bug worth catching,
 *   and only re-reading the row proves its absence.
 * - `collaborator`: a non-owner project member can exercise all four verbs,
 *   and gets 404 (never 403, never 200) on a project they were never invited
 *   to. This is the one gap that genuinely needs a second Clerk account.
 *
 * What a passing run does **not** prove:
 * - Anything about the browser. No React, no hook, no optimistic/pessimistic
 *   state, no focus behaviour. Those are `browser-qa` territory.
 * - Anything about the *unauthenticated* paths (401/405), which unit 38
 *   already exercised with plain curl.
 * - The cap branch (409 at `MAX_BUILD_UNITS`), duplicate titles, boundary
 *   normalization, or the 400 messages. Those are separate checks; this script
 *   is deliberately narrow.
 * - That the app is correct for *cookie-borne* browser sessions specifically,
 *   if it ran in `bearer` mode. The run prints which auth transport worked —
 *   read that line, it is a finding in its own right.
 *
 * Auth. There is no browser here, so a short-lived Clerk session token is
 * minted through the Clerk Backend API (endpoint shapes below cross-checked
 * against the installed `@clerk/backend@3.11.1` client, which is the authority
 * for the BAPI version this app talks to):
 *   GET  /v1/users?email_address=<email>              -> the user
 *   GET  /v1/sessions?user_id=<id>&status=active      -> an active session
 *   POST /v1/sessions/<session_id>/tokens             -> { jwt }
 * Tokens live ~60s, so they are minted per phase and re-minted once on a 401
 * rather than counted as a failure. `CLERK_SECRET_KEY` is read from the
 * environment only — never from an argument — and is never printed, logged, or
 * interpolated into an error.
 *
 * Data safety. Every project this script touches is one it created, named with
 * the `verify-build-units-` prefix, and deleted in a `finally` — including on
 * failure. Nothing pre-existing is mutated or read. Throwaways are mandatory
 * rather than polite: concurrent creates permanently burn sequence numbers,
 * because `deleteBuildUnit` deliberately does not roll the counter back.
 *
 * Usage (from the repo root, with `npm run dev` already running):
 *   npm run verify:build-units -- concurrent
 *   npm run verify:build-units -- concurrent --count=12
 *   npm run verify:build-units -- cross-project
 *   npm run verify:build-units -- collaborator --collaborator-email=b@example.com
 *   npm run verify:build-units -- all
 *
 * Environment:
 *   CLERK_SECRET_KEY              required, from .env.local or .env
 *   VERIFY_OWNER_EMAIL            required, the signed-in account to act as
 *   VERIFY_COLLABORATOR_EMAIL     optional, the second account
 *   VERIFY_BASE_URL               optional, defaults to http://localhost:3000
 *
 * Exits non-zero if any assertion fails.
 */
import { config } from "dotenv";

import type { BuildUnitSummary } from "../types/build-units";

config({ path: ".env.local" });
config({ path: ".env" });

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

const BASE_URL = (
  process.env.VERIFY_BASE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

const CLERK_API = "https://api.clerk.com/v1";

/**
 * The BAPI version `@clerk/backend@3.11.1` pins (`SUPPORTED_BAPI_VERSION`).
 * Sent explicitly so the response shapes this script parses are the same ones
 * the app's own Clerk client is built against, rather than whatever the
 * instance's default version happens to be.
 */
const CLERK_API_VERSION = "2026-05-12";

/** Every project this script creates carries this prefix. Nothing else is touched. */
const PROJECT_PREFIX = "verify-build-units-";

/**
 * Concurrent creates fired at one project. Eight matches unit 38's
 * database-layer stress test, so the two runs are directly comparable, and it
 * sits far under `MAX_BUILD_UNITS` (200, in `lib/build-units.ts`) — that
 * constant is not imported because importing it would drag the Prisma client
 * into a script that is meant to speak only HTTP.
 */
const DEFAULT_CONCURRENT_CREATES = 8;
const MAX_CONCURRENT_CREATES = 50;

/** Re-mint a token rather than risk Clerk's ~60s lifetime expiring mid-phase. */
const TOKEN_REUSE_MS = 30_000;

/* -------------------------------------------------------------------------- */
/* Output                                                                      */
/* -------------------------------------------------------------------------- */

let failures = 0;
let skipped = 0;

function section(title: string): void {
  console.log(`\n--- ${title} ${"-".repeat(Math.max(0, 60 - title.length))}`);
}

/**
 * Record one assertion. The observed value is always printed, pass or fail —
 * a verdict alone is not evidence, and the point of this unit is output that
 * can be pasted into `context/progress/` as proof.
 */
function check(passed: boolean, label: string, observed: string): boolean {
  console.log(`[${passed ? "PASS" : "FAIL"}] ${label}`);
  console.log(`        observed: ${observed}`);
  if (!passed) failures += 1;
  return passed;
}

/** A check that could not run, reported as its own outcome rather than a pass. */
function skip(label: string, why: string): void {
  console.log(`[SKIP] ${label}`);
  console.log(`        reason:   ${why}`);
  skipped += 1;
}

function info(message: string): void {
  console.log(`        ${message}`);
}

/* -------------------------------------------------------------------------- */
/* Clerk Backend API                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A Clerk-authenticated identity plus its cached token.
 *
 * `sessionId` is resolved once; the JWT is re-minted from it whenever the cache
 * is stale or a route answers 401.
 */
interface Account {
  label: string;
  email: string;
  userId: string;
  sessionId: string;
  token: string | null;
  tokenMintedAt: number;
}

/** Read the secret. Never accepted as an argument, never echoed. */
function requireClerkSecret(): string {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "CLERK_SECRET_KEY is not set. Put it in .env.local (or .env) at the repo root; it is never read from the command line.",
    );
  }
  return secret;
}

/**
 * Call the Clerk Backend API. Failures report the method, path, and status —
 * deliberately never the credential, which exists only inside the header here.
 */
async function clerkRequest(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(`${CLERK_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${requireClerkSecret()}`,
      "Clerk-API-Version": CLERK_API_VERSION,
      // Always sent, even bodyless — `@clerk/backend` does the same, and the
      // API answers 415 to a POST that arrives without it.
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    throw new Error(
      `Clerk Backend API ${method} ${path} answered ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

/**
 * Clerk list endpoints answer either a bare array or `{ data, total_count }`
 * depending on endpoint and API version — `deserialize` in `@clerk/backend`
 * handles both, so this does too rather than guessing.
 */
function listOf(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload as Record<string, unknown>[];
  }
  if (
    typeof payload === "object" &&
    payload !== null &&
    "data" in payload &&
    Array.isArray((payload as { data: unknown }).data)
  ) {
    return (payload as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

function stringField(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Resolve an email to a Clerk user with a live session.
 *
 * "No active session" is raised as exactly that, rather than being left to
 * surface later as a confusing 404 from the app: an account nobody has signed
 * in as recently simply cannot be impersonated this way.
 */
async function resolveAccount(label: string, email: string): Promise<Account> {
  const users = listOf(
    await clerkRequest(
      "GET",
      `/users?email_address=${encodeURIComponent(email)}&limit=10`,
    ),
  );

  const userId = users.map((user) => stringField(user, "id")).find(Boolean);
  if (!userId) {
    throw new Error(
      `No Clerk user has the email address ${email}. Sign up that account first, then re-run.`,
    );
  }

  const sessions = listOf(
    await clerkRequest(
      "GET",
      `/sessions?user_id=${encodeURIComponent(userId)}&status=active&paginated=true&limit=10`,
    ),
  );

  const sessionId = sessions
    .map((session) => stringField(session, "id"))
    .find(Boolean);
  if (!sessionId) {
    throw new Error(
      `No active Clerk session for ${email}. Sign in as that account at ${BASE_URL} in a browser, then re-run — this script can only borrow a session that already exists.`,
    );
  }

  return {
    label,
    email,
    userId,
    sessionId,
    token: null,
    tokenMintedAt: 0,
  };
}

/** Mint a fresh session JWT. `POST /v1/sessions/{id}/tokens` answers `{ jwt }`. */
async function mintToken(account: Account): Promise<string> {
  const payload = await clerkRequest(
    "POST",
    `/sessions/${encodeURIComponent(account.sessionId)}/tokens`,
  );
  const jwt =
    typeof payload === "object" && payload !== null
      ? stringField(payload as Record<string, unknown>, "jwt")
      : null;

  if (!jwt) {
    throw new Error(
      `Clerk returned no jwt when minting a token for ${account.email}`,
    );
  }

  account.token = jwt;
  account.tokenMintedAt = Date.now();
  return jwt;
}

/** The cached token, re-minted when stale or when `force` is set (after a 401). */
async function tokenFor(account: Account, force = false): Promise<string> {
  if (
    !force &&
    account.token &&
    Date.now() - account.tokenMintedAt < TOKEN_REUSE_MS
  ) {
    return account.token;
  }
  return mintToken(account);
}

/* -------------------------------------------------------------------------- */
/* App API                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * How the app accepts a session token outside a browser.
 *
 * Resolved by probing once, because which one works is itself a finding: the
 * app's `auth()` may accept an `Authorization: Bearer` header, or it may only
 * recognize the `__session` cookie a browser would send.
 */
type AuthMode = "bearer" | "cookie";

let authMode: AuthMode | null = null;

function authHeaders(jwt: string): Record<string, string> {
  return authMode === "cookie"
    ? { Cookie: `__session=${jwt}` }
    : { Authorization: `Bearer ${jwt}` };
}

interface ApiResponse {
  status: number;
  body: unknown;
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * One authenticated request against the app. A 401 is treated as an expired
 * token — re-mint once and retry — rather than a test failure, since Clerk
 * session tokens are short-lived by design. The request is rebuilt from
 * `(method, path, body)` on the retry so no consumed body is re-sent.
 */
async function api(
  account: Account,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse> {
  const send = async (jwt: string): Promise<Response> =>
    fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...authHeaders(jwt),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "manual",
    });

  let response = await send(await tokenFor(account));
  if (response.status === 401) {
    response = await send(await tokenFor(account, true));
  }

  return { status: response.status, body: await readBody(response) };
}

/**
 * Decide the auth transport by trying `Authorization: Bearer` first and falling
 * back to the `__session` cookie. Both failing means the token is not being
 * accepted at all, which is a hard stop rather than a per-check failure.
 */
async function resolveAuthMode(account: Account): Promise<void> {
  const probe = async (mode: AuthMode): Promise<number> => {
    authMode = mode;
    const { status } = await api(account, "GET", "/api/projects");
    return status;
  };

  const bearerStatus = await probe("bearer");
  if (bearerStatus === 200) {
    authMode = "bearer";
    info(`auth transport: Authorization: Bearer <jwt> (GET /api/projects 200)`);
    return;
  }

  const cookieStatus = await probe("cookie");
  if (cookieStatus === 200) {
    authMode = "cookie";
    info(
      `auth transport: Cookie: __session=<jwt> (Bearer answered ${bearerStatus}, cookie 200)`,
    );
    return;
  }

  authMode = null;
  throw new Error(
    `Neither transport authenticated against ${BASE_URL}: Bearer header -> ${bearerStatus}, __session cookie -> ${cookieStatus}. Is the dev server running, and is CLERK_SECRET_KEY from the same instance the app is configured with?`,
  );
}

/* -------------------------------------------------------------------------- */
/* Body readers                                                                */
/* -------------------------------------------------------------------------- */

function unitFrom(body: unknown): BuildUnitSummary | null {
  if (typeof body !== "object" || body === null || !("unit" in body)) {
    return null;
  }
  const unit = (body as { unit: unknown }).unit;
  return typeof unit === "object" && unit !== null
    ? (unit as BuildUnitSummary)
    : null;
}

function unitsFrom(body: unknown): BuildUnitSummary[] {
  if (typeof body !== "object" || body === null || !("units" in body)) {
    return [];
  }
  const units = (body as { units: unknown }).units;
  return Array.isArray(units) ? (units as BuildUnitSummary[]) : [];
}

/**
 * Everything a stray write would disturb, `updatedAt` included — the field that
 * turns "the unit still looks right" into "the row was not written".
 */
function fingerprint(unit: BuildUnitSummary): string {
  return JSON.stringify({
    id: unit.id,
    sequence: unit.sequence,
    title: unit.title,
    summary: unit.summary,
    status: unit.status,
    verified: unit.verified,
    source: unit.source,
    updatedAt: unit.updatedAt,
  });
}

/* -------------------------------------------------------------------------- */
/* Throwaway projects                                                          */
/* -------------------------------------------------------------------------- */

interface Throwaway {
  id: string;
  purpose: string;
}

const created: Throwaway[] = [];
const deleted: string[] = [];
const leftBehind: { id: string; why: string }[] = [];

function throwawayId(purpose: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${PROJECT_PREFIX}${purpose}-${suffix}`;
}

/**
 * Create a project owned by `account`, registered for teardown before anything
 * else can fail. Registering first is the point: a project that was created but
 * not recorded is a project that gets left behind.
 */
async function createThrowaway(
  account: Account,
  purpose: string,
): Promise<string> {
  const id = throwawayId(purpose);
  created.push({ id, purpose });

  const { status, body } = await api(account, "POST", "/api/projects", {
    id,
    name: id,
    description: "Throwaway created by scripts/verify-build-units-http.ts",
  });

  if (status !== 201) {
    throw new Error(
      `Could not create throwaway project ${id}: POST /api/projects answered ${status} ${JSON.stringify(body)}`,
    );
  }

  info(`created throwaway project ${id}`);
  return id;
}

/** Read a project's `nextBuildUnitSequence` through the API, not the database. */
async function readCounter(
  account: Account,
  projectId: string,
): Promise<number | null> {
  const { status, body } = await api(account, "GET", "/api/projects");
  if (status !== 200 || typeof body !== "object" || body === null) {
    return null;
  }

  const projects = (body as { projects?: unknown }).projects;
  if (!Array.isArray(projects)) {
    return null;
  }

  const project = (projects as Record<string, unknown>[]).find(
    (row) => row.id === projectId,
  );
  const counter = project?.nextBuildUnitSequence;
  return typeof counter === "number" ? counter : null;
}

/**
 * Delete everything this run created. Runs in a `finally`, so a thrown
 * assertion still tears down — and anything that will not delete is reported
 * by id rather than quietly abandoned.
 */
async function cleanup(account: Account | null): Promise<void> {
  if (created.length === 0) {
    return;
  }

  section("cleanup");

  for (const project of created) {
    if (!account) {
      leftBehind.push({
        id: project.id,
        why: "no authenticated owner available to delete it",
      });
      continue;
    }

    try {
      const { status } = await api(
        account,
        "DELETE",
        `/api/projects/${encodeURIComponent(project.id)}`,
      );
      if (status === 200 || status === 404) {
        deleted.push(project.id);
        info(`deleted ${project.id} (${status})`);
      } else {
        leftBehind.push({ id: project.id, why: `DELETE answered ${status}` });
      }
    } catch (error) {
      leftBehind.push({
        id: project.id,
        why: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Phase: concurrent                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Unit 38 gap 1 — parallel creation through HTTP.
 *
 * The lib-layer stress test proved the `Project` row lock serializes creates
 * when `createBuildUnit` is called directly. This fires the same shape of load
 * at the route, so the transaction boundary is exercised through the request
 * pipeline: guard, body parse, normalization, transaction, response.
 */
async function runConcurrent(owner: Account, count: number): Promise<void> {
  section(`concurrent — ${count} parallel POSTs`);

  const projectId = await createThrowaway(owner, "concurrent");
  const before = await readCounter(owner, projectId);

  // One token for the whole burst, minted immediately before it, so the
  // requests race each other rather than racing token minting.
  await tokenFor(owner, true);

  const path = `/api/projects/${encodeURIComponent(projectId)}/build-units`;
  const responses = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      api(owner, "POST", path, {
        title: `Concurrent unit ${index + 1}`,
        summary: `Fired in parallel by verify-build-units-http.ts`,
      }),
    ),
  );

  const statuses = responses.map((response) => response.status);
  check(
    statuses.every((status) => status === 201),
    `all ${count} concurrent POSTs answer 201`,
    `statuses: [${statuses.join(", ")}]`,
  );

  const units = responses
    .map((response) => unitFrom(response.body))
    .filter((unit): unit is BuildUnitSummary => unit !== null);
  const sequences = units.map((unit) => unit.sequence);
  const distinct = new Set(sequences);

  check(
    distinct.size === count && sequences.length === count,
    `all ${count} returned sequence numbers are distinct`,
    `returned in arrival order: [${sequences.join(", ")}]; ${distinct.size} distinct of ${sequences.length} returned`,
  );

  const sorted = [...sequences].sort((a, b) => a - b);
  const contiguous =
    sorted.length === count &&
    sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1);
  check(
    contiguous,
    `the sequence set is contiguous with no gaps`,
    `sorted: [${sorted.join(", ")}] (${sorted[0]}..${sorted[sorted.length - 1]})`,
  );

  const after = await readCounter(owner, projectId);
  check(
    before !== null && after !== null && after - before === count,
    `the project counter advanced by exactly ${count}`,
    `nextBuildUnitSequence before=${before}, after=${after}, delta=${
      before !== null && after !== null ? after - before : "unreadable"
    }`,
  );

  const list = await api(owner, "GET", path);
  const persisted = unitsFrom(list.body);
  check(
    list.status === 200 && persisted.length === count,
    `GET lists exactly ${count} persisted units in sequence order`,
    `status=${list.status}, count=${persisted.length}, sequences=[${persisted
      .map((unit) => unit.sequence)
      .join(", ")}]`,
  );
}

/* -------------------------------------------------------------------------- */
/* Phase: cross-project                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Unit 38 gap 2 — cross-project unit-id isolation through HTTP.
 *
 * Two projects, both created here. The caller is a genuine member of A, so the
 * `withProjectMember` guard *passes* and the 404 can only come from the
 * `{ id: unitId, projectId }` row scoping in `lib/build-units.ts`. The mirror
 * case (a non-member hitting B's own path) 404s one layer earlier, at the
 * guard. Running both is what separates the two mechanisms; a single 404 alone
 * cannot tell them apart.
 */
async function runCrossProject(
  owner: Account,
  outsider: Account | null,
): Promise<void> {
  section("cross-project — a unit id from B, routed through A");

  const projectA = await createThrowaway(owner, "cross-a");
  const projectB = await createThrowaway(owner, "cross-b");

  const pathA = `/api/projects/${encodeURIComponent(projectA)}/build-units`;
  const pathB = `/api/projects/${encodeURIComponent(projectB)}/build-units`;

  const createdInA = unitFrom(
    (await api(owner, "POST", pathA, { title: "Unit that lives in A" })).body,
  );
  const createdInB = unitFrom(
    (
      await api(owner, "POST", pathB, {
        title: "Unit that lives in B",
        summary: "Must survive every request aimed at it through project A",
      })
    ).body,
  );

  if (!createdInA || !createdInB) {
    check(false, "set up one unit in each project", "create did not return a unit");
    return;
  }

  const beforeFingerprint = fingerprint(createdInB);
  info(`A unit ${createdInA.id} (seq ${createdInA.sequence})`);
  info(`B unit ${createdInB.id} (seq ${createdInB.sequence})`);

  // Negative control. Without this, the 404s below could equally mean "PATCH
  // never works", which would prove nothing about scoping.
  const control = await api(
    owner,
    "PATCH",
    `${pathA}/${encodeURIComponent(createdInA.id)}`,
    { status: "in progress" },
  );
  check(
    control.status === 200 && unitFrom(control.body)?.status === "in progress",
    `control: a legitimate PATCH through its own project answers 200`,
    `status=${control.status}, unit.status=${unitFrom(control.body)?.status ?? "none"}`,
  );

  const foreignPatch = await api(
    owner,
    "PATCH",
    `${pathA}/${encodeURIComponent(createdInB.id)}`,
    { status: "shipped", title: "Overwritten through the wrong project" },
  );
  check(
    foreignPatch.status === 404,
    `PATCH of B's unit id through A's path answers 404 (member of A)`,
    `status=${foreignPatch.status}, body=${JSON.stringify(foreignPatch.body)}`,
  );

  const foreignDelete = await api(
    owner,
    "DELETE",
    `${pathA}/${encodeURIComponent(createdInB.id)}`,
  );
  check(
    foreignDelete.status === 404,
    `DELETE of B's unit id through A's path answers 404 (member of A)`,
    `status=${foreignDelete.status}, body=${JSON.stringify(foreignDelete.body)}`,
  );

  // The actual point of this phase: a 404 response paired with a successful
  // write would be the bug, and only re-reading the row can rule it out.
  const reread = unitsFrom((await api(owner, "GET", pathB)).body).find(
    (unit) => unit.id === createdInB.id,
  );
  check(
    reread !== undefined && fingerprint(reread) === beforeFingerprint,
    `B's row is byte-identical afterwards, updatedAt included`,
    reread === undefined
      ? "the unit is gone from project B — a 404 was answered but the row was deleted"
      : `before=${beforeFingerprint} after=${fingerprint(reread)}`,
  );

  section("cross-project — the mirror case, through B's own path");

  if (!outsider) {
    skip(
      "non-member PATCH/DELETE through B's own path answers 404",
      "second account not configured (set VERIFY_COLLABORATOR_EMAIL or pass --collaborator-email=...); without it every caller here is a member of both projects, so only the row-scoping half can be exercised",
    );
    return;
  }

  const outsiderPatch = await api(
    outsider,
    "PATCH",
    `${pathB}/${encodeURIComponent(createdInB.id)}`,
    { status: "shipped" },
  );
  check(
    outsiderPatch.status === 404,
    `PATCH through B's own path answers 404 for a non-member (guard, not scoping)`,
    `status=${outsiderPatch.status}, body=${JSON.stringify(outsiderPatch.body)}`,
  );

  const outsiderDelete = await api(
    outsider,
    "DELETE",
    `${pathB}/${encodeURIComponent(createdInB.id)}`,
  );
  check(
    outsiderDelete.status === 404,
    `DELETE through B's own path answers 404 for a non-member (guard, not scoping)`,
    `status=${outsiderDelete.status}, body=${JSON.stringify(outsiderDelete.body)}`,
  );

  const rereadAfterOutsider = unitsFrom(
    (await api(owner, "GET", pathB)).body,
  ).find((unit) => unit.id === createdInB.id);
  check(
    rereadAfterOutsider !== undefined &&
      fingerprint(rereadAfterOutsider) === beforeFingerprint,
    `B's row is still byte-identical after the non-member's attempts`,
    rereadAfterOutsider === undefined
      ? "the unit is gone from project B — a 404 was answered but the row was deleted"
      : `before=${beforeFingerprint} after=${fingerprint(rereadAfterOutsider)}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Phase: collaborator                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Unit 38 gap 3 — collaborator (non-owner) access.
 *
 * `withProjectMember` is membership-gated rather than ownership-gated on
 * purpose: build units are project *content*. This exercises all four verbs as
 * someone who is a member only by invitation, and confirms the not-invited case
 * collapses to 404 — never 403, which would leak the project's existence.
 */
async function runCollaborator(
  owner: Account,
  collaborator: Account,
): Promise<void> {
  section("collaborator — a non-owner member exercises all four verbs");

  const shared = await createThrowaway(owner, "collab-shared");
  const unshared = await createThrowaway(owner, "collab-private");

  const invite = await api(
    owner,
    "POST",
    `/api/projects/${encodeURIComponent(shared)}/collaborators`,
    { email: collaborator.email },
  );
  check(
    invite.status === 201,
    `owner invites ${collaborator.email} to the shared project`,
    `status=${invite.status}`,
  );

  const sharedPath = `/api/projects/${encodeURIComponent(shared)}/build-units`;
  const privatePath = `/api/projects/${encodeURIComponent(unshared)}/build-units`;

  const list = await api(collaborator, "GET", sharedPath);
  check(
    list.status === 200,
    `collaborator GET on the shared project answers 200`,
    `status=${list.status}, units=${unitsFrom(list.body).length}`,
  );

  const create = await api(collaborator, "POST", sharedPath, {
    title: "Added by the collaborator",
    summary: "Proves a non-owner member may write project content",
  });
  const collaboratorUnit = unitFrom(create.body);
  check(
    create.status === 201 && collaboratorUnit !== null,
    `collaborator POST on the shared project answers 201`,
    `status=${create.status}, unit=${collaboratorUnit?.id ?? "none"}, sequence=${collaboratorUnit?.sequence ?? "none"}`,
  );

  if (collaboratorUnit) {
    const patch = await api(
      collaborator,
      "PATCH",
      `${sharedPath}/${encodeURIComponent(collaboratorUnit.id)}`,
      { status: "shipped", verified: "browser" },
    );
    const patched = unitFrom(patch.body);
    check(
      patch.status === 200 &&
        patched?.status === "shipped" &&
        patched?.verified === "browser",
      `collaborator PATCH on the shared project answers 200 and applies`,
      `status=${patch.status}, unit.status=${patched?.status ?? "none"}, unit.verified=${patched?.verified ?? "none"}`,
    );

    const remove = await api(
      collaborator,
      "DELETE",
      `${sharedPath}/${encodeURIComponent(collaboratorUnit.id)}`,
    );
    check(
      remove.status === 200,
      `collaborator DELETE on the shared project answers 200`,
      `status=${remove.status}, body=${JSON.stringify(remove.body)}`,
    );
  }

  section("collaborator — a project they were never invited to");

  // Seeded by the owner so the not-invited PATCH/DELETE aim at a unit that
  // genuinely exists; a 404 for a *missing* unit would prove nothing.
  const ownerUnit = unitFrom(
    (
      await api(owner, "POST", privatePath, {
        title: "Owner-only unit",
        summary: "The collaborator was never invited to this project",
      })
    ).body,
  );

  const privateList = await api(collaborator, "GET", privatePath);
  check(
    privateList.status === 404,
    `collaborator GET on a project they were never invited to answers 404`,
    `status=${privateList.status}, body=${JSON.stringify(privateList.body)}`,
  );

  const privateCreate = await api(collaborator, "POST", privatePath, {
    title: "Should never exist",
  });
  check(
    privateCreate.status === 404,
    `collaborator POST on a project they were never invited to answers 404`,
    `status=${privateCreate.status}, body=${JSON.stringify(privateCreate.body)}`,
  );

  if (!ownerUnit) {
    check(false, "seed a unit in the not-invited project", "create returned no unit");
    return;
  }

  const beforeFingerprint = fingerprint(ownerUnit);

  const privatePatch = await api(
    collaborator,
    "PATCH",
    `${privatePath}/${encodeURIComponent(ownerUnit.id)}`,
    { status: "shipped" },
  );
  check(
    privatePatch.status === 404,
    `collaborator PATCH on a project they were never invited to answers 404`,
    `status=${privatePatch.status}, body=${JSON.stringify(privatePatch.body)}`,
  );

  const privateDelete = await api(
    collaborator,
    "DELETE",
    `${privatePath}/${encodeURIComponent(ownerUnit.id)}`,
  );
  check(
    privateDelete.status === 404,
    `collaborator DELETE on a project they were never invited to answers 404`,
    `status=${privateDelete.status}, body=${JSON.stringify(privateDelete.body)}`,
  );

  const reread = unitsFrom((await api(owner, "GET", privatePath)).body).find(
    (unit) => unit.id === ownerUnit.id,
  );
  check(
    reread !== undefined && fingerprint(reread) === beforeFingerprint,
    `the not-invited project's row is byte-identical afterwards`,
    reread === undefined
      ? "the unit is gone — a 404 was answered but the row was deleted"
      : `before=${beforeFingerprint} after=${fingerprint(reread)}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

const SUBCOMMANDS = ["concurrent", "cross-project", "collaborator", "all"] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

function isSubcommand(value: string): value is Subcommand {
  return (SUBCOMMANDS as readonly string[]).includes(value);
}

function flagValue(argv: string[], name: string): string | null {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function usage(): void {
  console.error(
    "Usage: npm run verify:build-units -- <concurrent|cross-project|collaborator|all> [--count=N] [--collaborator-email=...]",
  );
  console.error("");
  console.error("Requires a dev server at VERIFY_BASE_URL (default http://localhost:3000),");
  console.error("CLERK_SECRET_KEY and VERIFY_OWNER_EMAIL in .env.local or .env, and a");
  console.error("browser sign-in for each account so an active Clerk session exists.");
}

/** Guards against a second summary when a throw unwinds past the `finally`. */
let summarized = false;

function printSummary(): void {
  if (summarized) {
    return;
  }
  summarized = true;

  section("summary");

  console.log(`created:      ${created.length ? created.map((p) => p.id).join(", ") : "nothing"}`);
  console.log(`deleted:      ${deleted.length ? deleted.join(", ") : "nothing"}`);
  console.log(
    `left behind:  ${
      leftBehind.length
        ? leftBehind.map((p) => `${p.id} (${p.why})`).join(", ")
        : "nothing"
    }`,
  );
  console.log(
    `assertions:   ${failures === 0 ? "all passed" : `${failures} FAILED`}${
      skipped > 0 ? `, ${skipped} skipped` : ""
    }`,
  );
  console.log(
    "layer:        HTTP, against a running Next.js dev server. Not the browser, and not the database directly.",
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const subcommand = argv.find((arg) => !arg.startsWith("--"));

  if (!subcommand || !isSubcommand(subcommand)) {
    usage();
    process.exit(1);
  }

  const ownerEmail = process.env.VERIFY_OWNER_EMAIL;
  if (!ownerEmail) {
    console.error(
      "VERIFY_OWNER_EMAIL is not set (.env.local or .env). It is the email of the Clerk account this script acts as.",
    );
    process.exit(1);
  }

  const collaboratorEmail =
    flagValue(argv, "collaborator-email") ??
    process.env.VERIFY_COLLABORATOR_EMAIL ??
    null;

  const rawCount = flagValue(argv, "count");
  const count = rawCount ? Number.parseInt(rawCount, 10) : DEFAULT_CONCURRENT_CREATES;
  if (!Number.isInteger(count) || count < 2 || count > MAX_CONCURRENT_CREATES) {
    console.error(
      `--count must be an integer between 2 and ${MAX_CONCURRENT_CREATES} (well under the 200-unit cap in lib/build-units.ts).`,
    );
    process.exit(1);
  }

  // Fail on a missing secret before anything is created.
  requireClerkSecret();

  section("setup");
  info(`base url: ${BASE_URL}`);

  const owner = await resolveAccount("owner", ownerEmail);
  info(`owner:    ${ownerEmail} (${owner.userId}, session ${owner.sessionId})`);

  await resolveAuthMode(owner);

  let collaborator: Account | null = null;
  if (collaboratorEmail) {
    collaborator = await resolveAccount("collaborator", collaboratorEmail);
    info(
      `collab:   ${collaboratorEmail} (${collaborator.userId}, session ${collaborator.sessionId})`,
    );
  } else {
    info("collab:   not configured");
  }

  try {
    if (subcommand === "concurrent" || subcommand === "all") {
      await runConcurrent(owner, count);
    }

    if (subcommand === "cross-project" || subcommand === "all") {
      await runCrossProject(owner, collaborator);
    }

    if (subcommand === "collaborator" || subcommand === "all") {
      if (!collaborator) {
        section("collaborator");
        skip(
          "collaborator access checks",
          "second account not configured — set VERIFY_COLLABORATOR_EMAIL in .env.local or pass --collaborator-email=..., and sign that account in once so it has an active Clerk session",
        );
        if (subcommand === "collaborator") {
          // Asked for explicitly, so an unconfigured account is a failure to run,
          // not a quiet no-op.
          failures += 1;
        }
      } else {
        await runCollaborator(owner, collaborator);
      }
    }
  } finally {
    await cleanup(owner);
    printSummary();
  }

  process.exit(failures === 0 ? 0 : 1);
}

void main().catch((error: unknown) => {
  console.error(
    `\nverify-build-units-http failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  // `main`'s `finally` has already cleaned up and summarized for anything
  // thrown inside a phase; this covers a setup failure, where nothing exists
  // to tear down yet.
  printSummary();
  process.exit(1);
});
