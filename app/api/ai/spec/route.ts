import { tasks } from "@trigger.dev/sdk";
import { NextResponse } from "next/server";

import { getAccessibleProject, getClerkIdentity } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/projects-api";
import { specRequestSchema } from "@/lib/spec-agent/payload";
import type { generateSpec } from "@/trigger/generate-spec";

/**
 * Kick off spec generation as a durable background task. The handler stays thin:
 * it authenticates the caller, validates input, proves project access, triggers
 * the task, and records the run so its token can later be verified — writing the
 * spec happens in `trigger/generate-spec.ts`, never here (invariant 1).
 *
 * Access is resolved from the authenticated user + `roomId` alone. The room id
 * *is* the project id, so a client-supplied `projectId` would be an unverified
 * claim; the id the task and the `TaskRun` record receive is the one the access
 * check returned. A project member (owner or collaborator) may generate,
 * mirroring the collaborative canvas the spec is written from.
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  const identity = await getClerkIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  const parsed = specRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "roomId, chatHistory, nodes, and edges are required" },
      { status: 400 },
    );
  }
  const { roomId, chatHistory, nodes, edges } = parsed.data;

  const project = await getAccessibleProject(roomId, identity);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const handle = await tasks.trigger<typeof generateSpec>("generate-spec", {
    projectId: project.id,
    roomId,
    chatHistory,
    nodes,
    edges,
  });

  await prisma.taskRun.create({
    data: {
      runId: handle.id,
      projectId: project.id,
      userId: identity.userId,
    },
  });

  return NextResponse.json({ runId: handle.id }, { status: 201 });
};
