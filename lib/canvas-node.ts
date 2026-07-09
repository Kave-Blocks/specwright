import {
  CANVAS_NODE_TYPE,
  DEFAULT_NODE_COLOR,
  type CanvasNode,
  type CanvasNodeShape,
  type NodeSize,
} from "@/types/canvas"

/** Monotonic counter so nodes created within the same millisecond stay unique. */
let nodeCounter = 0

/** Build a unique node id from the shape name, a timestamp, and a counter. */
export function generateNodeId(shape: CanvasNodeShape): string {
  nodeCounter += 1
  return `${shape}-${Date.now()}-${nodeCounter}`
}

/** Where a new node should be placed, in canvas (flow) coordinates. */
export interface CanvasPosition {
  x: number
  y: number
}

/**
 * Create a new canvas node at the given position: an empty label, the default
 * node color, the dragged shape, and the shape's default footprint.
 */
export function createCanvasNode(
  shape: CanvasNodeShape,
  size: NodeSize,
  position: CanvasPosition
): CanvasNode {
  return {
    id: generateNodeId(shape),
    type: CANVAS_NODE_TYPE,
    position,
    style: { width: size.width, height: size.height },
    data: { label: "", color: DEFAULT_NODE_COLOR, shape },
  }
}
