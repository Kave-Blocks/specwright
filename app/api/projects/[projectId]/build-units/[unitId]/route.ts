import { NextResponse } from "next/server"

import { withProjectMember } from "@/lib/api-auth"
import {
  deleteBuildUnit,
  normalizeUnitSummary,
  normalizeUnitTitle,
  parseBuildUnitStatus,
  parseBuildUnitVerified,
  updateBuildUnit,
  type BuildUnitUpdate,
} from "@/lib/build-units"
import { readJsonBody } from "@/lib/projects-api"
import type { BuildUnitResponse } from "@/types/build-units"

/**
 * One build unit: change it, or remove it.
 *
 * Both handlers use `withProjectMember`, not `withProjectOwner`. A unit is
 * project *content* — the same category as the canvas and the architecture
 * brief, whose routes carry the reasoning in full — so anyone who may open the
 * project may record what has been built in it. Ownership guards *lifecycle*
 * (renaming, deleting, sharing the project), which is not what happens here.
 *
 * Both also pass the **guard-resolved `project.id`**, never `params.projectId`,
 * and `lib/build-units.ts` scopes every write to `{ id: unitId, projectId }`.
 * That pairing is what stops a unit id belonging to another project from being
 * reachable through a project the caller does belong to: the row simply does
 * not match, and the caller gets the same 404 an unknown id gets — the
 * row-scoping pattern of
 * `app/api/projects/[projectId]/collaborators/[collaboratorId]/route.ts`.
 */

/** Not-found and duplicate answers, worded for a person, shared by both paths. */
const NOT_FOUND = "Not found"
const DUPLICATE = "A unit with that title already exists"

/**
 * Apply a partial change to a unit.
 *
 * **Presence is decided by `"field" in body`, not by an `undefined` check on the
 * value.** The two are not equivalent for `summary`: `null` and `""` both mean
 * *clear it*, while an absent key means *leave it alone*. Reading presence off
 * the value — or off truthiness — would make clearing a summary impossible,
 * since the cleared value is exactly the falsy one.
 *
 * Every present field is parsed **before** the nothing-to-update check, so a
 * body carrying only an unrecognized status gets "Unknown status" rather than
 * the misleading "Nothing to update".
 *
 * The empty-title rejection and the length bound live here rather than in
 * `updateBuildUnit`, which trusts what it is handed: `normalizeUnitTitle` and
 * `normalizeUnitSummary` are the boundary, and only a route can turn their
 * `null` into a 400.
 *
 * Renaming re-derives the unit's `key`, so a rename onto another unit's title
 * collides and answers 409 — the same refusal a colliding create gets, rather
 * than a silent duplicate or overwrite.
 *
 * `supersededByChange` may be **cleared and only cleared**. Setting it requires
 * a change to point at, which a person cannot invent, so the only human
 * operation is removal — this is where someone gets to disagree with an applied
 * change about whether their unit is really stale. Applying a change
 * (`lib/changes/apply.ts`) is the one thing that writes a value, and it does not
 * come through here, which is what makes "no request can set
 * `supersededByChangeId`" true rather than merely intended.
 */
export const PATCH = withProjectMember<{
  projectId: string
  unitId: string
}>(async (request, { params: { unitId }, project }) => {
  const body = await readJsonBody(request)
  const patch: BuildUnitUpdate = {}

  if ("title" in body) {
    const title = normalizeUnitTitle(body.title)
    if (title === null) {
      return NextResponse.json(
        { error: "A title is required" },
        { status: 400 },
      )
    }
    patch.title = title
  }

  // No validation to fail: a blank or non-string summary normalizes to `null`,
  // which is the legitimate "no summary" value.
  if ("summary" in body) {
    patch.summary = normalizeUnitSummary(body.summary)
  }

  if ("status" in body) {
    const status = parseBuildUnitStatus(body.status)
    if (status === null) {
      return NextResponse.json({ error: "Unknown status" }, { status: 400 })
    }
    patch.status = status
  }

  if ("verified" in body) {
    const verified = parseBuildUnitVerified(body.verified)
    if (verified === null) {
      return NextResponse.json(
        { error: "Unknown verification level" },
        { status: 400 },
      )
    }
    patch.verified = verified
  }

  /*
   * Clear-only, enforced twice over: `BuildUnitUpdate.supersededByChangeId` is
   * typed `null`, so setting it is not expressible in the lib at all, and a body
   * that sends anything other than `null` is refused here rather than quietly
   * treated as a clear. A caller that meant to clear it and sent a number should
   * hear that it cannot, not have it happen anyway.
   */
  if ("supersededByChange" in body) {
    if (body.supersededByChange !== null) {
      return NextResponse.json(
        { error: "Supersession can only be cleared, not set" },
        { status: 400 },
      )
    }
    patch.supersededByChangeId = null
  }

  // Every field that was present and valid set a key above — including
  // `summary: null` — so an empty patch means the body carried none of them.
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const result = await updateBuildUnit(project.id, unitId, patch)
  if (!result.ok) {
    return result.reason === "not-found"
      ? NextResponse.json({ error: NOT_FOUND }, { status: 404 })
      : NextResponse.json({ error: DUPLICATE }, { status: 409 })
  }

  const payload: BuildUnitResponse = { unit: result.unit }
  return NextResponse.json(payload)
})

/**
 * Remove a unit.
 *
 * `Project.nextBuildUnitSequence` is deliberately not rolled back, so the next
 * unit created takes a higher number instead of inheriting the deleted one's.
 * The gap is correct: the number is the identity people referred to the unit
 * by, and reusing it would silently repoint that reference.
 */
export const DELETE = withProjectMember<{
  projectId: string
  unitId: string
}>(async (_request, { params: { unitId }, project }) => {
  const deleted = await deleteBuildUnit(project.id, unitId)
  if (!deleted) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 })
  }

  // `{ ok: true }` — the shape the most recent precedent (`brief/route.ts`)
  // answers a successful write with.
  return NextResponse.json({ ok: true })
})
