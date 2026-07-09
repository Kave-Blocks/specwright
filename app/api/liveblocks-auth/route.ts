import { currentUser } from "@clerk/nextjs/server";
import type { User } from "@clerk/backend";
import { NextResponse } from "next/server";

import { getLiveblocks, getUserColor } from "@/lib/liveblocks";
import { getAccessibleProject } from "@/lib/project-access";
import { readJsonBody } from "@/lib/projects-api";

/**
 * Liveblocks authentication endpoint.
 *
 * The client posts the room it wants to enter; the room id is the project id,
 * so entering a room is exactly entering a project. Before minting a session we
 * require a signed-in Clerk user and verify — via the existing access helper —
 * that they own the project or collaborate on it. Unauthorized access returns
 * `403`. On success we ensure the room exists and hand back a session token
 * carrying the user's display name, avatar, and a deterministic cursor color.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  const roomId = typeof body.room === "string" ? body.room : null;
  if (!roomId) {
    return NextResponse.json({ error: "Missing room" }, { status: 400 });
  }

  // The room id is the project id — verify project access with the same helper
  // the workspace shell uses. A missing project and no-access collapse to the
  // same `null`, so both are answered with 403.
  const email = primaryEmail(user);
  const project = await getAccessibleProject(roomId, {
    userId: user.id,
    email,
  });
  if (!project) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const liveblocks = getLiveblocks();
  await ensureRoom(liveblocks, roomId);

  const session = liveblocks.prepareSession(user.id, {
    userInfo: {
      name: displayName(user, email),
      avatar: user.hasImage ? user.imageUrl : "",
      color: getUserColor(user.id),
    },
  });
  session.allow(roomId, session.FULL_ACCESS);

  const { status, body: sessionBody } = await session.authorize();
  return new Response(sessionBody, { status });
}

/** Create the room only if it does not already exist. */
async function ensureRoom(
  liveblocks: ReturnType<typeof getLiveblocks>,
  roomId: string,
): Promise<void> {
  try {
    await liveblocks.getRoom(roomId);
  } catch {
    try {
      await liveblocks.createRoom(roomId, { defaultAccesses: [] });
    } catch {
      // A concurrent request may have created it first; that's fine.
    }
  }
}

/** Resolve the user's primary email, falling back to the first address. */
function primaryEmail(user: User): string | null {
  return (
    user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    )?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    null
  );
}

/** Build a display name: full name → username → email → "Anonymous". */
function displayName(user: User, email: string | null): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return full || user.username || email || "Anonymous";
}
