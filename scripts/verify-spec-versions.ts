/**
 * Proves spec versioning and build-unit lineage (unit 39) at the **library and
 * database layer**, against the real Postgres and the real Blob store.
 *
 * There is no model call anywhere in this script — `saveProjectSpec` is called
 * directly with fixed Markdown, which is exactly why this unit is verifiable
 * while the configured `OPENAI_API_KEY` is unusable. (As of 2026-07-31 that key
 * answers `401 Incorrect API key provided`, i.e. it is invalid rather than
 * merely out of quota — a distinction that matters, because a new key fixes it
 * and waiting does not.)
 *
 * What a passing run proves:
 * - `sequential`: the first spec on a fresh project is version 1, the next is
 *   2, the next 3, and `Project.nextSpecVersion` tracks one ahead.
 * - `concurrent`: N `saveProjectSpec` calls issued in parallel receive N
 *   distinct, contiguous versions and none of them fails. That is the
 *   `Project` row lock inside the transaction doing its job — the check that a
 *   `max(version) + 1` implementation would fail.
 * - `lineage`: deleting a spec row nulls `ProjectBuildUnit.specId`
 *   (`onDelete: SetNull`) and leaves the unit's `status`, `verified`,
 *   `sequence`, and `source` untouched; the wire summary drops from
 *   `specVersion: n` to `null` while `source` stays `"spec"`.
 * - `cascade`: deleting the project removes its specs.
 * - `backfill`: every pre-existing `ProjectSpec` row in the database carries a
 *   version, and within each project the versions are 1..n in `createdAt`
 *   order with no gaps and no duplicates, and that project's
 *   `nextSpecVersion` is n + 1. This one reads pre-existing data and never
 *   writes.
 * - `backfill-deep`: the migration's own backfill statements, **read verbatim
 *   out of `prisma/migrations/.../migration.sql`** rather than copied here,
 *   re-run over synthetic multi-spec history — several projects at different
 *   depths, `createdAt` deliberately unrelated to insertion order, an exact
 *   `createdAt` tie, and pre-seeded *wrong* versions the statements have to
 *   correct. This is the depth the real dataset (one spec row) could not
 *   supply. It runs inside a transaction that is **always rolled back**, so no
 *   row — throwaway or real — is left modified; the phase then re-reads to
 *   prove the rollback actually took.
 *
 * What a passing run does **not** prove:
 * - Anything at the HTTP layer: no route, no access check, no response shape.
 *   `context/progress/38-build-units.md` records why that is a separate layer.
 * - Anything about the browser — the Specs list's version label and the
 *   "from v{n}" badge are `browser-qa` territory.
 * - The download route's `Content-Disposition`, which is HTTP-layer.
 *
 * Data safety. Every project this script writes to is one it created, named
 * with the `verify-spec-versions-` prefix, and deleted in a `finally` —
 * including on failure. The `backfill` phase is read-only. Blobs uploaded by
 * the write phases are left behind when their rows cascade away; they are
 * inert, and the same is true of any spec deleted in the app today.
 *
 * Usage (from the repo root):
 *   npm run verify:spec-versions -- sequential
 *   npm run verify:spec-versions -- concurrent
 *   npm run verify:spec-versions -- concurrent --count=12
 *   npm run verify:spec-versions -- lineage
 *   npm run verify:spec-versions -- backfill
 *   npm run verify:spec-versions -- backfill-deep
 *   npm run verify:spec-versions -- all
 *
 * Environment (from `.env.local`, loaded below):
 *   DATABASE_URL            required
 *   BLOB_READ_WRITE_TOKEN   required — the spec Markdown is really uploaded
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

const PROJECT_PREFIX = "verify-spec-versions-";
const OWNER_ID = "verify-spec-versions-owner";
const MARKDOWN = "# Verification spec\n\nWritten by scripts/verify-spec-versions.ts.\n";

/** Deferred so `.env.local` is loaded before the Prisma client is constructed. */
async function deps() {
  const { prisma } = await import("@/lib/prisma");
  const { saveProjectSpec, specDownloadFilename } = await import(
    "@/lib/spec-agent/storage"
  );
  const { listBuildUnits } = await import("@/lib/build-units");
  return { prisma, saveProjectSpec, specDownloadFilename, listBuildUnits };
}

type Prisma = Awaited<ReturnType<typeof deps>>["prisma"];

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

async function createProject(prisma: Prisma, suffix: string) {
  return prisma.project.create({
    data: { ownerId: OWNER_ID, name: `${PROJECT_PREFIX}${suffix}` },
    select: { id: true, nextSpecVersion: true },
  });
}

async function sequentialPhase() {
  console.log("\nsequential — versions ascend from 1, counter stays one ahead");
  const { prisma, saveProjectSpec, specDownloadFilename } = await deps();
  const project = await createProject(prisma, `sequential-${process.pid}`);

  try {
    check("fresh project starts at nextSpecVersion 1", project.nextSpecVersion === 1,
      `got ${project.nextSpecVersion}`);

    for (const expected of [1, 2, 3]) {
      const saved = await saveProjectSpec({
        projectId: project.id,
        markdown: MARKDOWN,
      });
      check(`spec ${expected} is version ${expected}`, saved.version === expected,
        `got ${saved.version}`);
      check(`spec ${expected} downloads as spec-v${expected}.md`,
        specDownloadFilename(saved.version) === `spec-v${expected}.md`,
        specDownloadFilename(saved.version));
    }

    const after = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { nextSpecVersion: true },
    });
    check("counter is one ahead of the last version", after.nextSpecVersion === 4,
      `got ${after.nextSpecVersion}`);
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
  }
}

async function concurrentPhase(count: number) {
  console.log(`\nconcurrent — ${count} parallel saves take ${count} distinct versions`);
  const { prisma, saveProjectSpec } = await deps();
  const project = await createProject(prisma, `concurrent-${process.pid}`);

  try {
    const results = await Promise.allSettled(
      Array.from({ length: count }, () =>
        saveProjectSpec({ projectId: project.id, markdown: MARKDOWN }),
      ),
    );

    const rejected = results.filter((r) => r.status === "rejected");
    check("no save failed", rejected.length === 0,
      rejected.length > 0 ? String((rejected[0] as PromiseRejectedResult).reason) : undefined);

    const versions = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value.version)
      .sort((a, b) => a - b);

    check("versions are distinct", new Set(versions).size === versions.length,
      versions.join(","));
    check(`versions are 1..${count} with no gaps`,
      versions.every((v, i) => v === i + 1) && versions.length === count,
      versions.join(","));

    const after = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { nextSpecVersion: true },
    });
    check(`counter advanced by exactly ${count}`, after.nextSpecVersion === count + 1,
      `got ${after.nextSpecVersion}`);
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
  }
}

async function lineagePhase() {
  console.log("\nlineage — a removed spec nulls the link and leaves the unit intact");
  const { prisma, saveProjectSpec, listBuildUnits } = await deps();
  const project = await createProject(prisma, `lineage-${process.pid}`);

  try {
    const spec = await saveProjectSpec({ projectId: project.id, markdown: MARKDOWN });

    // `source: SPEC` + `specId` set directly, which is what a future producer
    // would write. `status`/`verified` are set to non-defaults so a silent
    // reset would be visible.
    const unit = await prisma.projectBuildUnit.create({
      data: {
        projectId: project.id,
        sequence: 1,
        key: "derived-unit",
        title: "Derived unit",
        status: "IN_PROGRESS",
        verified: "PARTIAL",
        source: "SPEC",
        specId: spec.id,
      },
      select: { id: true, sequence: true, status: true, verified: true, source: true },
    });

    const manual = await prisma.projectBuildUnit.create({
      data: { projectId: project.id, sequence: 2, key: "typed-unit", title: "Typed unit" },
      select: { id: true },
    });

    const before = await listBuildUnits(project.id);
    const derivedBefore = before.find((u) => u.id === unit.id);
    const manualBefore = before.find((u) => u.id === manual.id);
    check("derived unit reports its source spec's version",
      derivedBefore?.specVersion === spec.version, `got ${derivedBefore?.specVersion}`);
    check("manual unit reports no source", manualBefore?.specVersion === null,
      `got ${manualBefore?.specVersion}`);
    check("no response field leaks the spec id or file path",
      !("specId" in (derivedBefore ?? {})) && !("filePath" in (derivedBefore ?? {})),
      Object.keys(derivedBefore ?? {}).join(","));

    await prisma.projectSpec.delete({ where: { id: spec.id } });

    const row = await prisma.projectBuildUnit.findUnique({
      where: { id: unit.id },
      select: { id: true, sequence: true, status: true, verified: true, source: true, specId: true },
    });
    check("unit survives its spec's deletion", row !== null);
    check("specId is nulled, not cascaded", row?.specId === null, String(row?.specId));
    check("status unchanged", row?.status === unit.status, String(row?.status));
    check("verified unchanged", row?.verified === unit.verified, String(row?.verified));
    check("sequence unchanged", row?.sequence === unit.sequence, String(row?.sequence));
    check("source still SPEC — the unit knows it was not hand-typed",
      row?.source === "SPEC", String(row?.source));

    const after = await listBuildUnits(project.id);
    check("orphaned unit reports no version",
      after.find((u) => u.id === unit.id)?.specVersion === null);
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
  }
}

async function cascadePhase() {
  console.log("\ncascade — deleting a project removes its specs");
  const { prisma, saveProjectSpec } = await deps();
  const project = await createProject(prisma, `cascade-${process.pid}`);
  const spec = await saveProjectSpec({ projectId: project.id, markdown: MARKDOWN });

  await prisma.project.delete({ where: { id: project.id } });
  const found = await prisma.projectSpec.findUnique({ where: { id: spec.id } });
  check("spec is gone with its project", found === null);
}

async function backfillPhase() {
  console.log("\nbackfill — read-only check of every pre-existing spec row");
  const { prisma } = await deps();

  const projects = await prisma.project.findMany({
    where: { name: { startsWith: PROJECT_PREFIX, not: undefined } },
    select: { id: true },
  });
  const throwaway = new Set(projects.map((p) => p.id));

  const specs = await prisma.projectSpec.findMany({
    orderBy: [{ projectId: "asc" }, { createdAt: "asc" }],
    select: { id: true, projectId: true, version: true, createdAt: true },
  });
  const real = specs.filter((s) => !throwaway.has(s.projectId));

  console.log(`  (${real.length} spec row(s) across the database)`);

  const byProject = new Map<string, typeof real>();
  for (const spec of real) {
    byProject.set(spec.projectId, [...(byProject.get(spec.projectId) ?? []), spec]);
  }

  let allContiguous = true;
  let countersCorrect = true;
  for (const [projectId, rows] of byProject) {
    const versions = rows.map((r) => r.version);
    if (!versions.every((v, i) => v === i + 1)) allContiguous = false;

    const { nextSpecVersion } = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { nextSpecVersion: true },
    });
    if (nextSpecVersion !== rows.length + 1) countersCorrect = false;
  }

  check("every spec has a version", real.every((s) => typeof s.version === "number"));
  check("versions are 1..n in createdAt order within each project", allContiguous);
  check("each project's counter is its spec count + 1", countersCorrect);

  const empty = await prisma.project.count({
    where: { specs: { none: {} }, nextSpecVersion: { not: 1 } },
  });
  check("a project with no specs still starts at version 1", empty === 0,
    `${empty} project(s) with no specs have a counter other than 1`);
}

/** Placeholder versions the backfill has to overwrite. Far above any real
 *  count, and distinct, so the corrective UPDATE never transiently collides
 *  with `@@unique([projectId, version])` on its way down to 1..n. */
const WRONG_VERSION_BASE = 1000;

/** Deliberately wrong counter, so "the migration set it" is distinguishable
 *  from "it was already right". */
const WRONG_COUNTER = 777;

/**
 * The migration's two backfill statements, read out of the migration file
 * itself. Copying the SQL into this script would let the two drift and would
 * verify the copy rather than the migration, so the file is the source.
 */
async function readBackfillStatements(): Promise<string[]> {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(
    "prisma/migrations/20260731120000_add_spec_versions/migration.sql",
    "utf8",
  );

  const statements = sql
    .split(";")
    .map((s) =>
      s
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((s) => s.toUpperCase().startsWith("UPDATE "));

  if (statements.length !== 2) {
    throw new Error(
      `Expected 2 UPDATE statements in the migration, found ${statements.length}. ` +
        `If the migration changed, this phase needs re-reading before it is trusted.`,
    );
  }
  return statements;
}

async function backfillDeepPhase() {
  console.log(
    "\nbackfill-deep — the migration's own SQL over multi-spec history (rolled back)",
  );
  const { prisma } = await deps();
  const statements = await readBackfillStatements();
  check("migration file yields exactly 2 backfill statements", statements.length === 2);

  // Depths chosen to cover: a single spec (the whole of the real dataset), a
  // small project, a project deeper than any real one, and a spec-less project
  // whose counter must stay at 1.
  const DEPTHS = [1, 5, 12, 0];
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  const created: { id: string; depth: number }[] = [];

  try {
    for (const [index, depth] of DEPTHS.entries()) {
      const project = await prisma.project.create({
        data: {
          ownerId: OWNER_ID,
          name: `${PROJECT_PREFIX}deep-${process.pid}-${index}`,
          nextSpecVersion: WRONG_COUNTER,
        },
        select: { id: true },
      });
      created.push({ id: project.id, depth });

      for (let i = 0; i < depth; i += 1) {
        // `createdAt` is deliberately not insertion order — the last-inserted
        // row is the oldest — so a backfill that leaned on insertion order
        // instead of `createdAt` would be caught here. Rows 1 and 2 of the
        // deepest project share an exact timestamp, which is the tie the
        // migration breaks by `id`.
        const offsetMinutes = depth === 12 && i <= 1 ? 0 : (depth - i) * 37;
        await prisma.projectSpec.create({
          data: {
            projectId: project.id,
            version: WRONG_VERSION_BASE + i,
            filePath: `https://example.invalid/not-uploaded/${index}-${i}.md`,
            createdAt: new Date(base + offsetMinutes * 60_000),
          },
        });
      }
    }

    // Independently computed expectation: order by (createdAt, id) ascending,
    // number from 1. Same rule as the migration, arrived at separately.
    const expected = new Map<string, number>();
    for (const { id } of created) {
      const rows = await prisma.projectSpec.findMany({
        where: { projectId: id },
        select: { id: true, createdAt: true },
      });
      rows
        .sort(
          (a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime() ||
            a.id.localeCompare(b.id),
        )
        .forEach((row, i) => expected.set(row.id, i + 1));
    }

    // The real (non-throwaway) rows, so the rollback can be proven against
    // data this script did not create.
    const throwaway = new Set(created.map((c) => c.id));
    const realBefore = await prisma.projectSpec.findMany({
      select: { id: true, projectId: true, version: true },
    });
    const realRows = realBefore.filter((r) => !throwaway.has(r.projectId));

    class Rollback extends Error {}

    try {
      await prisma.$transaction(async (tx) => {
        for (const statement of statements) {
          await tx.$executeRawUnsafe(statement);
        }

        let versionsCorrect = true;
        let tieBrokenById = true;
        for (const { id, depth } of created) {
          const rows = await tx.projectSpec.findMany({
            where: { projectId: id },
            select: { id: true, version: true },
          });
          for (const row of rows) {
            if (row.version !== expected.get(row.id)) versionsCorrect = false;
          }
          const versions = rows.map((r) => r.version).sort((a, b) => a - b);
          if (
            versions.length !== depth ||
            !versions.every((v, i) => v === i + 1)
          ) {
            versionsCorrect = false;
          }
          if (depth === 12) {
            // The tie pair must have taken two consecutive numbers rather than
            // both landing on the same one.
            if (new Set(versions).size !== versions.length) tieBrokenById = false;
          }
        }

        check(
          "every seeded spec is renumbered to 1..n by (createdAt, id)",
          versionsCorrect,
        );
        check(
          "an exact createdAt tie takes two distinct consecutive versions",
          tieBrokenById,
        );

        let countersCorrect = true;
        for (const { id, depth } of created) {
          const { nextSpecVersion } = await tx.project.findUniqueOrThrow({
            where: { id },
            select: { nextSpecVersion: true },
          });
          // A spec-less project is untouched by the counter UPDATE (it joins
          // against a GROUP BY over ProjectSpec), so it keeps whatever it had.
          const want = depth === 0 ? WRONG_COUNTER : depth + 1;
          if (nextSpecVersion !== want) countersCorrect = false;
        }
        check(
          "each seeded project's counter becomes its spec count + 1",
          countersCorrect,
        );

        const unique = await tx.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT COUNT(*)::bigint AS count FROM (
             SELECT "projectId", "version" FROM "ProjectSpec"
             GROUP BY "projectId", "version" HAVING COUNT(*) > 1
           ) dupes`,
        );
        check(
          "no (projectId, version) duplicate anywhere after the backfill",
          Number(unique[0]?.count ?? -1) === 0,
          `${unique[0]?.count} duplicate group(s)`,
        );

        throw new Rollback("rolling back — this phase never keeps its writes");
      });
      check("transaction was rolled back", false, "it committed");
    } catch (error) {
      check("transaction was rolled back", error instanceof Rollback,
        error instanceof Error ? error.message : String(error));
    }

    const realAfter = await prisma.projectSpec.findMany({
      where: { id: { in: realRows.map((r) => r.id) } },
      select: { id: true, version: true },
    });
    const unchanged = realRows.every(
      (before) =>
        realAfter.find((a) => a.id === before.id)?.version === before.version,
    );
    check(
      `pre-existing spec row(s) unchanged after rollback (${realRows.length} checked)`,
      unchanged,
    );

    const stillWrong = await prisma.projectSpec.count({
      where: {
        projectId: { in: created.map((c) => c.id) },
        version: { gte: WRONG_VERSION_BASE },
      },
    });
    const seeded = DEPTHS.reduce((a, b) => a + b, 0);
    check(
      "seeded rows are back at their placeholder versions — the rollback really took",
      stillWrong === seeded,
      `${stillWrong} of ${seeded} still placeholder`,
    );
  } finally {
    await prisma.project.deleteMany({
      where: { id: { in: created.map((c) => c.id) } },
    });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const phase = args.find((a) => !a.startsWith("--")) ?? "all";
  const countArg = args.find((a) => a.startsWith("--count="));
  const count = countArg ? Number(countArg.split("=")[1]) : 5;

  const run = {
    sequential: sequentialPhase,
    concurrent: () => concurrentPhase(count),
    lineage: lineagePhase,
    cascade: cascadePhase,
    backfill: backfillPhase,
    "backfill-deep": backfillDeepPhase,
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
