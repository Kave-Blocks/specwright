"use client"

import { useState, type MouseEvent, type PointerEvent } from "react"

import { NODE_COLORS } from "@/types/canvas"

interface NodeColorToolbarProps {
  /** The node's current background fill — marks the active swatch. */
  activeColor: string
  /** Called with the selected fill / text color pair. */
  onSelect: (color: string, textColor: string) => void
}

/**
 * Small floating toolbar shown above a selected node. It renders one swatch per
 * predefined color pair (`NODE_COLORS`); picking one updates both the node
 * background and its paired text color. The active pair reads as clearly
 * selected, and hovering a swatch shows a tight glow tinted with its text
 * color. Pointer interactions are marked `nodrag`/`nopan` and stop propagation
 * so using the toolbar never drags the node or pans the canvas.
 */
export function NodeColorToolbar({ activeColor, onSelect }: NodeColorToolbarProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  // Keep the swatch clicks from starting a node drag / canvas pan.
  const swallow = (event: PointerEvent | MouseEvent) => event.stopPropagation()

  return (
    <div
      className="nodrag nopan absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-surface-border bg-surface/95 p-1.5 shadow-lg backdrop-blur"
      onPointerDown={swallow}
      onDoubleClick={swallow}
    >
      {NODE_COLORS.map(({ fill, text }) => {
        const isActive = fill === activeColor
        const isHovered = hovered === fill
        return (
          <button
            key={fill}
            type="button"
            aria-label={`Set node color`}
            aria-pressed={isActive}
            onClick={(event) => {
              event.stopPropagation()
              onSelect(fill, text)
            }}
            onPointerDown={swallow}
            onMouseEnter={() => setHovered(fill)}
            onMouseLeave={() => setHovered(null)}
            className="flex h-5 w-5 items-center justify-center rounded-full border transition-transform hover:scale-110"
            style={{
              backgroundColor: fill,
              borderColor: isActive ? text : "var(--border-subtle)",
              // Tight, controlled glow in the swatch's text color: a bright ring
              // for the active pair, a soft glow on hover.
              boxShadow: isActive
                ? `0 0 0 2px var(--bg-surface), 0 0 0 3px ${text}`
                : isHovered
                  ? `0 0 6px 1px ${text}`
                  : "none",
            }}
          >
            {/* Dot in the paired text color so each swatch shows the pair. */}
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: text }}
            />
          </button>
        )
      })}
    </div>
  )
}
