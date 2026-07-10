import { get, put } from "@vercel/blob"
import { NextResponse } from "next/server"

import { withProjectMember } from "@/lib/api-auth"
import { canvasBlobPath, parseCanvasSnapshot } from "@/lib/canvas-storage"
import { prisma } from "@/lib/prisma"
import { readJsonBody } from "@/lib/projects-api"

/**
 * Persist the latest canvas graph. Any project member (owner or collaborator)
 * may save, since the canvas is collaboratively edited. The JSON goes to Vercel
 * Blob and only the returned blob URL is written to the project record —
 * metadata in Prisma, artifact in Blob (`architecture-context.md`).
 *
 * The store is private, so blobs are written with private access and can only
 * be read back through the SDK (see GET), never a plain public fetch.
 */
export const PUT = withProjectMember<{ projectId: string }>(
  async (request, { params: { projectId } }) => {
    const snapshot = parseCanvasSnapshot(await readJsonBody(request))
    if (!snapshot) {
      return NextResponse.json(
        { error: "Invalid canvas payload" },
        { status: 400 },
      )
    }

    // Stable pathname + overwrite keeps the blob URL constant across saves, so
    // `canvasJsonPath` never churns and old snapshots aren't orphaned.
    const blob = await put(canvasBlobPath(projectId), JSON.stringify(snapshot), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    })

    await prisma.project.update({
      where: { id: projectId },
      data: { canvasJsonPath: blob.url },
    })

    return NextResponse.json({ url: blob.url })
  },
)

/**
 * Read the saved canvas graph back for the editor. Returns `{ canvas: null }`
 * when the project has never been saved (or the artifact can't be read) so the
 * editor can cleanly start from an empty room. Private blobs require the SDK's
 * authenticated `get` (with `useCache: false` for the freshest content) rather
 * than a public URL fetch.
 */
export const GET = withProjectMember<{ projectId: string }>(
  async (_request, { params: { projectId } }) => {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { canvasJsonPath: true },
    })

    if (!project?.canvasJsonPath) {
      return NextResponse.json({ canvas: null })
    }

    // Read the blob back through the SDK using the stored URL (a private blob
    // URL is not publicly fetchable; the SDK attaches the auth token).
    const result = await get(project.canvasJsonPath, {
      access: "private",
      useCache: false,
    })
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ canvas: null })
    }

    const canvas = parseCanvasSnapshot(
      await new Response(result.stream).json(),
    )
    return NextResponse.json({ canvas })
  },
)
