/**
 * Proves change-proposal behaviour (unit 40) at the **library and database
 * layer**, against the real Postgres and the real Blob store.
 *
 * There is no model call anywhere in this script. `saveProjectChange` is called
 * with a fixed, hand-written proposal document, which is what lets every check
 * below run while the configured `OPENAI_API_KEY` is invalid (it answers `401
 * Incorrect API key provided`, so it is not a quota that will reset — a
 * replacement key is what unblocks the model-dependent checks).
 *
 * What a passing run proves — these are unit 40's "do not need a working model
 * call" checks, at the layer this script can reach:
 * - `sequence`: changes take 1, 2, 3 within a project, and
 *   `Project.nextChangeSequence` tracks one ahead.
 * - `concurrent`: N `saveProjectChange` calls issued in parallel receive N
 *   distinct, contiguous sequence numbers and none fails — the `Project` row
 *   lock inside the transaction doing its job, the check a `max(n) + 1`
 *   implementation would fail.
 * - `build-units-untouched`: creating a proposal that names existing units
 *   leaves every one of them **byte-identical** — same title, summary, status,
 *   verification, sequence, and `updatedAt`. This is the scope limit that
 *   matters most in this unit: a proposal applies nothing.
 * - `impacts`: impact rows reference units by id; deleting a referenced unit
 *   cascades the impact row away and leaves the change itself readable.
 * - `discard`: discarding sets `DISCARDED` and leaves the row, its
 *   `proposalPath`, and its impact rows in place.
 * - `base-spec-restrict`: a spec a change was reasoned against **cannot** be
 *   deleted (`onDelete: Restrict`), which is what keeps a proposal
 *   interpretable. Contrast `ProjectBuildUnit.specId`'s `SetNull`.
 * - `cascade`: deleting a project removes its changes and their impacts.
 * - `no-leak`: the stored proposal document holds `buildUnitId`, never a title,
 *   and `SavedProjectChange` hands back no blob URL.
 *
 * What a passing run does **not** prove:
 * - Anything at the HTTP layer: not the 409 no-spec refusal, not cross-project
 *   404 scoping, not the signed-out path, and not the absence of
 *   `proposalPath`/`baseSpecId` in a real response body. Those are route-layer
 *   and are driven through a real signed-in browser session instead.
 * - Anything about the browser or the React view.
 * - Anything about the model: the prompt, the delta shape it returns, or
 *   whether a hallucinated unit key is dropped in a real run. `validate.ts` is
 *   exercised here with hand-written input, which proves the dropping logic but
 *   not that a real model ever triggers it.
 *
 * Data safety. Every project this script touches is one it created, named with
 * the `verify-change-proposals-` prefix, and deleted in a `finally` — including
 * on failure. Nothing pre-existing is read or mutated. Blobs uploaded here are
 * left behind when their rows cascade away; they are inert, exactly as for any
 * change deleted in the app today.
 *
 * Usage (from the repo root):
 *   npm run verify:changes -- sequence
 *   npm run verify:changes -- concurrent --count=5
 *   npm run verify:changes -- build-units-untouched
 *   npm run verify:changes -- impacts
 *   npm run verify:changes -- discard
 *   npm run verify:changes -- base-spec-restrict
 *   npm run verify:changes -- cascade
 *   npm run verify:changes -- all
 *
 * Environment (from `.env.local`):
 *   DATABASE_URL            required
 *   BLOB_READ_WRITE_TOKEN   required — the proposal JSON is really uploaded
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

const PROJECT_PREFIX = "verify-change-proposals-";
const OWNER_ID = "verify-change-proposals-owner";
const AUTHOR_ID = "verify-change-proposals-author";
const SPEC_MARKDOWN = "# Fixture spec\n\nWritten by scripts/verify-change-proposals.ts.\n";

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
  const { saveProjectChange, readChangeProposal } = await import(
    "@/lib/change-agent/storage"
  );
  const { validateChangeProposal } = await import("@/lib/change-agent/validate");
  const { saveProjectSpec } = await import("@/lib/spec-agent/storage");
  return {
    prisma,
    saveProjectChange,
    readChangeProposal,
    validateChangeProposal,
    saveProjectSpec,
  };
}

type Deps = Awaited<ReturnType<typeof deps>>;

/** A project with a spec and `unitCount` build units — the state a change needs. */
async function seedProject(d: Deps, suffix: string, unitCount = 0) {
  const project = await d.prisma.project.create({
    data: { ownerId: OWNER_ID, name: `${PROJECT_PREFIX}${suffix}` },
    select: { id: true, nextChangeSequence: true },
  });

  const spec = await d.saveProjectSpec({
    projectId: project.id,
    markdown: SPEC_MARKDOWN,
  });

  const units = [];
  for (let i = 1; i <= unitCount; i += 1) {
    units.push(
      await d.prisma.projectBuildUnit.create({
        data: {
          projectId: project.id,
          sequence: i,
          key: `fixture-unit-${i}`,
          title: `Fixture unit ${i}`,
          summary: `Summary ${i}`,
          status: "IN_PROGRESS",
          verified: "PARTIAL",
        },
        select: {
          id: true,
          sequence: true,
          title: true,
          summary: true,
          status: true,
          verified: true,
          updatedAt: true,
        },
      }),
    );
  }

  return { project, spec, units };
}

/** A fixed proposal document naming the given unit ids. No model involved. */
function fixtureProposal(buildUnitIds: string[]) {
  return {
    summary: "Add an offline mode.",
    architectureDelta: [
      { kind: "added" as const, component: "Sync queue", detail: "Buffers writes." },
      { kind: "modified" as const, component: "API client", detail: "Retries." },
      { kind: "removed" as const, component: "Poller", detail: "Superseded." },
    ],
    affectedUnits: buildUnitIds.map((buildUnitId) => ({
      buildUnitId,
      reason: "Touches the sync path.",
    })),
    proposedUnits: [{ title: "Offline queue", summary: "Buffer writes locally." }],
    openQuestions: ["How long may a write stay queued?"],
  };
}

async function sequencePhase() {
  console.log("\nsequence — changes take 1, 2, 3 and the counter stays one ahead");
  const d = await deps();
  const { project, spec } = await seedProject(d, `sequence-${process.pid}`);

  try {
    check("fresh project starts at nextChangeSequence 1",
      project.nextChangeSequence === 1, `got ${project.nextChangeSequence}`);

    for (const expected of [1, 2, 3]) {
      const saved = await d.saveProjectChange({
        projectId: project.id,
        authorId: AUTHOR_ID,
        request: `Change ${expected}`,
        baseSpecId: spec.id,
        proposal: fixtureProposal([]),
      });
      check(`change ${expected} takes sequence ${expected}`,
        saved.sequence === expected, `got ${saved.sequence}`);
      check(`change ${expected} hands back no blob URL`,
        !("proposalPath" in saved) &&
          !JSON.stringify(saved).includes("blob.vercel-storage"),
        Object.keys(saved).join(","));
    }

    const after = await d.prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { nextChangeSequence: true },
    });
    check("counter is one ahead of the last sequence", after.nextChangeSequence === 4,
      `got ${after.nextChangeSequence}`);
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function concurrentPhase(count: number) {
  console.log(`\nconcurrent — ${count} parallel proposals take ${count} distinct numbers`);
  const d = await deps();
  const { project, spec } = await seedProject(d, `concurrent-${process.pid}`);

  try {
    const results = await Promise.allSettled(
      Array.from({ length: count }, (_, i) =>
        d.saveProjectChange({
          projectId: project.id,
          authorId: AUTHOR_ID,
          request: `Parallel change ${i}`,
          baseSpecId: spec.id,
          proposal: fixtureProposal([]),
        }),
      ),
    );

    const rejected = results.filter((r) => r.status === "rejected");
    check("no save failed", rejected.length === 0,
      rejected.length > 0
        ? String((rejected[0] as PromiseRejectedResult).reason).slice(0, 160)
        : undefined);

    const sequences = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value.sequence)
      .sort((a, b) => a - b);

    check("sequences are distinct", new Set(sequences).size === sequences.length,
      sequences.join(","));
    check(`sequences are 1..${count} with no gaps`,
      sequences.length === count && sequences.every((s, i) => s === i + 1),
      sequences.join(","));
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function buildUnitsUntouchedPhase() {
  console.log("\nbuild-units-untouched — a proposal applies nothing");
  const d = await deps();
  const { project, spec, units } = await seedProject(
    d,
    `untouched-${process.pid}`,
    3,
  );

  try {
    const before = await d.prisma.projectBuildUnit.findMany({
      where: { projectId: project.id },
      orderBy: { sequence: "asc" },
    });

    await d.saveProjectChange({
      projectId: project.id,
      authorId: AUTHOR_ID,
      request: "Add offline mode",
      baseSpecId: spec.id,
      proposal: fixtureProposal(units.map((u) => u.id)),
    });

    const after = await d.prisma.projectBuildUnit.findMany({
      where: { projectId: project.id },
      orderBy: { sequence: "asc" },
    });

    check("same number of units", before.length === after.length,
      `${before.length} → ${after.length}`);
    check(
      "every unit is byte-identical, updatedAt included",
      JSON.stringify(before) === JSON.stringify(after),
    );

    const created = await d.prisma.projectBuildUnit.count({
      where: { projectId: project.id, title: { in: ["Offline queue"] } },
    });
    check("the proposed unit was NOT created as a build unit", created === 0,
      `${created} created`);

    const counter = await d.prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { nextBuildUnitSequence: true },
    });
    check("nextBuildUnitSequence untouched by a proposal",
      counter.nextBuildUnitSequence === 1, `got ${counter.nextBuildUnitSequence}`);

    const specs = await d.prisma.projectSpec.count({ where: { projectId: project.id } });
    check("no second ProjectSpec row was written", specs === 1, `${specs} specs`);
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function impactsPhase() {
  console.log("\nimpacts — units referenced by id; a deleted unit drops its impact only");
  const d = await deps();
  const { project, spec, units } = await seedProject(d, `impacts-${process.pid}`, 2);

  try {
    const saved = await d.saveProjectChange({
      projectId: project.id,
      authorId: AUTHOR_ID,
      request: "Add offline mode",
      baseSpecId: spec.id,
      proposal: fixtureProposal(units.map((u) => u.id)),
    });

    const impacts = await d.prisma.projectChangeImpact.findMany({
      where: { changeId: saved.id },
      select: { buildUnitId: true, reason: true },
    });
    check("one impact row per affected unit", impacts.length === 2,
      `${impacts.length}`);
    check("impacts reference units by id",
      impacts.every((i) => units.some((u) => u.id === i.buildUnitId)));

    // A rename must not orphan an impact — the whole reason the row stores an
    // id rather than the (re-derived) key.
    await d.prisma.projectBuildUnit.update({
      where: { id: units[0]!.id },
      data: { title: "Renamed entirely", key: "renamed-entirely" },
    });
    const afterRename = await d.prisma.projectChangeImpact.count({
      where: { changeId: saved.id },
    });
    check("renaming a unit leaves its impact row intact", afterRename === 2,
      `${afterRename}`);

    await d.prisma.projectBuildUnit.delete({ where: { id: units[0]!.id } });

    const change = await d.prisma.projectChange.findUnique({
      where: { id: saved.id },
      select: { id: true, status: true, proposalPath: true },
    });
    check("the change survives its referenced unit's deletion", change !== null);
    check("the change keeps its stored proposal", Boolean(change?.proposalPath));

    const remaining = await d.prisma.projectChangeImpact.findMany({
      where: { changeId: saved.id },
      select: { buildUnitId: true },
    });
    check("the deleted unit's impact row cascaded away", remaining.length === 1,
      `${remaining.length} remaining`);
    check("the surviving unit's impact row is untouched",
      remaining[0]?.buildUnitId === units[1]!.id);

    const stored = await d.readChangeProposal(change!.proposalPath!);
    check("stored document holds buildUnitId, never a title",
      JSON.stringify(stored?.affectedUnits ?? []).includes(units[1]!.id) &&
        !JSON.stringify(stored?.affectedUnits ?? []).includes("Fixture unit"),
      JSON.stringify(stored?.affectedUnits ?? []).slice(0, 160));
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function discardPhase() {
  console.log("\ndiscard — status changes, the row and its proposal stay");
  const d = await deps();
  const { project, spec, units } = await seedProject(d, `discard-${process.pid}`, 1);

  try {
    const saved = await d.saveProjectChange({
      projectId: project.id,
      authorId: AUTHOR_ID,
      request: "Add offline mode",
      baseSpecId: spec.id,
      proposal: fixtureProposal(units.map((u) => u.id)),
    });

    await d.prisma.projectChange.update({
      where: { id: saved.id },
      data: { status: "DISCARDED" },
    });

    const after = await d.prisma.projectChange.findUnique({
      where: { id: saved.id },
      select: { id: true, status: true, request: true, proposalPath: true, sequence: true },
    });
    check("the row still exists", after !== null);
    check("status is DISCARDED", after?.status === "DISCARDED", String(after?.status));
    check("the request text is unchanged", after?.request === "Add offline mode");
    check("the proposal is still referenced", Boolean(after?.proposalPath));
    check("the sequence is unchanged", after?.sequence === saved.sequence);

    const impacts = await d.prisma.projectChangeImpact.count({
      where: { changeId: saved.id },
    });
    check("impact rows survive a discard", impacts === 1, `${impacts}`);

    const proposal = await d.readChangeProposal(after!.proposalPath!);
    check("the stored document is still readable", proposal !== null);
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function baseSpecRestrictPhase() {
  console.log("\nbase-spec-restrict — a spec a change was reasoned against cannot be deleted");
  const d = await deps();
  const { project, spec } = await seedProject(d, `restrict-${process.pid}`);

  try {
    await d.saveProjectChange({
      projectId: project.id,
      authorId: AUTHOR_ID,
      request: "Add offline mode",
      baseSpecId: spec.id,
      proposal: fixtureProposal([]),
    });

    let refused = false;
    try {
      await d.prisma.projectSpec.delete({ where: { id: spec.id } });
    } catch {
      refused = true;
    }
    check("deleting the base spec is refused", refused);

    const stillThere = await d.prisma.projectSpec.findUnique({
      where: { id: spec.id },
      select: { id: true },
    });
    check("the base spec is still present", stillThere !== null);
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function cascadePhase() {
  console.log("\ncascade — deleting a project removes its changes and impacts");
  const d = await deps();
  const { project, spec, units } = await seedProject(d, `cascade-${process.pid}`, 1);

  const saved = await d.saveProjectChange({
    projectId: project.id,
    authorId: AUTHOR_ID,
    request: "Add offline mode",
    baseSpecId: spec.id,
    proposal: fixtureProposal(units.map((u) => u.id)),
  });

  // Cascade must reach ProjectChange even though its baseSpec relation is
  // Restrict — Restrict guards the *spec*, not the project.
  await d.prisma.project.delete({ where: { id: project.id } });

  const change = await d.prisma.projectChange.findUnique({ where: { id: saved.id } });
  check("the change is gone with its project", change === null);
  const impacts = await d.prisma.projectChangeImpact.count({
    where: { changeId: saved.id },
  });
  check("its impact rows are gone too", impacts === 0, `${impacts}`);
  const specs = await d.prisma.projectSpec.count({ where: { id: spec.id } });
  check("the project's spec is gone too", specs === 0);
}

async function validatePhase() {
  console.log("\nvalidate — a model-invented unit key is dropped, never stored");
  const d = await deps();

  const units = [
    {
      id: "unit-a",
      key: "auth-service",
      title: "Auth service",
      summary: "Handles sign-in.",
      status: "in progress" as const,
      sequence: 1,
    },
    {
      id: "unit-b",
      key: "billing-service",
      title: "Billing service",
      summary: null,
      status: "specced" as const,
      sequence: 2,
    },
  ];

  const draft = {
    summary: "Add offline mode.",
    architectureDelta: [
      { kind: "added" as const, component: "Queue", detail: "Buffers writes." },
    ],
    affectedUnits: [
      { key: "auth-service", reason: "Real." },
      { key: "totally-invented-service", reason: "Hallucinated." },
      { key: "auth-service", reason: "Duplicate of a real one." },
    ],
    proposedUnits: [
      { title: "Offline queue", summary: "Buffer writes." },
      { title: "   ", summary: "Titleless — must be dropped." },
    ],
    openQuestions: ["How long may a write stay queued?"],
  };

  const result = d.validateChangeProposal(draft, units);
  const kept = result.document.affectedUnits.map((a) => a.buildUnitId);

  check("the real unit key resolved to its id", kept.includes("unit-a"));
  check("the invented key was dropped", kept.length === 1, kept.join(","));
  check("nothing invented reached the document",
    !JSON.stringify(result.document).includes("totally-invented-service"));
  check("drops were counted, not swallowed", result.droppedAffectedUnits >= 1,
    String(result.droppedAffectedUnits));
  check("a titleless proposed unit was dropped",
    result.document.proposedUnits.length === 1,
    JSON.stringify(result.document.proposedUnits));
}

async function main() {
  const args = process.argv.slice(2);
  const phase = args.find((a) => !a.startsWith("--")) ?? "all";
  const countArg = args.find((a) => a.startsWith("--count="));
  const count = countArg ? Number(countArg.split("=")[1]) : 5;

  const run = {
    sequence: sequencePhase,
    concurrent: () => concurrentPhase(count),
    "build-units-untouched": buildUnitsUntouchedPhase,
    impacts: impactsPhase,
    discard: discardPhase,
    "base-spec-restrict": baseSpecRestrictPhase,
    cascade: cascadePhase,
    validate: validatePhase,
  };

  if (phase === "all") {
    for (const fn of Object.values(run)) await fn();
  } else if (phase in run) {
    await run[phase as keyof typeof run]();
  } else {
    console.error(`Unknown phase "${phase}". One of: ${Object.keys(run).join(", ")}, all`);
    process.exit(1);
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
