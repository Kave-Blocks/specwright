import { auth } from "@trigger.dev/sdk";
import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizeId, readJsonBody } from "@/lib/projects-api";

/**
 * How long a spec run's realtime token stays valid. A spec run is a longer read
 * than a design run (the client may sit on the page while it is written, and
 * then re-read the finished output), so the token is minted for an hour rather
 * than the SDK's short default.
 */
const TOKEN_EXPIRATION = "1hr";

/**
 * Issue a realtime read token scoped to a single spec run so the client can
 * subscribe to its progress and read its Markdown output. Ownership is proven
 * from the `TaskRun` record (only the user who triggered the run may read it):
 * missing run → 404, wrong owner → 403, mirroring the 404/403 masking used for
 * project ownership.
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
    expirationTime: TOKEN_EXPIRATION,
  });

  return NextResponse.json({ token });
});
