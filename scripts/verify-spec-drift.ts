/**
 * Proves spec-drift counting (unit 42) at the **library and database layer**,
 * against the real Postgres and the real Blob store.
 *
 * There is no model call anywhere in this script, and there is none in the unit
 * either: drift is counted from columns units 39, 40, and 41 already write.
 * Every phase hand-authors its proposal document through `saveProjectChange`
 * and applies it through the real `applyChange`, so what is counted here is the
 * state a real apply actually leaves behind.
 *
 * What a passing run proves — unit 42's "Check When Done" list, at the layer
 * this script can reach:
 * - `none`: a project with no specs counts `0` and reports a `null` version
 *   rather than failing; a project with a spec but no applied changes counts
 *   `0` against its real version.
 * - `applied`: applying one change counts `1` and names the current version.
 * - `two`: applying two changes without regenerating counts `2`, not `1`.
 * - `regenerate`: generating a spec clears the count back to `0`.
 * - `older`: a change applied against a version that is no longer current is
 *   **not** counted, while one applied against the current version is — the
 *   whole basis of deriving drift instead of storing it.
 * - `status`: a `PROPOSED` change and a `DISCARDED` change are never counted.
 *   Neither has touched the build list, so neither can have put the spec behind.
 * - `deleted-spec`: with the newest spec removed, "current" falls back to the
 *   highest version that still *exists* — not `nextSpecVersion - 1`. This is
 *   the one case where the two disagree, and the reason the version is read
 *   from the rows.
 * - `cross-project`: an applied change in another project is never counted
 *   against this one.
 *
 * What a passing run does **not** prove:
 * - Anything at the HTTP layer: not that `GET /specs` carries the two fields,
 *   not that it still omits `filePath`, and not the signed-out or non-member
 *   paths. Those need a live server and a real Clerk session.
 * - Anything about the browser or the React views — the notice's presence at
 *   one, its absence at zero, and the added apply-outcome line are unobserved
 *   by this script.
 *
 * Data safety. Every project this script touches is one it created, named with
 * the `verify-spec-drift-` prefix, and deleted in a `finally` — including on
 * failure. Nothing pre-existing is read or mutated. Blobs uploaded here are
 * left behind when their rows cascade away; they are inert.
 *
 * Usage (from the repo root):
 *   npm run verify:drift -- none
 *   npm run verify:drift -- applied
 *   npm run verify:drift -- two
 *   npm run verify:drift -- regenerate
 *   npm run verify:drift -- older
 *   npm run verify:drift -- status
 *   npm run verify:drift -- deleted-spec
 *   npm run verify:drift -- cross-project
 *   npm run verify:drift -- all
 *
 * Environment (from `.env.local`):
 *   DATABASE_URL            required
 *   BLOB_READ_WRITE_TOKEN   required — the proposal JSON is really uploaded
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

const PROJECT_PREFIX = "verify-spec-drift-";
const OWNER_ID = "verify-spec-drift-owner";
const AUTHOR_ID = "verify-spec-drift-author";
const SPEC_MARKDOWN =
  "# Fixture spec\n\nWritten by scripts/verify-spec-drift.ts.\n";

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

/** Deferred so `.env.local` is loaded before the Prisma client is constructed. */
async function deps() {
  const { prisma } = await import("@/lib/prisma");
  const { saveProjectChange } = await import("@/lib/change-agent/storage");
  const { applyChange } = await import("@/lib/changes/apply");
  const { countAppliedChangesSinceCurrentSpec, currentSpecVersionOf } =
    await import("@/lib/changes");
  const { saveProjectSpec } = await import("@/lib/spec-agent/storage");
  const { deriveBuildUnitKey } = await import("@/lib/build-units");
  return {
    prisma,
    saveProjectChange,
    applyChange,
    countAppliedChangesSinceCurrentSpec,
    currentSpecVersionOf,
    saveProjectSpec,
    deriveBuildUnitKey,
  };
}

type Deps = Awaited<ReturnType<typeof deps>>;

/** A project with `unitCount` build units, and no spec yet. */
async function seedProject(d: Deps, suffix: string, unitCount = 1) {
  const project = await d.prisma.project.create({
    data: { ownerId: OWNER_ID, name: `${PROJECT_PREFIX}${suffix}` },
    select: { id: true },
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
        select: { id: true },
      }),
    );
  }

  return { project, units };
}

/**
 * A fixed proposal document. No model involved.
 *
 * Titles are parameterised because `41` skips a proposed unit whose derived key
 * collides with an existing one — two changes proposing "Offline queue" would
 * create nothing the second time, and this script would then be counting
 * applies that did no work.
 */
function fixtureProposal(buildUnitIds: string[], label: string) {
  return {
    summary: `Add ${label}.`,
    architectureDelta: [
      {
        kind: "added" as const,
        component: `${label} component`,
        detail: "Fixture delta.",
      },
    ],
    affectedUnits: buildUnitIds.map((buildUnitId) => ({
      buildUnitId,
      reason: "Touches the fixture path.",
    })),
    proposedUnits: [{ title: label, summary: `Summary for ${label}.` }],
    openQuestions: [],
  };
}

/** Save a change against `baseSpecId` and apply it, asserting it landed. */
async function applyFixtureChange(
  d: Deps,
  projectId: string,
  baseSpecId: string,
  buildUnitIds: string[],
  label: string,
) {
  const saved = await d.saveProjectChange({
    projectId,
    authorId: AUTHOR_ID,
    request: `Add ${label}`,
    baseSpecId,
    proposal: fixtureProposal(buildUnitIds, label),
  });
  const result = await d.applyChange(projectId, saved.id);
  check(
    `fixture apply "${label}" succeeded`,
    result.ok,
    result.ok ? "" : result.reason,
  );
  return saved;
}

/* -------------------------------------------------------------------------- */
/* Phases                                                                      */
/* -------------------------------------------------------------------------- */

async function nonePhase() {
  console.log(
    "\nnone — no specs counts 0 with a null version; a spec with no changes counts 0",
  );
  const d = await deps();
  const { project } = await seedProject(d, `none-${process.pid}`);

  try {
    const empty = await d.countAppliedChangesSinceCurrentSpec(project.id);
    check(
      "a project with no specs counts 0",
      empty.appliedSinceCurrentSpec === 0,
      String(empty.appliedSinceCurrentSpec),
    );
    check(
      "a project with no specs reports a null version rather than erroring",
      empty.currentSpecVersion === null,
      String(empty.currentSpecVersion),
    );

    const spec = await d.saveProjectSpec({
      projectId: project.id,
      markdown: SPEC_MARKDOWN,
    });
    const fresh = await d.countAppliedChangesSinceCurrentSpec(project.id);
    check(
      "a spec with no applied changes counts 0",
      fresh.appliedSinceCurrentSpec === 0,
      String(fresh.appliedSinceCurrentSpec),
    );
    check(
      "the version reported is the spec that exists",
      fresh.currentSpecVersion === spec.version,
      `${fresh.currentSpecVersion} vs ${spec.version}`,
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function appliedPhase() {
  console.log("\napplied — one applied change counts 1 against the current version");
  const d = await deps();
  const { project, units } = await seedProject(d, `applied-${process.pid}`);

  try {
    const spec = await d.saveProjectSpec({
      projectId: project.id,
      markdown: SPEC_MARKDOWN,
    });
    await applyFixtureChange(
      d,
      project.id,
      spec.id,
      [units[0]!.id],
      "Offline queue",
    );

    const drift = await d.countAppliedChangesSinceCurrentSpec(project.id);
    check(
      "the count is 1",
      drift.appliedSinceCurrentSpec === 1,
      String(drift.appliedSinceCurrentSpec),
    );
    check(
      "it is measured against the current version",
      drift.currentSpecVersion === spec.version,
      `${drift.currentSpecVersion} vs ${spec.version}`,
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function twoPhase() {
  console.log("\ntwo — two applies without regenerating count 2, not 1");
  const d = await deps();
  const { project, units } = await seedProject(d, `two-${process.pid}`);

  try {
    const spec = await d.saveProjectSpec({
      projectId: project.id,
      markdown: SPEC_MARKDOWN,
    });
    await applyFixtureChange(d, project.id, spec.id, [units[0]!.id], "Offline queue");
    await applyFixtureChange(d, project.id, spec.id, [units[0]!.id], "Retry policy");

    const drift = await d.countAppliedChangesSinceCurrentSpec(project.id);
    check(
      "the count is 2",
      drift.appliedSinceCurrentSpec === 2,
      String(drift.appliedSinceCurrentSpec),
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function regeneratePhase() {
  console.log("\nregenerate — generating a spec clears the count");
  const d = await deps();
  const { project, units } = await seedProject(d, `regenerate-${process.pid}`);

  try {
    const first = await d.saveProjectSpec({
      projectId: project.id,
      markdown: SPEC_MARKDOWN,
    });
    await applyFixtureChange(d, project.id, first.id, [units[0]!.id], "Offline queue");

    const before = await d.countAppliedChangesSinceCurrentSpec(project.id);
    check(
      "the count is 1 before regenerating",
      before.appliedSinceCurrentSpec === 1,
      String(before.appliedSinceCurrentSpec),
    );

    const second = await d.saveProjectSpec({
      projectId: project.id,
      markdown: SPEC_MARKDOWN,
    });
    const after = await d.countAppliedChangesSinceCurrentSpec(project.id);
    check(
      "the count is 0 after regenerating",
      after.appliedSinceCurrentSpec === 0,
      String(after.appliedSinceCurrentSpec),
    );
    check(
      "the version advanced to the new spec",
      after.currentSpecVersion === second.version,
      `${after.currentSpecVersion} vs ${second.version}`,
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function olderPhase() {
  console.log(
    "\nolder — a change applied before the current version is not counted; a later one is",
  );
  const d = await deps();
  const { project, units } = await seedProject(d, `older-${process.pid}`);

  try {
    const first = await d.saveProjectSpec({
      projectId: project.id,
      markdown: SPEC_MARKDOWN,
    });
    await applyFixtureChange(d, project.id, first.id, [units[0]!.id], "Offline queue");

    // A spec generated *after* that apply — the drift it created is now resolved.
    const second = await d.saveProjectSpec({
      projectId: project.id,
      markdown: SPEC_MARKDOWN,
    });
    await applyFixtureChange(d, project.id, second.id, [units[0]!.id], "Retry policy");

    const drift = await d.countAppliedChangesSinceCurrentSpec(project.id);
    check(
      "only the change applied against the current version is counted",
      drift.appliedSinceCurrentSpec === 1,
      String(drift.appliedSinceCurrentSpec),
    );
    check(
      "the version is the newer spec",
      drift.currentSpecVersion === second.version,
      `${drift.currentSpecVersion} vs ${second.version}`,
    );

    const applied = await d.prisma.projectChange.count({
      where: { projectId: project.id, status: "APPLIED" },
    });
    check(
      "both changes really are APPLIED — the exclusion is by version, not by status",
      applied === 2,
      String(applied),
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function statusPhase() {
  console.log("\nstatus — a proposed change and a discarded change are never counted");
  const d = await deps();
  const { project, units } = await seedProject(d, `status-${process.pid}`);

  try {
    const spec = await d.saveProjectSpec({
      projectId: project.id,
      markdown: SPEC_MARKDOWN,
    });

    // Saved and left alone: still PROPOSED.
    await d.saveProjectChange({
      projectId: project.id,
      authorId: AUTHOR_ID,
      request: "Add offline mode",
      baseSpecId: spec.id,
      proposal: fixtureProposal([units[0]!.id], "Offline queue"),
    });

    const discarded = await d.saveProjectChange({
      projectId: project.id,
      authorId: AUTHOR_ID,
      request: "Add retries",
      baseSpecId: spec.id,
      proposal: fixtureProposal([units[0]!.id], "Retry policy"),
    });
    await d.prisma.projectChange.update({
      where: { id: discarded.id },
      data: { status: "DISCARDED" },
    });

    const drift = await d.countAppliedChangesSinceCurrentSpec(project.id);
    check(
      "neither a proposed nor a discarded change puts the spec behind",
      drift.appliedSinceCurrentSpec === 0,
      String(drift.appliedSinceCurrentSpec),
    );

    // And the same project counts 1 the moment one of them is applied, so the
    // zero above is the status filter working rather than the fixture failing.
    await applyFixtureChange(d, project.id, spec.id, [units[0]!.id], "Sync worker");
    const after = await d.countAppliedChangesSinceCurrentSpec(project.id);
    check(
      "applying one of them counts 1",
      after.appliedSinceCurrentSpec === 1,
      String(after.appliedSinceCurrentSpec),
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function deletedSpecPhase() {
  console.log(
    "\ndeleted-spec — current is the highest version that exists, not nextSpecVersion - 1",
  );
  const d = await deps();
  const { project, units } = await seedProject(d, `deleted-spec-${process.pid}`);

  try {
    const first = await d.saveProjectSpec({
      projectId: project.id,
      markdown: SPEC_MARKDOWN,
    });
    await applyFixtureChange(d, project.id, first.id, [units[0]!.id], "Offline queue");

    // A second spec resolves the drift, then is removed. No change was reasoned
    // against it, so `onDelete: Restrict` does not refuse the delete.
    const second = await d.saveProjectSpec({
      projectId: project.id,
      markdown: SPEC_MARKDOWN,
    });
    await d.prisma.projectSpec.delete({ where: { id: second.id } });

    const { nextSpecVersion } = await d.prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { nextSpecVersion: true },
    });
    check(
      "the counter and the surviving rows genuinely disagree",
      nextSpecVersion - 1 !== first.version,
      `counter says ${nextSpecVersion - 1}, newest row is ${first.version}`,
    );

    const current = await d.currentSpecVersionOf(project.id);
    check(
      "current resolves to the surviving spec",
      current === first.version,
      `${current} vs ${first.version}`,
    );

    const drift = await d.countAppliedChangesSinceCurrentSpec(project.id);
    check(
      "the drift reappears against the surviving version",
      drift.appliedSinceCurrentSpec === 1,
      String(drift.appliedSinceCurrentSpec),
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function crossProjectPhase() {
  console.log("\ncross-project — another project's applied changes are never counted");
  const d = await deps();
  const a = await seedProject(d, `cross-a-${process.pid}`);
  const b = await seedProject(d, `cross-b-${process.pid}`);

  try {
    const specA = await d.saveProjectSpec({
      projectId: a.project.id,
      markdown: SPEC_MARKDOWN,
    });
    const specB = await d.saveProjectSpec({
      projectId: b.project.id,
      markdown: SPEC_MARKDOWN,
    });

    await applyFixtureChange(d, a.project.id, specA.id, [a.units[0]!.id], "Offline queue");
    await applyFixtureChange(d, a.project.id, specA.id, [a.units[0]!.id], "Retry policy");

    const driftB = await d.countAppliedChangesSinceCurrentSpec(b.project.id);
    check(
      "project B counts 0 while project A counts 2",
      driftB.appliedSinceCurrentSpec === 0,
      String(driftB.appliedSinceCurrentSpec),
    );
    check(
      "project B reports its own version",
      driftB.currentSpecVersion === specB.version,
      `${driftB.currentSpecVersion} vs ${specB.version}`,
    );

    const driftA = await d.countAppliedChangesSinceCurrentSpec(a.project.id);
    check(
      "project A is unaffected by B's existence",
      driftA.appliedSinceCurrentSpec === 2,
      String(driftA.appliedSinceCurrentSpec),
    );
  } finally {
    await d.prisma.project.delete({ where: { id: a.project.id } });
    await d.prisma.project.delete({ where: { id: b.project.id } });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const phase = args.find((a) => !a.startsWith("--")) ?? "all";

  const run = {
    none: nonePhase,
    applied: appliedPhase,
    two: twoPhase,
    regenerate: regeneratePhase,
    older: olderPhase,
    status: statusPhase,
    "deleted-spec": deletedSpecPhase,
    "cross-project": crossProjectPhase,
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
