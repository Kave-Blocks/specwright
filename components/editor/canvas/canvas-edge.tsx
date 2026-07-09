"use client"

import {
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react"
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react"

import { CANVAS_EDGE_COLOR, type CanvasEdge } from "@/types/canvas"

import { useCanvasActions } from "./canvas-context"

/** Corner rounding of the right-angle routing. */
const EDGE_BORDER_RADIUS = 8
/** Visible line thickness (kept constant so the hit area can widen on its own). */
const EDGE_STROKE_WIDTH = 1.5
/** Wide, invisible hit area so edges are easy to hover/click without looking thick. */
const EDGE_INTERACTION_WIDTH = 22
/** Stroke opacity at rest vs. when the edge is hovered or selected. */
const EDGE_OPACITY_REST = 0.5
const EDGE_OPACITY_ACTIVE = 1

/** Shown as a faint hint on an active edge that has no label yet. */
const LABEL_PLACEHOLDER = "Add label"

/**
 * Renderer for the custom canvas edge type. Routes the path with clean
 * right-angle steps (`getSmoothStepPath`), dims the stroke at rest, and brightens
 * it when hovered or selected. A wide transparent interaction path makes the edge
 * easy to hover and click without thickening the visible line.
 *
 * Double-clicking the edge opens an inline label editor positioned at the path
 * midpoint via `EdgeLabelRenderer`. Typing commits to the collaborative edge data
 * live (blur, Enter, or Escape close the editor); saved labels render as small
 * pill badges, and an active unlabeled edge shows a faint hint. Label interactions
 * carry `nodrag`/`nopan` so they never drag a node or pan the canvas.
 */
export function CanvasEdgeRenderer({
  id,
  data,
  selected,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
}: EdgeProps<CanvasEdge>) {
  const { updateEdgeLabel } = useCanvasActions()
  const label = data?.label ?? ""

  const [hovered, setHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(label)
  const inputRef = useRef<HTMLInputElement>(null)

  const active = Boolean(selected) || hovered

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: EDGE_BORDER_RADIUS,
  })

  const startEditing = (event: MouseEvent) => {
    // Swallow React Flow's zoom-on-double-click before opening the editor.
    event.stopPropagation()
    setDraft(label)
    setIsEditing(true)
  }

  const stopEditing = () => setIsEditing(false)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value
    setDraft(next)
    updateEdgeLabel(id, next)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault()
      stopEditing()
    }
  }

  // Focus the input and drop the caret at the end when editing opens.
  useLayoutEffect(() => {
    if (!isEditing) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [isEditing])

  const showLabel = isEditing || Boolean(label) || active

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={0}
        style={{
          stroke: CANVAS_EDGE_COLOR,
          strokeWidth: EDGE_STROKE_WIDTH,
          strokeLinecap: "round",
          strokeOpacity: active ? EDGE_OPACITY_ACTIVE : EDGE_OPACITY_REST,
          transition: "stroke-opacity 150ms ease",
        }}
      />
      {/* Wide invisible hit area: `pointerEvents: stroke` makes the transparent
       * stroke hittable so hover/double-click work without a visible thick line. */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={EDGE_INTERACTION_WIDTH}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={startEditing}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            onDoubleClick={startEditing}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {isEditing ? (
              <label className="grid items-center rounded-full border border-brand/60 bg-surface/95 px-2 py-0.5 shadow-sm backdrop-blur-sm">
                {/* Mirror span sizes the container to the text so the input grows. */}
                <span
                  aria-hidden
                  className="col-start-1 row-start-1 whitespace-pre px-1 text-xs"
                >
                  {draft || LABEL_PLACEHOLDER}
                </span>
                <input
                  ref={inputRef}
                  // `size={1}` drops the input's default ~20ch intrinsic width so
                  // the mirror span above drives the container width.
                  size={1}
                  className="col-start-1 row-start-1 w-full min-w-8 bg-transparent px-1 text-center text-xs text-copy-primary outline-none placeholder:text-copy-faint"
                  value={draft}
                  placeholder={LABEL_PLACEHOLDER}
                  onChange={handleChange}
                  onBlur={stopEditing}
                  onKeyDown={handleKeyDown}
                />
              </label>
            ) : label ? (
              <span className="block max-w-55 truncate rounded-full border border-surface-border bg-surface/95 px-2 py-0.5 text-xs text-copy-secondary shadow-sm backdrop-blur-sm">
                {label}
              </span>
            ) : (
              <span className="block rounded-full border border-dashed border-surface-border/70 bg-surface/80 px-2 py-0.5 text-xs text-copy-faint backdrop-blur-sm">
                {LABEL_PLACEHOLDER}
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
