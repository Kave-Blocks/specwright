import { MarkerType } from "@xyflow/react"
import type { DefaultEdgeOptions, Edge, Node } from "@xyflow/react"

/** Visual shape a canvas node can be rendered as. */
export type CanvasNodeShape =
  | "rectangle"
  | "diamond"
  | "circle"
  | "pill"
  | "cylinder"
  | "hexagon"

/** Data carried by every node on the collaborative canvas. */
export type CanvasNodeData = {
  /** Text shown inside the node. */
  label: string
  /** Background fill color for the node (any CSS color string). */
  color: string
  /** Label color, paired with `color` (see `NODE_COLORS`). */
  textColor: string
  /** Shape the node is drawn as. */
  shape: CanvasNodeShape
}

/** A node fill / text color pair tuned for the dark canvas. */
export interface NodeColor {
  /** Human-readable name, used for accessible labels. */
  name: string
  /** Node background fill. */
  fill: string
  /** Contrasting label color. */
  text: string
}

/**
 * The 8 canvas node colors (see `context/ui-context.md`). The first entry is
 * the default applied to newly created nodes.
 */
export const NODE_COLORS: readonly NodeColor[] = [
  { name: "Neutral", fill: "#1F1F1F", text: "#EDEDED" }, // default
  { name: "Blue", fill: "#10233D", text: "#52A8FF" },
  { name: "Purple", fill: "#2E1938", text: "#BF7AF0" },
  { name: "Orange", fill: "#331B00", text: "#FF990A" },
  { name: "Red", fill: "#3C1618", text: "#FF6166" },
  { name: "Pink", fill: "#3A1726", text: "#F75F8F" },
  { name: "Green", fill: "#0F2E18", text: "#62C073" },
  { name: "Teal", fill: "#062822", text: "#0AC7B4" },
] as const

/** Fill applied to a node when none is chosen. */
export const DEFAULT_NODE_COLOR = NODE_COLORS[0].fill

/** Label color applied to a node when none is chosen (pairs with the default fill). */
export const DEFAULT_NODE_TEXT_COLOR = NODE_COLORS[0].text

/** Pixel footprint a node occupies on the canvas. */
export interface NodeSize {
  width: number
  height: number
}

/** A selectable shape in the bottom shape panel, with its default footprint. */
export interface NodeShapeDefinition {
  shape: CanvasNodeShape
  /** Human-readable name, used for tooltips / accessibility. */
  label: string
  /** Size a freshly dropped node of this shape is created at. */
  defaultSize: NodeSize
}

/**
 * The 6 supported node shapes and the sensible default size each is dropped at
 * — rectangles/pills are wider than tall, circles are square, and diamonds are
 * a touch larger so their labels have room.
 */
export const NODE_SHAPES: readonly NodeShapeDefinition[] = [
  { shape: "rectangle", label: "Rectangle", defaultSize: { width: 160, height: 80 } },
  { shape: "diamond", label: "Diamond", defaultSize: { width: 180, height: 110 } },
  { shape: "circle", label: "Circle", defaultSize: { width: 110, height: 110 } },
  { shape: "pill", label: "Pill", defaultSize: { width: 160, height: 64 } },
  { shape: "cylinder", label: "Cylinder", defaultSize: { width: 130, height: 120 } },
  { shape: "hexagon", label: "Hexagon", defaultSize: { width: 150, height: 100 } },
] as const

/**
 * Shape definitions keyed by shape name, so a shape *tool* — which carries only
 * the name — can resolve the footprint to place at. Derived from `NODE_SHAPES`
 * so the sizes above stay the single source of truth.
 */
export const NODE_SHAPE_BY_NAME = Object.fromEntries(
  NODE_SHAPES.map((definition) => [definition.shape, definition])
) as Record<CanvasNodeShape, NodeShapeDefinition>

/** A canvas tool that owns the cursor without creating anything. */
export type CanvasCursorTool = "select" | "hand"

/** The two cursor tools, in toolbar order, ahead of the six shape tools. */
export const CANVAS_CURSOR_TOOLS: readonly CanvasCursorTool[] = [
  "select",
  "hand",
] as const

/**
 * The canvas tool mode. Exactly one tool is active at all times — there is no
 * "no tool" state — and the active tool owns the cursor and decides what a click
 * and a drag on the canvas mean.
 */
export type CanvasTool = CanvasCursorTool | CanvasNodeShape

/** Tool the canvas loads in, and returns to after a shape is placed. */
export const DEFAULT_CANVAS_TOOL: CanvasTool = "select"

const SHAPE_TOOLS = new Set<CanvasTool>(NODE_SHAPES.map(({ shape }) => shape))

/** True when the active tool places a node of that shape on the next canvas click. */
export function isShapeTool(tool: CanvasTool): tool is CanvasNodeShape {
  return SHAPE_TOOLS.has(tool)
}

/** `dataTransfer` payload carried while dragging a shape onto the canvas. */
export interface ShapeDragPayload {
  shape: CanvasNodeShape
  size: NodeSize
}

/** `dataTransfer` type used for the shape drag-and-drop payload. */
export const SHAPE_DRAG_MIME = "application/ghost-shape"

/** Custom node type name registered with React Flow. */
export const CANVAS_NODE_TYPE = "canvasNode" as const

/** Custom edge type name registered with React Flow. */
export const CANVAS_EDGE_TYPE = "canvasEdge" as const

/**
 * Default edge stroke / arrow color (see `context/ui-context.md` → Edge Style).
 * A raw color string because React Flow edge/marker props can't consume Tailwind
 * tokens — the same boundary exception already used for the Background/MiniMap.
 */
export const CANVAS_EDGE_COLOR = "#f8fafc"

/** Data carried by every edge on the collaborative canvas. */
export type CanvasEdgeData = {
  /** Inline label shown as a pill along the edge (empty when unlabeled). */
  label?: string
}

/** A node on the collaborative canvas. */
export type CanvasNode = Node<CanvasNodeData, typeof CANVAS_NODE_TYPE>

/** An edge on the collaborative canvas. */
export type CanvasEdge = Edge<CanvasEdgeData, typeof CANVAS_EDGE_TYPE>

/**
 * A serializable snapshot of the whole canvas graph. This is the exact JSON
 * shape persisted to Vercel Blob and loaded back into the room — Prisma only
 * stores the blob URL, never this content.
 */
export interface CanvasSnapshot {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

/** Lifecycle of a debounced canvas autosave, surfaced in the navbar indicator. */
export type CanvasSaveStatus = "idle" | "saving" | "saved" | "error"

/**
 * Style applied to every new connection: the custom canvas edge renderer, a
 * closed arrowhead at the end, and a light, thin stroke with rounded ends.
 * `onConnect` merges these onto the connection (Liveblocks' own `onConnect` does
 * not apply React Flow's `defaultEdgeOptions`, so the edge is built explicitly).
 */
export const DEFAULT_EDGE_OPTIONS: DefaultEdgeOptions = {
  type: CANVAS_EDGE_TYPE,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
    color: CANVAS_EDGE_COLOR,
  },
  style: {
    stroke: CANVAS_EDGE_COLOR,
    strokeWidth: 1.5,
    strokeLinecap: "round",
  },
}
