import { tasks } from "@trigger.dev/sdk";
import { NextResponse } from "next/server";

import { changeRequestSchema } from "@/lib/change-agent/payload";
import { getAccessibleProject, getClerkIdentity } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/projects-api";
import type { proposeChange } from "@/trigger/propose-change";

/**
 * Kick off a change proposal as a durable background task. The handler stays
 * thin, exactly as `POST /api/ai/spec` does: it authenticates the caller,
 * validates input, proves project access, refuses the one case that cannot
 * produce a proposal, triggers the task, and records the run so its token can
 * later be verified. Reasoning about the change and writing the `ProjectChange`
 * row happen in `trigger/propose-change.ts`, never here (invariant 1).
 *
 * Access is resolved from the authenticated user + `roomId` alone. The room id
 * *is* the project id, so a client-supplied `projectId` would be an unverified
 * claim; the id the task and the `TaskRun` record receive is the one the access
 * check returned. A project member (owner or collaborator) may propose — a
 * change is project *content*, the same category as the canvas and the brief.
 *
 * Nothing else travels in the body either: not the spec, not the brief, not the
 * canvas, not the unit list. The task reads all four server-side from the
 * project this check resolved (`lib/change-agent/propose.ts`).
 *
 * A missing project and one the caller cannot access collapse to the same 404,
 * so a signed-out caller gets 401 and a non-member gets no confirmation that
 * the project exists.
 */

/** Refusal shown to a member whose project has never had a spec generated. */
const NO_SPEC_MESSAGE =
  "This project has no specification yet. Generate a spec first — a change is a delta against one.";

export const POST = async (request: Request): Promise<NextResponse> => {
  const identity = await getClerkIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  const parsed = changeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "roomId and request are required" },
      { status: 400 },
    );
  }
  // `request` arrives trimmed and truncated by the schema — over-length text is
  // bounded, never rejected (`MAX_CHANGE_REQUEST_LENGTH`).
  const { roomId, request: changeRequest } = parsed.data;

  const project = await getAccessibleProject(roomId, identity);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  /*
   * Refuse **before** a run is started, and therefore before a model call is
   * spent: a change is a delta and a project with no spec has nothing to be a
   * delta against. 409 rather than 400 — the request itself is well-formed, it
   * is the project's state that conflicts with it — and the message names the
   * action that resolves it, because "Conflict" is not something a person can
   * act on.
   *
   * Only *existence* is checked here. Which spec the proposal is reasoned
   * against is the task's to decide: `loadChangeContext` takes the
   * highest-`version` spec and records its id as the change's `baseSpecId`.
   * Resolving it here as well would open a window in which the route picked one
   * spec and the task, running later, reasoned against a newer one — so the
   * decision is made in exactly one place, at the moment it is used. That check
   * also still holds if the last spec were deleted in between.
   */
  const spec = await prisma.projectSpec.findFirst({
    // The project the access check resolved, never the raw `roomId`.
    where: { projectId: project.id },
    select: { id: true },
  });

  if (!spec) {
    return NextResponse.json({ error: NO_SPEC_MESSAGE }, { status: 409 });
  }

  const handle = await tasks.trigger<typeof proposeChange>("propose-change", {
    projectId: project.id,
    roomId,
    request: changeRequest,
    // The author is the authenticated caller, not a body field — it is recorded
    // on the change and must not be spoofable.
    authorId: identity.userId,
  });

  /*
   * The same `TaskRun` record the spec path writes, and deliberately the same
   * one: it carries a run id, a project id, and a user id and says nothing
   * about which task produced the run. `POST /api/ai/spec/token` verifies a
   * caller against exactly those fields, so it already mints a run-scoped
   * realtime token for this run without a line of change — no second token
   * route, and nothing here that would make the existing one spec-specific.
   */
  await prisma.taskRun.create({
    data: {
      runId: handle.id,
      projectId: project.id,
      userId: identity.userId,
    },
  });

  return NextResponse.json({ runId: handle.id }, { status: 201 });
};
