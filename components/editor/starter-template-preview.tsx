import type { CanvasNode } from "@/types/canvas"

import type { CanvasTemplate } from "./starter-templates"

/** Flow-unit breathing room drawn around the graph inside the preview viewport. */
const VIEW_PADDING = 40

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Read a node's footprint (position + size) in canvas coordinates. */
function nodeBox(node: CanvasNode): Box {
  const width = Number(node.style?.width) || 160
  const height = Number(node.style?.height) || 80
  return { x: node.position.x, y: node.position.y, width, height }
}

/** Bounding box of every node, padded — used as the SVG `viewBox` so the graph fits. */
function graphViewBox(nodes: CanvasNode[]): Box {
  const boxes = nodes.map(nodeBox)
  const minX = Math.min(...boxes.map((box) => box.x))
  const minY = Math.min(...boxes.map((box) => box.y))
  const maxX = Math.max(...boxes.map((box) => box.x + box.width))
  const maxY = Math.max(...boxes.map((box) => box.y + box.height))
  return {
    x: minX - VIEW_PADDING,
    y: minY - VIEW_PADDING,
    width: maxX - minX + VIEW_PADDING * 2,
    height: maxY - minY + VIEW_PADDING * 2,
  }
}

/**
 * A lightweight, static preview of a template's diagram — no React Flow instance.
 * The template's node positions define the viewBox, so the whole graph is scaled
 * to fit the fixed-size viewport. Edges are drawn as simple lines between node
 * centers; nodes are drawn with their own shape and color data. Strokes use
 * `non-scaling-stroke` so they stay crisp regardless of the fit scale.
 */
export function StarterTemplatePreview({ template }: { template: CanvasTemplate }) {
  const { nodes, edges } = template
  if (nodes.length === 0) return null

  const view = graphViewBox(nodes)
  const centers = new Map(
    nodes.map((node) => {
      const box = nodeBox(node)
      return [node.id, { x: box.x + box.width / 2, y: box.y + box.height / 2 }]
    })
  )

  return (
    <svg
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-32 w-full"
      role="img"
      aria-label={`${template.name} diagram preview`}
    >
      {/* Edges first so nodes render on top of the center-to-center lines. */}
      <g fill="none" style={{ stroke: "var(--border-subtle)" }}>
        {edges.map((edge) => {
          const from = centers.get(edge.source)
          const to = centers.get(edge.target)
          if (!from || !to) return null
          return (
            <line
              key={edge.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
      </g>
      <g>
        {nodes.map((node) => (
          <PreviewShape key={node.id} node={node} />
        ))}
      </g>
    </svg>
  )
}

/** Draw a single node in the preview using its shape and color pair. */
function PreviewShape({ node }: { node: CanvasNode }) {
  const { x, y, width, height } = nodeBox(node)
  const { color, textColor, shape } = node.data
  const stroke = {
    fill: color,
    stroke: textColor,
    strokeWidth: 1.5,
    vectorEffect: "non-scaling-stroke" as const,
  }

  switch (shape) {
    case "pill":
      return <rect x={x} y={y} width={width} height={height} rx={height / 2} {...stroke} />
    case "circle":
      return (
        <ellipse
          cx={x + width / 2}
          cy={y + height / 2}
          rx={width / 2}
          ry={height / 2}
          {...stroke}
        />
      )
    case "diamond":
      return (
        <polygon
          points={`${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`}
          {...stroke}
        />
      )
    case "hexagon": {
      const inset = width * 0.22
      return (
        <polygon
          points={`${x + inset},${y} ${x + width - inset},${y} ${x + width},${y + height / 2} ${x + width - inset},${y + height} ${x + inset},${y + height} ${x},${y + height / 2}`}
          {...stroke}
        />
      )
    }
    case "cylinder": {
      const rimRy = Math.min(height * 0.14, 16)
      const bottomY = y + height - rimRy
      const body = `M ${x},${y + rimRy} L ${x},${bottomY} A ${width / 2},${rimRy} 0 0 0 ${x + width},${bottomY} L ${x + width},${y + rimRy}`
      return (
        <g>
          <path d={body} {...stroke} />
          <ellipse cx={x + width / 2} cy={y + rimRy} rx={width / 2} ry={rimRy} {...stroke} />
        </g>
      )
    }
    default:
      return <rect x={x} y={y} width={width} height={height} rx={12} {...stroke} />
  }
}
