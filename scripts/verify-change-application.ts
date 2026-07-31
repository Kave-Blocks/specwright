/**
 * Proves change-application behaviour (unit 41) at the **library and database
 * layer**, against the real Postgres and the real Blob store.
 *
 * There is no model call anywhere in this script, and there is none in the unit
 * either: applying consumes the proposal document unit 40 already stored rather
 * than producing one. Every phase hand-authors that document through
 * `saveProjectChange` — the fixture the unit spec asks for — and then calls
 * `applyChange` against it.
 *
 * What a passing run proves — unit 41's "Check When Done" list, at the layer
 * this script can reach:
 * - `creates`: applying creates the proposed units at the **end** of the build
 *   list, each `specced` / `none` / `source: change`, with no existing unit
 *   renumbered and no spec written.
 * - `preserves`: a superseded unit keeps its title, summary, status,
 *   verification level, and sequence **byte-identical**; a unit that read
 *   `shipped` / `browser` before still reads `shipped` / `browser` after, **and**
 *   carries the supersession marker.
 * - `twice`: applying the same change twice is refused, and the second attempt
 *   creates nothing and changes nothing.
 * - `stale`: a change whose base spec is no longer the project's current version
 *   is refused, the refusal names both versions, and confirming with the current
 *   version applies it.
 * - `duplicate`: a proposed unit whose title matches an existing unit is skipped
 *   and reported, and the existing unit is untouched.
 * - `cap`: a change that would push the project past `MAX_BUILD_UNITS` is
 *   refused **whole** — nothing created, nothing superseded, change still
 *   `PROPOSED`.
 * - `clear`: a person can clear supersession, and nothing else about that unit
 *   changes.
 * - `set-null`: deleting a change leaves the units it created and superseded
 *   standing, with both links nulled (`onDelete: SetNull`). No route does this
 *   today — it is a database-level guarantee, tested here so a future delete
 *   route inherits it.
 * - `discarded`: `applyChange` refuses a `DISCARDED` change.
 * - `cross-project`: a change id from another project cannot be applied through
 *   a project id it does not belong to.
 *
 * What a passing run does **not** prove:
 * - Anything at the HTTP layer: not the 404/409 status codes, not the
 *   `supersededByChange` rejection in the PATCH body, not the signed-out or
 *   non-member paths, and not the absence of ids in real response bodies. Those
 *   are route-layer and are driven through a real signed-in browser session.
 * - Anything about the browser or the React views.
 * - A genuine mid-transaction failure. The `cap` phase proves the all-or-nothing
 *   rollback via the cap sentinel, which is the same transaction and the same
 *   rollback, but not an arbitrary crash at an arbitrary statement.
 *
 * Data safety. Every project this script touches is one it created, named with
 * the `verify-change-application-` prefix, and deleted in a `finally` — including
 * on failure. Nothing pre-existing is read or mutated. Blobs uploaded here are
 * left behind when their rows cascade away; they are inert.
 *
 * Usage (from the repo root):
 *   npm run verify:apply -- creates
 *   npm run verify:apply -- preserves
 *   npm run verify:apply -- twice
 *   npm run verify:apply -- stale
 *   npm run verify:apply -- duplicate
 *   npm run verify:apply -- cap
 *   npm run verify:apply -- clear
 *   npm run verify:apply -- set-null
 *   npm run verify:apply -- discarded
 *   npm run verify:apply -- cross-project
 *   npm run verify:apply -- all
 *
 * Environment (from `.env.local`):
 *   DATABASE_URL            required
 *   BLOB_READ_WRITE_TOKEN   required — the proposal JSON is really uploaded
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

const PROJECT_PREFIX = "verify-change-application-";
const OWNER_ID = "verify-change-application-owner";
const AUTHOR_ID = "verify-change-application-author";
const SPEC_MARKDOWN =
  "# Fixture spec\n\nWritten by scripts/verify-change-application.ts.\n";

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
  const { saveProjectSpec } = await import("@/lib/spec-agent/storage");
  const { updateBuildUnit, MAX_BUILD_UNITS, deriveBuildUnitKey } = await import(
    "@/lib/build-units"
  );
  return {
    prisma,
    saveProjectChange,
    applyChange,
    saveProjectSpec,
    updateBuildUnit,
    MAX_BUILD_UNITS,
    deriveBuildUnitKey,
  };
}

type Deps = Awaited<ReturnType<typeof deps>>;

/**
 * A project with a spec and `unitCount` build units — the state an apply needs.
 *
 * Units are seeded through the real counter rather than with hand-picked
 * sequences, so "created at the end of the list" is a claim about the same
 * numbering the app uses.
 */
async function seedProject(d: Deps, suffix: string, unitCount = 0) {
  const project = await d.prisma.project.create({
    data: { ownerId: OWNER_ID, name: `${PROJECT_PREFIX}${suffix}` },
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
          // Deliberately a *shipped, browser-verified* unit: the property this
          // unit exists to protect is that superseding one does not rewrite it.
          status: "SHIPPED",
          verified: "BROWSER",
        },
        select: { id: true, sequence: true, title: true },
      }),
    );
  }

  return { project, spec, units };
}

/** A fixed proposal document. No model involved. */
function fixtureProposal(
  buildUnitIds: string[],
  proposedUnits: { title: string; summary: string | null }[] = [
    { title: "Offline queue", summary: "Buffer writes locally." },
    { title: "Retry policy", summary: null },
  ],
) {
  return {
    summary: "Add an offline mode.",
    architectureDelta: [
      {
        kind: "added" as const,
        component: "Sync queue",
        detail: "Buffers writes.",
      },
    ],
    affectedUnits: buildUnitIds.map((buildUnitId) => ({
      buildUnitId,
      reason: "Touches the sync path.",
    })),
    proposedUnits,
    openQuestions: [],
  };
}

/** Everything about a unit that an apply must not change. */
const FROZEN_SELECT = {
  id: true,
  sequence: true,
  title: true,
  summary: true,
  status: true,
  verified: true,
  source: true,
  specId: true,
  createdAt: true,
} as const;

async function frozenSnapshot(d: Deps, projectId: string) {
  return d.prisma.projectBuildUnit.findMany({
    where: { projectId },
    orderBy: { sequence: "asc" },
    select: FROZEN_SELECT,
  });
}

/* -------------------------------------------------------------------------- */
/* Phases                                                                      */
/* -------------------------------------------------------------------------- */

async function createsPhase() {
  console.log(
    "\ncreates — proposed units land at the end, specced/none/change, nothing renumbered",
  );
  const d = await deps();
  const { project, spec, units } = await seedProject(d, `creates-${process.pid}`, 2);

  try {
    const saved = await d.saveProjectChange({
      projectId: project.id,
      authorId: AUTHOR_ID,
      request: "Add offline mode",
      baseSpecId: spec.id,
      proposal: fixtureProposal([units[0]!.id]),
    });

    const before = await frozenSnapshot(d, project.id);
    const result = await d.applyChange(project.id, saved.id);

    check("apply succeeded", result.ok, result.ok ? "" : result.reason);
    if (!result.ok) return;

    check(
      "both proposed units were created",
      result.applied.created.length === 2,
      String(result.applied.created.length),
    );
    check(
      "nothing was skipped",
      result.applied.skippedTitles.length === 0,
      result.applied.skippedTitles.join(","),
    );
    check(
      "every created unit is specced / none / change",
      result.applied.created.every(
        (u) =>
          u.status === "specced" &&
          u.verified === "none" &&
          u.source === "change",
      ),
      JSON.stringify(result.applied.created.map((u) => [u.status, u.verified, u.source])),
    );
    check(
      "created units carry no supersession of their own",
      result.applied.created.every((u) => u.supersededByChange === null),
    );

    const all = await frozenSnapshot(d, project.id);
    const createdSequences = result.applied.created.map((u) => u.sequence);
    const existingMax = Math.max(...before.map((u) => u.sequence));
    check(
      "created units take the highest sequences",
      createdSequences.every((s) => s > existingMax),
      `${createdSequences.join(",")} vs existing max ${existingMax}`,
    );
    check(
      "created sequences are contiguous from the reserved block",
      createdSequences.length === 2 &&
        createdSequences[1] === createdSequences[0]! + 1,
      createdSequences.join(","),
    );

    const stillThere = all.filter((u) =>
      before.some((b) => b.id === u.id && b.sequence === u.sequence),
    );
    check(
      "no existing unit was renumbered",
      stillThere.length === before.length,
      `${stillThere.length} of ${before.length}`,
    );

    const changeRow = await d.prisma.projectChange.findUniqueOrThrow({
      where: { id: saved.id },
      select: { status: true },
    });
    check("the change is now APPLIED", changeRow.status === "APPLIED",
      changeRow.status);

    const specs = await d.prisma.projectSpec.count({
      where: { projectId: project.id },
    });
    check("no spec was created by applying", specs === 1, `${specs} specs`);
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function preservesPhase() {
  console.log(
    "\npreserves — a superseded unit keeps everything and still reads shipped/browser",
  );
  const d = await deps();
  const { project, spec, units } = await seedProject(
    d,
    `preserves-${process.pid}`,
    3,
  );

  try {
    // Only the first two are named as affected; the third proves that a unit
    // outside the impact set is left alone entirely.
    const affected = [units[0]!.id, units[1]!.id];
    const saved = await d.saveProjectChange({
      projectId: project.id,
      authorId: AUTHOR_ID,
      request: "Add offline mode",
      baseSpecId: spec.id,
      proposal: fixtureProposal(affected),
    });

    const before = await frozenSnapshot(d, project.id);
    const result = await d.applyChange(project.id, saved.id);
    check("apply succeeded", result.ok, result.ok ? "" : result.reason);
    if (!result.ok) return;

    check(
      "both affected units are reported superseded",
      result.applied.supersededUnitIds.length === 2 &&
        affected.every((id) => result.applied.supersededUnitIds.includes(id)),
      result.applied.supersededUnitIds.join(","),
    );

    const after = await frozenSnapshot(d, project.id);
    const afterExisting = after.filter((u) => before.some((b) => b.id === u.id));
    check(
      "every pre-existing unit is byte-identical — title, summary, status, verification, sequence",
      JSON.stringify(before) === JSON.stringify(afterExisting),
    );

    const superseded = await d.prisma.projectBuildUnit.findMany({
      where: { id: { in: affected } },
      select: {
        status: true,
        verified: true,
        supersededByChangeId: true,
        supersededByChange: { select: { sequence: true } },
      },
    });
    check(
      "a superseded unit still reads SHIPPED / BROWSER",
      superseded.every((u) => u.status === "SHIPPED" && u.verified === "BROWSER"),
      JSON.stringify(superseded.map((u) => [u.status, u.verified])),
    );
    check(
      "and carries the supersession marker at the same time",
      superseded.every((u) => u.supersededByChangeId === saved.id),
    );
    check(
      "the marker reads as the change's sequence, not its id",
      superseded.every((u) => u.supersededByChange?.sequence === saved.sequence),
      JSON.stringify(superseded.map((u) => u.supersededByChange)),
    );

    const untouched = await d.prisma.projectBuildUnit.findUniqueOrThrow({
      where: { id: units[2]!.id },
      select: { supersededByChangeId: true },
    });
    check(
      "a unit outside the impact set is not marked",
      untouched.supersededByChangeId === null,
    );

    // Supersession must be a *third axis*, not a status member.
    const statuses = await d.prisma.projectBuildUnit.findMany({
      where: { projectId: project.id },
      select: { status: true },
    });
    check(
      "no unit's status was rewritten to anything resembling SUPERSEDED",
      statuses.every((u) => u.status !== ("SUPERSEDED" as never)),
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function twicePhase() {
  console.log("\ntwice — a second apply is refused and changes nothing");
  const d = await deps();
  const { project, spec, units } = await seedProject(d, `twice-${process.pid}`, 2);

  try {
    const saved = await d.saveProjectChange({
      projectId: project.id,
      authorId: AUTHOR_ID,
      request: "Add offline mode",
      baseSpecId: spec.id,
      proposal: fixtureProposal([units[0]!.id]),
    });

    const first = await d.applyChange(project.id, saved.id);
    check("the first apply succeeded", first.ok, first.ok ? "" : first.reason);

    const between = await frozenSnapshot(d, project.id);
    const counterBefore = await d.prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { nextBuildUnitSequence: true },
    });

    const second = await d.applyChange(project.id, saved.id);
    check("the second apply is refused", !second.ok);
    check(
      "and refused as not-proposed",
      !second.ok && second.reason === "not-proposed",
      second.ok ? "ok" : second.reason,
    );

    const after = await frozenSnapshot(d, project.id);
    check(
      "the second attempt created nothing and changed nothing",
      JSON.stringify(between) === JSON.stringify(after),
    );

    const counterAfter = await d.prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { nextBuildUnitSequence: true },
    });
    check(
      "the refusal burned no sequence numbers",
      counterAfter.nextBuildUnitSequence === counterBefore.nextBuildUnitSequence,
      `${counterBefore.nextBuildUnitSequence} → ${counterAfter.nextBuildUnitSequence}`,
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function stalePhase() {
  console.log(
    "\nstale — a change reasoned against an older spec is refused, then applies on confirmation",
  );
  const d = await deps();
  const { project, spec, units } = await seedProject(d, `stale-${process.pid}`, 1);

  try {
    const saved = await d.saveProjectChange({
      projectId: project.id,
      authorId: AUTHOR_ID,
      request: "Add offline mode",
      baseSpecId: spec.id,
      proposal: fixtureProposal([units[0]!.id]),
    });

    // The canvas moved under the pending proposal: a second spec is generated.
    const newer = await d.saveProjectSpec({
      projectId: project.id,
      markdown: SPEC_MARKDOWN,
    });
    check("the project is now on a later spec version", newer.version === spec.version + 1,
      `${spec.version} → ${newer.version}`);

    const before = await frozenSnapshot(d, project.id);
    const refused = await d.applyChange(project.id, saved.id);
    check("applying a stale change is refused", !refused.ok);
    check(
      "and refused as stale",
      !refused.ok && refused.reason === "stale",
      refused.ok ? "ok" : refused.reason,
    );
    if (!refused.ok && refused.reason === "stale") {
      check(
        "the refusal names the version it was reasoned against",
        refused.baseSpecVersion === spec.version,
        String(refused.baseSpecVersion),
      );
      check(
        "and the version the project is on now",
        refused.currentSpecVersion === newer.version,
        String(refused.currentSpecVersion),
      );
    }

    const afterRefusal = await frozenSnapshot(d, project.id);
    check(
      "the refusal changed nothing",
      JSON.stringify(before) === JSON.stringify(afterRefusal),
    );
    const stillProposed = await d.prisma.projectChange.findUniqueOrThrow({
      where: { id: saved.id },
      select: { status: true },
    });
    check("the change is still PROPOSED", stillProposed.status === "PROPOSED",
      stillProposed.status);

    // Acknowledging the *wrong* number is not an acknowledgement.
    const wrong = await d.applyChange(project.id, saved.id, {
      acknowledgedSpecVersion: spec.version,
    });
    check(
      "acknowledging the stale version is still refused",
      !wrong.ok && wrong.reason === "stale",
      wrong.ok ? "ok" : wrong.reason,
    );

    const confirmed = await d.applyChange(project.id, saved.id, {
      acknowledgedSpecVersion: newer.version,
    });
    check(
      "confirming with the current version applies the change",
      confirmed.ok,
      confirmed.ok ? "" : confirmed.reason,
    );
    check(
      "and it created the proposed units",
      confirmed.ok && confirmed.applied.created.length === 2,
      confirmed.ok ? String(confirmed.applied.created.length) : "",
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function duplicatePhase() {
  console.log(
    "\nduplicate — a proposed unit matching an existing title is skipped and reported",
  );
  const d = await deps();
  const { project, spec, units } = await seedProject(
    d,
    `duplicate-${process.pid}`,
    2,
  );

  try {
    // The first proposed unit deliberately collides with an existing title.
    const saved = await d.saveProjectChange({
      projectId: project.id,
      authorId: AUTHOR_ID,
      request: "Add offline mode",
      baseSpecId: spec.id,
      proposal: fixtureProposal([], [
        { title: units[0]!.title, summary: "A duplicate of an existing unit." },
        { title: "Genuinely new unit", summary: null },
      ]),
    });

    const before = await frozenSnapshot(d, project.id);
    const result = await d.applyChange(project.id, saved.id);
    check("apply succeeded", result.ok, result.ok ? "" : result.reason);
    if (!result.ok) return;

    check(
      "the colliding title was skipped, not created",
      result.applied.created.length === 1 &&
        result.applied.created[0]!.title === "Genuinely new unit",
      JSON.stringify(result.applied.created.map((u) => u.title)),
    );
    check(
      "and reported by title",
      result.applied.skippedTitles.length === 1 &&
        result.applied.skippedTitles[0] === units[0]!.title,
      result.applied.skippedTitles.join(","),
    );

    const after = await frozenSnapshot(d, project.id);
    const existingAfter = after.filter((u) => before.some((b) => b.id === u.id));
    check(
      "the existing unit it collided with is untouched",
      JSON.stringify(before) === JSON.stringify(existingAfter),
    );
    check(
      "no second unit with that title exists",
      after.filter((u) => u.title === units[0]!.title).length === 1,
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function capPhase() {
  console.log("\ncap — a change that would exceed the unit cap is refused whole");
  const d = await deps();
  const { project, spec } = await seedProject(d, `cap-${process.pid}`, 0);

  try {
    // Fill the project to one below the cap, cheaply — createMany, then set the
    // counter past them, since this phase is about the cap and not the counter.
    const fill = d.MAX_BUILD_UNITS - 1;
    await d.prisma.projectBuildUnit.createMany({
      data: Array.from({ length: fill }, (_, i) => ({
        projectId: project.id,
        sequence: i + 1,
        key: `filler-${i + 1}`,
        title: `Filler ${i + 1}`,
        status: "SHIPPED" as const,
        verified: "BROWSER" as const,
      })),
    });
    await d.prisma.project.update({
      where: { id: project.id },
      data: { nextBuildUnitSequence: fill + 1 },
    });

    const anchor = await d.prisma.projectBuildUnit.findFirstOrThrow({
      where: { projectId: project.id },
      select: { id: true },
    });

    // Two proposed units against 199 existing → 201, one over the cap.
    const saved = await d.saveProjectChange({
      projectId: project.id,
      authorId: AUTHOR_ID,
      request: "Add offline mode",
      baseSpecId: spec.id,
      proposal: fixtureProposal([anchor.id]),
    });

    const beforeCount = await d.prisma.projectBuildUnit.count({
      where: { projectId: project.id },
    });
    const counterBefore = await d.prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { nextBuildUnitSequence: true },
    });

    const result = await d.applyChange(project.id, saved.id);
    check("the apply is refused", !result.ok);
    check(
      "and refused for the cap",
      !result.ok && result.reason === "cap",
      result.ok ? "ok" : result.reason,
    );

    const afterCount = await d.prisma.projectBuildUnit.count({
      where: { projectId: project.id },
    });
    check("no unit was created", afterCount === beforeCount,
      `${beforeCount} → ${afterCount}`);

    const marked = await d.prisma.projectBuildUnit.count({
      where: { projectId: project.id, supersededByChangeId: { not: null } },
    });
    check("nothing was marked superseded", marked === 0, `${marked} marked`);

    const changeRow = await d.prisma.projectChange.findUniqueOrThrow({
      where: { id: saved.id },
      select: { status: true },
    });
    check(
      "the change is still PROPOSED — the whole transaction rolled back",
      changeRow.status === "PROPOSED",
      changeRow.status,
    );

    const counterAfter = await d.prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { nextBuildUnitSequence: true },
    });
    check(
      "the reserved sequence block was rolled back with it",
      counterAfter.nextBuildUnitSequence === counterBefore.nextBuildUnitSequence,
      `${counterBefore.nextBuildUnitSequence} → ${counterAfter.nextBuildUnitSequence}`,
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function clearPhase() {
  console.log("\nclear — a person can clear supersession, and nothing else moves");
  const d = await deps();
  const { project, spec, units } = await seedProject(d, `clear-${process.pid}`, 1);

  try {
    const saved = await d.saveProjectChange({
      projectId: project.id,
      authorId: AUTHOR_ID,
      request: "Add offline mode",
      baseSpecId: spec.id,
      proposal: fixtureProposal([units[0]!.id], []),
    });
    const applied = await d.applyChange(project.id, saved.id);
    check("apply succeeded", applied.ok, applied.ok ? "" : applied.reason);

    const before = await d.prisma.projectBuildUnit.findUniqueOrThrow({
      where: { id: units[0]!.id },
      select: FROZEN_SELECT,
    });

    const result = await d.updateBuildUnit(project.id, units[0]!.id, {
      supersededByChangeId: null,
    });
    check("the clear succeeded", result.ok, result.ok ? "" : result.reason);
    check(
      "the unit reads unsuperseded on the wire",
      result.ok && result.unit.supersededByChange === null,
    );

    const after = await d.prisma.projectBuildUnit.findUniqueOrThrow({
      where: { id: units[0]!.id },
      select: FROZEN_SELECT,
    });
    check(
      "nothing else about the unit changed",
      JSON.stringify(before) === JSON.stringify(after),
    );

    const changeRow = await d.prisma.projectChange.findUniqueOrThrow({
      where: { id: saved.id },
      select: { status: true },
    });
    check(
      "the change itself is untouched by the disagreement",
      changeRow.status === "APPLIED",
      changeRow.status,
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function setNullPhase() {
  console.log(
    "\nset-null — deleting a change leaves every unit it created or superseded standing",
  );
  const d = await deps();
  const { project, spec, units } = await seedProject(
    d,
    `set-null-${process.pid}`,
    1,
  );

  try {
    const saved = await d.saveProjectChange({
      projectId: project.id,
      authorId: AUTHOR_ID,
      request: "Add offline mode",
      baseSpecId: spec.id,
      proposal: fixtureProposal([units[0]!.id]),
    });
    const applied = await d.applyChange(project.id, saved.id);
    check("apply succeeded", applied.ok, applied.ok ? "" : applied.reason);
    if (!applied.ok) return;

    const createdIds = applied.applied.created.map((u) => u.id);

    // No route does this today (unit 40's DELETE discards by status and keeps
    // the row). This proves the database-level guarantee a future delete route
    // would inherit.
    await d.prisma.projectChange.delete({ where: { id: saved.id } });

    const survivors = await d.prisma.projectBuildUnit.findMany({
      where: { id: { in: [...createdIds, units[0]!.id] } },
      select: {
        id: true,
        source: true,
        changeId: true,
        supersededByChangeId: true,
        status: true,
      },
    });
    check(
      "every unit survived the change's deletion",
      survivors.length === createdIds.length + 1,
      `${survivors.length} of ${createdIds.length + 1}`,
    );
    check(
      "both change links were nulled, never cascaded",
      survivors.every(
        (u) => u.changeId === null && u.supersededByChangeId === null,
      ),
      JSON.stringify(survivors.map((u) => [u.changeId, u.supersededByChangeId])),
    );
    check(
      "`source` survives the null-out, so a created unit still knows it was not hand-typed",
      survivors
        .filter((u) => createdIds.includes(u.id))
        .every((u) => u.source === "CHANGE"),
      JSON.stringify(survivors.map((u) => u.source)),
    );
    check(
      "the superseded unit kept its status",
      survivors.find((u) => u.id === units[0]!.id)?.status === "SHIPPED",
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function discardedPhase() {
  console.log("\ndiscarded — a discarded change cannot be applied");
  const d = await deps();
  const { project, spec, units } = await seedProject(
    d,
    `discarded-${process.pid}`,
    1,
  );

  try {
    const saved = await d.saveProjectChange({
      projectId: project.id,
      authorId: AUTHOR_ID,
      request: "Add offline mode",
      baseSpecId: spec.id,
      proposal: fixtureProposal([units[0]!.id]),
    });
    await d.prisma.projectChange.update({
      where: { id: saved.id },
      data: { status: "DISCARDED" },
    });

    const before = await frozenSnapshot(d, project.id);
    const result = await d.applyChange(project.id, saved.id);
    check(
      "applying a discarded change is refused as not-proposed",
      !result.ok && result.reason === "not-proposed",
      result.ok ? "ok" : result.reason,
    );

    const after = await frozenSnapshot(d, project.id);
    check(
      "and it changed nothing",
      JSON.stringify(before) === JSON.stringify(after),
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function crossProjectPhase() {
  console.log(
    "\ncross-project — a change id from another project cannot be applied here",
  );
  const d = await deps();
  const a = await seedProject(d, `cross-a-${process.pid}`, 1);
  const b = await seedProject(d, `cross-b-${process.pid}`, 1);

  try {
    const saved = await d.saveProjectChange({
      projectId: a.project.id,
      authorId: AUTHOR_ID,
      request: "Add offline mode",
      baseSpecId: a.spec.id,
      proposal: fixtureProposal([a.units[0]!.id]),
    });

    const before = await frozenSnapshot(d, b.project.id);
    // Project B's id, project A's change.
    const result = await d.applyChange(b.project.id, saved.id);
    check(
      "the apply is refused as not-found",
      !result.ok && result.reason === "not-found",
      result.ok ? "ok" : result.reason,
    );

    const after = await frozenSnapshot(d, b.project.id);
    check(
      "project B's build list is unchanged",
      JSON.stringify(before) === JSON.stringify(after),
    );

    const stillProposed = await d.prisma.projectChange.findUniqueOrThrow({
      where: { id: saved.id },
      select: { status: true },
    });
    check(
      "project A's change is still PROPOSED",
      stillProposed.status === "PROPOSED",
      stillProposed.status,
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
    creates: createsPhase,
    preserves: preservesPhase,
    twice: twicePhase,
    stale: stalePhase,
    duplicate: duplicatePhase,
    cap: capPhase,
    clear: clearPhase,
    "set-null": setNullPhase,
    discarded: discardedPhase,
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
