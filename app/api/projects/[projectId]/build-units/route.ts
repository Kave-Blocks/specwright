import { NextResponse } from "next/server"

import { withProjectMember } from "@/lib/api-auth"
import {
  createBuildUnit,
  listBuildUnits,
  MAX_BUILD_UNITS,
  normalizeUnitSummary,
  normalizeUnitTitle,
} from "@/lib/build-units"
import { readJsonBody } from "@/lib/projects-api"
import type {
  BuildUnitListResponse,
  BuildUnitResponse,
} from "@/types/build-units"

/**
 * A project's build units — the collection.
 *
 * Both handlers are membership-gated, not ownership-gated. Build units are
 * project *content*, like the canvas and the architecture brief, rather than
 * project *lifecycle*, which is what `withProjectOwner` guards; the reasoning is
 * written out in the sibling `brief/route.ts` and applies unchanged here. So a
 * collaborator can add a unit and change its status, and `withProjectMember`
 * collapses "no such project" and "no access" into one 404 so a non-member
 * cannot probe existence.
 *
 * Every query goes through `project.id` — the id the guard *resolved* — never
 * `params.projectId`, the same discipline `specs/route.ts` follows.
 *
 * The route is thin on purpose: `lib/build-units.ts` owns the enum mapping, the
 * sequence transaction, and the key derivation. What stays here is the part that
 * only an HTTP boundary can do — parsing an untrusted body, and turning the
 * lib's results into status codes.
 */

/** List the project's units in build order (sequence ascending). */
export const GET = withProjectMember<{ projectId: string }>(
  async (_request, { project }) => {
    const body: BuildUnitListResponse = {
      units: await listBuildUnits(project.id),
    }
    return NextResponse.json(body)
  },
)

/**
 * Create a unit at the end of the build order from `{ title, summary? }`.
 *
 * Normalization happens **here**, before the lib is called: `createBuildUnit`
 * documents that it expects already-normalized input and neither re-truncates
 * nor rejects, because the empty-title refusal is an HTTP answer (400) and only
 * the boundary can give it. Over-length text is truncated rather than refused —
 * the `MAX_BRIEF_LENGTH` policy in `brief/route.ts` for human-typed text with no
 * `maxlength` at its source.
 *
 * A duplicate title collides on the derived key, and a full project trips the
 * cap. Both come back from `createBuildUnit` as *results* rather than throws
 * (see its P2002 handling), so each becomes a 409 carrying a message written for
 * a person to act on — the client hook shows the `{ error }` body verbatim.
 */
export const POST = withProjectMember<{ projectId: string }>(
  async (request, { project }) => {
    const body = await readJsonBody(request)

    const title = normalizeUnitTitle(body.title)
    if (!title) {
      return NextResponse.json(
        { error: "A title is required" },
        { status: 400 },
      )
    }

    const result = await createBuildUnit(project.id, {
      title,
      summary: normalizeUnitSummary(body.summary),
    })

    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.reason === "cap"
              ? `This project has reached its ${MAX_BUILD_UNITS}-unit limit`
              : "A unit with that title already exists",
        },
        { status: 409 },
      )
    }

    const created: BuildUnitResponse = { unit: result.unit }
    return NextResponse.json(created, { status: 201 })
  },
)
