import {
  BuildUnitSource,
  BuildUnitStatus,
  BuildUnitVerified,
} from "@/app/generated/prisma/enums";

import {
  MAX_BUILD_UNITS,
  deriveBuildUnitKey,
  normalizeUnitTitle,
  toSummary,
  UNIT_SELECT,
} from "@/lib/build-units";
import { prisma } from "@/lib/prisma";
import type { BuildUnitSummary } from "@/types/build-units";
import type { DerivedUnit } from "@/lib/unit-agent/payload";

/**
 * Writing a derived build list into a project — the whole write side of unit
 * `44`, in one transaction.
 *
 * This is `38`'s **producer contract**, unchanged and stated once more because
 * this is the second producer to implement it and the first one written against
 * a model's output rather than a stored document:
 *
 * > match on `key`, add what does not exist, never touch the rest.
 *
 * Three consequences follow, and none of them is optional:
 *
 * 1. **It only adds.** No supersession, no edit, no delete. Supersession needs a
 *    change to point at (`supersededByChangeId`) and a derivation has none, so
 *    marking anything stale is not even expressible here. A spec that no longer
 *    mentions a unit somebody built does not retract it — `41` exists because a
 *    record of what was built must survive being replaced.
 * 2. **`status`, `verified`, and `sequence` are human-owned.** `status` and
 *    `verified` take their defaults from this module and never a value the model
 *    returned; `sequence` comes from the project counter. Nothing the model
 *    emits reaches any of the three.
 * 3. **A key collision is a no-op, not an error.** It is also what makes a
 *    second derivation from the same spec write nothing — the idempotency is the
 *    collision, so no "already derived" column exists or is needed. That is
 *    `39`'s rule again: record a fact already true, not one that anticipates a
 *    relationship.
 *
 * `projectId` must already be access-checked by the caller — this module does
 * not authorize.
 */

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

/** What landed, in the shape the caller reports back to a person. */
export interface DerivedBuildUnits {
  /** The units created, in the order they were given numbers. */
  created: BuildUnitSummary[];
  /**
   * Titles skipped because a unit with the same derived key already exists. A
   * skip is a no-op rather than a failure, so it is counted and returned.
   */
  skippedTitles: string[];
  /**
   * How many entries the model returned that carried no usable title. Counted
   * rather than silently ignored: `40` records that a producer which drops model
   * output invisibly turns a prompt problem into a mystery.
   */
  droppedCount: number;
}

export type ProduceUnitsResult =
  | { ok: true; produced: DerivedBuildUnits }
  | { ok: false; reason: "cap" };

/**
 * Thrown inside the transaction to roll it back when the project cannot hold
 * what would be created. A sentinel rather than an early return because the
 * rollback is the point: it puts the reserved sequence block back.
 */
class BuildUnitCapReached extends Error {
  constructor() {
    super("Project has reached its build-unit cap");
    this.name = "BuildUnitCapReached";
  }
}

/* -------------------------------------------------------------------------- */
/* Produce                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Write a derived set of units into a project's build list.
 *
 * **The transaction's ordering is the concurrency contract. Do not restructure
 * it.** It is `lib/changes/apply.ts`'s ordering, minus the change-status flip
 * that path opens with, and the reasoning transfers line for line:
 *
 * 1. Drop entries with no usable title, **before** reserving anything, so the
 *    block reserved matches what could actually be written.
 * 2. Increment `Project.nextBuildUnitSequence` **once by N**, not N times. The
 *    `UPDATE … RETURNING` takes a row lock on the `Project` row held until
 *    commit — the same lock `createBuildUnit` relies on — so a member adding a
 *    unit by hand at this moment queues behind the derivation instead of
 *    colliding with it.
 * 3. Read the existing key set **while that lock is held**, so the collision set
 *    cannot change under the insert.
 * 4. Check the cap against what will *actually* be created, after collisions are
 *    removed. Refusing on units that would have been skipped anyway would be a
 *    refusal about nothing.
 * 5. Insert, assigning from the front of the reserved block. Numbers reserved
 *    for skipped units go unused, and the gap is correct for the reason `38`
 *    gives: a sequence number is never reused.
 *
 * There is no step 6. `apply.ts` has one — marking the impact set superseded —
 * and its absence here is the substantive difference between the two producers.
 */
export async function produceDerivedUnits(
  projectId: string,
  specId: string,
  units: DerivedUnit[],
): Promise<ProduceUnitsResult> {
  /*
   * 1. Model output is untrusted input. A title that is absent, non-string, or
   *    blank after trimming is not a unit, and `normalizeUnitTitle` is the same
   *    gate a person's typed title passes through — so a derived unit cannot be
   *    something a person could not have typed.
   */
  const candidates: { title: string; summary: string | null }[] = [];
  let droppedCount = 0;

  for (const unit of units) {
    const title = normalizeUnitTitle(unit.title);
    if (!title) {
      droppedCount += 1;
      continue;
    }
    candidates.push({ title, summary: unit.summary });
  }

  try {
    const produced = await prisma.$transaction(async (tx) => {
      // 2. Reserve the whole block in one increment.
      let firstSequence = 0;
      if (candidates.length > 0) {
        const { nextBuildUnitSequence } = await tx.project.update({
          where: { id: projectId },
          data: { nextBuildUnitSequence: { increment: candidates.length } },
          select: { nextBuildUnitSequence: true },
        });
        firstSequence = nextBuildUnitSequence - candidates.length;
      }

      // 3. The collision set, read under the lock.
      const existing = await tx.projectBuildUnit.findMany({
        where: { projectId },
        select: { key: true },
      });
      const takenKeys = new Set(existing.map((unit) => unit.key));

      /*
       * Two derived units that slugify to the same key collide with each other
       * too; `takenKeys` grows as we go, so the second is skipped rather than
       * failing the insert on the unique constraint.
       */
      const toCreate: {
        sequence: number;
        key: string;
        title: string;
        summary: string | null;
      }[] = [];
      const skippedTitles: string[] = [];

      candidates.forEach((unit, index) => {
        const sequence = firstSequence + index;
        const key = deriveBuildUnitKey(unit.title, sequence);
        if (takenKeys.has(key)) {
          skippedTitles.push(unit.title);
          return;
        }
        takenKeys.add(key);
        toCreate.push({ sequence, key, title: unit.title, summary: unit.summary });
      });

      // 4. The cap, against what will actually be created.
      if (existing.length + toCreate.length > MAX_BUILD_UNITS) {
        throw new BuildUnitCapReached();
      }

      // 5. Insert. Sequential rather than `createMany` because each row is read
      // back through `UNIT_SELECT` — the caller reports the created rows, and
      // `createMany` returns only a count.
      const created: BuildUnitSummary[] = [];
      for (const unit of toCreate) {
        const row = await tx.projectBuildUnit.create({
          data: {
            projectId,
            sequence: unit.sequence,
            key: unit.key,
            title: unit.title,
            summary: unit.summary,
            // The human-owned columns take their defaults *here*, never a value
            // the model returned. Derived work has not been started or verified.
            status: BuildUnitStatus.SPECCED,
            verified: BuildUnitVerified.NONE,
            // Both already existed before this unit: `SPEC` was the enum member
            // reserved for exactly this producer, and `specId` is the lineage
            // column `39` added. No migration was needed.
            source: BuildUnitSource.SPEC,
            specId,
          },
          select: UNIT_SELECT,
        });
        created.push(toSummary(row));
      }

      return { created, skippedTitles, droppedCount };
    });

    return { ok: true, produced };
  } catch (error) {
    if (error instanceof BuildUnitCapReached) {
      return { ok: false, reason: "cap" };
    }
    throw error;
  }
}
