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
 *
 * The **room id is not accepted from the client.** One Liveblocks room per
 * project, and the room id *is* the project id, so the room this writes into is
 * always the one the access check resolved — never a second value the caller
 * supplied. A route that access-checks one id and acts on another is the bug:
 * the task mutates the room through the secret-key server client, which no
 * room-level ACL backstops, and this agent may `deleteNode` (cascading every
 * attached edge). So an unverified `roomId` here would not be "draw in a
 * stranger's canvas", it would be "erase it". `TaskRun` records `project.id`
 * for the same reason — the audit row and the room acted on cannot diverge.
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  const identity = await getClerkIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  const prompt = normalizeName(body.prompt);
  const projectId = normalizeId(body.projectId);
  if (!prompt || !projectId) {
    return NextResponse.json(
      { error: "prompt and projectId are required" },
      { status: 400 },
    );
  }

  const project = await getAccessibleProject(projectId, identity);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const handle = await tasks.trigger<typeof designAgent>("design-agent", {
    prompt,
    // Resolved here, not accepted — see the note above.
    roomId: project.id,
  });

  await prisma.taskRun.create({
    data: {
      runId: handle.id,
      projectId: project.id,
      userId: identity.userId,
    },
  });

  // The handle already carries a JWT scoped to reading just this run, which is
  // exactly what the client needs to subscribe with `useRealtimeRun` — so it is
  // handed straight back rather than minting a second token. (The separate
  // `/api/ai/design/token` route stays for re-issuing one later.)
  return NextResponse.json(
    { runId: handle.id, publicToken: handle.publicAccessToken },
    { status: 201 },
  );
};
