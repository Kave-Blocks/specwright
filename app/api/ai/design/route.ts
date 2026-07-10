import { tasks } from "@trigger.dev/sdk";
import { NextResponse } from "next/server";

import {
  getAccessibleProject,
  getClerkIdentity,
} from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { normalizeId, normalizeName, readJsonBody } from "@/lib/projects-api";
import type { designAgent } from "@/trigger/design-agent";

/**
 * Kick off design generation as a durable background task. The request handler
 * stays thin: it validates input, proves project access, triggers the task, and
 * records the run so its token can later be verified — the actual generation
 * work happens in `trigger/design-agent.ts`, never here (invariant 1).
 *
 * A project member (owner or collaborator) may generate, mirroring the
 * collaborative canvas: `projectId` arrives in the body (not the path), so the
 * access check runs inline rather than through the `withProjectMember` wrapper.
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  const identity = await getClerkIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  const prompt = normalizeName(body.prompt);
  const roomId = normalizeId(body.roomId);
  const projectId = normalizeId(body.projectId);
  if (!prompt || !roomId || !projectId) {
    return NextResponse.json(
      { error: "prompt, roomId, and projectId are required" },
      { status: 400 },
    );
  }

  const project = await getAccessibleProject(projectId, identity);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const handle = await tasks.trigger<typeof designAgent>("design-agent", {
    prompt,
    roomId,
  });

  await prisma.taskRun.create({
    data: {
      runId: handle.id,
      projectId,
      userId: identity.userId,
    },
  });

  return NextResponse.json({ runId: handle.id }, { status: 201 });
};
