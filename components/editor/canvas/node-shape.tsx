"use client"

import { cn } from "@/lib/utils"
import type { CanvasNodeShape } from "@/types/canvas"

/** Border/stroke color at rest and when the owning node is selected. */
const STROKE_REST = "var(--border-default)"
const STROKE_SELECTED = "var(--accent-primary)"

interface NodeShapeProps {
  shape: CanvasNodeShape
  /** Fill color of the shape (any CSS color string). */
  color: string
  /** Whether the owning node is selected — brightens the border. */
  selected?: boolean
}

/**
 * Draws the visual body of a canvas node, filling its parent (which sizes it).
 * Rectangle, pill, and circle use CSS borders; diamond, hexagon, and cylinder
 * are drawn as SVG shapes that scale with the node via a stretched viewBox.
 * Borders stay subtle at rest and brighten when selected. Shared by the node
 * renderer and the tool-panel drag preview so both draw the same shape.
 */
export function NodeShape({ shape, color, selected = false }: NodeShapeProps) {
  if (shape === "rectangle" || shape === "pill" || shape === "circle") {
    return (
      <div
        className={cn(
          "absolute inset-0 border transition-colors",
          shape === "rectangle" ? "rounded-xl" : "rounded-full",
          selected ? "border-brand" : "border-surface-border"
        )}
        style={{ backgroundColor: color }}
      />
    )
  }

  const stroke = selected ? STROKE_SELECTED : STROKE_REST

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <g fill={color} stroke={stroke} strokeWidth={2}>
        {shape === "diamond" && (
          <polygon points="50,1 99,50 50,99 1,50" vectorEffect="non-scaling-stroke" />
        )}
        {shape === "hexagon" && (
          <polygon
            points="25,1 75,1 99,50 75,99 25,99 1,50"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {shape === "cylinder" && (
          <>
            <path
              d="M1,12 L1,88 A49,11 0 0 0 99,88 L99,12"
              vectorEffect="non-scaling-stroke"
            />
            <ellipse
              cx="50"
              cy="12"
              rx="49"
              ry="11"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </g>
    </svg>
  )
}
