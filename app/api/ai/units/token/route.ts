import { auth } from "@trigger.dev/sdk";
import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizeId, readJsonBody } from "@/lib/projects-api";

/**
 * Issue a realtime read token scoped to a single unit-derivation run so the
 * client can subscribe to its progress.
 *
 * Identical in shape and reasoning to `POST /api/ai/canvas/token` and
 * `POST /api/ai/design/token`: ownership is proven from the `TaskRun` record —
 * only the user who triggered the run may read it — with missing run → 404 and
 * wrong owner → 403, mirroring the 404/403 masking used for project ownership.
 *
 * The `TaskRun` record says nothing about which task produced the run, so this
 * route is task-agnostic exactly as its siblings are. It exists as its own path
 * only to keep each AI surface addressable on its own route.
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
