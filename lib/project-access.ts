import { auth, currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";

export interface ClerkIdentity {
  userId: string;
  email: string | null;
}

/** Minimal project shape the workspace shell needs after an access check. */
export interface AccessibleProject {
  id: string;
  name: string;
}

/**
 * Resolve the current Clerk identity: the user id plus the primary email
 * address (falling back to the first address). Returns `null` when the request
 * is unauthenticated so callers can redirect rather than trust a partial
 * identity.
 */
export async function getClerkIdentity(): Promise<ClerkIdentity | null> {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const user = await currentUser();
  const email =
    user?.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    )?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null;

  return { userId, email };
}

/**
 * Fetch a project the identity may open — as its owner, or as a collaborator
 * matched by email. Returns `null` when the project does not exist or the
 * identity has no access, so both cases collapse to the same "access denied"
 * result and a non-member cannot distinguish them. Only the fields the
 * workspace shell renders are selected.
 */
export async function getAccessibleProject(
  projectId: string,
  identity: ClerkIdentity,
): Promise<AccessibleProject | null> {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { ownerId: identity.userId },
        ...(identity.email
          ? [{ collaborators: { some: { email: identity.email } } }]
          : []),
      ],
    },
    select: { id: true, name: true },
  });
}
