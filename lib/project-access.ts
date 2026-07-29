import { auth, currentUser } from "@clerk/nextjs/server";
import { cache } from "react";

import { prisma } from "@/lib/prisma";

export interface ClerkIdentity {
  userId: string;
  email: string | null;
}

/** Minimal project shape the workspace shell needs after an access check. */
export interface AccessibleProject {
  id: string;
  name: string;
  ownerId: string;
  /** Blob path for the saved canvas snapshot, or `null` if never saved. */
  canvasJsonPath: string | null;
  /**
   * Latest Discovery-composed brief, or `null` if Discovery has never been
   * run. Stored inline (not in Blob) — the text is bounded, so it lives in
   * Postgres the same way `description` does.
   */
  architectureBrief: string | null;
}

/**
 * Resolve the current Clerk identity: the user id plus the primary email
 * address (falling back to the first address). Returns `null` when the request
 * is unauthenticated so callers can redirect rather than trust a partial
 * identity.
 *
 * Wrapped in React's `cache()` so every call within one request (the room
 * layout's access check, plus each route's own data fetch) shares a single
 * Clerk lookup instead of re-querying per caller.
 */
export const getClerkIdentity = cache(
  async (): Promise<ClerkIdentity | null> => {
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
  },
);

/**
 * Fetch a project the identity may open — as its owner, or as a collaborator
 * matched by email. Returns `null` when the project does not exist or the
 * identity has no access, so both cases collapse to the same "access denied"
 * result and a non-member cannot distinguish them. Only the fields the
 * workspace shell (and the routes nested under it) render are selected.
 *
 * Wrapped in React's `cache()`, keyed on `(projectId, identity)` — a cache hit
 * requires the same `identity` object, which is why callers should get it from
 * the also-cached {@link getClerkIdentity} rather than building their own.
 */
export const getAccessibleProject = cache(
  async (
    projectId: string,
    identity: ClerkIdentity,
  ): Promise<AccessibleProject | null> => {
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
      select: {
        id: true,
        name: true,
        ownerId: true,
        canvasJsonPath: true,
        architectureBrief: true,
      },
    });
  },
);
