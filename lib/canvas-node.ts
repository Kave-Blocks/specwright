import {
  CANVAS_NODE_TYPE,
  DEFAULT_NODE_COLOR,
  DEFAULT_NODE_TEXT_COLOR,
  type CanvasNode,
  type CanvasNodeShape,
  type NodeSize,
} from "@/types/canvas"

/** Build a globally-unique node id, safe across collaborating clients. */
export function generateNodeId(shape: CanvasNodeShape): string {
  return `${shape}-${crypto.randomUUID()}`
}

/** Where a new node should be placed, in canvas (flow) coordinates. */
export interface CanvasPosition {
  x: number
  y: number
}

/**
 * Create a new canvas node at the given position: an empty label, the default
 * node color pair, the dragged shape, and the shape's default footprint.
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
    data: {
      label: "",
      color: DEFAULT_NODE_COLOR,
      textColor: DEFAULT_NODE_TEXT_COLOR,
      shape,
    },
  }
}
