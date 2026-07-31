import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

import { withProjectMember } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  SPEC_CONTENT_TYPE,
  specDownloadFilename,
} from "@/lib/spec-agent/storage";

/**
 * Download one generated spec as a Markdown file.
 *
 * The spec lives in a **private** blob store, so its URL is never handed to the
 * client — this route is the only way to read it. Access is proven before the
 * artifact is touched:
 *
 * 1. `withProjectMember` authenticates the caller and resolves `projectId` to a
 *    project they can open (owner or collaborator — the same membership that
 *    grants access to the canvas the spec was written from). An unauthenticated
 *    caller gets 401; a missing project and one the caller cannot access both
 *    collapse to 404, so a non-member cannot probe which projects exist.
 * 2. The spec is looked up **scoped to that project**, so a spec id belonging to
 *    someone else's project cannot be read through a project the caller happens
 *    to be a member of. A spec that does not exist and one that belongs to
 *    another project are indistinguishable — both 404.
 *
 * Only then is the blob dereferenced, and its bytes are streamed straight
 * through as an attachment rather than buffered.
 */
export const GET = withProjectMember<{ projectId: string; specId: string }>(
  async (_request, { params: { projectId, specId } }) => {
    // Scoped by both ids: this is the check that the spec belongs to the project
    // the caller was authorized for, not merely that it exists.
    const spec = await prisma.projectSpec.findFirst({
      where: { id: specId, projectId },
      // `version` names the downloaded file, and this lookup is already the
      // one that proves the spec belongs to the project — no second read.
      select: { id: true, version: true, filePath: true },
    });

    if (!spec) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // A private blob URL is not publicly fetchable — the SDK attaches the auth
    // token. `useCache: false` matches the canvas read: always the stored bytes.
    const result = await get(spec.filePath, {
      access: "private",
      useCache: false,
    });

    if (!result || result.statusCode !== 200) {
      // The row points at an artifact that is gone or unreadable. Nothing to
      // download, and the caller cannot act on the difference.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new NextResponse(result.stream, {
      status: 200,
      headers: {
        "Content-Type": `${SPEC_CONTENT_TYPE}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${specDownloadFilename(spec.version)}"`,
        // A per-user artifact behind an access check — never store it in a
        // shared cache.
        "Cache-Control": "private, no-store",
      },
    });
  },
);
