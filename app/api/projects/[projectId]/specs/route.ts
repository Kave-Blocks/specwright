import { NextResponse } from "next/server";

import { withProjectMember } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { specDownloadFilename } from "@/lib/spec-agent/storage";
import type { ProjectSpecSummary } from "@/types/specs";

/**
 * List a project's generated specs, newest first.
 *
 * Readable by the owner and by any collaborator — the same membership that
 * grants access to the canvas the specs were written from, and the same guard
 * the sibling download route uses. `withProjectMember` collapses "no such
 * project" and "no access" into one 404, so a non-member cannot probe existence.
 *
 * Metadata only. `filePath` — the private Blob URL — is **never** selected into
 * the response: a spec's bytes are only ever read through the download route,
 * behind its own access check. The filename is derived from the version here,
 * because `ProjectSpec` stores no filename of its own (see `types/specs.ts`).
 *
 * Ordering stays newest-first by `createdAt`. Versions ascend with creation, so
 * ordering by `version` would produce the same list by a less obvious route —
 * and `@@index([projectId, createdAt])` already serves this one.
 */
export const GET = withProjectMember<{ projectId: string }>(
  async (_request, { project }) => {
    const rows = await prisma.projectSpec.findMany({
      // The project the guard resolved, never the raw path param.
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, version: true, createdAt: true },
    });

    const specs: ProjectSpecSummary[] = rows.map((row) => ({
      id: row.id,
      version: row.version,
      filename: specDownloadFilename(row.version),
      createdAt: row.createdAt.toISOString(),
    }));

    return NextResponse.json({ specs });
  },
);
