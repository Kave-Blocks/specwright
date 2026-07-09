import { auth, currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import type { Project, ProjectRole } from "@/lib/projects";

export interface EditorHomeProjects {
  ownedProjects: Project[];
  sharedProjects: Project[];
}

/**
 * Fetch the authenticated user's owned and shared projects for the editor
 * home. Owned projects match `ownerId`; shared projects are those where a
 * collaborator record matches the user's Clerk email address. Both lists are
 * ordered newest first. Returns empty lists when unauthenticated.
 */
export async function getEditorHomeProjects(): Promise<EditorHomeProjects> {
  const { userId } = await auth();
  if (!userId) {
    return { ownedProjects: [], sharedProjects: [] };
  }

  const user = await currentUser();
  const email =
    user?.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    )?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null;

  const [owned, shared] = await Promise.all([
    prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "desc" },
    }),
    email
      ? prisma.project.findMany({
          where: { collaborators: { some: { email } } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  return {
    ownedProjects: owned.map((project) => toUiProject(project, "owner")),
    sharedProjects: shared.map((project) =>
      toUiProject(project, "collaborator"),
    ),
  };
}

/**
 * Map a persisted project onto the UI shape used by the sidebar. The project
 * id doubles as the Liveblocks room id (slug + suffix), so it is surfaced as
 * the slug.
 */
function toUiProject(
  project: { id: string; name: string },
  role: ProjectRole,
): Project {
  return {
    id: project.id,
    name: project.name,
    slug: project.id,
    role,
  };
}
