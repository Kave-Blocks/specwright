import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  getAccessibleProject,
  getClerkIdentity,
  type AccessibleProject,
  type ClerkIdentity,
} from "@/lib/project-access";
import {
  ownershipErrorResponse,
  verifyProjectOwnership,
} from "@/lib/projects-api";

/**
 * Auth guards for API route handlers.
 *
 * Since `proxy.ts` deliberately excludes `/api/(.*)` from `auth.protect()` (so
 * handlers can answer with JSON 401/403 instead of a browser redirect), the
 * middleware is no longer a backstop. These wrappers make the guard the only
 * way to reach a handler body: a route cannot touch data without first passing
 * through `withAuth` / `withProjectOwner` / `withProjectMember`. A forgotten
 * check becomes a compile-time shape mismatch, not a silently public endpoint.
 */

/** Route context as Next.js passes it to a handler — params resolve async. */
interface RouteContext<P> {
  params: Promise<P>;
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Require an authenticated user. The wrapped handler receives the resolved
 * `userId`. Use for collection routes that scope everything to the caller.
 */
export function withAuth(
  handler: (
    request: Request,
    context: { userId: string },
  ) => Promise<NextResponse>,
) {
  return async (request: Request): Promise<NextResponse> => {
    const { userId } = await auth();
    if (!userId) {
      return unauthorized();
    }
    return handler(request, { userId });
  };
}

/**
 * Require an authenticated user who owns `params.projectId`. Mirrors the
 * 403-vs-404 masking of {@link verifyProjectOwnership}. The wrapped handler
 * receives the resolved params and `userId`, and only runs once ownership is
 * proven.
 */
export function withProjectOwner<P extends { projectId: string }>(
  handler: (
    request: Request,
    context: { params: P; userId: string },
  ) => Promise<NextResponse>,
) {
  return async (
    request: Request,
    ctx: RouteContext<P>,
  ): Promise<NextResponse> => {
    const { userId } = await auth();
    if (!userId) {
      return unauthorized();
    }

    const params = await ctx.params;
    const ownership = await verifyProjectOwnership(params.projectId, userId);
    if (!ownership.authorized) {
      return ownershipErrorResponse(ownership.status);
    }

    return handler(request, { params, userId });
  };
}

/**
 * Require an authenticated user with access to `params.projectId` as owner or
 * collaborator. Missing project and no-access collapse to the same 404 so a
 * non-member cannot probe existence. The wrapped handler receives the resolved
 * params, the caller's identity, and the accessible project.
 */
export function withProjectMember<P extends { projectId: string }>(
  handler: (
    request: Request,
    context: {
      params: P;
      identity: ClerkIdentity;
      project: AccessibleProject;
    },
  ) => Promise<NextResponse>,
) {
  return async (
    request: Request,
    ctx: RouteContext<P>,
  ): Promise<NextResponse> => {
    const identity = await getClerkIdentity();
    if (!identity) {
      return unauthorized();
    }

    const params = await ctx.params;
    const project = await getAccessibleProject(params.projectId, identity);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return handler(request, { params, identity, project });
  };
}
