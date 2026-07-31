import { NextResponse } from "next/server"

import { withProjectMember } from "@/lib/api-auth"
import { MAX_BUILD_UNITS } from "@/lib/build-units"
import { applyChange } from "@/lib/changes/apply"
import { readJsonBody } from "@/lib/projects-api"
import type { ChangeApplyResponse, ChangeStaleRefusal } from "@/types/changes"

/**
 * Apply a change proposal to the project's build list.
 *
 * `withProjectMember`, not `withProjectOwner` — applying a change writes build
 * units, which are project *content*, exactly as `40`'s collection routes and
 * `38`'s routes are. Ownership guards project *lifecycle* (renaming, deleting,
 * sharing), which is not what happens here.
 *
 * The read is scoped to `{ id: changeId, projectId }` inside `applyChange`,
 * using the **guard-resolved** `project.id` rather than the raw path param, so a
 * change id belonging to another project is not reachable through a project the
 * caller does belong to: it matches nothing and gets the same 404 an unknown id
 * gets.
 *
 * The route stays thin. `lib/changes/apply.ts` owns the transaction, the
 * sequence block, the collision skipping, and the supersession write; what stays
 * here is what only an HTTP boundary can do — parsing an untrusted body, and
 * turning the lib's results into status codes.
 *
 * **No model call happens on this path**, and no spec is written.
 */

/** Refusals, worded for a person. The client shows each `{ error }` verbatim. */
const NOT_FOUND = "Not found"
const NOT_PROPOSED =
  "This change is no longer open — it has already been applied or discarded."
const NO_PROPOSAL =
  "This change has no stored proposal, so there is nothing to apply."
const CAP = `Applying this change would push the project past its ${MAX_BUILD_UNITS}-unit limit.`

export const POST = withProjectMember<{
  projectId: string
  changeId: string
}>(async (request, { params: { changeId }, project }) => {
  const body = await readJsonBody(request)

  /*
   * The acknowledged version is the **only** thing this endpoint accepts from a
   * client, and the body is the only place it can come from. It is a
   * *confirmation of something the server told the client* — the number the
   * stale refusal named — not an instruction: `applyChange` validates it against
   * the project's actual current version, so an acknowledgement of any other
   * number refuses exactly as an absent one does. A non-numeric value is simply
   * absent rather than a 400, because it can never make a refusal into a pass.
   */
  const acknowledged = body.acknowledgedSpecVersion
  const acknowledgedSpecVersion =
    typeof acknowledged === "number" && Number.isInteger(acknowledged)
      ? acknowledged
      : undefined

  const result = await applyChange(project.id, changeId, {
    acknowledgedSpecVersion,
  })

  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 })
    }

    if (result.reason === "stale") {
      // Its own body shape, so the view can tell the one recoverable refusal
      // apart from the terminal ones and offer the confirmation that resolves
      // it. The message names both versions on its own, so a client that only
      // reads `error` still says something true.
      const refusal: ChangeStaleRefusal = {
        error: `This proposal was reasoned against spec version ${result.baseSpecVersion}, but the project is now on version ${result.currentSpecVersion}. Confirm to apply it anyway.`,
        stale: {
          baseSpecVersion: result.baseSpecVersion,
          currentSpecVersion: result.currentSpecVersion,
        },
      }
      return NextResponse.json(refusal, { status: 409 })
    }

    const error =
      result.reason === "cap"
        ? CAP
        : result.reason === "no-proposal"
          ? NO_PROPOSAL
          : NOT_PROPOSED
    return NextResponse.json({ error }, { status: 409 })
  }

  const payload: ChangeApplyResponse = {
    created: result.applied.created,
    supersededUnitIds: result.applied.supersededUnitIds,
    skippedTitles: result.applied.skippedTitles,
  }
  return NextResponse.json(payload)
})
