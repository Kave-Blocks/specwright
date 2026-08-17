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
import { generateDerivedUnits, loadDeriveContext } from "@/lib/unit-agent/derive";
import { deriveUnitsPayloadSchema } from "@/lib/unit-agent/payload";
import { produceDerivedUnits } from "@/lib/unit-agent/produce";
import type { AiStatusPhase } from "@/types/tasks";

/**
 * Run metadata the client reads (via `useRealtimeRun`) to track a derivation.
 *
 * It rides on the **run**, not on the room's `ai-status-feed`, and the line is
 * the one `architecture-context.md` draws by what the work mutates. Design
 * generation and canvas write-back broadcast because they change the shared
 * canvas everybody is looking at. A build list is explicitly *not* that: it is
 * "the one project resource with no second layer — no Blob half and no realtime
 * channel, because a unit is edited deliberately by one person at a time and
 * read back on load". So this follows the spec and proposal path.
 *
 * `createdCount` appears once the units are written, so a subscriber can report
 * what landed without refetching the list to count it.
 */
export interface DeriveUnitsRunMetadata {
  phase: AiStatusPhase;
  text: string;
  createdCount?: number;
}

/** Publish the current phase onto the run so a subscriber sees it in realtime. */
function setPhase(phase: AiStatusPhase, text: string): void {
  metadata.set("phase", phase).set("text", text);
}

/**
 * Whether a failed attempt is the run's *last* word. Identical to
 * `propose-change`'s and `generate-spec`'s, and for the identical reason:
 * publishing "error" from an attempt Trigger is about to retry would tell a
 * subscriber the derivation had failed while the run was still working.
 */
function isTerminalFailure(error: unknown, ctx: Context): boolean {
  return (
    error instanceof AbortTaskRunError ||
    ctx.attempt.number >= (ctx.run.maxAttempts ?? 1)
  );
}

/** What the task returns once the units have been written. */
export interface DeriveUnitsResult {
  createdCount: number;
  skippedTitles: string[];
  droppedCount: number;
}

/**
 * Durable unit-derivation task — unit `44`. A project's current spec becomes the
 * first set of build units it implies:
 *
 * 1. Report a "start" phase on the run's metadata.
 * 2. Read the spec and the existing unit list, server-side.
 * 3. Ask the model to decompose the spec.
 * 4. Write what it returned through the producer, which drops untitled entries,
 *    skips key collisions, and never writes a human-owned column.
 * 5. Report "complete" (or "error") and return what landed.
 *
 * The payload is validated by {@link deriveUnitsPayloadSchema} — the same schema
 * `POST /api/ai/units` validates against. `projectId` and `specId` are resolved
 * server-side from the caller's access, so they are trustworthy on arrival.
 *
 * **This task only adds build units.** It writes no spec, supersedes nothing,
 * edits nothing, deletes nothing, and does not touch the canvas or the
 * Liveblocks room. The one thing it changes is a project's build list, and only
 * by extension.
 */
export const deriveUnits = schemaTask({
  id: "derive-units",
  schema: deriveUnitsPayloadSchema,
  run: async (payload, { ctx }): Promise<DeriveUnitsResult> => {
    const { projectId, specId } = payload;

    try {
      logger.info("derive-units started", { projectId, specId });
      setPhase("start", "Specwright is reading your spec…");

      if (!process.env.OPENAI_API_KEY) {
        // A configuration error, not a transient one — do not retry.
        throw new AbortTaskRunError("OPENAI_API_KEY is not set");
      }

      // Read here from the already access-checked `projectId`, never from the
      // payload — the rule `36` set for the brief, applied to the spec too.
      const context = await loadDeriveContext(projectId);

      if (!context) {
        // Either the project is gone, or its last spec was removed between the
        // route's refusal check and this run. Neither is fixed by retrying.
        throw new AbortTaskRunError(
          `Project ${projectId} has no specification to derive build units from`,
        );
      }

      /*
       * The spec moved under the request. The route resolved `specId` from the
       * project's current spec; if a newer one has since been generated, the
       * derivation would silently attribute units to a spec that is no longer
       * current. Refusing is the honest answer — the caller re-derives against
       * the spec that is actually current, exactly as `41` refuses a proposal
       * whose base has moved rather than quietly reinterpreting it.
       */
      if (context.spec.id !== specId) {
        throw new AbortTaskRunError(
          `Project ${projectId} has a newer specification than the one this run was started for`,
        );
      }

      setPhase("processing", "Specwright is working out what this spec implies…");

      const { units } = await generateDerivedUnits(context);

      setPhase("processing", "Specwright is adding the units to your build list…");

      const result = await produceDerivedUnits(projectId, context.spec.id, units);

      if (!result.ok) {
        // The cap. Not a transient failure and not a fault — the project is
        // full, which no retry changes.
        throw new AbortTaskRunError(
          `Project ${projectId} has reached its build-unit cap; nothing was created`,
        );
      }

      const { created, skippedTitles, droppedCount } = result.produced;

      logger.info("derive-units wrote a build list", {
        projectId,
        specId,
        specVersion: context.spec.version,
        returned: units.length,
        created: created.length,
        skipped: skippedTitles.length,
        // Counted and logged on purpose, the same reason `40` counts dropped
        // unit keys: a model that keeps returning untitled entries is a prompt
        // problem, and it is invisible unless this number is here.
        droppedCount,
      });

      metadata.set("createdCount", created.length);
      setPhase(
        "complete",
        created.length === 1
          ? "Specwright added 1 build unit."
          : `Specwright added ${created.length} build units.`,
      );

      return {
        createdCount: created.length,
        skippedTitles,
        droppedCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const quotaExhausted = isQuotaExhaustedError(error);
      const terminal = quotaExhausted || isTerminalFailure(error, ctx);

      logger.error("derive-units attempt failed", {
        projectId,
        specId,
        error: message,
        attempt: ctx.attempt.number,
        maxAttempts: ctx.run.maxAttempts,
        terminal,
        quotaExhausted,
      });

      if (terminal) {
        setPhase(
          "error",
          quotaExhausted
            ? QUOTA_EXHAUSTED_MESSAGE
            : "Specwright hit an error and couldn't derive your build units. Please try again.",
        );
      }

      if (quotaExhausted) {
        throw new AbortTaskRunError(message);
      }

      throw error;
    }
  },
});
