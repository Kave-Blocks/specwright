import { z } from "zod";

import { MAX_UNIT_SUMMARY_LENGTH, MAX_UNIT_TITLE_LENGTH } from "@/lib/build-units";

/**
 * Every schema the unit-derivation path is validated with: the request a client
 * sends, the payload the `derive-units` task runs on, and the object the model
 * must return.
 *
 * They live in `lib/` rather than in the task module for the reason
 * `lib/spec-agent/payload.ts` and `lib/change-agent/payload.ts` both state:
 * `POST /api/ai/units` can then validate a request against the exact same
 * schema the task validates its payload with, without importing the task
 * instance into the route bundle — which would drag the AI SDK and the whole
 * task graph into the request path.
 */

/* -------------------------------------------------------------------------- */
/* Bounds                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cap on how many units the **model** may return in one derivation.
 *
 * A runaway guard in the spirit of `MAX_PROPOSED_UNITS`
 * (`lib/change-agent/payload.ts`) and `MAX_BUILD_UNITS` (`lib/build-units.ts`),
 * **not a product limit**. A spec describes a system, not a backlog of eighty
 * items; a model returning eighty has misread the task, and the honest response
 * is to bound the damage rather than to write all of it into somebody's project.
 *
 * It is deliberately well under `MAX_BUILD_UNITS` (200): that one is the
 * project-wide ceiling this producer is also checked against, and a single
 * derivation should never be able to consume it.
 */
export const MAX_DERIVED_UNITS = 40;

/* -------------------------------------------------------------------------- */
/* Client request → task payload                                               */
/* -------------------------------------------------------------------------- */

/**
 * What a client may send. `roomId` and nothing else.
 *
 * The spec is not accepted, its id is not accepted, and the existing unit list
 * is not accepted — the task reads all three server-side from the project the
 * access check resolved. The rule is `architecture-context.md`'s, stated
 * generally after the 2026-08-17 room-scoping fix: a route that access-checks
 * one id and acts on another is the bug.
 */
export const deriveUnitsRequestSchema = z.object({
  // Trimmed before the length check, so a whitespace-only id is rejected rather
  // than sent to the access check as a lookup that can never match.
  roomId: z.string().trim().min(1),
});

/**
 * What the task runs on. Both ids are resolved by the route from the access
 * check — `projectId` from the checked project, `specId` from that project's
 * own current spec row. Neither is ever read from the request body.
 */
export const deriveUnitsPayloadSchema = z.object({
  projectId: z.string().trim().min(1),
  specId: z.string().trim().min(1),
});

export type DeriveUnitsPayload = z.infer<typeof deriveUnitsPayloadSchema>;

/* -------------------------------------------------------------------------- */
/* Model output                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The object the model must return.
 *
 * Bounded here rather than trusted: `40` records that this model invents
 * identifiers it was never given, so everything it returns is untrusted input
 * (`architecture-context.md` → Change Proposals). Titles and summaries are
 * truncated to the same lengths a person's own typed unit is bounded by, so a
 * derived unit cannot be longer than one somebody could have typed.
 *
 * A blank title survives this schema as an empty string rather than failing the
 * whole derivation — `lib/unit-agent/produce.ts` drops it and counts the drop.
 * Failing the object would throw away the other thirty good units over one bad
 * entry, which is the wrong trade for a batch.
 */
export const derivedUnitsSchema = z.object({
  units: z
    .array(
      z.object({
        title: z
          .string()
          .transform((value) => value.trim().slice(0, MAX_UNIT_TITLE_LENGTH).trim()),
        summary: z
          .string()
          .nullable()
          .transform((value) =>
            value === null
              ? null
              : value.trim().slice(0, MAX_UNIT_SUMMARY_LENGTH).trim() || null,
          ),
      }),
    )
    .max(MAX_DERIVED_UNITS),
});

export type DerivedUnits = z.infer<typeof derivedUnitsSchema>;
export type DerivedUnit = DerivedUnits["units"][number];
