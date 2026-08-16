import {
  BuildUnitSource,
  BuildUnitStatus,
  BuildUnitVerified,
  ChangeStatus,
} from "@/app/generated/prisma/enums"
import {
  deriveBuildUnitKey,
  MAX_BUILD_UNITS,
  toSummary,
  UNIT_SELECT,
} from "@/lib/build-units"
import { readChangeProposal } from "@/lib/change-agent/storage"
import { currentSpecVersionOf } from "@/lib/changes"
import { prisma } from "@/lib/prisma"
import type { BuildUnitSummary } from "@/types/build-units"

/**
 * Applying a change proposal — the whole behaviour of unit `41`, in one
 * transaction.
 *
 * Accepting a proposal does two things and nothing else:
 *
 * 1. It **creates** the proposal's new units at the end of the build list.
 * 2. It **marks** the units the change makes stale as superseded, *without
 *    rewriting them*. An already-shipped unit still reads `shipped`, because it
 *    was.
 *
 * That second property is the point of the unit, and it is why supersession is
 * a third independent axis rather than a `BuildUnitStatus` member (the schema
 * doc on `ProjectBuildUnit` states it in full). `38` established that `status`,
 * `verified`, and `sequence` are human-owned and no automatic producer may
 * write them; a `SUPERSEDED` status would break that rule *and* overwrite the
 * record of what was actually built, which is exactly the failure this exists
 * to avoid.
 *
 * **No model call happens here.** This consumes the document `40` already
 * stored; it does not produce one, does not write a `ProjectSpec`, and does not
 * touch the canvas or the Liveblocks room.
 *
 * `projectId` must already be access-checked by the caller — this module does
 * not authorize.
 */

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

/** What landed, in the shape the caller reports back to a person. */
export interface AppliedChange {
  /** The units the change created, in the order they were given numbers. */
  created: BuildUnitSummary[]
  /** Ids of the existing units now marked superseded by this change. */
  supersededUnitIds: string[]
  /**
   * Titles of proposed units that were **skipped** because a unit with the same
   * derived key already exists. A skip is a no-op, not an error (see below), so
   * it is counted and returned rather than failing the apply.
   */
  skippedTitles: string[]
}

/**
 * Why an apply was refused.
 *
 * - `not-found` — no change with that id in that project.
 * - `not-proposed` — already applied, or discarded on purpose.
 * - `stale` — the proposal was reasoned against a spec version that is no
 *   longer the project's current one. Carries both numbers so the refusal can
 *   name them.
 * - `no-proposal` — the row exists but its stored document could not be read,
 *   so there is nothing to apply.
 * - `cap` — creating the proposed units would push the project past
 *   `MAX_BUILD_UNITS`. Refused **whole**: nothing is created and nothing is
 *   marked superseded.
 */
export type ApplyChangeResult =
  | { ok: true; applied: AppliedChange }
  | { ok: false; reason: "not-found" | "not-proposed" | "no-proposal" | "cap" }
  | {
      ok: false
      reason: "stale"
      baseSpecVersion: number
      currentSpecVersion: number
    }

/* -------------------------------------------------------------------------- */
/* Transaction sentinels                                                       */
/* -------------------------------------------------------------------------- */

/*
 * Thrown inside the transaction to roll it back, then translated to a result by
 * the catch below. Sentinels rather than early returns because the rollback is
 * the point: a partial apply leaves a build list nobody asked for — half the new
 * work present, half the supersession recorded, and no way to tell which half.
 */

class ChangeNoLongerProposed extends Error {
  constructor() {
    super("Change is no longer PROPOSED")
    this.name = "ChangeNoLongerProposed"
  }
}

class BuildUnitCapReached extends Error {
  constructor() {
    super("Project has reached its build-unit cap")
    this.name = "BuildUnitCapReached"
  }
}

/* -------------------------------------------------------------------------- */
/* Apply                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Apply one change to a project's build list.
 *
 * The two reads that cannot be inside the transaction happen first: the change
 * row (with its impacts and its base spec's version) and the proposal document,
 * which is an HTTP round-trip to Blob. Everything that *writes* is then in one
 * `$transaction`.
 *
 * **The transaction's ordering is the concurrency contract. Do not restructure
 * it.**
 *
 * 1. Flip the change to `APPLIED` with the `PROPOSED` requirement **in the
 *    `where`**. Under Postgres' read-committed isolation an `UPDATE` re-checks
 *    its `WHERE` after acquiring the row lock, so two applies racing on the same
 *    change resolve to exactly one match and one zero — the second rolls back
 *    having written nothing. This is the guard that actually holds; the status
 *    check before the transaction is only there to give a clean answer without
 *    opening one.
 * 2. Increment `Project.nextBuildUnitSequence` **once by N**, not N times. The
 *    `UPDATE … RETURNING` takes a row lock on the `Project` row held until
 *    commit, which is the same lock `createBuildUnit` relies on — so a member
 *    adding a unit by hand at this moment queues behind the apply rather than
 *    colliding with it. The reserved block is the N numbers below the returned
 *    value.
 * 3. Read the project's existing keys **while that lock is held**, so the
 *    collision set cannot change under the insert.
 * 4. Check the cap against what will actually be created, after collisions are
 *    removed. Refusing on units that would have been skipped anyway would be a
 *    refusal about nothing.
 * 5. Insert, assigning from the front of the reserved block. Numbers reserved
 *    for skipped units are simply not used — the resulting gap is correct, for
 *    the reason `38` gives: a sequence number is never reused.
 * 6. Mark the impact set superseded. `updateMany` on ids, writing **one column**
 *    — no `title`, `summary`, `status`, `verified`, or `sequence` appears in
 *    that `data`, and none may be added to it.
 */
export async function applyChange(
  projectId: string,
  changeId: string,
  options: { acknowledgedSpecVersion?: number } = {},
): Promise<ApplyChangeResult> {
  const change = await prisma.projectChange.findFirst({
    // Scoped by both ids: this is what stops a change id belonging to another
    // project being applied through a project the caller does belong to.
    where: { id: changeId, projectId },
    select: {
      id: true,
      status: true,
      proposalPath: true,
      baseSpec: { select: { version: true } },
      impacts: { select: { buildUnitId: true } },
    },
  })

  if (!change) {
    return { ok: false, reason: "not-found" }
  }

  // An applied change re-applied would duplicate work; a discarded one was
  // rejected on purpose. Neither is a state this can move out of.
  if (change.status !== ChangeStatus.PROPOSED) {
    return { ok: false, reason: "not-proposed" }
  }

  /*
   * Staleness. A proposal is a delta against a known base, so if the project's
   * spec has moved on, the proposal was reasoned against an older picture of
   * the system — the canvas is collaborative and *will* move under a pending
   * proposal. This is IcePanel's merge-conflict step reduced to a single
   * branch: refuse, name both versions, and require the caller to re-submit
   * acknowledging the current one.
   *
   * The acknowledgement is a *confirmation of something the server told the
   * client*, so it is validated against the current version rather than trusted
   * as an instruction: an acknowledgement of some other number refuses exactly
   * as an absent one does.
   */
  const currentSpecVersion = await currentSpecVersionOf(projectId)
  if (
    currentSpecVersion !== null &&
    change.baseSpec.version !== currentSpecVersion &&
    options.acknowledgedSpecVersion !== currentSpecVersion
  ) {
    return {
      ok: false,
      reason: "stale",
      baseSpecVersion: change.baseSpec.version,
      currentSpecVersion,
    }
  }

  // Read outside the transaction: it is an HTTP round-trip to Blob, and holding
  // the `Project` row lock across it would block every concurrent unit create.
  const proposal = await readChangeProposal(change.proposalPath)
  if (!proposal) {
    // The row exists but its document is unreadable, so there is nothing to
    // apply. Refusing keeps the change `PROPOSED` rather than marking it applied
    // for having done nothing.
    return { ok: false, reason: "no-proposal" }
  }

  const proposedUnits = proposal.proposedUnits
  const supersededUnitIds = change.impacts.map((impact) => impact.buildUnitId)

  try {
    const applied = await prisma.$transaction(async (tx) => {
      // 1. The real double-apply guard — see the ordering note above.
      const { count } = await tx.projectChange.updateMany({
        where: { id: changeId, projectId, status: ChangeStatus.PROPOSED },
        data: { status: ChangeStatus.APPLIED },
      })
      if (count === 0) {
        throw new ChangeNoLongerProposed()
      }

      // 2. Reserve the whole block in one increment.
      let firstSequence = 0
      if (proposedUnits.length > 0) {
        const { nextBuildUnitSequence } = await tx.project.update({
          where: { id: projectId },
          data: {
            nextBuildUnitSequence: { increment: proposedUnits.length },
          },
          select: { nextBuildUnitSequence: true },
        })
        firstSequence = nextBuildUnitSequence - proposedUnits.length
      }

      // 3. The collision set, read under the lock.
      const existing = await tx.projectBuildUnit.findMany({
        where: { projectId },
        select: { key: true },
      })
      const takenKeys = new Set(existing.map((unit) => unit.key))

      /*
       * A proposed unit whose derived key collides with an existing one is a
       * **no-op, not an error**. `38` defines `@@unique([projectId, key])` as
       * the natural key an automatic producer matches against, and its producer
       * contract is: match on `key`, add what does not exist, never touch the
       * rest. Skipping is also the second guard against a double apply if the
       * status check above were ever bypassed — a re-apply would find every key
       * already taken and create nothing.
       *
       * Two proposed units that slugify to the same key collide with each other
       * too; `takenKeys` grows as we go, so the second is skipped rather than
       * failing the insert on the unique constraint.
       */
      const toCreate: { sequence: number; key: string; title: string; summary: string | null }[] =
        []
      const skippedTitles: string[] = []

      proposedUnits.forEach((unit, index) => {
        const sequence = firstSequence + index
        const key = deriveBuildUnitKey(unit.title, sequence)
        if (takenKeys.has(key)) {
          skippedTitles.push(unit.title)
          return
        }
        takenKeys.add(key)
        toCreate.push({
          sequence,
          key,
          title: unit.title,
          summary: unit.summary,
        })
      })

      // 4. The cap, against what will actually be created.
      if (existing.length + toCreate.length > MAX_BUILD_UNITS) {
        throw new BuildUnitCapReached()
      }

      // 5. Insert. Sequential rather than `createMany` because each row is read
      // back through `UNIT_SELECT` — the caller applies the created rows to
      // local state, and `createMany` returns only a count.
      const created: BuildUnitSummary[] = []
      for (const unit of toCreate) {
        const row = await tx.projectBuildUnit.create({
          data: {
            projectId,
            sequence: unit.sequence,
            key: unit.key,
            title: unit.title,
            summary: unit.summary,
            // The new work has not been started or verified — those are the
            // human-owned columns, and this is where their defaults come from
            // rather than from anything the proposal said.
            status: BuildUnitStatus.SPECCED,
            verified: BuildUnitVerified.NONE,
            source: BuildUnitSource.CHANGE,
            changeId,
          },
          select: UNIT_SELECT,
        })
        created.push(toSummary(row))
      }

      // 6. Supersession: one column, on the impact set, scoped to the project.
      // Nothing else about these rows is touched.
      if (supersededUnitIds.length > 0) {
        await tx.projectBuildUnit.updateMany({
          where: { id: { in: supersededUnitIds }, projectId },
          data: { supersededByChangeId: changeId },
        })
      }

      return { created, supersededUnitIds, skippedTitles }
    })

    return { ok: true, applied }
  } catch (error) {
    if (error instanceof ChangeNoLongerProposed) {
      return { ok: false, reason: "not-proposed" }
    }
    if (error instanceof BuildUnitCapReached) {
      return { ok: false, reason: "cap" }
    }
    throw error
  }
}

/*
 * `currentSpecVersionOf` used to live here, private to this module. `42` needs
 * the same answer to measure spec drift, so it moved to `lib/changes.ts` rather
 * than being written a second time — the reasoning about why the version is
 * read from the spec rows and not from `Project.nextSpecVersion - 1` travelled
 * with it.
 */
