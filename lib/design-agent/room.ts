import { logger } from "@trigger.dev/sdk";

import { getLiveblocks } from "@/lib/liveblocks";
import { AI_STATUS_FEED_ID, type AiStatusPhase } from "@/types/tasks";

/**
 * The AI's identity and voice inside a Liveblocks room: its presence (cursor and
 * thinking state) and its status messages on the shared `ai-status-feed`.
 *
 * Extracted from `trigger/design-agent.ts` when unit `43` added a second task
 * that mutates the shared canvas. Both broadcast for the same reason
 * `context/architecture-context.md` gives — **a canvas change happens to
 * everybody**, unlike a spec or a proposal, which are produced for the person
 * who asked — so both must appear as the same participant, with the same name,
 * colour, and TTL behaviour. Two copies of that identity is how one task comes
 * to show a different avatar from the other.
 *
 * This module is for background tasks only: it imports Trigger's `logger` so a
 * swallowed failure still lands in the run trace. Nothing under `app/` imports
 * it, and nothing should.
 */

/** The AI participant's stable identity in the room (not a real Clerk user). */
const AI_USER_ID = "ghost-ai";
const AI_NAME = "Specwright";
/** The AI accent (`--accent-ai` from `ui-context.md`) tints the AI cursor/avatar. */
const AI_COLOR = "#6457f9";

/** Where the AI cursor hovers while it works, in canvas coordinates. */
export const AI_CURSOR = { x: 100, y: 20 } as const;
/** Presence TTL while a task runs (seconds); refreshed before the model call. */
export const PRESENCE_TTL = 180;
/** Short TTL used when clearing presence, so the AI disappears promptly. */
const CLEAR_TTL = 3;

type Liveblocks = ReturnType<typeof getLiveblocks>;

/**
 * Publish an AI status message to the shared `ai-status-feed` every participant
 * sees. Best-effort: status is progress UI, not the job, so a feed hiccup is
 * logged and swallowed rather than failing (or retrying) the whole run.
 *
 * `label` names the calling task in the log line, so a swallowed failure is
 * still attributable once two tasks publish to the same feed.
 */
export async function announceAiStatus(
  liveblocks: Liveblocks,
  roomId: string,
  phase: AiStatusPhase,
  text: string,
  label: string,
): Promise<void> {
  try {
    await liveblocks.createFeedMessage({
      roomId,
      feedId: AI_STATUS_FEED_ID,
      data: { phase, text },
    });
  } catch (error) {
    logger.warn(`${label} failed to publish status`, {
      roomId,
      phase,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Set the AI's ephemeral presence (cursor + thinking) in the room. */
export async function setAiPresence(
  liveblocks: Liveblocks,
  roomId: string,
  data: { cursor: { x: number; y: number } | null; thinking: boolean },
  ttl: number,
): Promise<void> {
  await liveblocks.setPresence(roomId, {
    userId: AI_USER_ID,
    // `selection` completes the room's `Presence` shape (see liveblocks.config.ts).
    // The AI never selects anything — it writes the graph — so it is always
    // null, but sending it keeps every participant's presence the same shape.
    data: { ...data, selection: null },
    userInfo: { name: AI_NAME, avatar: "", color: AI_COLOR },
    ttl,
  });
}

/** Best-effort presence clear — never throws, so it is safe in `finally`. */
export async function clearAiPresence(
  liveblocks: Liveblocks,
  roomId: string,
  label: string,
): Promise<void> {
  try {
    await setAiPresence(
      liveblocks,
      roomId,
      { cursor: null, thinking: false },
      CLEAR_TTL,
    );
  } catch (error) {
    logger.warn(`${label} failed to clear AI presence`, {
      roomId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
