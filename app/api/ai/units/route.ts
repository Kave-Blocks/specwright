import { tasks } from "@trigger.dev/sdk";
import { NextResponse } from "next/server";

import { getAccessibleProject, getClerkIdentity } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/projects-api";
import { deriveUnitsRequestSchema } from "@/lib/unit-agent/payload";
import type { deriveUnits } from "@/trigger/derive-units";

/**
 * Kick off a build-unit derivation as a durable background task — unit `44`.
 *
 * The handler stays thin, exactly as `POST /api/ai/change` does: authenticate
 * the caller, validate input, prove project access, refuse the one case that
 * cannot produce units, trigger the task, and record the run so its token can
 * later be verified. Reading the spec, calling the model, and writing the units
 * happen in `trigger/derive-units.ts`, never here (invariant 1).
 *
 * Access is resolved from the authenticated user + `roomId` alone. The room id
 * *is* the project id, so a client-supplied `projectId` would be an unverified
 * claim; the id the task and the `TaskRun` record receive is the one the access
 * check returned. **`specId` is resolved here too**, from that same checked
 * project — it is never accepted from the body, because a route that
 * access-checks one id and acts on another is the bug
 * (`architecture-context.md`, after the 2026-08-17 room-scoping fix).
 *
 * A project member (owner or collaborator) may derive: build units are project
 * *content*, the same category as the canvas, the brief, and changes — the
 * reasoning `architecture-context.md` gives for both build-unit routes using
 * `withProjectMember`.
 *
 * A missing project and one the caller cannot access collapse to the same 404,
 * so a signed-out caller gets 401 and a non-member gets no confirmation that
 * the project exists.
 */

/** Refusal shown to a member whose project has never had a spec generated. */
const NO_SPEC_MESSAGE =
  "This project has no specification yet. Generate a spec first — build units are derived from one.";

export const POST = async (request: Request): Promise<NextResponse> => {
  const identity = await getClerkIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  const parsed = deriveUnitsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "roomId is required" }, { status: 400 });
  }
  const { roomId } = parsed.data;

  const project = await getAccessibleProject(roomId, identity);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  /*
   * The one refusal answered before a run is started, so a request that cannot
   * succeed never spends a model call — `40`'s discipline, and the same 409
   * `POST /api/ai/change` answers with. The task re-checks it, because the last
   * spec can be removed in between.
   *
   * Newest by `version`, not `createdAt`: the version is assigned from a counter
   * and is the number people refer to a spec by, so it is the ordering that
   * cannot disagree with what the UI shows.
   */
  const currentSpec = await prisma.projectSpec.findFirst({
    where: { projectId: project.id },
    orderBy: { version: "desc" },
    select: { id: true },
  });

  if (!currentSpec) {
    return NextResponse.json({ error: NO_SPEC_MESSAGE }, { status: 409 });
  }

  const handle = await tasks.trigger<typeof deriveUnits>("derive-units", {
    projectId: project.id,
    specId: currentSpec.id,
  });

  await prisma.taskRun.create({
    data: {
      runId: handle.id,
      projectId: project.id,
      userId: identity.userId,
    },
  });

  return NextResponse.json({ runId: handle.id });
};
