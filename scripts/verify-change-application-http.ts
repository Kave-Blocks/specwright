/**
 * Proves change-application behaviour (unit 41) at the **HTTP layer**, against a
 * locally running dev server — the layer `scripts/verify-change-application.ts`
 * explicitly cannot reach.
 *
 * What a passing run proves:
 * - `apply`: `POST /api/projects/{id}/changes/{changeId}/apply` answers 200 with
 *   the created units, the superseded ids, and the skipped titles — and the body
 *   leaks **no** `proposalPath`, `baseSpecId`, `changeId`, `supersededByChangeId`,
 *   `key`, or blob URL. A body is captured verbatim and searched, not trusted.
 * - `twice`: the second apply answers 409 and creates nothing.
 * - `stale`: a change whose base spec is no longer current answers **409 with a
 *   `stale` object naming both versions**, and re-submitting with
 *   `acknowledgedSpecVersion` set to the current version answers 200.
 * - `no-set`: `PATCH …/build-units/{unitId}` with a *number* for
 *   `supersededByChange` answers 400 and leaves the unit unchanged; with `null`
 *   it answers 200 and clears it, changing nothing else. **No request can set
 *   supersession.**
 * - `discard-applied`: `DELETE …/changes/{changeId}` on an applied change answers
 *   409 and leaves it `applied`.
 * - `cross-project`: a change id from another project answers 404 through a
 *   project the caller genuinely belongs to, and that project's build list is
 *   byte-identical afterwards. A 404 paired with a successful write is the bug
 *   worth catching, and only re-reading proves its absence.
 * - `signed-out`: an unauthenticated apply answers 401, creates nothing, and
 *   confirms nothing about whether the project exists.
 *
 * What a passing run does **not** prove:
 * - Anything about the browser: no React, no hook, no focus behaviour, no
 *   rendering of the stale confirmation or the outcome report.
 * - The **non-member** path. `withProjectMember`'s 404-for-a-stranger is unit
 *   38's inherited gap and needs a second Clerk account; this script uses one.
 *
 * Auth. There is no browser here, so a short-lived Clerk session token is minted
 * through the Clerk Backend API, exactly as `verify-build-units-http.ts` does and
 * against the same pinned BAPI version. `CLERK_SECRET_KEY` is read from the
 * environment only, and is never printed, logged, or interpolated into an error.
 *
 * Seeding is done with Prisma rather than over HTTP, because the state an apply
 * needs — a project with a spec, build units, and a **stored change proposal** —
 * can only be created through the API by spending a model call, which this unit
 * is required not to do. The proposal document is hand-authored, which is the
 * fixture the unit spec asks for.
 *
 * Data safety. Every project this script touches is one it created, named with
 * the `verify-apply-http-` prefix, owned by the signed-in account, and deleted in
 * a `finally` — including on failure. Nothing pre-existing is read or mutated.
 *
 * Usage (from the repo root, with `npm run dev` already running):
 *   npm run verify:apply-http -- apply
 *   npm run verify:apply-http -- all
 *
 * Environment:
 *   CLERK_SECRET_KEY     required, from .env.local or .env
 *   VERIFY_OWNER_EMAIL   required, an account with an active browser session
 *   VERIFY_BASE_URL      optional, defaults to http://localhost:3000
 *   DATABASE_URL         required, for seeding
 *   BLOB_READ_WRITE_TOKEN required, the proposal JSON is really uploaded
 *
 * Exits non-zero if any assertion fails.
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

const BASE_URL = (
  process.env.VERIFY_BASE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

const CLERK_API = "https://api.clerk.com/v1";
/** The BAPI version `@clerk/backend@3.11.1` pins, as unit 38's script sends. */
const CLERK_API_VERSION = "2026-05-12";
const TOKEN_REUSE_MS = 30_000;

const PROJECT_PREFIX = "verify-apply-http-";
const SPEC_MARKDOWN =
  "# Fixture spec\n\nWritten by scripts/verify-change-application-http.ts.\n";

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
): Promise<unknown> {
  const response = await fetch(`${CLERK_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${requireClerkSecret()}`,
      "Clerk-API-Version": CLERK_API_VERSION,
      "Content-Type": "application/json",
    },
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
  const sessionId = sessions
    .map((session) => stringField(session, "id"))
    .find(Boolean);
  if (!sessionId) {
    throw new Error(
      `No active Clerk session for ${email}. Sign in as that account at ${BASE_URL} in a browser, then re-run — this script can only borrow a session that already exists.`,
    );
  }

  return { email, userId, sessionId, token: null, tokenMintedAt: 0 };
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
/* Seeding                                                                     */
/* -------------------------------------------------------------------------- */

async function deps() {
  const { prisma } = await import("@/lib/prisma");
  const { saveProjectChange } = await import("@/lib/change-agent/storage");
  const { saveProjectSpec } = await import("@/lib/spec-agent/storage");
  const { deriveBuildUnitKey } = await import("@/lib/build-units");
  return { prisma, saveProjectChange, saveProjectSpec, deriveBuildUnitKey };
}

type Deps = Awaited<ReturnType<typeof deps>>;

/** A project owned by the signed-in account, with a spec, units, and a change. */
async function seed(
  d: Deps,
  ownerId: string,
  suffix: string,
  options: { unitCount?: number; proposedTitles?: string[] } = {},
) {
  const { unitCount = 2, proposedTitles = ["Offline queue", "Retry policy"] } =
    options;

  const project = await d.prisma.project.create({
    data: { ownerId, name: `${PROJECT_PREFIX}${suffix}` },
    select: { id: true },
  });

  const spec = await d.saveProjectSpec({
    projectId: project.id,
    markdown: SPEC_MARKDOWN,
  });

  const units = [];
  for (let i = 1; i <= unitCount; i += 1) {
    const { nextBuildUnitSequence } = await d.prisma.project.update({
      where: { id: project.id },
      data: { nextBuildUnitSequence: { increment: 1 } },
      select: { nextBuildUnitSequence: true },
    });
    const sequence = nextBuildUnitSequence - 1;
    units.push(
      await d.prisma.projectBuildUnit.create({
        data: {
          projectId: project.id,
          sequence,
          key: d.deriveBuildUnitKey(`Fixture unit ${i}`, sequence),
          title: `Fixture unit ${i}`,
          summary: `Summary ${i}`,
          status: "SHIPPED",
          verified: "BROWSER",
        },
        select: { id: true, sequence: true, title: true },
      }),
    );
  }

  const change = await d.saveProjectChange({
    projectId: project.id,
    authorId: ownerId,
    request: "Add offline mode",
    baseSpecId: spec.id,
    proposal: {
      summary: "Add an offline mode.",
      architectureDelta: [
        { kind: "added" as const, component: "Sync queue", detail: "Buffers." },
      ],
      affectedUnits: units.map((u) => ({
        buildUnitId: u.id,
        reason: "Touches the sync path.",
      })),
      proposedUnits: proposedTitles.map((title) => ({ title, summary: null })),
      openQuestions: [],
    },
  });

  return { project, spec, units, change };
}

/** Values that must never appear in a response body, searched in the raw bytes. */
function leakedFields(raw: string): string[] {
  return [
    "proposalPath",
    "baseSpecId",
    "supersededByChangeId",
    "changeId",
    '"key"',
    "blob.vercel-storage",
  ].filter((needle) => raw.includes(needle));
}

async function buildUnitsOf(account: Account, projectId: string) {
  const { body } = await api(
    account,
    "GET",
    `/api/projects/${projectId}/build-units`,
  );
  return (body as { units?: unknown[] })?.units ?? [];
}

/* -------------------------------------------------------------------------- */
/* Phases                                                                      */
/* -------------------------------------------------------------------------- */

async function applyPhase(d: Deps, account: Account) {
  section("apply — 200, the outcome body, and no leaked ids");
  const { project, units, change } = await seed(d, account.userId, `apply-${process.pid}`);

  try {
    const before = await buildUnitsOf(account, project.id);

    const response = await api(
      account,
      "POST",
      `/api/projects/${project.id}/changes/${change.id}/apply`,
    );
    check(response.status === 200, "apply answers 200", `status ${response.status}`);

    const body = response.body as {
      created?: { id: string; status: string; verified: string; source: string }[];
      supersededUnitIds?: string[];
      skippedTitles?: string[];
    };
    check(
      body?.created?.length === 2,
      "two units were created",
      `created ${body?.created?.length}`,
    );
    check(
      Boolean(
        body?.created?.every(
          (u) =>
            u.status === "specced" && u.verified === "none" && u.source === "change",
        ),
      ),
      "each created unit is specced / none / change",
      JSON.stringify(body?.created?.map((u) => [u.status, u.verified, u.source])),
    );
    check(
      body?.supersededUnitIds?.length === 2,
      "both affected units are reported superseded",
      `${body?.supersededUnitIds?.length} ids`,
    );
    check(
      body?.skippedTitles?.length === 0,
      "nothing was skipped",
      JSON.stringify(body?.skippedTitles),
    );

    const leaked = leakedFields(response.raw);
    check(
      leaked.length === 0,
      "the response body leaks no server-side field or blob URL",
      leaked.length === 0 ? "none of proposalPath/baseSpecId/supersededByChangeId/changeId/key/blob URL" : leaked.join(","),
    );

    const after = (await buildUnitsOf(account, project.id)) as {
      id: string;
      status: string;
      verified: string;
      sequence: number;
      supersededByChange: number | null;
    }[];
    check(
      after.length === before.length + 2,
      "the build list grew by exactly the created units",
      `${before.length} → ${after.length}`,
    );

    const supersededRows = after.filter((u) =>
      units.some((seeded) => seeded.id === u.id),
    );
    check(
      supersededRows.every(
        (u) => u.status === "shipped" && u.verified === "browser",
      ),
      "a superseded unit still reads shipped / browser over the wire",
      JSON.stringify(supersededRows.map((u) => [u.status, u.verified])),
    );
    check(
      supersededRows.every((u) => u.supersededByChange === change.sequence),
      "and carries the supersession marker as the change's sequence",
      JSON.stringify(supersededRows.map((u) => u.supersededByChange)),
    );

    const before2 = before as { id: string; sequence: number }[];
    check(
      before2.every((b) => after.find((a) => a.id === b.id)?.sequence === b.sequence),
      "no existing unit was renumbered",
      JSON.stringify(before2.map((b) => b.sequence)),
    );

    section("twice — the second apply is refused over HTTP");
    const second = await api(
      account,
      "POST",
      `/api/projects/${project.id}/changes/${change.id}/apply`,
    );
    check(second.status === 409, "the second apply answers 409", `status ${second.status}`);
    check(
      typeof (second.body as { error?: unknown })?.error === "string",
      "and carries a message written for a person",
      String((second.body as { error?: unknown })?.error),
    );
    const afterSecond = await buildUnitsOf(account, project.id);
    check(
      afterSecond.length === after.length,
      "the refused apply created nothing",
      `${after.length} → ${afterSecond.length}`,
    );

    section("discard-applied — an applied change cannot be discarded");
    const discard = await api(
      account,
      "DELETE",
      `/api/projects/${project.id}/changes/${change.id}`,
    );
    check(discard.status === 409, "DELETE answers 409", `status ${discard.status}`);
    const readBack = await api(
      account,
      "GET",
      `/api/projects/${project.id}/changes/${change.id}`,
    );
    check(
      (readBack.body as { change?: { status?: string } })?.change?.status ===
        "applied",
      "and the change is still applied",
      String((readBack.body as { change?: { status?: string } })?.change?.status),
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function stalePhase(d: Deps, account: Account) {
  section("stale — 409 naming both versions, then 200 on confirmation");
  const { project, change } = await seed(d, account.userId, `stale-${process.pid}`);

  try {
    const newer = await d.saveProjectSpec({
      projectId: project.id,
      markdown: SPEC_MARKDOWN,
    });

    const refused = await api(
      account,
      "POST",
      `/api/projects/${project.id}/changes/${change.id}/apply`,
    );
    check(refused.status === 409, "a stale apply answers 409", `status ${refused.status}`);

    const stale = (refused.body as { stale?: { baseSpecVersion?: number; currentSpecVersion?: number } })
      ?.stale;
    check(
      typeof stale?.baseSpecVersion === "number" &&
        typeof stale?.currentSpecVersion === "number",
      "the refusal carries its own `stale` shape, not a bare error string",
      JSON.stringify(stale),
    );
    check(
      stale?.currentSpecVersion === newer.version,
      "and names the version the project is on now",
      `${stale?.currentSpecVersion} vs ${newer.version}`,
    );
    check(
      typeof (refused.body as { error?: unknown })?.error === "string" &&
        String((refused.body as { error?: string }).error).includes(
          String(newer.version),
        ),
      "the message names both versions on its own",
      String((refused.body as { error?: string })?.error),
    );

    const wrong = await api(
      account,
      "POST",
      `/api/projects/${project.id}/changes/${change.id}/apply`,
      { acknowledgedSpecVersion: stale?.baseSpecVersion },
    );
    check(
      wrong.status === 409,
      "acknowledging the *stale* version is still refused",
      `status ${wrong.status}`,
    );

    const confirmed = await api(
      account,
      "POST",
      `/api/projects/${project.id}/changes/${change.id}/apply`,
      { acknowledgedSpecVersion: newer.version },
    );
    check(
      confirmed.status === 200,
      "confirming with the current version answers 200",
      `status ${confirmed.status}`,
    );
    check(
      (confirmed.body as { created?: unknown[] })?.created?.length === 2,
      "and it created the proposed units",
      `created ${(confirmed.body as { created?: unknown[] })?.created?.length}`,
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function noSetPhase(d: Deps, account: Account) {
  section("no-set — supersession can be cleared and never set");
  const { project, units, change } = await seed(d, account.userId, `no-set-${process.pid}`);

  try {
    await api(
      account,
      "POST",
      `/api/projects/${project.id}/changes/${change.id}/apply`,
    );

    const unitId = units[0]!.id;
    const before = (await buildUnitsOf(account, project.id)) as {
      id: string;
      supersededByChange: number | null;
    }[];
    const beforeRow = before.find((u) => u.id === unitId);
    check(
      beforeRow?.supersededByChange === change.sequence,
      "the unit starts out superseded",
      String(beforeRow?.supersededByChange),
    );

    const setAttempt = await api(
      account,
      "PATCH",
      `/api/projects/${project.id}/build-units/${unitId}`,
      { supersededByChange: 99 },
    );
    check(
      setAttempt.status === 400,
      "PATCH with a number answers 400 — supersession cannot be set",
      `status ${setAttempt.status}`,
    );

    const stringAttempt = await api(
      account,
      "PATCH",
      `/api/projects/${project.id}/build-units/${unitId}`,
      { supersededByChange: change.id },
    );
    check(
      stringAttempt.status === 400,
      "PATCH with a change id answers 400 too",
      `status ${stringAttempt.status}`,
    );

    const midway = (await buildUnitsOf(account, project.id)) as {
      id: string;
      supersededByChange: number | null;
    }[];
    check(
      JSON.stringify(before) === JSON.stringify(midway),
      "and neither refused request changed anything",
      "build list byte-identical",
    );

    const cleared = await api(
      account,
      "PATCH",
      `/api/projects/${project.id}/build-units/${unitId}`,
      { supersededByChange: null },
    );
    check(cleared.status === 200, "PATCH with null answers 200", `status ${cleared.status}`);

    const unit = (cleared.body as { unit?: Record<string, unknown> })?.unit;
    check(
      unit?.supersededByChange === null,
      "the unit reads unsuperseded",
      String(unit?.supersededByChange),
    );
    check(
      unit?.status === "shipped" &&
        unit?.verified === "browser" &&
        unit?.title === units[0]!.title &&
        unit?.sequence === units[0]!.sequence,
      "and nothing else about it changed",
      JSON.stringify([unit?.status, unit?.verified, unit?.title, unit?.sequence]),
    );

    const leaked = leakedFields(cleared.raw);
    check(
      leaked.length === 0,
      "the unit body leaks no server-side field",
      leaked.length === 0 ? "none" : leaked.join(","),
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function crossProjectPhase(d: Deps, account: Account) {
  section("cross-project — another project's change id answers 404 and writes nothing");
  const a = await seed(d, account.userId, `cross-a-${process.pid}`);
  const b = await seed(d, account.userId, `cross-b-${process.pid}`);

  try {
    const before = await buildUnitsOf(account, b.project.id);

    // Project B's path, project A's change. The caller is a genuine member of B.
    const response = await api(
      account,
      "POST",
      `/api/projects/${b.project.id}/changes/${a.change.id}/apply`,
    );
    check(response.status === 404, "answers 404", `status ${response.status}`);

    const after = await buildUnitsOf(account, b.project.id);
    check(
      JSON.stringify(before) === JSON.stringify(after),
      "and project B's build list is byte-identical afterwards",
      `${(before as unknown[]).length} units, unchanged`,
    );

    const changeA = await api(
      account,
      "GET",
      `/api/projects/${a.project.id}/changes/${a.change.id}`,
    );
    check(
      (changeA.body as { change?: { status?: string } })?.change?.status ===
        "proposed",
      "project A's change is still proposed",
      String((changeA.body as { change?: { status?: string } })?.change?.status),
    );
  } finally {
    await d.prisma.project.delete({ where: { id: a.project.id } });
    await d.prisma.project.delete({ where: { id: b.project.id } });
  }
}

async function signedOutPhase(d: Deps, account: Account) {
  section("signed-out — 401, no data, no confirmation the project exists");
  const { project, change } = await seed(d, account.userId, `signed-out-${process.pid}`);

  try {
    const before = await buildUnitsOf(account, project.id);

    const response = await api(
      null,
      "POST",
      `/api/projects/${project.id}/changes/${change.id}/apply`,
    );
    check(response.status === 401, "answers 401", `status ${response.status}`);
    check(
      !response.raw.includes(project.id) && !response.raw.includes(change.id),
      "and the body confirms nothing about the project or the change",
      response.raw.slice(0, 120),
    );

    const after = await buildUnitsOf(account, project.id);
    check(
      JSON.stringify(before) === JSON.stringify(after),
      "the build list is unchanged",
      `${(before as unknown[]).length} units, unchanged`,
    );

    const changeRow = await d.prisma.projectChange.findUniqueOrThrow({
      where: { id: change.id },
      select: { status: true },
    });
    check(
      changeRow.status === "PROPOSED",
      "and the change is still PROPOSED",
      changeRow.status,
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
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

  const account = await resolveAccount(email);
  await resolveAuthMode(account);
  const d = await deps();

  const run = {
    apply: () => applyPhase(d, account),
    stale: () => stalePhase(d, account),
    "no-set": () => noSetPhase(d, account),
    "cross-project": () => crossProjectPhase(d, account),
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

  console.log(
    failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
