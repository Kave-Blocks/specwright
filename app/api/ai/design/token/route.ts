import { auth } from "@trigger.dev/sdk";
import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizeId, readJsonBody } from "@/lib/projects-api";

/**
 * Issue a realtime read token scoped to a single design run so the client can
 * subscribe to its progress. Ownership is proven from the `TaskRun` record
 * (only the user who triggered the run may read it): missing run → 404, wrong
 * owner → 403, mirroring the 404/403 masking used for project ownership.
 */
export const POST = withAuth(async (request, { userId }) => {
  const body = await readJsonBody(request);
  const runId = normalizeId(body.runId);
  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const taskRun = await prisma.taskRun.findUnique({
    where: { runId },
    select: { userId: true },
  });
  if (!taskRun) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (taskRun.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // A scopeless token authorizes nothing; scope it to just this run's reads.
  const token = await auth.createPublicToken({
    scopes: { read: { runs: [runId] } },
  });

  return NextResponse.json({ token });
});
