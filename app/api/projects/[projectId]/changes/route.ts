import { NextResponse } from "next/server";

import { withProjectMember } from "@/lib/api-auth";
import { changeStatusToWire } from "@/lib/changes";
import { prisma } from "@/lib/prisma";
import type { ChangeListResponse, ChangeSummary } from "@/types/changes";

/**
 * List a project's change proposals, newest first.
 *
 * `withProjectMember`, not `withProjectOwner`. A change is project *content* —
 * the same category as the canvas, the architecture brief, and build units,
 * whose routes carry the reasoning in full — so anyone who may open the project
 * may see what has been proposed for it. Ownership guards project *lifecycle*
 * (renaming, deleting, sharing), which is not what happens here. The guard also
 * collapses "no such project" and "no access" into one 404, so a non-member
 * cannot probe existence, and an unauthenticated caller gets 401.
 *
 * Metadata only. `proposalPath` — the private Blob URL — and `baseSpecId` are
 * **never** selected into the response: a proposal's bytes are only ever read
 * through the sibling `[changeId]` route, behind its own access check, and the
 * base spec is identified to the client by the one thing it renders, its
 * `version`. Same discipline that keeps `filePath` out of `ProjectSpecSummary`.
 *
 * Ordering stays newest-first by `createdAt`, which `@@index([projectId,
 * createdAt])` already serves. Sequences ascend with creation, so ordering by
 * `sequence` would produce the same list by a less obvious route.
 */
export const GET = withProjectMember<{ projectId: string }>(
  async (_request, { project }) => {
    const rows = await prisma.projectChange.findMany({
      // The project the guard resolved, never the raw path param.
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sequence: true,
        request: true,
        status: true,
        createdAt: true,
        // The join the client needs to say what the proposal was reasoned
        // against. The relation is required, so `baseSpec` is never null.
        baseSpec: { select: { version: true } },
      },
    });

    const changes: ChangeSummary[] = rows.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      request: row.request,
      // The enum member never reaches the wire — `lib/changes.ts` is the only
      // place either direction of that translation happens.
      status: changeStatusToWire(row.status),
      baseSpecVersion: row.baseSpec.version,
      createdAt: row.createdAt.toISOString(),
    }));

    const payload: ChangeListResponse = { changes };
    return NextResponse.json(payload);
  },
);
