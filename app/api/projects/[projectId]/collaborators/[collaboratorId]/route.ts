import { NextResponse } from "next/server";

import { withProjectOwner } from "@/lib/api-auth";
import { listProjectMembers } from "@/lib/collaborators";
import { prisma } from "@/lib/prisma";

/** Remove a collaborator from a project. Only the project owner may remove. */
export const DELETE = withProjectOwner<{
  projectId: string;
  collaboratorId: string;
}>(async (_request, { params: { projectId, collaboratorId }, userId }) => {
  // Scope the delete to this project so a collaborator id from another project
  // cannot be removed through it.
  const { count } = await prisma.projectCollaborator.deleteMany({
    where: { id: collaboratorId, projectId },
  });
  if (count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const members = await listProjectMembers({ id: projectId, ownerId: userId });
  return NextResponse.json({ members });
});
