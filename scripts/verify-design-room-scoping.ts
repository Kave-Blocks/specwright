/**
 * Proves that `POST /api/ai/design` acts on the room its **access check**
 * resolved, never on a room the caller named — at the **HTTP layer**, against a
 * locally running dev server.
 *
 * Why this is its own script rather than a phase of `verify-change-application-
 * http.ts`: the route under test belongs to units 22/23, and the assertion is
 * about a *trigger payload*, not about a build list. It borrows that script's
 * Clerk-session mechanics unchanged; nothing else is shared.
 *
 * The gap this closes. The route used to take **both** `projectId` and `roomId`
 * from the body, access-check the first, and hand the second to the task. A
 * request carrying a `projectId` the caller can reach and a `roomId` they cannot
 * passed the check and mutated somebody else's canvas — and because the design
 * agent may emit `deleteNode` (which cascades every attached edge), the reachable
 * action was not "draw in a stranger's diagram" but "erase it". The task mutates
 * through the secret-key Liveblocks server client, which no room-level ACL
 * backstops, so the route's check was the entire boundary.
 *
 * What a passing run proves:
 * - `forged`: a request naming an accessible `projectId` **and an inaccessible
 *   `roomId`** answers 201 — and the run it started carries the *caller's own*
 *   room. The other project gets no run recorded against it.
 * - `legitimate`: a request with no `roomId` at all answers 201 and targets the
 *   caller's room. This is the trap worth naming: asserting only that the forged
 *   request is refused would also pass a "fix" that broke every real request.
 * - `denied`: a `projectId` the caller cannot reach answers 404 and starts
 *   nothing — the access check itself still bites.
 * - `invalid`: a body with no `projectId` answers 400, and the message no longer
 *   demands the field the route stopped reading.
 * - `signed-out`: an unauthenticated request answers 401 and starts nothing.
 *
 * The assertion is on **the room the run received**, read back from Trigger.dev
 * with `runs.retrieve`, not on the response code. The forged request is *supposed
 * to succeed* — it just must not succeed against the other room.
 *
 * What a passing run does **not** prove:
 * - Anything the task then does with that room. No plan is generated and no
 *   Liveblocks room is touched here; every run this script starts is cancelled
 *   as soon as its payload has been read.
 * - Anything in the browser, and nothing about `/api/ai/spec` or `/api/ai/change`
 *   (both of which resolve access *from* `roomId`, so neither has a second id).
 *
 * Model cost. Each phase starts a real run and cancels it immediately. With no
 * `trigger dev` worker attached the run never leaves the queue, so nothing is
 * spent. With one attached, the cancel races the worker — and the room it would
 * race to write is a throwaway project this script created and deletes.
 *
 * Data safety. Both projects are created here, named with the
 * `verify-design-room-` prefix, and deleted in a `finally` — including on
 * failure. `TaskRun` has no foreign key to `Project` (`projectId` is a plain
 * column), so those rows are deleted explicitly rather than by cascade. Nothing
 * pre-existing is read or mutated.
 *
 * Usage (from the repo root, with `npm run dev` already running):
 *   npm run verify:design-room -- forged
 *   npm run verify:design-room -- all
 *
 * Environment:
 *   CLERK_SECRET_KEY     required, from .env.local or .env
 *   VERIFY_OWNER_EMAIL   required, the account to run as. Unlike the sibling
 *                        HTTP verifiers this does **not** need a signed-in
 *                        browser: an active session is borrowed if one exists,
 *                        and otherwise minted through the Clerk Backend API and
 *                        revoked when the run ends.
 *   TRIGGER_SECRET_KEY   required, to read back the run's payload
 *   DATABASE_URL         required, for seeding
 *   VERIFY_BASE_URL      optional, defaults to http://localhost:3000
 *
 * Exits non-zero if any assertion fails.
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

import type { designAgent } from "@/trigger/design-agent";

const BASE_URL = (
  process.env.VERIFY_BASE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

const CLERK_API = "https://api.clerk.com/v1";
/** The BAPI version `@clerk/backend@3.11.1` pins, as unit 38's script sends. */
const CLERK_API_VERSION = "2026-05-12";
const TOKEN_REUSE_MS = 30_000;

const PROJECT_PREFIX = "verify-design-room-";
/** Owner of the unreachable project. Not a real Clerk id, deliberately. */
const OTHER_OWNER_ID = "verify-design-room-other-owner";
const PROMPT = "Draw nothing — this run is cancelled before it starts.";

let failures = 0;

function section(title: string): void {
  console.log(`\n--- ${title} ${"-".repeat(Math.max(0, 58 - title.length))}`);
}

/** The observed value is printed pass or fail — a verdict alone is not evidence. */
function check(passed: boolean, label: string, observed: string): boolean {
  console.log(`[${passed ? "PASS" : "FAIL"}] ${label}`);
  console.log(`        observed: ${observed}`);
  if (!passed) failures += 1;
  return passed;
}

function info(message: string): void {
  console.log(`        ${message}`);
}

/* -------------------------------------------------------------------------- */
/* Clerk Backend API                                                           */
/* -------------------------------------------------------------------------- */

interface Account {
  email: string;
  userId: string;
  sessionId: string;
  token: string | null;
  tokenMintedAt: number;
  /** True when this script created the session, and so must revoke it. */
  ownsSession: boolean;
}

function requireClerkSecret(): string {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "CLERK_SECRET_KEY is not set. Put it in .env.local (or .env) at the repo root; it is never read from the command line.",
    );
  }
  return secret;
}

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
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    // The credential exists only inside the header above; it is never echoed.
    throw new Error(
      `Clerk Backend API ${method} ${path} answered ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}

function listOf(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
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

async function resolveAccount(email: string): Promise<Account> {
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
  const existing = sessions
    .map((session) => stringField(session, "id"))
    .find(Boolean);
  if (existing) {
    info(`borrowed the active Clerk session for ${email}`);
    return {
      email,
      userId,
      sessionId: existing,
      token: null,
      tokenMintedAt: 0,
      ownsSession: false,
    };
  }

  // No signed-in browser: mint a session instead of refusing to run. The
  // sibling HTTP verifiers can only borrow one, which makes them unrunnable in
  // a headless checkout — a verification that needs a human to log in first is
  // one that quietly stops being run. Revoked in `main`'s `finally`.
  const created = await clerkRequest("POST", "/sessions", { user_id: userId });
  const sessionId =
    typeof created === "object" && created !== null
      ? stringField(created as Record<string, unknown>, "id")
      : null;
  if (!sessionId) {
    throw new Error(
      `No active Clerk session for ${email}, and creating one returned no session id. Sign in as that account at ${BASE_URL} in a browser, then re-run.`,
    );
  }
  info(`created a Clerk session for ${email} (revoked when this run ends)`);

  return {
    email,
    userId,
    sessionId,
    token: null,
    tokenMintedAt: 0,
    ownsSession: true,
  };
}

/** Revoke a session this script created, so it leaves no usable credential. */
async function releaseAccount(account: Account): Promise<void> {
  if (!account.ownsSession) return;
  try {
    await clerkRequest(
      "POST",
      `/sessions/${encodeURIComponent(account.sessionId)}/revoke`,
    );
    info("revoked the Clerk session this run created");
  } catch (error) {
    info(`could not revoke the created session: ${(error as Error).message}`);
  }
}

async function tokenFor(account: Account, force = false): Promise<string> {
  if (
    !force &&
    account.token &&
    Date.now() - account.tokenMintedAt < TOKEN_REUSE_MS
  ) {
    return account.token;
  }
  const payload = await clerkRequest(
    "POST",
    `/sessions/${encodeURIComponent(account.sessionId)}/tokens`,
  );
  const jwt =
    typeof payload === "object" && payload !== null
      ? stringField(payload as Record<string, unknown>, "jwt")
      : null;
  if (!jwt) {
    throw new Error(`Clerk returned no jwt for ${account.email}`);
  }
  account.token = jwt;
  account.tokenMintedAt = Date.now();
  return jwt;
}

/* -------------------------------------------------------------------------- */
/* App API                                                                     */
/* -------------------------------------------------------------------------- */

type AuthMode = "bearer" | "cookie";
let authMode: AuthMode = "bearer";

function authHeaders(jwt: string): Record<string, string> {
  return authMode === "cookie"
    ? { Cookie: `__session=${jwt}` }
    : { Authorization: `Bearer ${jwt}` };
}

interface ApiResponse {
  status: number;
  body: unknown;
  /** The raw bytes, kept so a leak check searches what was actually sent. */
  raw: string;
}

async function api(
  account: Account | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse> {
  const send = async (jwt: string | null): Promise<Response> =>
    fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(jwt === null ? {} : authHeaders(jwt)),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "manual",
    });

  let response = await send(account ? await tokenFor(account) : null);
  // A 401 on an authenticated call is an expired token, not a finding — Clerk
  // session tokens are short-lived by design. Re-mint once and retry.
  if (response.status === 401 && account) {
    response = await send(await tokenFor(account, true));
  }

  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw.length > 0 ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed, raw };
}

/** Try `Authorization: Bearer` first, fall back to the `__session` cookie. */
async function resolveAuthMode(account: Account): Promise<void> {
  authMode = "bearer";
  let probe = await api(account, "GET", "/api/projects");
  if (probe.status === 200) {
    info("auth transport: Authorization: Bearer <jwt>");
    return;
  }
  authMode = "cookie";
  probe = await api(account, "GET", "/api/projects");
  if (probe.status === 200) {
    info("auth transport: Cookie: __session=<jwt>");
    return;
  }
  throw new Error(
    `Neither Bearer nor cookie auth was accepted (GET /api/projects answered ${probe.status}). Is the dev server running at ${BASE_URL}?`,
  );
}

/* -------------------------------------------------------------------------- */
/* Trigger.dev                                                                 */
/* -------------------------------------------------------------------------- */

/** Every run this script started, cancelled together at the end of a phase. */
const startedRuns: string[] = [];

/**
 * The room a started run actually received — the whole point of this script.
 * Read from Trigger.dev rather than inferred from the request, because what the
 * route *sent* is the only thing that distinguishes the fix from the bug.
 */
async function roomOfRun(runId: string): Promise<string | null> {
  const { runs } = await import("@trigger.dev/sdk");
  const run = await runs.retrieve<typeof designAgent>(runId);
  return run.payload?.roomId ?? null;
}

/** Best-effort: a queued run costs nothing, but leaving it queued is untidy. */
async function cancelStartedRuns(): Promise<void> {
  if (startedRuns.length === 0) return;
  const { runs } = await import("@trigger.dev/sdk");
  for (const runId of startedRuns.splice(0)) {
    try {
      await runs.cancel(runId);
    } catch (error) {
      info(`could not cancel ${runId}: ${(error as Error).message}`);
    }
  }
}

/** POST the design route, remembering any run so it can be cancelled. */
async function design(
  account: Account | null,
  body: unknown,
): Promise<ApiResponse & { runId: string | null }> {
  const response = await api(account, "POST", "/api/ai/design", body);
  const runId = (response.body as { runId?: unknown })?.runId;
  const id = typeof runId === "string" ? runId : null;
  if (id) startedRuns.push(id);
  return { ...response, runId: id };
}

/* -------------------------------------------------------------------------- */
/* Seeding                                                                     */
/* -------------------------------------------------------------------------- */

async function deps() {
  const { prisma } = await import("@/lib/prisma");
  return { prisma };
}

type Deps = Awaited<ReturnType<typeof deps>>;

/** One project the caller owns, one they have no path to at all. */
async function seed(d: Deps, ownerId: string, suffix: string) {
  const mine = await d.prisma.project.create({
    data: { ownerId, name: `${PROJECT_PREFIX}mine-${suffix}` },
    select: { id: true },
  });
  const theirs = await d.prisma.project.create({
    // A different owner and no collaborator row: `getAccessibleProject` has
    // nothing to match the caller on, which is exactly the victim's position.
    data: { ownerId: OTHER_OWNER_ID, name: `${PROJECT_PREFIX}theirs-${suffix}` },
    select: { id: true },
  });
  return { mine, theirs };
}

async function cleanup(d: Deps, projectIds: string[]): Promise<void> {
  await cancelStartedRuns();
  // `TaskRun.projectId` is a plain column with no relation, so project deletion
  // does not cascade to it — these rows have to go explicitly.
  await d.prisma.taskRun.deleteMany({ where: { projectId: { in: projectIds } } });
  await d.prisma.project.deleteMany({ where: { id: { in: projectIds } } });
}

async function taskRunCount(d: Deps, projectId: string): Promise<number> {
  return d.prisma.taskRun.count({ where: { projectId } });
}

/* -------------------------------------------------------------------------- */
/* Phases                                                                      */
/* -------------------------------------------------------------------------- */

async function forgedPhase(d: Deps, account: Account) {
  section("forged — an unreachable roomId is ignored, not obeyed");
  const { mine, theirs } = await seed(d, account.userId, `forged-${process.pid}`);

  try {
    // The shape of the closed request: a project the caller genuinely belongs
    // to, and somebody else's room.
    const response = await design(account, {
      prompt: PROMPT,
      projectId: mine.id,
      roomId: theirs.id,
    });
    check(
      response.status === 201,
      "the request still answers 201 — it is supposed to succeed",
      `status ${response.status}`,
    );
    check(
      response.runId !== null,
      "and a run was started",
      String(response.runId),
    );

    if (response.runId) {
      const room = await roomOfRun(response.runId);
      check(
        room === mine.id,
        "the run received the caller's own room",
        `roomId ${room} (mine ${mine.id})`,
      );
      check(
        room !== theirs.id,
        "and not the room the body named",
        `body asked for ${theirs.id}`,
      );
    }

    check(
      (await taskRunCount(d, mine.id)) === 1,
      "the run is recorded against the caller's project",
      `${await taskRunCount(d, mine.id)} TaskRun row(s)`,
    );
    check(
      (await taskRunCount(d, theirs.id)) === 0,
      "and nothing is recorded against the other project",
      `${await taskRunCount(d, theirs.id)} TaskRun row(s)`,
    );
  } finally {
    await cleanup(d, [mine.id, theirs.id]);
  }
}

async function legitimatePhase(d: Deps, account: Account) {
  section("legitimate — the real client's body still works, with no roomId");
  const { mine, theirs } = await seed(d, account.userId, `legit-${process.pid}`);

  try {
    // Exactly what `hooks/use-design-submit.ts` now sends.
    const response = await design(account, {
      prompt: PROMPT,
      projectId: mine.id,
    });
    check(
      response.status === 201,
      "a body with no roomId answers 201",
      `status ${response.status}`,
    );

    if (response.runId) {
      const room = await roomOfRun(response.runId);
      check(
        room === mine.id,
        "and the run targets the project's own room",
        `roomId ${room}`,
      );
    } else {
      check(false, "and the run targets the project's own room", "no run id");
    }
  } finally {
    await cleanup(d, [mine.id, theirs.id]);
  }
}

async function deniedPhase(d: Deps, account: Account) {
  section("denied — an unreachable projectId answers 404 and starts nothing");
  const { mine, theirs } = await seed(d, account.userId, `denied-${process.pid}`);

  try {
    const response = await design(account, {
      prompt: PROMPT,
      projectId: theirs.id,
    });
    check(response.status === 404, "answers 404", `status ${response.status}`);
    check(
      response.runId === null,
      "no run was started",
      String(response.runId),
    );
    check(
      (await taskRunCount(d, theirs.id)) === 0,
      "and nothing was recorded against it",
      `${await taskRunCount(d, theirs.id)} TaskRun row(s)`,
    );
  } finally {
    await cleanup(d, [mine.id, theirs.id]);
  }
}

async function invalidPhase(d: Deps, account: Account) {
  section("invalid — projectId is required, roomId is not");
  const { mine, theirs } = await seed(d, account.userId, `invalid-${process.pid}`);

  try {
    const response = await design(account, { prompt: PROMPT });
    check(response.status === 400, "a body with no projectId answers 400", `status ${response.status}`);

    const message = String((response.body as { error?: unknown })?.error ?? "");
    check(
      !message.includes("roomId"),
      "and the message no longer demands the field the route stopped reading",
      message,
    );

    // A roomId alone must not be enough — the field the route once trusted is
    // now inert, so this is still a missing-projectId request.
    const roomOnly = await design(account, { prompt: PROMPT, roomId: mine.id });
    check(
      roomOnly.status === 400,
      "a body carrying only roomId answers 400 too",
      `status ${roomOnly.status}`,
    );
  } finally {
    await cleanup(d, [mine.id, theirs.id]);
  }
}

async function signedOutPhase(d: Deps, account: Account) {
  section("signed-out — 401, and no run at all");
  const { mine, theirs } = await seed(d, account.userId, `signed-out-${process.pid}`);

  try {
    const response = await design(null, {
      prompt: PROMPT,
      projectId: mine.id,
      roomId: theirs.id,
    });
    check(response.status === 401, "answers 401", `status ${response.status}`);
    check(
      response.runId === null,
      "no run was started",
      String(response.runId),
    );
    check(
      (await taskRunCount(d, mine.id)) === 0 &&
        (await taskRunCount(d, theirs.id)) === 0,
      "and neither project has a run recorded",
      "0 TaskRun rows",
    );
  } finally {
    await cleanup(d, [mine.id, theirs.id]);
  }
}

/* -------------------------------------------------------------------------- */
/* Entry                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
  const args = process.argv.slice(2);
  const phase = args.find((a) => !a.startsWith("--")) ?? "all";

  const email = process.env.VERIFY_OWNER_EMAIL;
  if (!email) {
    console.error(
      "VERIFY_OWNER_EMAIL is not set. Put the signed-in account's email in .env.local.",
    );
    process.exit(1);
  }
  if (!process.env.TRIGGER_SECRET_KEY) {
    console.error(
      "TRIGGER_SECRET_KEY is not set. It is needed to read back which room each run received — the assertion this script exists to make.",
    );
    process.exit(1);
  }

  const account = await resolveAccount(email);
  try {
    await resolveAuthMode(account);
    const d = await deps();

    const run = {
      forged: () => forgedPhase(d, account),
      legitimate: () => legitimatePhase(d, account),
      denied: () => deniedPhase(d, account),
      invalid: () => invalidPhase(d, account),
      "signed-out": () => signedOutPhase(d, account),
    };

    if (phase === "all") {
      for (const fn of Object.values(run)) await fn();
    } else if (phase in run) {
      await run[phase as keyof typeof run]();
    } else {
      console.error(
        `Unknown phase "${phase}". One of: ${Object.keys(run).join(", ")}, all`,
      );
      process.exit(1);
    }
  } finally {
    await releaseAccount(account);
  }

  console.log(
    failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
