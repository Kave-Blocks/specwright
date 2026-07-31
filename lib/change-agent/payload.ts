import { z } from "zod";

import { CHANGE_DELTA_KIND_ORDER } from "@/types/changes";
import type { ChangeDeltaKind } from "@/types/changes";

/**
 * Every schema the change path is validated with: the request a client sends,
 * the payload the `propose-change` task runs on, the object the model must
 * return, and the document that ends up in Blob.
 *
 * They live in `lib/` rather than in the task module for the reason
 * `lib/spec-agent/payload.ts` states: `POST /api/ai/change` can then validate a
 * request against the exact same schema the task validates its payload with,
 * without importing the task instance into the route bundle (which would drag
 * the AI SDK and the whole task graph into the request path).
 */

/* -------------------------------------------------------------------------- */
/* Bounds                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Bound on the member's change request.
 *
 * Over-length text is **truncated, never rejected** — the policy
 * `MAX_BRIEF_LENGTH` (`app/api/projects/[projectId]/brief/route.ts`) documents
 * for human-typed text with no `maxlength` at its source, and the same one
 * `lib/build-units.ts` applies to a unit's title and summary. A request that
 * merely ran long is still a legitimate request, and failing it would lose what
 * the person typed. A *blank* request is still rejected: there is nothing to
 * propose against.
 */
export const MAX_CHANGE_REQUEST_LENGTH = 20_000;

/**
 * Caps on how much the **model** may return.
 *
 * These are runaway guards in the spirit of `MAX_NODES`/`MAX_EDGES`
 * (`lib/spec-agent/payload.ts`) and `MAX_BUILD_UNITS` (`lib/build-units.ts`) —
 * **not product limits**. No real change touches forty parts of an
 * architecture, so hitting one of these means the model has started listing
 * rather than reasoning, and the run should not turn that into forty rows.
 *
 * They are **enforced by truncation in `validate.ts`, not as JSON-Schema
 * `maxItems` on the schema below**. OpenAI's strict structured-output mode
 * rejects `minItems`/`maxItems` outright, so putting them on the model-facing
 * schema would fail every call with a 400 instead of bounding anything. The
 * model is told the limits in prose (see `propose.ts`); the truncation is what
 * actually holds.
 */
export const MAX_DELTA_ENTRIES = 40;
export const MAX_AFFECTED_UNITS = 40;
export const MAX_PROPOSED_UNITS = 20;
export const MAX_OPEN_QUESTIONS = 20;

/**
 * Cap on a single free-text field of the proposal. Same runaway framing: the
 * arrays above bound how many entries come back but say nothing about how big
 * each one is, and all of it is stored and rendered.
 */
export const MAX_PROPOSAL_TEXT_LENGTH = 2_000;

/* -------------------------------------------------------------------------- */
/* Request                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Body of `POST /api/ai/change`.
 *
 * `projectId` is deliberately absent, exactly as in `specRequestSchema`: the
 * room id *is* the project id, and access is resolved from the authenticated
 * user + `roomId` server-side. A client-supplied project id is never trusted —
 * and neither are the spec, the brief, the canvas, or the unit list, none of
 * which appear here. The task reads all of them from the project the access
 * check resolved.
 */
export const changeRequestSchema = z.object({
  // Trimmed before the length check, so a whitespace-only id is rejected rather
  // than sent to the access check as a lookup that can never match.
  roomId: z.string().trim().min(1),
  // Trimmed, rejected when blank, then bounded by truncation — never by
  // rejection (see `MAX_CHANGE_REQUEST_LENGTH`).
  request: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.slice(0, MAX_CHANGE_REQUEST_LENGTH).trim()),
});

/**
 * Payload handed to the `propose-change` task: the validated request plus the
 * two values the route resolves server-side — the `projectId` the caller's
 * access resolved to, and the Clerk id of the member asking, which is recorded
 * on the change as its author.
 */
export const proposeChangePayloadSchema = changeRequestSchema.extend({
  projectId: z.string().trim().min(1),
  authorId: z.string().trim().min(1),
});

/* -------------------------------------------------------------------------- */
/* Model output                                                                */
/* -------------------------------------------------------------------------- */

/*
 * The schema below is handed to `generateObject`, which converts it to JSON
 * Schema for OpenAI's structured outputs. Two constraints follow from that and
 * are deliberate:
 *
 * - No `.transform()` anywhere. A transform has no JSON-Schema representation,
 *   so normalization happens afterwards, in `validate.ts`.
 * - No optional fields and no array bounds. Strict structured outputs require
 *   every property to be required, and reject `minItems`/`maxItems`. So a
 *   missing summary arrives as `""` and is normalized to `null` later.
 *
 * Nothing here is trusted on arrival: passing the schema only proves the shape,
 * and a `key` that parses is still a key the model may have invented.
 */

const deltaKinds = CHANGE_DELTA_KIND_ORDER as readonly [
  ChangeDeltaKind,
  ...ChangeDeltaKind[],
];

/** One line of the architecture delta, as the model returns it. */
const proposalDeltaEntrySchema = z.object({
  kind: z.enum(deltaKinds).describe("How this part of the system moves."),
  component: z
    .string()
    .describe(
      "The part of the system that moves — a service, a store, a boundary. Name it as the current spec names it.",
    ),
  detail: z.string().describe("What specifically changes about it, and why."),
});

/** An existing build unit the model claims the change affects. */
const proposalAffectedUnitSchema = z.object({
  key: z
    .string()
    .describe(
      "The key of an existing build unit, copied exactly from the list you were given. Never invent one.",
    ),
  reason: z.string().describe("Why this change makes that unit stale."),
});

/** A piece of work the change implies but which does not exist yet. */
const proposalProposedUnitSchema = z.object({
  title: z.string().describe("A short imperative title for the new work."),
  summary: z
    .string()
    .describe("One or two sentences on what the work involves. May be empty."),
});

/** The structured proposal the model must return. */
export const changeProposalSchema = z.object({
  summary: z
    .string()
    .describe("A few sentences stating what the change does to this system."),
  architectureDelta: z.array(proposalDeltaEntrySchema),
  affectedUnits: z.array(proposalAffectedUnitSchema),
  proposedUnits: z.array(proposalProposedUnitSchema),
  openQuestions: z
    .array(z.string())
    .describe("What this change leaves genuinely undecided. May be empty."),
});

/* -------------------------------------------------------------------------- */
/* Stored document                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The proposal document as it is stored in Blob.
 *
 * It differs from both the model's output and the client's `ChangeProposal` in
 * one field, and the difference is the point: `affectedUnits` holds
 * **`buildUnitId`**, never a key and never a title. A key is re-derived when a
 * unit is renamed (`lib/build-units.ts`), and a title goes stale the moment
 * someone edits it — so the document stores the one stable reference and the
 * read route resolves the current title from it.
 *
 * It is a schema rather than a bare interface because a document fetched back
 * out of Blob is **unknown external input** just as much as the model's output
 * was: it may predate a shape change, or have been truncated on write.
 */
export const storedChangeProposalSchema = z.object({
  summary: z.string(),
  architectureDelta: z.array(
    z.object({
      kind: z.enum(deltaKinds),
      component: z.string(),
      detail: z.string(),
    }),
  ),
  affectedUnits: z.array(
    z.object({
      buildUnitId: z.string(),
      reason: z.string(),
    }),
  ),
  proposedUnits: z.array(
    z.object({
      title: z.string(),
      summary: z.string().nullable(),
    }),
  ),
  openQuestions: z.array(z.string()),
});

export type ChangeRequest = z.infer<typeof changeRequestSchema>;
export type ProposeChangePayload = z.infer<typeof proposeChangePayloadSchema>;
export type ChangeProposalDraft = z.infer<typeof changeProposalSchema>;
export type StoredChangeProposal = z.infer<typeof storedChangeProposalSchema>;
export type StoredAffectedUnit = StoredChangeProposal["affectedUnits"][number];
