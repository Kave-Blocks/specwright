import type { Edge, Node } from "@xyflow/react"

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
  /** Accent color for the node (any CSS color string). */
  color: string
  /** Shape the node is drawn as. */
  shape: CanvasNodeShape
}

/** A node fill / text color pair tuned for the dark canvas. */
export interface NodeColor {
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
  { fill: "#1F1F1F", text: "#EDEDED" }, // Neutral dark (default)
  { fill: "#10233D", text: "#52A8FF" }, // Blue
  { fill: "#2E1938", text: "#BF7AF0" }, // Purple
  { fill: "#331B00", text: "#FF990A" }, // Orange
  { fill: "#3C1618", text: "#FF6166" }, // Red
  { fill: "#3A1726", text: "#F75F8F" }, // Pink
  { fill: "#0F2E18", text: "#62C073" }, // Green
  { fill: "#062822", text: "#0AC7B4" }, // Teal
] as const

/** Fill applied to a node when none is chosen. */
export const DEFAULT_NODE_COLOR = NODE_COLORS[0].fill

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

/** A node on the collaborative canvas. */
export type CanvasNode = Node<CanvasNodeData, typeof CANVAS_NODE_TYPE>

/** An edge on the collaborative canvas. */
export type CanvasEdge = Edge<Record<string, unknown>, typeof CANVAS_EDGE_TYPE>
