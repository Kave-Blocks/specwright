import {
  CANVAS_EDGE_TYPE,
  CANVAS_NODE_TYPE,
  DEFAULT_EDGE_OPTIONS,
  NODE_COLORS,
  NODE_SHAPES,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeShape,
  type NodeSize,
} from "@/types/canvas"

/**
 * A prebuilt starter diagram a user can import into the canvas. Templates are
 * static canvas snapshots that follow the same node/edge schema as user-created
 * content (see `architecture-context.md` → Starter System Designs), so they can
 * be dropped straight into the collaborative room.
 */
export interface CanvasTemplate {
  /** Stable identifier the template is resolved by at import time. */
  id: string
  /** Display name shown on the template card. */
  name: string
  /** One-line summary of the system the template describes. */
  description: string
  /** Nodes that make up the diagram, using the shared canvas node schema. */
  nodes: CanvasNode[]
  /** Edges connecting the diagram's nodes, using the shared canvas edge schema. */
  edges: CanvasEdge[]
}

/**
 * The node color palette (`NODE_COLORS`) addressed by readable names so the
 * template data below reads as intent ("blue", "teal") rather than indices.
 */
const PALETTE = {
  neutral: NODE_COLORS[0],
  blue: NODE_COLORS[1],
  purple: NODE_COLORS[2],
  orange: NODE_COLORS[3],
  red: NODE_COLORS[4],
  pink: NODE_COLORS[5],
  green: NODE_COLORS[6],
  teal: NODE_COLORS[7],
} as const

type PaletteName = keyof typeof PALETTE

/** Default footprint per shape, reused so template nodes stay well-proportioned. */
const SHAPE_SIZES = new Map<CanvasNodeShape, NodeSize>(
  NODE_SHAPES.map((definition) => [definition.shape, definition.defaultSize])
)

/** Which side of a node an edge attaches to (matches the node handle ids). */
type HandleSide = "top" | "right" | "bottom" | "left"

interface NodeSpec {
  id: string
  label: string
  shape: CanvasNodeShape
  color: PaletteName
  x: number
  y: number
}

/** Build a canvas node from a terse spec, applying the shape's default size. */
function node(spec: NodeSpec): CanvasNode {
  const pair = PALETTE[spec.color]
  const size = SHAPE_SIZES.get(spec.shape) ?? { width: 160, height: 80 }
  return {
    id: spec.id,
    type: CANVAS_NODE_TYPE,
    position: { x: spec.x, y: spec.y },
    style: { width: size.width, height: size.height },
    data: {
      label: spec.label,
      color: pair.fill,
      textColor: pair.text,
      shape: spec.shape,
    },
  }
}

interface EdgeSpec {
  source: string
  target: string
  label?: string
  /** Handle the edge leaves the source from (defaults to the right side). */
  from?: HandleSide
  /** Handle the edge enters the target on (defaults to the left side). */
  to?: HandleSide
}

/**
 * Build a canvas edge from a terse spec, applying the shared default edge
 * options (custom edge type, arrowhead, light stroke) so template edges render
 * identically to user-drawn ones.
 */
function edge(spec: EdgeSpec): CanvasEdge {
  return {
    ...DEFAULT_EDGE_OPTIONS,
    id: `${spec.source}--${spec.target}`,
    type: CANVAS_EDGE_TYPE,
    source: spec.source,
    target: spec.target,
    sourceHandle: spec.from ?? "right",
    targetHandle: spec.to ?? "left",
    data: { label: spec.label ?? "" },
  }
}

/** Microservices architecture: a gateway fanning out to independent services. */
const microservices: CanvasTemplate = {
  id: "microservices",
  name: "Microservices",
  description:
    "An API gateway routes client traffic to independent services, each owning its own database.",
  nodes: [
    node({ id: "ms-client", label: "Client", shape: "rectangle", color: "blue", x: 0, y: 200 }),
    node({ id: "ms-gateway", label: "API Gateway", shape: "hexagon", color: "teal", x: 280, y: 200 }),
    node({ id: "ms-auth", label: "Auth Service", shape: "pill", color: "purple", x: 580, y: 40 }),
    node({ id: "ms-users", label: "Users Service", shape: "pill", color: "green", x: 580, y: 200 }),
    node({ id: "ms-orders", label: "Orders Service", shape: "pill", color: "orange", x: 580, y: 360 }),
    node({ id: "ms-users-db", label: "Users DB", shape: "cylinder", color: "green", x: 860, y: 200 }),
    node({ id: "ms-orders-db", label: "Orders DB", shape: "cylinder", color: "orange", x: 860, y: 360 }),
  ],
  edges: [
    edge({ source: "ms-client", target: "ms-gateway" }),
    edge({ source: "ms-gateway", target: "ms-auth" }),
    edge({ source: "ms-gateway", target: "ms-users" }),
    edge({ source: "ms-gateway", target: "ms-orders" }),
    edge({ source: "ms-users", target: "ms-users-db" }),
    edge({ source: "ms-orders", target: "ms-orders-db" }),
  ],
}

/** CI/CD pipeline: a linear build-to-release flow with an approval gate. */
const cicdPipeline: CanvasTemplate = {
  id: "cicd-pipeline",
  name: "CI/CD Pipeline",
  description:
    "Commits flow through build, test, and staging to an approval gate that promotes to production or rolls back.",
  nodes: [
    node({ id: "cd-commit", label: "Commit", shape: "circle", color: "blue", x: 0, y: 140 }),
    node({ id: "cd-build", label: "Build", shape: "rectangle", color: "teal", x: 240, y: 140 }),
    node({ id: "cd-test", label: "Test", shape: "rectangle", color: "purple", x: 480, y: 140 }),
    node({ id: "cd-staging", label: "Deploy Staging", shape: "rectangle", color: "orange", x: 720, y: 140 }),
    node({ id: "cd-approval", label: "Approve?", shape: "diamond", color: "pink", x: 980, y: 130 }),
    node({ id: "cd-prod", label: "Production", shape: "rectangle", color: "green", x: 1280, y: 140 }),
    node({ id: "cd-rollback", label: "Rollback", shape: "rectangle", color: "red", x: 980, y: 360 }),
  ],
  edges: [
    edge({ source: "cd-commit", target: "cd-build" }),
    edge({ source: "cd-build", target: "cd-test" }),
    edge({ source: "cd-test", target: "cd-staging" }),
    edge({ source: "cd-staging", target: "cd-approval" }),
    edge({ source: "cd-approval", target: "cd-prod", label: "Pass" }),
    edge({ source: "cd-approval", target: "cd-rollback", label: "Fail", from: "bottom", to: "top" }),
  ],
}

/** Event-driven system: a broker fanning events out to decoupled consumers. */
const eventDriven: CanvasTemplate = {
  id: "event-driven",
  name: "Event-Driven System",
  description:
    "An ingest API publishes to an event broker that fans events out to decoupled consumers and their stores.",
  nodes: [
    node({ id: "ev-api", label: "Ingest API", shape: "rectangle", color: "blue", x: 0, y: 220 }),
    node({ id: "ev-broker", label: "Event Broker", shape: "hexagon", color: "purple", x: 280, y: 220 }),
    node({ id: "ev-orders", label: "Order Service", shape: "pill", color: "orange", x: 580, y: 40 }),
    node({ id: "ev-email", label: "Email Service", shape: "pill", color: "green", x: 580, y: 220 }),
    node({ id: "ev-analytics", label: "Analytics Service", shape: "pill", color: "teal", x: 580, y: 400 }),
    node({ id: "ev-orders-db", label: "Orders DB", shape: "cylinder", color: "orange", x: 860, y: 40 }),
    node({ id: "ev-warehouse", label: "Data Warehouse", shape: "cylinder", color: "teal", x: 860, y: 400 }),
  ],
  edges: [
    edge({ source: "ev-api", target: "ev-broker", label: "publish" }),
    edge({ source: "ev-broker", target: "ev-orders", label: "subscribe" }),
    edge({ source: "ev-broker", target: "ev-email" }),
    edge({ source: "ev-broker", target: "ev-analytics" }),
    edge({ source: "ev-orders", target: "ev-orders-db" }),
    edge({ source: "ev-analytics", target: "ev-warehouse" }),
  ],
}

/** The starter template library, in the order they appear in the import modal. */
export const CANVAS_TEMPLATES: readonly CanvasTemplate[] = [
  microservices,
  cicdPipeline,
  eventDriven,
]

/**
 * Deep-clone a template's graph so importing never mutates the shared template
 * constants (Liveblocks and React Flow take ownership of the objects handed to
 * them). Fresh `position`/`data` objects mean re-importing a template always
 * restores its original layout.
 */
export function cloneTemplateGraph(template: CanvasTemplate): {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
} {
  return {
    nodes: template.nodes.map((current) => ({
      ...current,
      position: { ...current.position },
      style: { ...current.style },
      data: { ...current.data },
    })),
    edges: template.edges.map((current) => ({
      ...current,
      data: { ...current.data },
    })),
  }
}
