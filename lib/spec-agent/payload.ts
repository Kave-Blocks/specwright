import { z } from "zod";

import type { CanvasNodeShape } from "@/types/canvas";
import { AI_CHAT_MAX_LENGTH } from "@/types/tasks";

/**
 * The contract between `POST /api/ai/spec` and the `generate-spec` task.
 *
 * It lives in `lib/` rather than in the task module so the route can validate a
 * request against the exact same schema the task validates its payload with,
 * without importing the task instance into the route bundle (which would drag
 * the AI SDK and the whole task graph into the request path).
 */

/** Caps that bound how much canvas/chat a single request can push into a run. */
export const MAX_CHAT_MESSAGES = 100;
export const MAX_NODES = 300;
export const MAX_EDGES = 600;

/**
 * Caps on the *strings* inside each node/edge. The array caps above bound how
 * many objects a request carries but say nothing about how big each one is, so
 * without these a client could post 300 nodes whose labels are megabytes each —
 * all of which is forwarded verbatim into the `generate-spec` prompt
 * (`buildUserPrompt`), inflating token cost and run time far beyond anything a
 * real canvas needs.
 *
 * The two fields are bounded *differently*, because what produces them differs:
 *
 * - **Ids** are machine-generated (`crypto.randomUUID`), so nothing legitimate
 *   comes close to the cap and an over-long id is rejected outright.
 * - **Labels** are typed by a human into a `<textarea>` that has **no maxlength**
 *   (`canvas-node.tsx`), so an over-long label is *truncated, never rejected*.
 *   Rejecting would let one long label on one node fail the whole spec run for
 *   an otherwise legitimate canvas. Contrast `content` below, which safely
 *   rejects precisely because its producer (`use-ai-chat.ts`) already truncates
 *   to `AI_CHAT_MAX_LENGTH` client-side, so a real client can never exceed it.
 */
export const MAX_ID_LENGTH = 200;
export const MAX_LABEL_LENGTH = 500;

/** An id: machine-generated, so an over-long one is rejected rather than cut. */
const specIdSchema = z.string().min(1).max(MAX_ID_LENGTH);

/** A label: human-typed and uncapped at the source, so bound it by truncating. */
const specLabelSchema = z
  .string()
  .transform((label) => label.slice(0, MAX_LABEL_LENGTH));

/**
 * Every shape a canvas node can carry. Keyed by `CanvasNodeShape` so that adding
 * a seventh shape to the canvas **fails to compile here** instead of silently
 * degrading to `rectangle` in every spec. The import is **type-only** and so is
 * erased at build: this file is imported by the route (and the client), and
 * `@/types/canvas` pulls in `@xyflow/react` at runtime — exactly the kind of
 * bundle coupling this module exists to avoid.
 */
const CANVAS_SHAPE_KEYS: Record<CanvasNodeShape, true> = {
  rectangle: true,
  diamond: true,
  circle: true,
  pill: true,
  cylinder: true,
  hexagon: true,
};

const CANVAS_SHAPES = Object.keys(CANVAS_SHAPE_KEYS) as [
  CanvasNodeShape,
  ...CanvasNodeShape[],
];

/**
 * A shape: constrained to the six the canvas actually has, rather than to a
 * string length. The value is fed to the model as the node's *meaning* (a
 * cylinder is a database), so an arbitrary string is not merely large, it is
 * nonsense the model would try to interpret. Anything unrecognized falls back to
 * `rectangle` — the same coercion `resolveShape` already applies in the design
 * agent — so stale storage cannot fail an otherwise valid spec run.
 */
const specShapeSchema = z.enum(CANVAS_SHAPES).catch("rectangle");

/**
 * One turn of the sidebar conversation. Unknown keys are stripped, so a client
 * can post its `ai-chat` feed messages unchanged — the `sender` and `timestamp`
 * they also carry are dropped here, and only role + content reach the model.
 */
export const specChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(AI_CHAT_MAX_LENGTH),
});

/**
 * A canvas node, narrowed to the fields the spec model actually reasons about.
 * Zod strips the rest (styling, measured size, selection state), so the run
 * payload stays small and the model isn't fed noise.
 */
export const specNodeSchema = z.object({
  id: specIdSchema,
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  data: z
    .object({
      label: specLabelSchema.optional(),
      shape: specShapeSchema.optional(),
    })
    .optional(),
});

/** A canvas edge, narrowed the same way — its endpoints and its label. */
export const specEdgeSchema = z.object({
  id: specIdSchema,
  source: specIdSchema,
  target: specIdSchema,
  data: z
    .object({
      label: specLabelSchema.optional(),
    })
    .optional(),
});

/**
 * Body of `POST /api/ai/spec`.
 *
 * `projectId` is deliberately absent: the room id *is* the project id, and
 * access is resolved from the authenticated user + `roomId` server-side. A
 * client-supplied project id is never trusted.
 */
export const specRequestSchema = z.object({
  // Trimmed before the length check, so a whitespace-only id is rejected rather
  // than sent to the access check as a lookup that can never match — the same
  // semantics `normalizeId` gives the other AI routes.
  roomId: z.string().trim().min(1),
  chatHistory: z.array(specChatMessageSchema).max(MAX_CHAT_MESSAGES),
  nodes: z.array(specNodeSchema).max(MAX_NODES),
  edges: z.array(specEdgeSchema).max(MAX_EDGES),
});

/**
 * Payload handed to the `generate-spec` task: the validated request plus the
 * `projectId` the route resolved from the authenticated user's access.
 */
export const generateSpecPayloadSchema = specRequestSchema.extend({
  projectId: z.string().trim().min(1),
});

export type SpecChatMessage = z.infer<typeof specChatMessageSchema>;
export type SpecNode = z.infer<typeof specNodeSchema>;
export type SpecEdge = z.infer<typeof specEdgeSchema>;
export type SpecRequest = z.infer<typeof specRequestSchema>;
export type GenerateSpecPayload = z.infer<typeof generateSpecPayloadSchema>;
