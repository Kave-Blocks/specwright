/**
 * Seed the project state a browser QA pass needs, owned by a real Clerk account.
 *
 * Why this exists rather than the route the plan first suggested: the HTTP verify
 * scripts can only *borrow* a Clerk session that already exists, so using their
 * `seed()` to set up a browser pass is circular — you need the session before you
 * can create the state you wanted the session for. This writes at the library
 * layer instead, so it needs no session and no running server.
 *
 * **No model call.** Every proposal document here is hand-authored, exactly as
 * `verify-change-application.ts` does it, so seeding costs no AI quota and
 * produces the same shapes a real run would.
 *
 * It creates two projects, both owned by the Clerk user behind `--email`, so
 * that account sees them at `/editor/{projectId}`:
 *
 * - **apply** — spec v1, three `SHIPPED`/`BROWSER` units, one `PROPOSED` change
 *   whose proposal touches two of them and proposes two new units, **one of
 *   which duplicates an existing unit's title** so the apply outcome's
 *   skipped-titles branch actually renders.
 * - **stale** — spec v1 *and* v2, with a `PROPOSED` change still based on v1, so
 *   the stale notice and its second confirmation render.
 *
 * Liveblocks rooms are provisioned lazily by `/api/liveblocks-auth` on first
 * visit, so nothing needs creating here for the editor routes to work.
 *
 * Usage (from the repo root):
 *   npx tsx scripts/seed-browser-fixture.ts --email you@example.com
 *   npx tsx scripts/seed-browser-fixture.ts --cleanup
 *
 * `--cleanup` deletes every project this script has ever created (they are
 * prefixed `browser-fixture-`) and nothing else.
 *
 * Environment (from `.env.local`):
 *   DATABASE_URL            required
 *   BLOB_READ_WRITE_TOKEN   required — the proposal JSON is really uploaded
 *   CLERK_SECRET_KEY        required — to resolve the email to a Clerk user id
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

const PROJECT_PREFIX = "browser-fixture-";
const CLERK_API = "https://api.clerk.com/v1";
// Pinned, matching the HTTP verify scripts — an unpinned BAPI version can change
// response shapes underneath this without warning.
const CLERK_API_VERSION = "2026-05-12";
const SPEC_MARKDOWN =
  "# Fixture spec\n\nWritten by scripts/seed-browser-fixture.ts.\n";

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1]!;
  return null;
}

/** Resolve an email to its Clerk user id. The password is never involved. */
async function clerkUserId(email: string): Promise<string> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "CLERK_SECRET_KEY is not set. Put it in .env.local at the repo root.",
    );
  }

  const response = await fetch(
    `${CLERK_API}/users?email_address=${encodeURIComponent(email)}&limit=10`,
    {
      headers: {
        Authorization: `Bearer ${secret}`,
        "Clerk-API-Version": CLERK_API_VERSION,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Clerk lookup failed (${response.status})`);
  }

  const body: unknown = await response.json();
  const users = Array.isArray(body)
    ? body
    : ((body as { data?: unknown }).data ?? []);
  const first = (users as { id?: unknown }[])[0];
  if (!first || typeof first.id !== "string") {
    throw new Error(
      `No Clerk user has the email address ${email}. Sign that account up first.`,
    );
  }
  return first.id;
}

async function deps() {
  const { prisma } = await import("@/lib/prisma");
  const { saveProjectChange } = await import("@/lib/change-agent/storage");
  const { saveProjectSpec } = await import("@/lib/spec-agent/storage");
  const { deriveBuildUnitKey } = await import("@/lib/build-units");
  return { prisma, saveProjectChange, saveProjectSpec, deriveBuildUnitKey };
}

type Deps = Awaited<ReturnType<typeof deps>>;

/**
 * Units attributed to `specId`, so each carries the "from v{n}" source badge.
 *
 * That badge is not decoration here — it is the **fourth** badge on a superseded
 * row, and four is the count the crowding question is actually about. Seeding
 * hand-typed units (no `specId`, `source: MANUAL`) renders only three, and a
 * three-badge row that looks fine proves nothing about the four-badge one.
 */
async function seedUnits(
  d: Deps,
  projectId: string,
  specId: string,
  titles: string[],
) {
  const units = [];
  for (const title of titles) {
    // Through the real counter, so "created at the end of the list" stays a
    // claim about the same numbering the app uses.
    const { nextBuildUnitSequence } = await d.prisma.project.update({
      where: { id: projectId },
      data: { nextBuildUnitSequence: { increment: 1 } },
      select: { nextBuildUnitSequence: true },
    });
    const sequence = nextBuildUnitSequence - 1;
    units.push(
      await d.prisma.projectBuildUnit.create({
        data: {
          projectId,
          sequence,
          key: d.deriveBuildUnitKey(title, sequence),
          title,
          summary: `What ${title.toLowerCase()} covers.`,
          // Shipped and browser-verified on purpose: the property unit 41 exists
          // to protect is that superseding one does not rewrite it, and that is
          // only visible if there is something to lose.
          status: "SHIPPED",
          verified: "BROWSER",
          specId,
          source: "SPEC",
        },
        select: { id: true, title: true, sequence: true },
      }),
    );
  }
  return units;
}

async function seedApplyProject(d: Deps, ownerId: string) {
  const project = await d.prisma.project.create({
    data: { ownerId, name: `${PROJECT_PREFIX}apply` },
    select: { id: true },
  });

  const spec = await d.saveProjectSpec({
    projectId: project.id,
    markdown: SPEC_MARKDOWN,
  });

  const units = await seedUnits(d, project.id, spec.id, [
    "Realtime canvas",
    "Spec generation",
    "Offline queue",
  ]);

  await d.saveProjectChange({
    projectId: project.id,
    authorId: ownerId,
    request: "Add offline support so the canvas keeps working without a network.",
    baseSpecId: spec.id,
    proposal: {
      summary:
        "Buffer canvas writes locally and reconcile them when the connection returns.",
      architectureDelta: [
        {
          kind: "added" as const,
          component: "Sync queue",
          detail: "Buffers writes while the socket is down.",
        },
        {
          kind: "modified" as const,
          component: "Realtime canvas",
          detail: "Reads from the queue before the socket.",
        },
      ],
      affectedUnits: [
        { buildUnitId: units[0]!.id, reason: "Writes now go through the queue." },
        { buildUnitId: units[1]!.id, reason: "Specs must describe the queue." },
      ],
      proposedUnits: [
        { title: "Sync reconciliation", summary: "Replay buffered writes in order." },
        { title: "Conflict resolution", summary: null },
        // Duplicates unit 3 above, so the outcome's skipped-titles branch renders.
        { title: "Offline queue", summary: "Duplicate — this one must be skipped." },
      ],
      openQuestions: ["How long should buffered writes be retained?"],
    },
  });

  return { id: project.id, specVersion: spec.version, units: units.length };
}

async function seedStaleProject(d: Deps, ownerId: string) {
  const project = await d.prisma.project.create({
    data: { ownerId, name: `${PROJECT_PREFIX}stale` },
    select: { id: true },
  });

  const first = await d.saveProjectSpec({
    projectId: project.id,
    markdown: SPEC_MARKDOWN,
  });

  const units = await seedUnits(d, project.id, first.id, ["Auth", "Billing"]);

  // Based on v1 …
  await d.saveProjectChange({
    projectId: project.id,
    authorId: ownerId,
    request: "Move billing behind a feature flag.",
    baseSpecId: first.id,
    proposal: {
      summary: "Gate billing so it can ship dark.",
      architectureDelta: [
        {
          kind: "added" as const,
          component: "Feature flags",
          detail: "Gates billing routes.",
        },
      ],
      affectedUnits: [
        { buildUnitId: units[1]!.id, reason: "Billing moves behind the flag." },
      ],
      proposedUnits: [
        { title: "Flag evaluation", summary: "Resolve flags per request." },
      ],
      openQuestions: [],
    },
  });

  // … and then the project moves to v2, which is what makes it stale.
  const second = await d.saveProjectSpec({
    projectId: project.id,
    markdown: SPEC_MARKDOWN,
  });

  return { id: project.id, baseVersion: first.version, currentVersion: second.version };
}

async function cleanup(d: Deps) {
  const { count } = await d.prisma.project.deleteMany({
    where: { name: { startsWith: PROJECT_PREFIX } },
  });
  console.log(`Deleted ${count} fixture project(s).`);
}

async function main() {
  const d = await deps();

  if (process.argv.includes("--cleanup")) {
    await cleanup(d);
    await d.prisma.$disconnect();
    return;
  }

  const email = arg("email");
  if (!email) {
    console.error(
      "Usage: npx tsx scripts/seed-browser-fixture.ts --email you@example.com",
    );
    process.exit(1);
  }

  const ownerId = await clerkUserId(email);
  console.log(`Owner: ${email} → ${ownerId}\n`);

  const apply = await seedApplyProject(d, ownerId);
  const stale = await seedStaleProject(d, ownerId);

  console.log("apply fixture — spec v%d, %d units, 1 PROPOSED change", apply.specVersion, apply.units);
  console.log(`  changes  /editor/${apply.id}/changes`);
  console.log(`  build    /editor/${apply.id}/build`);
  console.log(`  specs    /editor/${apply.id}/specs`);
  console.log();
  console.log(
    "stale fixture — change based on v%d, project now on v%d",
    stale.baseVersion,
    stale.currentVersion,
  );
  console.log(`  changes  /editor/${stale.id}/changes`);
  console.log();
  console.log("Clean up with: npx tsx scripts/seed-browser-fixture.ts --cleanup");

  await d.prisma.$disconnect();
}

void main();
