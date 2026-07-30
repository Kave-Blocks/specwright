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
import { prisma } from "@/lib/prisma";
import { generateSpecMarkdown } from "@/lib/spec-agent/generate";
import { generateSpecPayloadSchema } from "@/lib/spec-agent/payload";
import { saveProjectSpec } from "@/lib/spec-agent/storage";
import type { AiStatusPhase } from "@/types/tasks";

/**
 * Run metadata the client reads (via `useRealtimeRun`) to track a spec run live.
 * It reuses the existing `AiStatusPhase` vocabulary rather than inventing a
 * second one. Unlike the design agent — whose progress is broadcast to *every*
 * participant through the shared `ai-status-feed` because it mutates the shared
 * canvas — a spec run produces a document for the person who asked for it, so
 * its status rides on the run itself.
 *
 * `specId` appears once the spec has been stored, and is what a caller passes to
 * `GET /api/projects/{projectId}/specs/{specId}/download`. The blob URL is
 * deliberately *not* published here: it is a private artifact reference and must
 * only ever be dereferenced behind that route's access check.
 */
export interface SpecRunMetadata {
  phase: AiStatusPhase;
  text: string;
  specId?: string;
}

/** Publish the current phase onto the run so a subscriber sees it in realtime. */
function setPhase(phase: AiStatusPhase, text: string): void {
  metadata.set("phase", phase).set("text", text);
}

/**
 * Whether a failed attempt is the run's *last* word, i.e. nothing will follow it.
 * True when the attempt budget is spent, or when the error is non-retriable
 * (`AbortTaskRunError` fails the run immediately).
 *
 * This is what the "error" phase is gated on. Publishing it from an attempt that
 * Trigger is about to retry would tell a subscriber the spec had failed while the
 * run was in fact still working — and a later attempt would then contradict it by
 * moving the phase back to "processing". `maxAttempts` is optional on the run, so
 * an unknown budget is treated as a single attempt: better to report an error the
 * next attempt overwrites than to strand a subscriber on "processing" forever.
 */
function isTerminalFailure(error: unknown, ctx: Context): boolean {
  return (
    error instanceof AbortTaskRunError ||
    ctx.attempt.number >= (ctx.run.maxAttempts ?? 1)
  );
}

/**
 * Durable spec-generation task. The canvas graph and the conversation that
 * produced it become a Markdown technical specification:
 *
 * 1. Report a "start" phase on the run's metadata.
 * 2. Read the project's persisted Discovery brief, if it has one.
 * 3. Write the spec with OpenAI from the canvas graph + brief + chat context.
 * 4. Persist it — Markdown to Vercel Blob, a `ProjectSpec` row to Prisma.
 * 5. Report "complete" (or "error") and return the Markdown as the task output.
 *
 * The payload is validated by {@link generateSpecPayloadSchema} — the same
 * schema `POST /api/ai/spec` validates the request with. `projectId` is resolved
 * server-side from the caller's access, so it is trustworthy by the time it
 * arrives here, and is what the stored spec is linked to.
 *
 * Persisting happens *here*, not in a request handler: this is the only place
 * that runs once a spec exists without a client having to stay on the page, so
 * a spec is stored even if the requester closes the tab mid-run.
 */
export const generateSpec = schemaTask({
  id: "generate-spec",
  schema: generateSpecPayloadSchema,
  run: async (payload, { ctx }): Promise<string> => {
    const { projectId, roomId, chatHistory, nodes, edges } = payload;

    try {
      logger.info("generate-spec started", {
        projectId,
        roomId,
        nodes: nodes.length,
        edges: edges.length,
        messages: chatHistory.length,
      });
      setPhase("start", "Specwright is reading your canvas…");

      if (!process.env.OPENAI_API_KEY) {
        // A configuration error, not a transient one — do not retry.
        throw new AbortTaskRunError("OPENAI_API_KEY is not set");
      }

      setPhase("processing", "Specwright is writing your technical spec…");

      // Read the Discovery brief server-side rather than accepting it in the
      // payload: it must never be client-supplied, so it is fetched from the
      // already access-checked `projectId` exactly as that id was itself
      // resolved rather than trusted from the request body. Deliberately
      // unguarded — like the `saveProjectSpec` call below, a database failure
      // is a genuine error and belongs in the run's catch/retry handling, not
      // swallowed into a best-effort "no brief".
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { architectureBrief: true },
      });

      if (!project) {
        // The id reached this task already resolved from the caller's access,
        // so a missing row is not a transient fault a retry could fix.
        throw new AbortTaskRunError(`Project ${projectId} no longer exists`);
      }

      // `null` here is legitimate and distinct from the above: it means
      // Discovery has simply never been run for this project.
      const architectureBrief = project.architectureBrief;

      const markdown = await generateSpecMarkdown({
        chatHistory,
        nodes,
        edges,
        architectureBrief,
      });

      logger.info("generate-spec produced a spec", {
        projectId,
        roomId,
        characters: markdown.length,
        hasBrief: architectureBrief !== null,
      });

      setPhase("processing", "Specwright is saving your technical spec…");

      const spec = await saveProjectSpec({ projectId, markdown });

      logger.info("generate-spec stored a spec", {
        projectId,
        roomId,
        specId: spec.id,
      });

      // Publish the id (never the private blob URL) so the requester can fetch
      // the stored file through the access-checked download route.
      metadata.set("specId", spec.id);
      setPhase("complete", "Specwright finished your technical spec.");

      // The task output stays plain Markdown — storage is a side effect, so a
      // subscriber can still render the spec straight from the run.
      return markdown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A spent quota is terminal on whatever attempt surfaces it: no retry can
      // succeed until someone tops up billing, so it never waits for the attempt
      // budget to run out before the requester is told.
      const quotaExhausted = isQuotaExhaustedError(error);
      const terminal = quotaExhausted || isTerminalFailure(error, ctx);

      logger.error("generate-spec attempt failed", {
        projectId,
        roomId,
        error: message,
        attempt: ctx.attempt.number,
        maxAttempts: ctx.run.maxAttempts,
        terminal,
        quotaExhausted,
      });

      // Only tell the subscriber the spec failed once no attempt is left to
      // save it — a transient failure mid-run is Trigger's to absorb, not the
      // requester's to see. The next attempt republishes "start"/"processing".
      if (terminal) {
        setPhase(
          "error",
          quotaExhausted
            ? QUOTA_EXHAUSTED_MESSAGE
            : "Specwright hit an error and couldn't finish the spec. Please try again.",
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
