import type { MutableFlow } from "@liveblocks/react-flow/node";

import {
  CANVAS_EDGE_TYPE,
  CANVAS_NODE_TYPE,
  DEFAULT_EDGE_OPTIONS,
  NODE_SHAPES,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeShape,
  type NodeSize,
} from "@/types/canvas";

import {
  resolveColor,
  resolveShape,
  type DesignOperation,
  type DesignPlan,
} from "./plan";

/** Horizontal gap between auto-placed layers (matches the layout guidance). */
const AUTO_COLUMN = 280;
/** Vertical gap between auto-placed rows. */
const AUTO_ROW = 160;
/** Auto-placement wraps to a new column after this many rows. */
const AUTO_ROWS = 4;
/** Smallest width/height a resize may set, so nodes never collapse. */
const MIN_SIZE = 40;

/** Default footprint per shape, reused so generated nodes stay well-proportioned. */
const SHAPE_SIZE = new Map<CanvasNodeShape, NodeSize>(
  NODE_SHAPES.map((definition) => [definition.shape, definition.defaultSize]),
);

/** Tally of what an applied plan actually changed, for logging and status. */
export interface AppliedSummary {
  nodesAdded: number;
  nodesUpdated: number;
  nodesRemoved: number;
  edgesAdded: number;
  edgesRemoved: number;
  skipped: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Resolve a node position, falling back to a tidy grid when coords are absent. */
function resolvePosition(
  op: DesignOperation,
  autoIndex: number,
): { x: number; y: number } {
  if (isFiniteNumber(op.x) && isFiniteNumber(op.y)) {
    return { x: op.x, y: op.y };
  }
  const column = Math.floor(autoIndex / AUTO_ROWS);
  const row = autoIndex % AUTO_ROWS;
  return { x: column * AUTO_COLUMN, y: row * AUTO_ROW };
}

/** Build a full canvas node from an `addNode` operation. */
function buildNode(op: DesignOperation, autoIndex: number): CanvasNode {
  const shape = resolveShape(op.shape);
  const pair = resolveColor(op.color);
  const size = SHAPE_SIZE.get(shape) ?? { width: 160, height: 80 };

  return {
    id: op.id,
    type: CANVAS_NODE_TYPE,
    position: resolvePosition(op, autoIndex),
    style: { width: size.width, height: size.height },
    data: {
      label: op.label ?? "",
      color: pair.fill,
      textColor: pair.text,
      shape,
    },
  };
}

/** Build a full canvas edge from an `addEdge` operation (source/target verified). */
function buildEdge(op: DesignOperation, id: string): CanvasEdge {
  return {
    ...DEFAULT_EDGE_OPTIONS,
    id,
    type: CANVAS_EDGE_TYPE,
    source: op.source as string,
    target: op.target as string,
    sourceHandle: op.from ?? "right",
    targetHandle: op.to ?? "left",
    data: { label: op.label ?? "" },
  };
}

/**
 * Apply a {@link DesignPlan} to an open collaborative flow, operation by
 * operation, enforcing the canvas rules along the way: shapes and colors are
 * coerced to the allowed palette, invalid or dangling operations are skipped
 * (an edge to a missing node, an update to an unknown id), and deleting a node
 * also removes its connected edges. Operations apply in order, so an edge may
 * reference a node added earlier in the same plan.
 */
export function applyDesignPlan(
  flow: MutableFlow<CanvasNode, CanvasEdge>,
  plan: DesignPlan,
): AppliedSummary {
  // Model output is not validated against the schema at runtime (strict JSON
  // mode is off), so a malformed plan can reach here. Fail with a clear message
  // instead of a cryptic "not iterable" — the caller retries, which regenerates.
  if (!Array.isArray(plan?.operations)) {
    throw new Error("Design plan is missing a valid `operations` array");
  }

  const summary: AppliedSummary = {
    nodesAdded: 0,
    nodesUpdated: 0,
    nodesRemoved: 0,
    edgesAdded: 0,
    edgesRemoved: 0,
    skipped: 0,
  };

  let autoIndex = 0;

  for (const op of plan.operations) {
    if (!op || typeof op.id !== "string" || op.id.length === 0) {
      summary.skipped += 1;
      continue;
    }

    switch (op.op) {
      case "addNode": {
        // Replacing an existing id is allowed (upsert), but keep the auto-grid
        // index advancing only for genuinely new placements.
        flow.addNode(buildNode(op, autoIndex));
        autoIndex += 1;
        summary.nodesAdded += 1;
        break;
      }

      case "updateNode": {
        if (!flow.getNode(op.id)) {
          summary.skipped += 1;
          break;
        }
        const patch: Partial<CanvasNodeData> = {};
        if (typeof op.label === "string") patch.label = op.label;
        if (op.shape) patch.shape = resolveShape(op.shape);
        if (op.color) {
          const pair = resolveColor(op.color);
          patch.color = pair.fill;
          patch.textColor = pair.text;
        }
        flow.updateNodeData(op.id, patch);
        summary.nodesUpdated += 1;
        break;
      }

      case "moveNode": {
        if (!flow.getNode(op.id) || !isFiniteNumber(op.x) || !isFiniteNumber(op.y)) {
          summary.skipped += 1;
          break;
        }
        flow.updateNode(op.id, { position: { x: op.x, y: op.y } });
        summary.nodesUpdated += 1;
        break;
      }

      case "resizeNode": {
        if (
          !flow.getNode(op.id) ||
          !isFiniteNumber(op.width) ||
          !isFiniteNumber(op.height)
        ) {
          summary.skipped += 1;
          break;
        }
        const width = Math.max(MIN_SIZE, op.width);
        const height = Math.max(MIN_SIZE, op.height);
        flow.updateNode(op.id, (node) => ({
          ...node,
          style: { ...node.style, width, height },
        }));
        summary.nodesUpdated += 1;
        break;
      }

      case "deleteNode": {
        if (!flow.getNode(op.id)) {
          summary.skipped += 1;
          break;
        }
        // Remove edges touching the node first so no dangling edge is left in
        // Storage (mirrors the client-side delete behavior).
        const attached = flow.edges.filter(
          (edge) => edge.source === op.id || edge.target === op.id,
        );
        for (const edge of attached) {
          flow.removeEdge(edge.id);
          summary.edgesRemoved += 1;
        }
        flow.removeNode(op.id);
        summary.nodesRemoved += 1;
        break;
      }

      case "addEdge": {
        const id = op.id;
        if (
          typeof op.source !== "string" ||
          typeof op.target !== "string" ||
          !flow.getNode(op.source) ||
          !flow.getNode(op.target)
        ) {
          summary.skipped += 1;
          break;
        }
        flow.addEdge(buildEdge(op, id));
        summary.edgesAdded += 1;
        break;
      }

      case "deleteEdge": {
        if (!flow.getEdge(op.id)) {
          summary.skipped += 1;
          break;
        }
        flow.removeEdge(op.id);
        summary.edgesRemoved += 1;
        break;
      }

      default: {
        summary.skipped += 1;
        break;
      }
    }
  }

  return summary;
}
