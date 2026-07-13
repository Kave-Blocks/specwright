import { currentUser } from "@clerk/nextjs/server";
import type { User } from "@clerk/backend";
import { NextResponse } from "next/server";

import {
  ensureAiChatFeed,
  ensureAiStatusFeed,
  getLiveblocks,
  getUserColor,
} from "@/lib/liveblocks";
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

  // Ensure the room's shared feeds exist so subscribing to them (via
  // `useFeedMessages`) succeeds before anything has been published: the AI
  // status feed before the first generation, the chat feed before the first
  // message. Best-effort: a feed hiccup must never block the user from entering
  // the room — but it is logged, because a persistent failure here (bad key,
  // rate limit, Liveblocks outage) silently costs the user their status feed.
  try {
    await Promise.all([
      ensureAiStatusFeed(liveblocks, roomId),
      ensureAiChatFeed(liveblocks, roomId),
    ]);
  } catch (error) {
    console.error("Failed to ensure Liveblocks feeds", { roomId, error });
  }

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

/**
 * Create the room only if it does not already exist.
 *
 * `getOrCreateRoom` is a single idempotent API call (`POST /v2/rooms?idempotent`)
 * that returns the room whether or not it existed, so there is no get-then-create
 * race to lose and no error to suppress. A genuine failure — auth, rate limit,
 * 5xx — propagates and fails the request. Unlike the cosmetic feeds, the room is
 * load-bearing: minting a session token for a room we could not confirm exists
 * only moves the failure into the client, with no server-side trace of why.
 */
async function ensureRoom(
  liveblocks: ReturnType<typeof getLiveblocks>,
  roomId: string,
): Promise<void> {
  await liveblocks.getOrCreateRoom(roomId, { defaultAccesses: [] });
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
