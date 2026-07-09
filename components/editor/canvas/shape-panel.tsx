"use client"

import { useRef, type DragEvent } from "react"
import {
  Circle,
  Cylinder,
  Diamond,
  Hexagon,
  Pill,
  RectangleHorizontal,
  type LucideIcon,
} from "lucide-react"

import {
  DEFAULT_NODE_COLOR,
  NODE_SHAPES,
  SHAPE_DRAG_MIME,
  type CanvasNodeShape,
  type ShapeDragPayload,
} from "@/types/canvas"

import { NodeShape } from "./node-shape"

/** Icon shown for each draggable shape. */
const SHAPE_ICONS: Record<CanvasNodeShape, LucideIcon> = {
  rectangle: RectangleHorizontal,
  diamond: Diamond,
  circle: Circle,
  pill: Pill,
  cylinder: Cylinder,
  hexagon: Hexagon,
}

/**
 * Floating pill-shaped toolbar at the bottom-center of the canvas. Each button
 * is draggable; dragging one starts a drag carrying the shape name and its
 * default size, which the canvas reads on drop to create a new node. While
 * dragging, a ghost preview of the shape (same type and default size used on
 * drop) is attached to the cursor via the native drag image.
 */
export function ShapePanel() {
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

    const preview = previewRefs.current[shape]
    if (preview) {
      // Centered under the cursor; the browser keeps this attached while
      // dragging and clears it automatically on drop or cancel.
      event.dataTransfer.setDragImage(preview, size.width / 2, size.height / 2)
    }
  }

  return (
    <>
      <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full border border-surface-border bg-surface/90 p-1.5 shadow-lg backdrop-blur">
          {NODE_SHAPES.map(({ shape, label, defaultSize }) => {
            const Icon = SHAPE_ICONS[shape]
            return (
              <button
                key={shape}
                type="button"
                draggable
                onDragStart={(event) => handleDragStart(event, shape, defaultSize)}
                title={label}
                aria-label={`Drag to add a ${label.toLowerCase()}`}
                className="flex h-9 w-9 cursor-grab items-center justify-center rounded-full text-copy-muted transition-colors hover:bg-elevated hover:text-copy-primary active:cursor-grabbing"
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
