import { Liveblocks } from "@liveblocks/node";

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

export function getLiveblocks(): Liveblocks {
  const client = globalForLiveblocks.liveblocks ?? createLiveblocksClient();

  if (process.env.NODE_ENV !== "production") {
    globalForLiveblocks.liveblocks = client;
  }

  return client;
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
