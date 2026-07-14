"use client"

import { useRef, type DragEvent } from "react"
import {
  Circle,
  Cylinder,
  Diamond,
  Hand,
  Hexagon,
  MousePointer2,
  Pill,
  RectangleHorizontal,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  CANVAS_CURSOR_TOOLS,
  DEFAULT_NODE_COLOR,
  NODE_SHAPES,
  SHAPE_DRAG_MIME,
  type CanvasCursorTool,
  type CanvasNodeShape,
  type CanvasTool,
  type ShapeDragPayload,
} from "@/types/canvas"

import { NodeShape } from "./node-shape"

/** Icon shown for each shape tool. */
const SHAPE_ICONS: Record<CanvasNodeShape, LucideIcon> = {
  rectangle: RectangleHorizontal,
  diamond: Diamond,
  circle: Circle,
  pill: Pill,
  cylinder: Cylinder,
  hexagon: Hexagon,
}

/** Icon, name, and shortcut for each cursor tool. */
const CURSOR_TOOLS: Record<
  CanvasCursorTool,
  { icon: LucideIcon; label: string; shortcut: string }
> = {
  select: { icon: MousePointer2, label: "Select", shortcut: "V" },
  hand: { icon: Hand, label: "Hand", shortcut: "H" },
}

/** Keyboard shortcut per shape tool; only the rectangle has one (spec 30). */
const SHAPE_SHORTCUTS: Partial<Record<CanvasNodeShape, string>> = {
  rectangle: "R",
}

/** Tooltip text: the tool's name, plus its shortcut when it has one. */
function tooltip(label: string, shortcut?: string): string {
  return shortcut ? `${label} (${shortcut})` : label
}

/**
 * Shared button treatment for every tool in the panel. The active tool is filled
 * with the brand accent so it reads as distinct from both rest and hover.
 */
const TOOL_BUTTON =
  "flex h-9 w-9 items-center justify-center rounded-full transition-colors"
const TOOL_BUTTON_ACTIVE = "bg-accent-dim text-brand"
const TOOL_BUTTON_IDLE =
  "text-copy-muted hover:bg-elevated hover:text-copy-primary"

interface ToolPanelProps {
  /** The one tool that is active right now. */
  activeTool: CanvasTool
  /** Make a tool active. */
  onSelectTool: (tool: CanvasTool) => void
}

/**
 * Floating pill-shaped tool panel at the bottom-center of the canvas: the two
 * cursor tools (select, hand), a divider, then the six shape tools. All eight own
 * the canvas cursor, which is why they share one group — zoom and undo do not, so
 * they stay in `CanvasControls`.
 *
 * A shape button does double duty. Clicking it activates that shape *tool*, and
 * the canvas then places the shape on the next click. Dragging it still starts a
 * native drag carrying the shape name and default size, which the canvas reads on
 * drop — that path is unchanged and does not touch the active tool. While
 * dragging, a ghost preview of the shape (same type and default size used on
 * drop) is attached to the cursor via the native drag image.
 */
export function ToolPanel({ activeTool, onSelectTool }: ToolPanelProps) {
  // Off-screen preview elements, one per shape, snapshotted as the drag image.
  const previewRefs = useRef<Partial<Record<CanvasNodeShape, HTMLDivElement | null>>>(
    {}
  )

  function handleDragStart(
    event: DragEvent<HTMLButtonElement>,
    shape: CanvasNodeShape,
    size: ShapeDragPayload["size"]
  ) {
    const payload: ShapeDragPayload = { shape, size }
    event.dataTransfer.setData(SHAPE_DRAG_MIME, JSON.stringify(payload))
    event.dataTransfer.effectAllowed = "copy"

    const source = previewRefs.current[shape]
    if (source) {
      // `setDragImage` snapshots a *painted, on-screen* element; the template
      // previews live off-screen (left:-9999px) so they can't be rasterized and
      // no ghost appears. Clone the matching preview into the body positioned at
      // the cursor — on-screen so it snapshots, and coincident with the drag
      // image so there's no flash — then remove it once the browser has grabbed
      // its snapshot. Centered under the cursor via the (w/2, h/2) hotspot.
      const ghost = source.cloneNode(true) as HTMLDivElement
      Object.assign(ghost.style, {
        position: "fixed",
        left: `${event.clientX - size.width / 2}px`,
        top: `${event.clientY - size.height / 2}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        margin: "0",
        pointerEvents: "none",
      })
      document.body.appendChild(ghost)
      event.dataTransfer.setDragImage(ghost, size.width / 2, size.height / 2)
      requestAnimationFrame(() => ghost.remove())
    }
  }

  return (
    <>
      <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full border border-surface-border bg-surface/90 p-1.5 shadow-lg backdrop-blur">
          {CANVAS_CURSOR_TOOLS.map((tool) => {
            const { icon: Icon, label, shortcut } = CURSOR_TOOLS[tool]
            const isActive = activeTool === tool
            return (
              <button
                key={tool}
                type="button"
                onClick={() => onSelectTool(tool)}
                aria-pressed={isActive}
                title={tooltip(label, shortcut)}
                aria-label={label}
                className={cn(
                  TOOL_BUTTON,
                  isActive ? TOOL_BUTTON_ACTIVE : TOOL_BUTTON_IDLE
                )}
              >
                <Icon className="h-5 w-5" />
              </button>
            )
          })}

          <div className="mx-1 h-5 w-px bg-surface-border" aria-hidden />

          {NODE_SHAPES.map(({ shape, label, defaultSize }) => {
            const Icon = SHAPE_ICONS[shape]
            const isActive = activeTool === shape
            return (
              <button
                key={shape}
                type="button"
                draggable
                onClick={() => onSelectTool(shape)}
                onDragStart={(event) => handleDragStart(event, shape, defaultSize)}
                aria-pressed={isActive}
                title={tooltip(label, SHAPE_SHORTCUTS[shape])}
                aria-label={`${label} — click to place, or drag onto the canvas`}
                className={cn(
                  TOOL_BUTTON,
                  "cursor-grab active:cursor-grabbing",
                  isActive ? TOOL_BUTTON_ACTIVE : TOOL_BUTTON_IDLE
                )}
              >
                <Icon className="h-5 w-5" />
              </button>
            )
          })}
        </div>
      </div>

      {/* Off-screen shape previews. Kept rendered (not `display:none`) but pushed
       * out of view so `setDragImage` can snapshot each one at its default size. */}
      <div
        className="pointer-events-none absolute top-0 left-[-9999px]"
        aria-hidden
      >
        {NODE_SHAPES.map(({ shape, defaultSize }) => (
          <div
            key={shape}
            ref={(el) => {
              previewRefs.current[shape] = el
            }}
            className="relative"
            style={{ width: defaultSize.width, height: defaultSize.height }}
          >
            <NodeShape shape={shape} color={DEFAULT_NODE_COLOR} />
          </div>
        ))}
      </div>
    </>
  )
}
