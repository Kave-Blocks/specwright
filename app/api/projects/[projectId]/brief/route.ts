import { NextResponse } from "next/server"

import { withProjectMember } from "@/lib/api-auth"
import { prisma } from "@/lib/prisma"
import { readJsonBody } from "@/lib/projects-api"

/**
 * Generous upper bound on a stored brief. A composed interview brief measures
 * roughly 1.2–4.5k characters, so this is far above any legitimate submission
 * and exists only to keep one pathological write from growing the row without
 * limit.
 *
 * Over-length text is truncated, never rejected — the same policy
 * `MAX_FREE_TEXT_LENGTH` (`lib/architecture-brief.ts`) and `AI_CHAT_MAX_LENGTH`
 * (`hooks/use-ai-chat.ts`) apply to human-typed text that has no `maxlength` at
 * its source. A brief that merely ran long is still a legitimate brief.
 */
const MAX_BRIEF_LENGTH = 20_000

/**
 * Persist the Discovery-composed architecture brief. Any project member (owner
 * or collaborator) may write it, since the brief is composed collaboratively
 * the same way the canvas is — `PUT /api/projects/[projectId]/canvas` is the
 * direct model for both the guard and the stable-overwrite shape.
 *
 * Unlike the canvas, the text goes straight into Postgres: it is bounded, so it
 * is stored like `Project.description` rather than as a Blob artifact needing a
 * path indirection.
 *
 * There is deliberately no `GET`. Clients already read the current value
 * through `getAccessibleProject`, and a server-side consumer (spec generation)
 * reads `Project.architectureBrief` directly via Prisma rather than making an
 * HTTP round trip to its own backend.
 */
export const PUT = withProjectMember<{ projectId: string }>(
  async (request, { params: { projectId } }) => {
    const { brief } = await readJsonBody(request)
    const trimmed = typeof brief === "string" ? brief.trim() : ""

    if (trimmed.length === 0) {
      return NextResponse.json({ error: "Empty brief" }, { status: 400 })
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { architectureBrief: trimmed.slice(0, MAX_BRIEF_LENGTH) },
    })

    return NextResponse.json({ ok: true })
  },
)
