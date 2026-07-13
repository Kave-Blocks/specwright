import { Liveblocks, LiveblocksError } from "@liveblocks/node";

import { AI_CHAT_FEED_ID, AI_STATUS_FEED_ID } from "@/types/tasks";

/**
 * Cached Liveblocks node client. Mirrors the `lib/prisma.ts` singleton pattern:
 * one client is reused across requests (and survives dev hot-reloads via a
 * global cache) instead of constructing a new one per auth call. The client is
 * created lazily so importing this module never throws when the secret key is
 * absent at build time — only calling `getLiveblocks()` requires it.
 */
function createLiveblocksClient(): Liveblocks {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;

  if (!secret) {
    throw new Error("LIVEBLOCKS_SECRET_KEY is not set");
  }

  return new Liveblocks({ secret });
}

const globalForLiveblocks = globalThis as unknown as {
  liveblocks: Liveblocks | undefined;
};

let cachedClient: Liveblocks | undefined;

export function getLiveblocks(): Liveblocks {
  // In dev, cache on `globalThis` so the client survives hot-reloads. In
  // production, cache in a module-level variable that persists across warm
  // invocations — otherwise a new client would be created on every call.
  if (process.env.NODE_ENV !== "production") {
    globalForLiveblocks.liveblocks ??= createLiveblocksClient();
    return globalForLiveblocks.liveblocks;
  }

  cachedClient ??= createLiveblocksClient();
  return cachedClient;
}

/** The HTTP status a Liveblocks API error carries, or `null` if not one. */
function liveblocksStatus(error: unknown): number | null {
  return error instanceof LiveblocksError ? error.status : null;
}

/**
 * Ensure a feed exists in a room (create-or-reuse), so clients subscribing with
 * `useFeedMessages` and the producers publishing into it both target the same
 * feed. Idempotent: a room may not have the feed yet, and concurrent callers may
 * race to create it — either way it settles to "exists".
 *
 * Only the two statuses that mean "already settled" are suppressed: `404` on
 * lookup (feed absent, so create it) and `409` on create (a concurrent caller
 * won the race). Everything else — auth, rate limits, network, 5xx — is a real
 * failure and propagates, so it is never mistaken for a missing feed and the
 * root cause is not hidden. Feeds are cosmetic (AI status + chat), so callers
 * are still expected to catch and log rather than break the room.
 */
async function ensureFeed(
  client: Liveblocks,
  roomId: string,
  feedId: string,
): Promise<void> {
  try {
    await client.getFeed({ roomId, feedId });
    return;
  } catch (error) {
    // Anything other than "not found" would fail the create call the same way;
    // rethrow it instead of masking the cause behind a doomed create attempt.
    if (liveblocksStatus(error) !== 404) {
      throw error;
    }
  }

  try {
    await client.createFeed({ roomId, feedId });
  } catch (error) {
    if (liveblocksStatus(error) !== 409) {
      throw error;
    }
    // 409: a concurrent request created it first, which is the state we wanted.
  }
}

/** Ensure the shared AI status feed exists in a room. See {@link ensureFeed}. */
export async function ensureAiStatusFeed(
  client: Liveblocks,
  roomId: string,
): Promise<void> {
  await ensureFeed(client, roomId, AI_STATUS_FEED_ID);
}

/**
 * Ensure the shared room chat feed exists. Separate from the status feed on
 * purpose: chat messages and AI progress never share a feed.
 */
export async function ensureAiChatFeed(
  client: Liveblocks,
  roomId: string,
): Promise<void> {
  await ensureFeed(client, roomId, AI_CHAT_FEED_ID);
}

/**
 * A fixed palette of cursor colors. Kept intentionally small and hand-picked so
 * every color reads clearly against the dark canvas and is visually distinct
 * from its neighbours.
 */
const CURSOR_COLORS = [
  "#22d3ee", // cyan (brand)
  "#f472b6", // pink
  "#a78bfa", // violet
  "#34d399", // emerald
  "#fbbf24", // amber
  "#60a5fa", // blue
  "#fb7185", // rose
  "#4ade80", // green
  "#f97316", // orange
  "#c084fc", // purple
] as const;

/**
 * Deterministically map a user id to a consistent cursor color from
 * {@link CURSOR_COLORS}. The same id always yields the same color (across
 * sessions and clients) via a stable string hash, so a user's cursor keeps its
 * color everywhere it appears.
 */
export function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % CURSOR_COLORS.length;
  return CURSOR_COLORS[index];
}
