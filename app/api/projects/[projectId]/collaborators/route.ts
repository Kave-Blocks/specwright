import { NextResponse } from "next/server";

import { withProjectMember, withProjectOwner } from "@/lib/api-auth";
import { listProjectMembers, normalizeEmail } from "@/lib/collaborators";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/projects-api";

/** Detect Prisma's unique-constraint violation (email already a collaborator). */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * List a project's collaborators. Readable by the owner and by any
 * collaborator, so membership (not ownership) is enforced here.
 */
export const GET = withProjectMember<{ projectId: string }>(
  async (_request, { project }) => {
    const members = await listProjectMembers(project);
    return NextResponse.json({ members });
  },
);

/** Invite a collaborator by email. Only the project owner may invite. */
export const POST = withProjectOwner<{ projectId: string }>(
  async (request, { params: { projectId }, userId }) => {
    const body = await readJsonBody(request);
    const email = normalizeEmail(body.email);
    if (!email) {
      return NextResponse.json(
        { error: "A valid email is required" },
        { status: 400 },
      );
    }

    try {
      await prisma.projectCollaborator.create({ data: { projectId, email } });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return NextResponse.json(
          { error: "That person is already a collaborator" },
          { status: 409 },
        );
      }
      throw error;
    }

    const members = await listProjectMembers({ id: projectId, ownerId: userId });
    return NextResponse.json({ members }, { status: 201 });
  },
);
