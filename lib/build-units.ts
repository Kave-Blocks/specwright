import {
  BuildUnitSource,
  BuildUnitStatus,
  BuildUnitVerified,
} from "@/app/generated/prisma/enums"
import { prisma } from "@/lib/prisma"
import { slugify } from "@/lib/projects"
import type {
  BuildUnitSourceValue,
  BuildUnitStatusValue,
  BuildUnitSummary,
  BuildUnitVerifiedValue,
} from "@/types/build-units"

/**
 * Server-side build-unit behaviour.
 *
 * This is the **only** module that translates between the SCREAMING_SNAKE
 * Prisma enum members and the lowercase tracker vocabulary the wire carries
 * (`"in progress"`, with the space — see `types/build-units.ts`). Keeping both
 * directions here means a route never sees an enum member and the database
 * never sees a wire string, so a new member is added in exactly two places: the
 * schema, and the tables below.
 *
 * It reaches for the Prisma client, so it is server-only. The shapes it returns
 * live in `types/build-units.ts`, which imports nothing, so a `"use client"`
 * module can share them without dragging the database client into the browser.
 */

/* -------------------------------------------------------------------------- */
/* Bounds                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cap on how many units one project may hold.
 *
 * A runaway guard in the spirit of `MAX_NODES`/`MAX_EDGES`
 * (`lib/spec-agent/payload.ts`), **not a product limit**: no real backlog has
 * two hundred entries, so hitting this means something is inserting in a loop.
 * It exists so one pathological caller cannot grow a project without bound.
 */
export const MAX_BUILD_UNITS = 200

/**
 * Bounds on a unit's human-typed text.
 *
 * Over-length text is **truncated, never rejected** — the policy
 * `MAX_BRIEF_LENGTH` (`app/api/projects/[projectId]/brief/route.ts`),
 * `MAX_FREE_TEXT_LENGTH` (`lib/architecture-brief.ts`), and `AI_CHAT_MAX_LENGTH`
 * (`hooks/use-ai-chat.ts`) all apply to human-typed text with no `maxlength` at
 * its source. A title that merely ran long is still a legitimate title, and
 * failing the create would lose what the person typed.
 */
export const MAX_UNIT_TITLE_LENGTH = 200
export const MAX_UNIT_SUMMARY_LENGTH = 1_000

/* -------------------------------------------------------------------------- */
/* Vocabulary mapping                                                          */
/* -------------------------------------------------------------------------- */

/*
 * Both directions are typed as exhaustive `Record`s rather than switches with a
 * default, so a member added to `BuildUnitStatus`/`BuildUnitVerified` in a later
 * unit fails the build here instead of silently falling through to a fallback.
 * The Prisma 7.8 `prisma-client` generator emits enums as `as const` objects
 * (`app/generated/prisma/enums.ts`), so a "member" is a string literal and these
 * maps are ordinary objects.
 */

const STATUS_TO_WIRE: Record<BuildUnitStatus, BuildUnitStatusValue> = {
  SPECCED: "specced",
  IN_PROGRESS: "in progress",
  SHIPPED: "shipped",
  DEFERRED: "deferred",
  BLOCKED: "blocked",
}

const STATUS_FROM_WIRE: Record<BuildUnitStatusValue, BuildUnitStatus> = {
  specced: BuildUnitStatus.SPECCED,
  "in progress": BuildUnitStatus.IN_PROGRESS,
  shipped: BuildUnitStatus.SHIPPED,
  deferred: BuildUnitStatus.DEFERRED,
  blocked: BuildUnitStatus.BLOCKED,
}

const VERIFIED_TO_WIRE: Record<BuildUnitVerified, BuildUnitVerifiedValue> = {
  NONE: "none",
  STRUCTURAL: "structural",
  PARTIAL: "partial",
  BROWSER: "browser",
}

const VERIFIED_FROM_WIRE: Record<BuildUnitVerifiedValue, BuildUnitVerified> = {
  none: BuildUnitVerified.NONE,
  structural: BuildUnitVerified.STRUCTURAL,
  partial: BuildUnitVerified.PARTIAL,
  browser: BuildUnitVerified.BROWSER,
}

/**
 * Outbound only. `source` records who created a unit and is never accepted from
 * a client: a person's unit is `MANUAL` by schema default, a spec-derived one is
 * `SPEC`, and applying a change proposal writes `CHANGE` server-side. There is
 * deliberately no `parseBuildUnitSource` for a route to reach for.
 */
const SOURCE_TO_WIRE: Record<BuildUnitSource, BuildUnitSourceValue> = {
  MANUAL: "manual",
  SPEC: "spec",
  CHANGE: "change",
}

/**
 * Parse a wire status into its enum member, or `null` when it is not one of the
 * five. Returning `null` rather than a default is what lets a route answer 400
 * instead of quietly writing a status the caller did not ask for.
 */
export function parseBuildUnitStatus(value: unknown): BuildUnitStatus | null {
  if (typeof value !== "string" || !Object.hasOwn(STATUS_FROM_WIRE, value)) {
    return null
  }
  return STATUS_FROM_WIRE[value as BuildUnitStatusValue]
}

/** Parse a wire verification level into its enum member, or `null`. */
export function parseBuildUnitVerified(
  value: unknown,
): BuildUnitVerified | null {
  if (typeof value !== "string" || !Object.hasOwn(VERIFIED_FROM_WIRE, value)) {
    return null
  }
  return VERIFIED_FROM_WIRE[value as BuildUnitVerifiedValue]
}

/* -------------------------------------------------------------------------- */
/* Normalization                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Derive a unit's natural key from its title — the value a future automatic
 * producer matches a spec's units against.
 *
 * `slugify` (`lib/projects.ts`) already lowercases, collapses non-alphanumeric
 * runs to single hyphens, and trims the ends; a project's slug and a unit's key
 * are the same derivation, so there is one implementation of it.
 *
 * A title that is entirely punctuation or non-Latin slugifies to the empty
 * string. Those titles are legitimate, so they fall back to `unit-{sequence}`,
 * which is unique by construction: a sequence number is never reused.
 */
export function deriveBuildUnitKey(title: string, sequence: number): string {
  return slugify(title) || `unit-${sequence}`
}

/**
 * Coerce an unknown value into a storable title, or `null` when there is none.
 *
 * Trimmed, then bounded (see `MAX_UNIT_TITLE_LENGTH`), then trimmed again so a
 * cut mid-whitespace leaves no trailing space — the same `boundedText` shape as
 * `lib/architecture-brief.ts`. Only an absent, non-string, or blank title is
 * rejected; length never is.
 */
export function normalizeUnitTitle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const bounded = value.trim().slice(0, MAX_UNIT_TITLE_LENGTH).trim()
  return bounded.length > 0 ? bounded : null
}

/**
 * Coerce an unknown value into a storable summary. A summary is optional, so
 * `null` here means "no summary" rather than "invalid" — which is why a blank
 * string and an explicit `null` both come back as `null`, and why a PATCH route
 * decides *presence* from `"summary" in body` rather than from this result.
 */
export function normalizeUnitSummary(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const bounded = value.trim().slice(0, MAX_UNIT_SUMMARY_LENGTH).trim()
  return bounded.length > 0 ? bounded : null
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The columns a unit is read through. `key` is deliberately absent: it is a
 * server-side matching detail with nothing to render, kept out of responses the
 * same way `ProjectSpec.filePath` is (`types/build-units.ts`).
 *
 * `specId` is absent for the same reason — the lineage is read through the
 * relation, so what leaves here is the source spec's *version*, the number the
 * UI shows, and never the id it never renders. `changeId` and
 * `supersededByChangeId` are absent on that same rule: supersession leaves here
 * as the change's *sequence*, the number a change is named by.
 *
 * `changeId` has no wire field at all — `source: "change"` already says a unit
 * was produced by applying a proposal, and nothing renders *which* one.
 */
export const UNIT_SELECT = {
  id: true,
  sequence: true,
  title: true,
  summary: true,
  status: true,
  verified: true,
  source: true,
  spec: { select: { version: true } },
  supersededByChange: { select: { sequence: true } },
  createdAt: true,
  updatedAt: true,
} as const

export interface BuildUnitRow {
  id: string
  sequence: number
  title: string
  summary: string | null
  status: BuildUnitStatus
  verified: BuildUnitVerified
  source: BuildUnitSource
  /** `null` when the unit has no source spec, or its spec was removed. */
  spec: { version: number } | null
  /** `null` when nothing has superseded this unit, or a person cleared it. */
  supersededByChange: { sequence: number } | null
  createdAt: Date
  updatedAt: Date
}

/** Map a persisted row onto the wire shape: enum members out, ISO dates out. */
export function toSummary(row: BuildUnitRow): BuildUnitSummary {
  return {
    id: row.id,
    sequence: row.sequence,
    title: row.title,
    summary: row.summary,
    status: STATUS_TO_WIRE[row.status],
    verified: VERIFIED_TO_WIRE[row.verified],
    source: SOURCE_TO_WIRE[row.source],
    specVersion: row.spec?.version ?? null,
    supersededByChange: row.supersededByChange?.sequence ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * A project's units in build order. Ordering by `sequence` (not `createdAt`)
 * is what makes the list stable: the number is the identity people refer to a
 * unit by, and gaps in it are expected rather than damage.
 */
export async function listBuildUnits(
  projectId: string,
): Promise<BuildUnitSummary[]> {
  const rows = await prisma.projectBuildUnit.findMany({
    where: { projectId },
    orderBy: { sequence: "asc" },
    select: UNIT_SELECT,
  })
  return rows.map(toSummary)
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

export type CreateBuildUnitResult =
  | { ok: true; unit: BuildUnitSummary }
  | { ok: false; reason: "cap" | "duplicate" }

export type UpdateBuildUnitResult =
  | { ok: true; unit: BuildUnitSummary }
  | { ok: false; reason: "not-found" | "duplicate" }

/** The fields a PATCH may carry. An absent key means "leave this alone". */
export interface BuildUnitUpdate {
  title?: string
  summary?: string | null
  status?: BuildUnitStatus
  verified?: BuildUnitVerified
  /**
   * Clear supersession — **and only clear it**. The type is `null`, not
   * `string | null`, so setting it is not expressible here at all: pointing a
   * unit at a change requires a change to point at, which a person cannot
   * invent, so the only human operation is removal. Applying a proposal
   * (`lib/changes/apply.ts`) is the one thing that writes a value, and it does
   * not go through this function.
   *
   * Clearing changes nothing else about the unit.
   */
  supersededByChangeId?: null
}

/**
 * Detect Prisma's unique-constraint violation. Here it always means the derived
 * `key` is taken — i.e. another unit in this project already has that title.
 * The detection shape is the one `app/api/projects/[projectId]/collaborators/route.ts`
 * uses; it lives in `lib/` rather than in a route because both build-unit routes
 * need to treat a collision identically.
 */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  )
}

/** Detect Prisma's "record to update not found" — a concurrent delete. */
function isMissingRecordError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  )
}

/**
 * Thrown inside the create transaction to roll it back when the project is
 * already full. A sentinel rather than a returned value because the rollback is
 * the point: it puts the counter increment back.
 */
class BuildUnitCapReached extends Error {
  constructor() {
    super("Project has reached its build-unit cap")
    this.name = "BuildUnitCapReached"
  }
}

/**
 * Create a unit at the end of a project's build order.
 *
 * `title` and `summary` are expected to have been through `normalizeUnitTitle`
 * and `normalizeUnitSummary` already — that is where the empty-title rejection
 * and the length bound live, because a route needs the rejection to answer 400.
 *
 * **The transaction's ordering is the concurrency contract. Do not restructure
 * it.**
 *
 * 1. Increment `Project.nextBuildUnitSequence` first. The `UPDATE … RETURNING`
 *    takes a row lock on the `Project` row that is held until commit, and that
 *    lock is what serializes concurrent creates — two members clicking Add at
 *    the same moment queue behind it and get different numbers. The number this
 *    unit takes is the returned value minus one.
 * 2. Check the cap **after** the increment, so the lock is already held.
 *    Checking first would let two parallel creates at 199 both pass.
 * 3. Derive the key inside, because the empty-slug fallback needs the sequence.
 * 4. Insert.
 *
 * Two observable consequences of the increment being inside the transaction:
 * a rejected create (duplicate title, or cap) rolls the counter back, so a
 * refusal burns no number. That does not contradict "gaps in `sequence` are
 * correct" — that rule is about deletes, and `deleteBuildUnit` deliberately does
 * not roll the counter back.
 */
export async function createBuildUnit(
  projectId: string,
  input: { title: string; summary: string | null },
): Promise<CreateBuildUnitResult> {
  try {
    const row = await prisma.$transaction(async (tx) => {
      const { nextBuildUnitSequence } = await tx.project.update({
        where: { id: projectId },
        data: { nextBuildUnitSequence: { increment: 1 } },
        select: { nextBuildUnitSequence: true },
      })
      const sequence = nextBuildUnitSequence - 1

      const existing = await tx.projectBuildUnit.count({ where: { projectId } })
      if (existing >= MAX_BUILD_UNITS) {
        throw new BuildUnitCapReached()
      }

      return tx.projectBuildUnit.create({
        data: {
          projectId,
          sequence,
          key: deriveBuildUnitKey(input.title, sequence),
          title: input.title,
          summary: input.summary,
        },
        select: UNIT_SELECT,
      })
    })

    return { ok: true, unit: toSummary(row) }
  } catch (error) {
    if (error instanceof BuildUnitCapReached) {
      return { ok: false, reason: "cap" }
    }
    // A duplicate title is a normal answer, not a fault: it comes back as a
    // result so both routes can turn it into the same 409 message.
    if (isUniqueConstraintError(error)) {
      return { ok: false, reason: "duplicate" }
    }
    throw error
  }
}

/**
 * Apply a patch to one unit, scoped to the project it belongs to.
 *
 * The lookup is `{ id: unitId, projectId }` **before** the write, and that
 * scoping is the whole guarantee: a unit id from another project resolves to
 * nothing and comes back `not-found`, so it is not reachable through a project
 * the caller does belong to. The write then addresses the row by id alone,
 * which is safe only because that check already ran.
 *
 * Changing the title re-derives the key from the unit's existing sequence, so
 * renaming a unit to what a future spec will call it creates the match instead
 * of guaranteeing a permanent mismatch. A rename into a taken key is a
 * `duplicate`, the same answer a colliding create gets.
 *
 * It can also **clear** supersession, and only clear it — see
 * {@link BuildUnitUpdate.supersededByChangeId}. That is the one place a person
 * gets to disagree with an applied change about whether their unit is stale.
 */
export async function updateBuildUnit(
  projectId: string,
  unitId: string,
  patch: BuildUnitUpdate,
): Promise<UpdateBuildUnitResult> {
  const existing = await prisma.projectBuildUnit.findFirst({
    where: { id: unitId, projectId },
    select: { sequence: true },
  })
  if (!existing) {
    return { ok: false, reason: "not-found" }
  }

  const data: {
    title?: string
    key?: string
    summary?: string | null
    status?: BuildUnitStatus
    verified?: BuildUnitVerified
    supersededByChangeId?: null
  } = {}

  if (patch.title !== undefined) {
    data.title = patch.title
    data.key = deriveBuildUnitKey(patch.title, existing.sequence)
  }
  if (patch.summary !== undefined) {
    data.summary = patch.summary
  }
  if (patch.status !== undefined) {
    data.status = patch.status
  }
  if (patch.verified !== undefined) {
    data.verified = patch.verified
  }
  // Present means clear it. The patch type admits no other value, so this
  // branch cannot set supersession however it is called.
  if (patch.supersededByChangeId !== undefined) {
    data.supersededByChangeId = null
  }

  try {
    const row = await prisma.projectBuildUnit.update({
      where: { id: unitId },
      data,
      select: UNIT_SELECT,
    })
    return { ok: true, unit: toSummary(row) }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, reason: "duplicate" }
    }
    // The row was deleted between the lookup and the write.
    if (isMissingRecordError(error)) {
      return { ok: false, reason: "not-found" }
    }
    throw error
  }
}

/**
 * Delete one unit, scoped to its project. `false` means nothing matched — an
 * unknown id, or one belonging to a different project.
 *
 * `Project.nextBuildUnitSequence` is **not** rolled back, so the next unit
 * created takes a higher number than the deleted one rather than inheriting it.
 * The gap left behind is correct: a number is the identity people referred to
 * the unit by, and reusing it would silently repoint that reference.
 */
export async function deleteBuildUnit(
  projectId: string,
  unitId: string,
): Promise<boolean> {
  const { count } = await prisma.projectBuildUnit.deleteMany({
    where: { id: unitId, projectId },
  })
  return count > 0
}
