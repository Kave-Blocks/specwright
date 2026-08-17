import { AbortTaskRunError, logger, task } from "@trigger.dev/sdk";
import { mutateFlow } from "@liveblocks/react-flow/node";

import {
  QUOTA_EXHAUSTED_MESSAGE,
  isQuotaExhaustedError,
} from "@/lib/ai-errors";
import { applyDesignPlan, type AppliedSummary } from "@/lib/design-agent/apply";
import { generateDesignPlan } from "@/lib/design-agent/plan";
import {
  AI_CURSOR,
  PRESENCE_TTL,
  announceAiStatus,
  clearAiPresence,
  setAiPresence,
} from "@/lib/design-agent/room";
import { ensureAiStatusFeed, getLiveblocks } from "@/lib/liveblocks";
import type { CanvasEdge, CanvasNode, CanvasSnapshot } from "@/types/canvas";
import type { AiStatusPhase } from "@/types/tasks";

/** Payload the design route hands to the background task. */
export interface DesignAgentPayload {
  prompt: string;
  roomId: string;
}

/** Names this task in the shared room helpers' log lines. */
const LABEL = "design-agent";

type Liveblocks = ReturnType<typeof getLiveblocks>;

/**
 * Publish to the shared `ai-status-feed`. A thin binding of this task's label
 * onto {@link announceAiStatus}, which every canvas-mutating task shares — unit
 * `43` added the second one, so the AI's identity and voice moved to
 * `lib/design-agent/room.ts` rather than being written twice.
 */
async function announce(
  liveblocks: Liveblocks,
  roomId: string,
  phase: AiStatusPhase,
  text: string,
): Promise<void> {
  await announceAiStatus(liveblocks, roomId, phase, text, LABEL);
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
      ? "Specwright refined the canvas."
      : "Specwright didn't find any changes to make.";
  }
  return `Specwright added ${parts.join(" and ")}.`;
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
      await announce(liveblocks, roomId, "start", "Specwright is reading your prompt…");

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
        "Specwright is designing your architecture…",
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
      const quotaExhausted = isQuotaExhaustedError(error);
      logger.error("design-agent failed", {
        roomId,
        error: message,
        quotaExhausted,
      });

      // Surface the failure in the shared status feed (best-effort — `announce`
      // never throws, so it can't mask the original error), then rethrow so
      // Trigger can retry transient failures.
      await announce(
        liveblocks,
        roomId,
        "error",
        quotaExhausted
          ? QUOTA_EXHAUSTED_MESSAGE
          : "Specwright hit an error and couldn't finish. Please try again.",
      );

      if (quotaExhausted) {
        // Same non-retriable class as the missing-`OPENAI_API_KEY` check above:
        // no retry succeeds until someone tops up billing, so fail the run now.
        throw new AbortTaskRunError(message);
      }

      throw error;
    } finally {
      // Always clear AI presence when the task finishes (success or failure).
      await clearAiPresence(liveblocks, roomId, LABEL);
    }
  },
});
