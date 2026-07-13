import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, jsonSchema } from "ai";

import {
  NODE_COLORS,
  NODE_SHAPES,
  type CanvasNodeShape,
  type CanvasSnapshot,
  type NodeColor,
} from "@/types/canvas";

/**
 * The OpenAI model used to interpret a design prompt. A fast, structured-output
 * capable model — kept as a single constant so it is easy to bump.
 */
export const DESIGN_MODEL = "gpt-4o-mini";

/** Palette names the AI may reference, derived from the shared `NODE_COLORS`. */
export type PaletteName =
  | "neutral"
  | "blue"
  | "purple"
  | "orange"
  | "red"
  | "pink"
  | "green"
  | "teal";

/** Side of a node an edge attaches to (matches the node handle ids). */
export type HandleSide = "top" | "right" | "bottom" | "left";

/** Canvas mutation verbs the design agent can emit. */
export type DesignOperationName =
  | "addNode"
  | "updateNode"
  | "moveNode"
  | "resizeNode"
  | "deleteNode"
  | "addEdge"
  | "deleteEdge";

/**
 * A single canvas operation. Deliberately a flat object (not a discriminated
 * union) so it maps cleanly onto a provider structured-output schema. Only
 * `op` + `id` are always required; the remaining fields are validated
 * per-operation when the plan is applied.
 */
export interface DesignOperation {
  op: DesignOperationName;
  /** Stable id of the node or edge this operation targets. */
  id: string;
  label?: string;
  shape?: CanvasNodeShape;
  color?: PaletteName;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  source?: string;
  target?: string;
  from?: HandleSide;
  to?: HandleSide;
}

/** The full plan the model returns: a summary plus an ordered list of operations. */
export interface DesignPlan {
  summary: string;
  operations: DesignOperation[];
}

/** Map a palette name (case-insensitive) to its fill/text pair, or `null`. */
const PALETTE = new Map<string, NodeColor>(
  NODE_COLORS.map((color) => [color.name.toLowerCase(), color]),
);

/** Every valid shape name, for schema enums and validation. */
export const SHAPE_NAMES: readonly CanvasNodeShape[] = NODE_SHAPES.map(
  (definition) => definition.shape,
);

/** Every valid palette name, for schema enums and validation. */
export const PALETTE_NAMES: readonly PaletteName[] = NODE_COLORS.map(
  (color) => color.name.toLowerCase() as PaletteName,
);

const HANDLE_SIDES: readonly HandleSide[] = ["top", "right", "bottom", "left"];

const OPERATION_NAMES: readonly DesignOperationName[] = [
  "addNode",
  "updateNode",
  "moveNode",
  "resizeNode",
  "deleteNode",
  "addEdge",
  "deleteEdge",
];

/** Resolve a palette name to its fill/text pair, defaulting to the neutral pair. */
export function resolveColor(name: string | undefined): NodeColor {
  if (name) {
    const pair = PALETTE.get(name.toLowerCase());
    if (pair) return pair;
  }
  return NODE_COLORS[0];
}

/** Coerce a value to a supported shape, defaulting to `rectangle`. */
export function resolveShape(shape: string | undefined): CanvasNodeShape {
  return SHAPE_NAMES.includes(shape as CanvasNodeShape)
    ? (shape as CanvasNodeShape)
    : "rectangle";
}

/**
 * JSON schema handed to the model. Structured output shapes the response into a
 * {@link DesignPlan}; per-operation field requirements are still validated when
 * applying, since the schema only marks `op`/`id` required (strict JSON-schema
 * mode is disabled at call time so the optional fields are permitted).
 */
const designPlanSchema = jsonSchema<DesignPlan>({
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "One short sentence describing the system that was designed.",
    },
    operations: {
      type: "array",
      description: "Ordered canvas operations to apply.",
      items: {
        type: "object",
        properties: {
          op: {
            type: "string",
            enum: [...OPERATION_NAMES],
            description: "The canvas operation to perform.",
          },
          id: {
            type: "string",
            description:
              "Stable, unique id of the node or edge this operation targets.",
          },
          label: { type: "string", description: "Text shown on the node/edge." },
          shape: { type: "string", enum: [...SHAPE_NAMES] },
          color: { type: "string", enum: [...PALETTE_NAMES] },
          x: { type: "number", description: "Node x position, canvas units." },
          y: { type: "number", description: "Node y position, canvas units." },
          width: { type: "number" },
          height: { type: "number" },
          source: { type: "string", description: "Edge source node id." },
          target: { type: "string", description: "Edge target node id." },
          from: { type: "string", enum: [...HANDLE_SIDES] },
          to: { type: "string", enum: [...HANDLE_SIDES] },
        },
        required: ["op", "id"],
      },
    },
  },
  required: ["summary", "operations"],
});

/** System prompt: encodes the canvas' shapes, palette, and layout rules. */
function buildSystemPrompt(): string {
  return [
    "You are Ghost AI, an expert software architect. You translate a natural-language request into a system-design diagram on a shared canvas by emitting a list of canvas operations.",
    "",
    "NODE SHAPES (use the semantically correct shape):",
    "- rectangle — general-purpose component or process",
    "- pill — a service or long-running process",
    "- cylinder — a database or storage",
    "- diamond — a decision or gateway",
    "- circle — an event or start/end endpoint",
    "- hexagon — an external system or trust boundary",
    "",
    `COLORS (pick a palette name; group related nodes by color): ${PALETTE_NAMES.join(", ")}. Default is "neutral".`,
    "",
    "LAYOUT RULES:",
    "- Lay the diagram out left-to-right in layers. Data/requests flow rightward.",
    "- Start the first layer at x = 0. Put each successive layer ~280 units further right (x = 0, 280, 560, 840, ...).",
    "- Within a layer, stack nodes vertically ~160 units apart (y = 0, 160, 320, ...); center a layer's nodes around y = 200.",
    "- Never overlap nodes. Keep the whole diagram readable and uncluttered.",
    "- Do not set width/height on addNode — each shape has a sensible default size. Only use resizeNode to deliberately change a node's size.",
    "",
    "EDGES:",
    "- addEdge connects two node ids (source -> target). By default an edge leaves the source's right side and enters the target's left side; override with from/to only when routing vertically (e.g. from:'bottom', to:'top').",
    "- Every edge's source and target must be a node id that already exists on the canvas or that you add in this same plan.",
    "- ALWAYS set a label on every edge. It is what the arrow means, and an unlabeled diagram is not useful. Use a short verb phrase (1-3 words) describing what flows from source to target — e.g. 'routes to', 'authenticates', 'reads', 'writes', 'queries', 'caches', 'publishes to', 'consumes'.",
    "",
    "OPERATIONS:",
    "- addNode: id, label, shape, color, x, y.",
    "- updateNode: id + any of label/shape/color to change an existing node.",
    "- moveNode: id, x, y.",
    "- resizeNode: id, width, height.",
    "- deleteNode: id (its connected edges are removed automatically).",
    "- addEdge: id, source, target, label (always) + optional from/to.",
    "- deleteEdge: id.",
    "",
    "GUIDELINES:",
    "- If the canvas is empty, design the full architecture from scratch (typically 5-12 nodes).",
    "- If the canvas already has content, extend or refine it — reuse existing node ids, and only add/move/update/delete what the request calls for.",
    "- Give every new node/edge a unique, stable, human-readable id (e.g. 'api-gateway', 'api-gateway->users').",
    "- Keep labels short (1-3 words).",
    "- Return only the operations needed; do not restate unchanged nodes.",
  ].join("\n");
}

/** User prompt: the request plus a compact view of the current canvas. */
function buildUserPrompt(prompt: string, current: CanvasSnapshot): string {
  const nodes = current.nodes.map((node) => ({
    id: node.id,
    label: node.data.label,
    shape: node.data.shape,
    x: Math.round(node.position.x),
    y: Math.round(node.position.y),
  }));
  const edges = current.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.data?.label ?? "",
  }));

  return [
    `Request: ${prompt}`,
    "",
    "Current canvas state (JSON):",
    JSON.stringify({ nodes, edges }),
  ].join("\n");
}

/**
 * Interpret a design prompt with OpenAI, returning a validated {@link DesignPlan}.
 * The current canvas state is included so the model can extend an existing
 * diagram rather than only starting fresh. Throws when `OPENAI_API_KEY` is
 * missing or the model call fails.
 */
export async function generateDesignPlan(params: {
  prompt: string;
  current: CanvasSnapshot;
}): Promise<DesignPlan> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const openai = createOpenAI({ apiKey });

  const { object } = await generateObject({
    model: openai(DESIGN_MODEL),
    schema: designPlanSchema,
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(params.prompt, params.current),
    // The schema marks most operation fields optional; strict mode requires
    // every property in `required`, so disable it and lean on the defensive
    // validation in `applyDesignPlan`.
    providerOptions: { openai: { strictJsonSchema: false } },
  });

  return object;
}
