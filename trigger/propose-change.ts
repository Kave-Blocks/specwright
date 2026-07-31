import {
  AbortTaskRunError,
  type Context,
  logger,
  metadata,
  schemaTask,
} from "@trigger.dev/sdk";

import {
  QUOTA_EXHAUSTED_MESSAGE,
  isQuotaExhaustedError,
} from "@/lib/ai-errors";
import { proposeChangePayloadSchema } from "@/lib/change-agent/payload";
import {
  generateChangeProposal,
  loadChangeContext,
} from "@/lib/change-agent/propose";
import { saveProjectChange } from "@/lib/change-agent/storage";
import { validateChangeProposal } from "@/lib/change-agent/validate";
import type { AiStatusPhase } from "@/types/tasks";

/**
 * Run metadata the client reads (via `useRealtimeRun`) to track a proposal live.
 *
 * It reuses the existing `AiStatusPhase` vocabulary rather than inventing a
 * second one, and it rides on the **run**, not on the room's `ai-status-feed`.
 * `context/architecture-context.md` draws that line by what the work mutates:
 * design generation broadcasts because it changes the shared canvas that
 * everyone is looking at, while a proposal changes nothing shared — it produces
 * a document for the person who asked for it, exactly like a spec run.
 *
 * `changeId` appears once the change has been stored, and is what a caller
 * passes to `GET /api/projects/{projectId}/changes/{changeId}`. The blob URL is
 * deliberately **not** published here: it is a private artifact reference and
 * must only ever be dereferenced behind that route's access check.
 */
export interface ChangeRunMetadata {
  phase: AiStatusPhase;
  text: string;
  changeId?: string;
}

/** Publish the current phase onto the run so a subscriber sees it in realtime. */
function setPhase(phase: AiStatusPhase, text: string): void {
  metadata.set("phase", phase).set("text", text);
}

/**
 * Whether a failed attempt is the run's *last* word, i.e. nothing will follow
 * it. True when the attempt budget is spent, or when the error is non-retriable
 * (`AbortTaskRunError` fails the run immediately).
 *
 * Identical to `generate-spec`'s, and for the identical reason: publishing the
 * "error" phase from an attempt Trigger is about to retry would tell a
 * subscriber the proposal had failed while the run was in fact still working,
 * and a later attempt would then contradict it by moving the phase back to
 * "processing". `maxAttempts` is optional on the run, so an unknown budget is
 * treated as a single attempt — better to report an error the next attempt
 * overwrites than to strand a subscriber on "processing" forever.
 */
function isTerminalFailure(error: unknown, ctx: Context): boolean {
  return (
    error instanceof AbortTaskRunError ||
    ctx.attempt.number >= (ctx.run.maxAttempts ?? 1)
  );
}

/** What the task returns once the proposal has been stored. */
export interface ProposeChangeResult {
  changeId: string;
  sequence: number;
}

/**
 * Durable change-proposal task. A plain-English request becomes a structured
 * proposal against the project's current spec:
 *
 * 1. Report a "start" phase on the run's metadata.
 * 2. Read everything the proposal is reasoned from, server-side.
 * 3. Ask the model for a structured proposal.
 * 4. Validate what it returned — resolve unit keys, drop what does not resolve.
 * 5. Persist it — the document to Vercel Blob, a `ProjectChange` row plus its
 *    impact rows to Prisma.
 * 6. Report "complete" (or "error") and return the change's id.
 *
 * The payload is validated by {@link proposeChangePayloadSchema} — the same
 * schema `POST /api/ai/change` validates the request with. `projectId` and
 * `authorId` are resolved server-side from the caller's access, so they are
 * trustworthy by the time they arrive here.
 *
 * **This task applies nothing.** It writes one `ProjectChange` and its
 * `ProjectChangeImpact` rows and nothing else: no build unit is created,
 * updated, or deleted, no spec is written, and the canvas and the Liveblocks
 * room are untouched. Accepting a proposal is unit `41`.
 *
 * Persisting happens *here*, not in a request handler: this is the only place
 * that runs once a proposal exists without a client having to stay on the page,
 * so a proposal is stored even if the requester closes the tab mid-run.
 */
export const proposeChange = schemaTask({
  id: "propose-change",
  schema: proposeChangePayloadSchema,
  run: async (payload, { ctx }): Promise<ProposeChangeResult> => {
    const { projectId, roomId, request, authorId } = payload;

    try {
      logger.info("propose-change started", {
        projectId,
        roomId,
        characters: request.length,
      });
      setPhase("start", "Specwright is reading your spec…");

      if (!process.env.OPENAI_API_KEY) {
        // A configuration error, not a transient one — do not retry.
        throw new AbortTaskRunError("OPENAI_API_KEY is not set");
      }

      // The spec, the brief, the canvas, and the unit list are all read here
      // from the already access-checked `projectId` rather than accepted in the
      // payload — the rule unit `36` set for the brief, applied to all four.
      const context = await loadChangeContext(projectId);

      if (!context) {
        // Either the project is gone, or it has no spec to be a delta against.
        // `POST /api/ai/change` refuses the second case before a run is even
        // started; reaching it here means the last spec was removed in between.
        // Neither is a fault a retry could fix.
        throw new AbortTaskRunError(
          `Project ${projectId} has no specification to propose a change against`,
        );
      }

      setPhase("processing", "Specwright is working out what this change moves…");

      const draft = await generateChangeProposal({ request, context });

      const { document, droppedAffectedUnits } = validateChangeProposal(
        draft,
        context.units,
      );

      logger.info("propose-change produced a proposal", {
        projectId,
        roomId,
        baseSpecVersion: context.baseSpec.version,
        deltaEntries: document.architectureDelta.length,
        affectedUnits: document.affectedUnits.length,
        proposedUnits: document.proposedUnits.length,
        openQuestions: document.openQuestions.length,
        // Counted and logged on purpose: a model that keeps inventing unit keys
        // is a prompt problem, and it is invisible unless this number is here.
        droppedAffectedUnits,
      });

      setPhase("processing", "Specwright is saving your change proposal…");

      const change = await saveProjectChange({
        projectId,
        authorId,
        request,
        baseSpecId: context.baseSpec.id,
        proposal: document,
      });

      logger.info("propose-change stored a change", {
        projectId,
        roomId,
        changeId: change.id,
        sequence: change.sequence,
      });

      // Publish the id (never the private blob URL) so the requester can read
      // the stored proposal through the access-checked change route.
      metadata.set("changeId", change.id);
      setPhase("complete", "Specwright finished your change proposal.");

      return { changeId: change.id, sequence: change.sequence };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A spent quota is terminal on whatever attempt surfaces it: no retry can
      // succeed until someone tops up billing, so the requester is told at once
      // rather than after the attempt budget runs out.
      const quotaExhausted = isQuotaExhaustedError(error);
      const terminal = quotaExhausted || isTerminalFailure(error, ctx);

      logger.error("propose-change attempt failed", {
        projectId,
        roomId,
        error: message,
        attempt: ctx.attempt.number,
        maxAttempts: ctx.run.maxAttempts,
        terminal,
        quotaExhausted,
      });

      // Only tell the subscriber the proposal failed once no attempt is left to
      // save it — a transient failure mid-run is Trigger's to absorb, not the
      // requester's to see. The next attempt republishes "start"/"processing".
      if (terminal) {
        setPhase(
          "error",
          quotaExhausted
            ? QUOTA_EXHAUSTED_MESSAGE
            : "Specwright hit an error and couldn't finish the change proposal. Please try again.",
        );
      }

      if (quotaExhausted) {
        // Same non-retriable class as the missing-`OPENAI_API_KEY` check above:
        // nothing changes until a human acts, so fail the run now rather than
        // spending the remaining attempts on calls that cannot succeed.
        throw new AbortTaskRunError(message);
      }

      // Rethrow so Trigger retries transient failures (`AbortTaskRunError` is
      // exempt and fails the run immediately).
      throw error;
    }
  },
});
