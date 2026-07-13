import { AbortTaskRunError, logger, task } from "@trigger.dev/sdk";
import { mutateFlow } from "@liveblocks/react-flow/node";

import { applyDesignPlan, type AppliedSummary } from "@/lib/design-agent/apply";
import { generateDesignPlan } from "@/lib/design-agent/plan";
import { ensureAiStatusFeed, getLiveblocks } from "@/lib/liveblocks";
import type { CanvasEdge, CanvasNode, CanvasSnapshot } from "@/types/canvas";
import { AI_STATUS_FEED_ID, type AiStatusPhase } from "@/types/tasks";

/** Payload the design route hands to the background task. */
export interface DesignAgentPayload {
  prompt: string;
  roomId: string;
}

/** The AI participant's stable identity in the room (not a real Clerk user). */
const AI_USER_ID = "ghost-ai";
const AI_NAME = "Ghost AI";
/** The AI accent (`--accent-ai` from `ui-context.md`) tints the AI cursor/avatar. */
const AI_COLOR = "#6457f9";
/** Where the AI cursor hovers while it works, in canvas coordinates. */
const AI_CURSOR = { x: 100, y: 20 } as const;
/** Presence TTL while the task runs (seconds); refreshed before the slow model call. */
const PRESENCE_TTL = 180;
/** Short TTL used when clearing presence, so the AI disappears promptly on finish. */
const CLEAR_TTL = 3;

type Liveblocks = ReturnType<typeof getLiveblocks>;

/**
 * Publish an AI status message to the shared `ai-status-feed` feed every
 * participant sees. Best-effort: status is non-critical, so a feed hiccup is
 * logged and swallowed rather than failing (or retrying) the whole generation.
 */
async function announce(
  liveblocks: Liveblocks,
  roomId: string,
  phase: AiStatusPhase,
  text: string,
): Promise<void> {
  try {
    await liveblocks.createFeedMessage({
      roomId,
      feedId: AI_STATUS_FEED_ID,
      data: { phase, text },
    });
  } catch (error) {
    logger.warn("design-agent failed to publish status", {
      roomId,
      phase,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Set the AI's ephemeral presence (cursor + thinking) in the room. */
async function setAiPresence(
  liveblocks: Liveblocks,
  roomId: string,
  data: { cursor: { x: number; y: number } | null; thinking: boolean },
  ttl: number,
): Promise<void> {
  await liveblocks.setPresence(roomId, {
    userId: AI_USER_ID,
    // `selection` completes the room's `Presence` shape (see liveblocks.config.ts).
    // The AI never selects anything — it writes the whole graph — so it is always
    // null, but sending it keeps every participant's presence the same shape.
    data: { ...data, selection: null },
    userInfo: { name: AI_NAME, avatar: "", color: AI_COLOR },
    ttl,
  });
}

/** Best-effort presence clear — never throws, so it is safe in `finally`. */
async function clearAiPresence(
  liveblocks: Liveblocks,
  roomId: string,
): Promise<void> {
  try {
    await setAiPresence(
      liveblocks,
      roomId,
      { cursor: null, thinking: false },
      CLEAR_TTL,
    );
  } catch (error) {
    logger.warn("design-agent failed to clear AI presence", {
      roomId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Turn an applied-plan tally into a human status line. */
function describeResult(summary: AppliedSummary): string {
  const parts: string[] = [];
  if (summary.nodesAdded > 0) {
    parts.push(`${summary.nodesAdded} node${summary.nodesAdded === 1 ? "" : "s"}`);
  }
  if (summary.edgesAdded > 0) {
    parts.push(
      `${summary.edgesAdded} connection${summary.edgesAdded === 1 ? "" : "s"}`,
    );
  }
  const edits = summary.nodesUpdated + summary.nodesRemoved + summary.edgesRemoved;
  if (parts.length === 0) {
    return edits > 0
      ? "Ghost AI refined the canvas."
      : "Ghost AI didn't find any changes to make.";
  }
  return `Ghost AI added ${parts.join(" and ")}.`;
}

/**
 * Durable design-generation task. A user prompt becomes real-time updates on the
 * collaborative canvas:
 *
 * 1. Announce a "start" status and show AI presence (cursor + thinking).
 * 2. Read the current canvas state from the shared Liveblocks room.
 * 3. Interpret the prompt with OpenAI into a structured plan of canvas operations.
 * 4. Apply the plan through the server-side collaborative flow utility
 *    (`mutateFlow`), the exact Storage the client's `useLiveblocksFlow` reads —
 *    so every participant sees nodes/edges appear live.
 * 5. Announce "complete" (or "error"), and clear AI presence when finished.
 */
export const designAgent = task({
  id: "design-agent",
  run: async (payload: DesignAgentPayload) => {
    const { prompt, roomId } = payload;
    const liveblocks = getLiveblocks();

    try {
      logger.info("design-agent started", { roomId });

      // Make sure the shared status feed exists before publishing into it. The
      // feed is progress UI, not the job: if Liveblocks is unreachable we log it
      // and design the canvas anyway rather than failing (and retrying) the run.
      // `announce` below degrades the same way.
      try {
        await ensureAiStatusFeed(liveblocks, roomId);
      } catch (error) {
        logger.warn("design-agent failed to ensure status feed", {
          roomId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      await setAiPresence(
        liveblocks,
        roomId,
        { cursor: AI_CURSOR, thinking: true },
        PRESENCE_TTL,
      );
      await announce(liveblocks, roomId, "start", "Ghost AI is reading your prompt…");

      // Read the current canvas so the model can extend an existing diagram
      // rather than only starting fresh. A read-only mutateFlow flushes nothing.
      let current: CanvasSnapshot = { nodes: [], edges: [] };
      await mutateFlow<CanvasNode, CanvasEdge>(
        { client: liveblocks, roomId },
        (flow) => {
          current = { nodes: [...flow.nodes], edges: [...flow.edges] };
        },
      );

      await announce(
        liveblocks,
        roomId,
        "processing",
        "Ghost AI is designing your architecture…",
      );
      // Refresh presence so the "thinking" state survives the slow model call.
      await setAiPresence(
        liveblocks,
        roomId,
        { cursor: AI_CURSOR, thinking: true },
        PRESENCE_TTL,
      );

      if (!process.env.OPENAI_API_KEY) {
        // A configuration error, not a transient one — do not retry.
        throw new AbortTaskRunError("OPENAI_API_KEY is not set");
      }

      const plan = await generateDesignPlan({ prompt, current });
      logger.info("design-agent plan generated", {
        roomId,
        operations: plan.operations.length,
      });

      // Apply the plan into the shared room. Each operation writes to the same
      // "flow" Storage the client renders from, so updates stream in live.
      let summary: AppliedSummary | null = null;
      await mutateFlow<CanvasNode, CanvasEdge>(
        { client: liveblocks, roomId },
        (flow) => {
          summary = applyDesignPlan(flow, plan);
        },
      );

      const applied: AppliedSummary = summary ?? {
        nodesAdded: 0,
        nodesUpdated: 0,
        nodesRemoved: 0,
        edgesAdded: 0,
        edgesRemoved: 0,
        skipped: 0,
      };

      logger.info("design-agent applied plan", { roomId, ...applied });
      await announce(liveblocks, roomId, "complete", describeResult(applied));

      return {
        status: "complete" as const,
        roomId,
        summary: applied,
        planSummary: plan.summary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("design-agent failed", { roomId, error: message });

      // Surface the failure in the shared status feed (best-effort — `announce`
      // never throws, so it can't mask the original error), then rethrow so
      // Trigger can retry transient failures.
      await announce(
        liveblocks,
        roomId,
        "error",
        "Ghost AI hit an error and couldn't finish. Please try again.",
      );

      throw error;
    } finally {
      // Always clear AI presence when the task finishes (success or failure).
      await clearAiPresence(liveblocks, roomId);
    }
  },
});
