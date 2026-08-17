import { AbortTaskRunError, logger, task } from "@trigger.dev/sdk";
import { mutateFlow } from "@liveblocks/react-flow/node";

import {
  QUOTA_EXHAUSTED_MESSAGE,
  isQuotaExhaustedError,
} from "@/lib/ai-errors";
import { readChangeProposal } from "@/lib/change-agent/storage";
import { loadPushableChange, markChangePushed } from "@/lib/canvas-sync/change";
import {
  buildCanvasSyncPrompt,
  filterAdditivePlan,
  skippedRemovals,
} from "@/lib/canvas-sync/plan";
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
import type { ChangeCanvasPushOutcome } from "@/types/changes";
import type { AiStatusPhase } from "@/types/tasks";

/**
 * Payload `POST /api/ai/canvas` hands to the background task.
 *
 * `projectId` and `roomId` are both resolved from the caller's access check —
 * the room id *is* the project id, so a client-supplied room would be an
 * unverified claim about which shared document to write into.
 */
export interface CanvasSyncPayload {
  projectId: string;
  changeId: string;
  roomId: string;
}

/** Names this task in the shared room helpers' log lines. */
const LABEL = "canvas-sync";

type Liveblocks = ReturnType<typeof getLiveblocks>;

/** Publish to the shared `ai-status-feed`, bound to this task's label. */
async function announce(
  liveblocks: Liveblocks,
  roomId: string,
  phase: AiStatusPhase,
  text: string,
): Promise<void> {
  await announceAiStatus(liveblocks, roomId, phase, text, LABEL);
}

/** Turn what landed into a status line for everyone in the room. */
function describeOutcome(outcome: ChangeCanvasPushOutcome): string {
  const parts: string[] = [];
  if (outcome.nodesAdded > 0) {
    parts.push(`${outcome.nodesAdded} node${outcome.nodesAdded === 1 ? "" : "s"}`);
  }
  if (outcome.edgesAdded > 0) {
    parts.push(
      `${outcome.edgesAdded} connection${outcome.edgesAdded === 1 ? "" : "s"}`,
    );
  }

  if (parts.length === 0) {
    return outcome.nodesUpdated > 0
      ? "Specwright updated the canvas with an applied change."
      : "Specwright found nothing to draw for this change.";
  }
  return `Specwright added ${parts.join(" and ")} from an applied change.`;
}

/**
 * Durable canvas write-back. An **applied** change's architecture delta becomes
 * real-time additions to the collaborative canvas, closing the last structurally
 * broken link in the change loop: until this runs, a regenerated spec silently
 * describes a system without any of the work the change added.
 *
 * 1. Re-check that the change may be pushed. The route already refused the
 *    obvious cases before spending a model call, but a change can move between
 *    the trigger and the run, so the rule is asked again here.
 * 2. Announce a "start" status on the shared feed and show AI presence.
 * 3. Read the current canvas with a read-only `mutateFlow`.
 * 4. Compose an additive prompt from the delta and interpret it with
 *    `generateDesignPlan` — the **existing** design path and the existing
 *    `DESIGN_MODEL`. There is no second design model and no second prompt module.
 * 5. **Filter every destructive operation out of the plan**, in code.
 * 6. Apply what is left through `applyDesignPlan` inside a second `mutateFlow`,
 *    so every participant watches the nodes appear.
 * 7. Record the push, and only then — a CRDT write is not transactional with
 *    Postgres, which is exactly why this is a task and not part of `41`'s
 *    transaction.
 *
 * Progress rides on the shared **`ai-status-feed`**, not the run's own metadata.
 * `context/architecture-context.md` draws that line by what the work mutates: a
 * spec and a proposal are produced for the person who asked, while this changes
 * the canvas everybody is looking at, so it follows the design agent's broadcast
 * path.
 *
 * Every refusal is an `AbortTaskRunError`. None of them — not applied, already
 * pushed, no stored document — becomes true by waiting, so retrying would spend
 * the budget to fail identically three times.
 */
export const canvasSync = task({
  id: "canvas-sync",
  run: async (payload: CanvasSyncPayload): Promise<ChangeCanvasPushOutcome> => {
    const { projectId, changeId, roomId } = payload;
    const liveblocks = getLiveblocks();

    try {
      logger.info("canvas-sync started", { projectId, changeId, roomId });

      // 1. The refusal rule, asked again. `loadPushableChange` is the one place
      // it is written; the route asks it too, before a run is ever started.
      const pushable = await loadPushableChange(projectId, changeId);
      if (!pushable.ok) {
        throw new AbortTaskRunError(
          pushable.reason === "not-found"
            ? "That change no longer exists in this project."
            : pushable.reason === "not-applied"
              ? "Only an applied change can be pushed to the canvas."
              : "This change has already been pushed to the canvas.",
        );
      }

      const proposal = await readChangeProposal(pushable.change.proposalPath);
      if (!proposal) {
        // The row exists but its document is unreadable, so there is no delta to
        // draw. Refusing keeps `canvasPushedAt` null rather than marking the
        // change drawn for having drawn nothing.
        throw new AbortTaskRunError(
          "This change has no stored proposal, so there is nothing to draw.",
        );
      }

      // The feed is progress UI, not the job: if Liveblocks' feed API is
      // unreachable we log it and draw the change anyway. `announce` degrades
      // the same way. The room *mutation* below is the job and does not.
      try {
        await ensureAiStatusFeed(liveblocks, roomId);
      } catch (error) {
        logger.warn("canvas-sync failed to ensure status feed", {
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
      await announce(
        liveblocks,
        roomId,
        "start",
        "Specwright is adding an applied change to the canvas…",
      );

      // 3. Read the current canvas. A read-only mutateFlow flushes nothing, and
      // the node ids it returns are what the model may attach new edges to.
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
        "Specwright is drawing the change…",
      );
      // Refresh presence so "thinking" survives the slow model call.
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

      // 4. The one model call this unit makes, through the existing design path.
      const plan = await generateDesignPlan({
        prompt: buildCanvasSyncPrompt({
          summary: proposal.summary,
          architectureDelta: proposal.architectureDelta,
        }),
        current,
      });

      // 5. The harness, not the wish. A hallucinated `deleteNode` would remove a
      // node a person drew, along with every edge attached to it.
      const { plan: additive, dropped } = filterAdditivePlan(plan);
      if (dropped > 0) {
        logger.warn("canvas-sync dropped destructive operations", {
          roomId,
          changeId,
          dropped,
          returned: plan.operations.length,
        });
      }

      // 6. Apply into the shared room — the same Storage the client's
      // `useLiveblocksFlow` reads, so updates stream in live.
      let summary: AppliedSummary | null = null;
      await mutateFlow<CanvasNode, CanvasEdge>(
        { client: liveblocks, roomId },
        (flow) => {
          summary = applyDesignPlan(flow, additive);
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

      // Additive-only is the contract, so a non-zero removal count here would
      // mean the filter had been bypassed. It cannot be undone at this point —
      // log it loudly rather than let it pass unremarked.
      if (applied.nodesRemoved > 0 || applied.edgesRemoved > 0) {
        logger.error("canvas-sync removed canvas content — this must not happen", {
          roomId,
          changeId,
          nodesRemoved: applied.nodesRemoved,
          edgesRemoved: applied.edgesRemoved,
        });
      }

      // 7. Only now. A push that failed above leaves this null, which is the
      // retry state — the control stays available.
      await markChangePushed(projectId, changeId);

      const outcome: ChangeCanvasPushOutcome = {
        nodesAdded: applied.nodesAdded,
        nodesUpdated: applied.nodesUpdated,
        edgesAdded: applied.edgesAdded,
        skippedRemovals: skippedRemovals(proposal.architectureDelta),
        droppedOperations: dropped,
      };

      logger.info("canvas-sync pushed change", { roomId, changeId, ...outcome });
      await announce(liveblocks, roomId, "complete", describeOutcome(outcome));

      return outcome;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const quotaExhausted = isQuotaExhaustedError(error);
      logger.error("canvas-sync failed", {
        projectId,
        changeId,
        roomId,
        error: message,
        quotaExhausted,
      });

      // Surface the failure on the shared feed (best-effort — `announce` never
      // throws, so it cannot mask the original error). A refusal already carries
      // a message written for a person, so it is shown as it is rather than
      // replaced by the generic line.
      await announce(
        liveblocks,
        roomId,
        "error",
        quotaExhausted
          ? QUOTA_EXHAUSTED_MESSAGE
          : error instanceof AbortTaskRunError
            ? message
            : "Specwright couldn’t add this change to the canvas. Please try again.",
      );

      if (quotaExhausted) {
        // The same non-retriable class `37` established: no retry succeeds until
        // someone tops up billing, so fail the run now instead of spending the
        // budget on doomed attempts.
        throw new AbortTaskRunError(message);
      }

      throw error;
    } finally {
      // Always clear AI presence when the task finishes (success or failure).
      await clearAiPresence(liveblocks, roomId, LABEL);
    }
  },
});
