import { tasks } from "@trigger.dev/sdk";
import { NextResponse } from "next/server";

import { loadPushableChange } from "@/lib/canvas-sync/change";
import { getAccessibleProject, getClerkIdentity } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { normalizeId, readJsonBody } from "@/lib/projects-api";
import type { canvasSync } from "@/trigger/canvas-sync";

/**
 * Push an applied change's architecture delta onto the project's canvas, as a
 * durable background task.
 *
 * The handler mirrors `POST /api/ai/design`: it authenticates the caller,
 * validates input, proves project access, refuses what cannot succeed, triggers
 * the task, and records the run so its token can later be verified. The drawing
 * itself happens in `trigger/canvas-sync.ts`, never here (invariant 1).
 *
 * `projectId` arrives **in the body, not the path** — the design route's
 * convention for room-scoped AI work, which is why the access check runs inline
 * rather than through the `withProjectMember` wrapper. A project member (owner
 * or collaborator) may push: the canvas is project *content*, the same category
 * as the change itself.
 *
 * The **room id is not accepted from the client.** One Liveblocks room per
 * project, and the room id *is* the project id, so the room this writes into is
 * the one the access check resolved. A room id in the body would be an
 * unverified claim about which shared document to mutate.
 *
 * The two refusals below happen **before the run is triggered**, so a request
 * that cannot succeed never spends a model call — the discipline `40` set when
 * it refused a proposal against a project with no spec.
 */

/** Refusals, worded for a person. The client shows each `{ error }` verbatim. */
const NOT_FOUND = "Not found";
const NOT_APPLIED =
  "Only an applied change can be pushed to the canvas. Apply it first.";
const ALREADY_PUSHED =
  "This change is already on the canvas. Pushing it again would draw it twice.";

export const POST = async (request: Request): Promise<NextResponse> => {
  const identity = await getClerkIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  const projectId = normalizeId(body.projectId);
  const changeId = normalizeId(body.changeId);
  if (!projectId || !changeId) {
    return NextResponse.json(
      { error: "projectId and changeId are required" },
      { status: 400 },
    );
  }

  const project = await getAccessibleProject(projectId, identity);
  if (!project) {
    // A missing project and one the caller cannot reach collapse to the same
    // 404, so a non-member gets no confirmation that the project exists.
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  // Scoped to the project the guard resolved, never the raw body value. Same
  // rule the task re-checks — the change can move between here and the run.
  const pushable = await loadPushableChange(project.id, changeId);
  if (!pushable.ok) {
    if (pushable.reason === "not-found") {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }
    // 409, not 400: the request is well-formed, it is the change's state that
    // conflicts with it. The message names **which** of the two states it is,
    // because "Conflict" is not something a person can act on.
    return NextResponse.json(
      {
        error:
          pushable.reason === "not-applied" ? NOT_APPLIED : ALREADY_PUSHED,
      },
      { status: 409 },
    );
  }

  const handle = await tasks.trigger<typeof canvasSync>("canvas-sync", {
    projectId: project.id,
    changeId,
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
  // what the client needs to subscribe with `useRealtimeRun` — so it is handed
  // straight back rather than minting a second token. The sibling `token` route
  // stays for re-issuing one later.
  return NextResponse.json(
    { runId: handle.id, publicToken: handle.publicAccessToken },
    { status: 201 },
  );
};
