/**
 * Proves spec-derived build units (unit 44) at the **library and database
 * layer**, against the real Postgres and the real Blob store.
 *
 * **There is no model call anywhere in this script, and that is deliberate.**
 * The two things this unit must never get wrong — that a human-owned column is
 * never written from model output, and that an existing unit is never touched —
 * are both decided *after* the model has spoken. Feeding hand-authored units
 * through `produceDerivedUnits` proves the producer holds regardless of what the
 * model emits, which observing one good model run could never do. What a model
 * actually returns for a real spec is a separate question, and an unfalsifiable
 * one; it is listed under "Not Verified" in the progress file rather than
 * pretended at here.
 *
 * What a passing run proves — unit 44's "Check When Done" list, at the layer
 * this script can reach:
 * - `derive`: units are created with `source: spec`, the spec's version as
 *   their lineage, and `specced`/`none` as their status and verification.
 * - `contract`: a derived unit whose key collides with a hand-typed one is
 *   skipped and reported, and the existing unit is byte-unchanged — every
 *   column, including the human-owned three. Nothing is superseded.
 * - `idempotent`: deriving the same units a second time creates nothing. The
 *   key collision *is* the idempotency, which is why no "already derived"
 *   column exists.
 * - `untrusted`: entries with a blank or whitespace-only title are dropped and
 *   counted, not written; the rest of the batch still lands.
 * - `cap`: a derivation that would exceed `MAX_BUILD_UNITS` is refused whole —
 *   nothing created, and the reserved sequence block rolled back.
 * - `no-spec`: a project with no spec has no context to derive from, so the
 *   refusal is decided before any model call would be spent.
 *
 * What a passing run does **not** prove:
 * - Anything at the HTTP layer: not `POST /api/ai/units`'s 409, not its 404
 *   masking, not the signed-out or non-member paths. Those need a live server
 *   and a real Clerk session.
 * - Anything about the model: whether a real spec yields sensible units is not
 *   something a script can assert.
 * - Anything in a browser. There is no UI in this unit at all — it is a
 *   separate one.
 *
 * Data safety. Every project this script touches is one it created, named with
 * the `verify-units-from-spec-` prefix, and deleted in a `finally` — including
 * on failure. Nothing pre-existing is read or mutated. Blobs uploaded here are
 * left behind when their rows cascade away; they are inert.
 *
 * Usage (from the repo root):
 *   npm run verify:units -- derive
 *   npm run verify:units -- contract
 *   npm run verify:units -- idempotent
 *   npm run verify:units -- untrusted
 *   npm run verify:units -- cap
 *   npm run verify:units -- no-spec
 *   npm run verify:units -- all
 *
 * Requires `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` in `.env.local` or `.env`.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

const PROJECT_PREFIX = "verify-units-from-spec-";
const OWNER_ID = "verify-units-from-spec-owner";
const SPEC_MARKDOWN =
  "# Fixture spec\n\nWritten by scripts/verify-units-from-spec.ts.\n";

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n${title}`);
}

/** Deferred so `.env.local` is loaded before the Prisma client is constructed. */
async function deps() {
  const { prisma } = await import("@/lib/prisma");
  const { saveProjectSpec } = await import("@/lib/spec-agent/storage");
  const { produceDerivedUnits } = await import("@/lib/unit-agent/produce");
  const { loadDeriveContext } = await import("@/lib/unit-agent/derive");
  const { deriveBuildUnitKey, MAX_BUILD_UNITS, listBuildUnits } = await import(
    "@/lib/build-units"
  );
  return {
    prisma,
    saveProjectSpec,
    produceDerivedUnits,
    loadDeriveContext,
    deriveBuildUnitKey,
    MAX_BUILD_UNITS,
    listBuildUnits,
  };
}

type Deps = Awaited<ReturnType<typeof deps>>;

/** A project with a spec, and optionally some hand-typed units. */
async function seedProject(d: Deps, suffix: string, handTypedTitles: string[] = []) {
  const project = await d.prisma.project.create({
    data: { ownerId: OWNER_ID, name: `${PROJECT_PREFIX}${suffix}` },
    select: { id: true },
  });

  const spec = await d.saveProjectSpec({
    projectId: project.id,
    markdown: SPEC_MARKDOWN,
  });

  const units = [];
  for (const title of handTypedTitles) {
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
          key: d.deriveBuildUnitKey(title, sequence),
          title,
          summary: `Hand-typed summary for ${title}.`,
          // Shipped and browser-verified on purpose: the property this unit must
          // not break is that a producer never rewrites a human-owned column,
          // and that is only visible if there is something to lose.
          status: "SHIPPED",
          verified: "BROWSER",
        },
        select: {
          id: true,
          sequence: true,
          title: true,
          summary: true,
          status: true,
          verified: true,
          source: true,
          specId: true,
          supersededByChangeId: true,
        },
      }),
    );
  }

  return { project, spec, units };
}

/* -------------------------------------------------------------------------- */
/* Phases                                                                      */
/* -------------------------------------------------------------------------- */

async function derivePhase() {
  section("derive — units land with spec lineage and default human-owned columns");
  const d = await deps();
  const { project, spec } = await seedProject(d, "derive");

  const result = await d.produceDerivedUnits(project.id, spec.id, [
    { title: "Realtime canvas", summary: "The collaborative surface." },
    { title: "Spec generation", summary: null },
    { title: "Offline queue", summary: "Buffer writes while the socket is down." },
  ]);

  check("the derivation succeeded", result.ok);
  if (!result.ok) {
    return;
  }

  const { created, skippedTitles, droppedCount } = result.produced;
  check("all three units were created", created.length === 3, `got ${created.length}`);
  check("nothing was skipped", skippedTitles.length === 0);
  check("nothing was dropped", droppedCount === 0);

  check(
    "every created unit reads source `spec`",
    created.every((unit) => unit.source === "spec"),
  );
  check(
    "every created unit carries the spec's version as its lineage",
    created.every((unit) => unit.specVersion === spec.version),
    `expected ${spec.version}`,
  );
  check(
    "every created unit reads `specced` / `none`",
    created.every((unit) => unit.status === "specced" && unit.verified === "none"),
  );
  check(
    "an omitted summary is stored as null, not as an empty string",
    created[1]?.summary === null,
  );
  check(
    "the units are numbered consecutively from the reserved block",
    created[1]!.sequence === created[0]!.sequence + 1 &&
      created[2]!.sequence === created[1]!.sequence + 1,
  );
  check(
    "nothing was marked superseded",
    created.every((unit) => unit.supersededByChange === null),
  );
}

async function contractPhase() {
  section("contract — a collision is skipped and the existing unit is untouched");
  const d = await deps();
  const { project, spec, units } = await seedProject(d, "contract", [
    "Realtime canvas",
  ]);
  const before = units[0]!;

  const result = await d.produceDerivedUnits(project.id, spec.id, [
    // Same title as the hand-typed unit, so the derived key collides.
    { title: "Realtime canvas", summary: "The model's version of this unit." },
    { title: "Spec generation", summary: null },
  ]);

  check("the derivation succeeded", result.ok);
  if (!result.ok) {
    return;
  }

  check(
    "the colliding title was skipped, not created",
    result.produced.created.length === 1 &&
      result.produced.created[0]!.title === "Spec generation",
  );
  check(
    "and reported by title",
    result.produced.skippedTitles.length === 1 &&
      result.produced.skippedTitles[0] === "Realtime canvas",
  );

  const after = await d.prisma.projectBuildUnit.findUnique({
    where: { id: before.id },
    select: {
      sequence: true,
      title: true,
      summary: true,
      status: true,
      verified: true,
      source: true,
      specId: true,
      supersededByChangeId: true,
    },
  });

  check("the existing unit still exists", after !== null);
  if (!after) {
    return;
  }

  // The whole contract, column by column. A single deep-equal would pass while
  // saying nothing about *which* column a future producer started writing.
  check("its status was not rewritten", after.status === before.status);
  check("its verification was not rewritten", after.verified === before.verified);
  check("its sequence was not rewritten", after.sequence === before.sequence);
  check("its title was not rewritten", after.title === before.title);
  check("its summary was not rewritten", after.summary === before.summary);
  check(
    "it was not re-attributed to the spec",
    after.source === before.source && after.specId === before.specId,
  );
  check(
    "and it was not marked superseded",
    after.supersededByChangeId === null,
  );

  const all = await d.listBuildUnits(project.id);
  check("the project holds exactly two units", all.length === 2, `got ${all.length}`);
}

async function idempotentPhase() {
  section("idempotent — deriving the same spec twice creates nothing the second time");
  const d = await deps();
  const { project, spec } = await seedProject(d, "idempotent");

  const units = [
    { title: "Realtime canvas", summary: null },
    { title: "Spec generation", summary: null },
  ];

  const first = await d.produceDerivedUnits(project.id, spec.id, units);
  check("the first derivation created both units", first.ok && first.produced.created.length === 2);

  const second = await d.produceDerivedUnits(project.id, spec.id, units);
  check("the second derivation succeeded", second.ok);
  if (!second.ok) {
    return;
  }
  check(
    "and created nothing",
    second.produced.created.length === 0,
    `created ${second.produced.created.length}`,
  );
  check(
    "reporting both titles as skipped",
    second.produced.skippedTitles.length === 2,
  );

  const all = await d.listBuildUnits(project.id);
  check("the project still holds exactly two units", all.length === 2, `got ${all.length}`);
}

async function untrustedPhase() {
  section("untrusted — untitled model entries are dropped and counted, not written");
  const d = await deps();
  const { project, spec } = await seedProject(d, "untrusted");

  const result = await d.produceDerivedUnits(project.id, spec.id, [
    { title: "Realtime canvas", summary: null },
    { title: "   ", summary: "Whitespace is not a title." },
    { title: "", summary: null },
    { title: "Spec generation", summary: null },
  ]);

  check("the derivation succeeded", result.ok);
  if (!result.ok) {
    return;
  }

  check(
    "the two usable units were created",
    result.produced.created.length === 2,
    `got ${result.produced.created.length}`,
  );
  check(
    "the two untitled entries were dropped",
    result.produced.droppedCount === 2,
    `got ${result.produced.droppedCount}`,
  );
  check(
    "a drop is not reported as a skip — they are different facts",
    result.produced.skippedTitles.length === 0,
  );
  check(
    "no unit was created with a blank title",
    result.produced.created.every((unit) => unit.title.trim().length > 0),
  );
  check(
    "and the two survivors are still numbered consecutively",
    result.produced.created[1]!.sequence === result.produced.created[0]!.sequence + 1,
  );
}

async function capPhase() {
  section("cap — a derivation past the ceiling is refused whole");
  const d = await deps();
  const { project, spec } = await seedProject(d, "cap");

  // Fill the project to one below the cap, in one statement rather than through
  // the producer — this phase is about the refusal, not about the fill.
  const fill = Array.from({ length: d.MAX_BUILD_UNITS - 1 }, (_, index) => ({
    projectId: project.id,
    sequence: index,
    key: `filler-${index}`,
    title: `Filler ${index}`,
    summary: null,
  }));
  await d.prisma.projectBuildUnit.createMany({ data: fill });
  await d.prisma.project.update({
    where: { id: project.id },
    data: { nextBuildUnitSequence: d.MAX_BUILD_UNITS - 1 },
  });

  const before = await d.prisma.project.findUnique({
    where: { id: project.id },
    select: { nextBuildUnitSequence: true },
  });

  // Two more would reach 201, one past the cap.
  const result = await d.produceDerivedUnits(project.id, spec.id, [
    { title: "One over", summary: null },
    { title: "Two over", summary: null },
  ]);

  check("the derivation is refused", !result.ok);
  check(
    "and refused for the cap",
    !result.ok && result.reason === "cap",
    !result.ok ? result.reason : "it succeeded",
  );

  const count = await d.prisma.projectBuildUnit.count({
    where: { projectId: project.id },
  });
  check(
    "no unit was created",
    count === d.MAX_BUILD_UNITS - 1,
    `holds ${count}`,
  );

  const after = await d.prisma.project.findUnique({
    where: { id: project.id },
    select: { nextBuildUnitSequence: true },
  });
  check(
    "the reserved sequence block rolled back with it",
    after?.nextBuildUnitSequence === before?.nextBuildUnitSequence,
    `${before?.nextBuildUnitSequence} → ${after?.nextBuildUnitSequence}`,
  );
}

async function noSpecPhase() {
  section("no-spec — a project with no spec has nothing to derive from");
  const d = await deps();
  const project = await d.prisma.project.create({
    data: { ownerId: OWNER_ID, name: `${PROJECT_PREFIX}no-spec` },
    select: { id: true },
  });

  const context = await d.loadDeriveContext(project.id);
  check(
    "the context loader refuses before any model call could be spent",
    context === null,
  );

  // And the positive case, so the refusal is not passing for the wrong reason.
  const spec = await d.saveProjectSpec({
    projectId: project.id,
    markdown: SPEC_MARKDOWN,
  });
  const withSpec = await d.loadDeriveContext(project.id);
  check("once a spec exists, the context loads", withSpec !== null);
  check(
    "and it carries that spec's id and version",
    withSpec?.spec.id === spec.id && withSpec?.spec.version === spec.version,
  );
  check(
    "with the spec's real Markdown, read back out of Blob",
    withSpec?.spec.markdown === SPEC_MARKDOWN,
  );
  check(
    "and an empty existing-unit list",
    withSpec?.existing.length === 0,
  );
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

const PHASES: Record<string, () => Promise<void>> = {
  derive: derivePhase,
  contract: contractPhase,
  idempotent: idempotentPhase,
  untrusted: untrustedPhase,
  cap: capPhase,
  "no-spec": noSpecPhase,
};

async function cleanup() {
  const { prisma } = await import("@/lib/prisma");
  const { count } = await prisma.project.deleteMany({
    where: { name: { startsWith: PROJECT_PREFIX } },
  });
  if (count > 0) {
    console.log(`\ncleanup: removed ${count} throwaway project(s)`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const phase = args.find((a) => !a.startsWith("--")) ?? "all";

  if (phase !== "all" && !Object.hasOwn(PHASES, phase)) {
    console.error(
      `Unknown phase "${phase}". Use one of: ${Object.keys(PHASES).join(", ")}, all`,
    );
    process.exit(1);
  }

  try {
    if (phase === "all") {
      for (const run of Object.values(PHASES)) {
        await run();
      }
    } else {
      await PHASES[phase]!();
    }
  } finally {
    await cleanup();
  }

  console.log("");
  if (failures > 0) {
    console.log(`${failures} check(s) FAILED.`);
    process.exit(1);
  }
  console.log("All checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
