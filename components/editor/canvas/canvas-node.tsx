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
  Handle,
  NodeResizer,
  Position,
  type NodeProps,
} from "@xyflow/react"

import { cn } from "@/lib/utils"
import type { CanvasNode } from "@/types/canvas"

import { useCanvasActions } from "./canvas-context"
import { NodeColorToolbar } from "./node-color-toolbar"
import { NodeShape } from "./node-shape"

/** Smallest footprint a node can be resized to. */
const MIN_NODE_WIDTH = 80
const MIN_NODE_HEIGHT = 48

/**
 * Connection handles: small white dots with a dark border, hidden by default and
 * faded in when the node is hovered (or selected) so nodes stay clean at rest.
 * The `!` overrides win against React Flow's `.react-flow__handle` theme styles.
 */
const HANDLE_DOT =
  "!h-2.5 !w-2.5 !border-[1.5px] !border-[color:var(--bg-base)] !bg-white transition-opacity duration-150"

/** Shown in the label's centered position while a node has no text. */
const LABEL_PLACEHOLDER = "Add label"

/**
 * Renderer for the custom canvas node type. The shape body is drawn by
 * `NodeShape` (CSS for rectangle/pill/circle, SVG for diamond/hexagon/cylinder)
 * and brightens its border when selected. The label is centered on top and
 * connection handles sit on all four sides so nodes can be linked.
 *
 * When selected, a `NodeResizer` shows subtle corner/edge handles that resize
 * the node (down to a minimum) through the synced node-change flow. Double-
 * clicking opens an inline `<textarea>` layered directly over the label; typing
 * commits to the collaborative state live, and blur or `Escape` closes editing.
 */
export function CanvasNodeRenderer({ id, data, selected }: NodeProps<CanvasNode>) {
  const { updateNodeLabel, updateNodeColor } = useCanvasActions()
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(data.label)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const startEditing = (event: MouseEvent) => {
    // Stop the double-click from reaching React Flow's zoom-on-double-click.
    event.stopPropagation()
    setDraft(data.label)
    setIsEditing(true)
  }

  const stopEditing = () => setIsEditing(false)

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value
    setDraft(next)
    updateNodeLabel(id, next)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      stopEditing()
    }
  }

  // Focus the textarea and place the caret at the end when editing opens, and
  // keep its height matched to the content so the node never shifts layout.
  useLayoutEffect(() => {
    if (!isEditing) return
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [isEditing])

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [draft, isEditing])

  // Handles fade in on node hover; stay visible while the node is selected.
  const handleClass = cn(
    HANDLE_DOT,
    selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
  )

  return (
    <div className="group relative h-full w-full" onDoubleClick={startEditing}>
      {selected && (
        <NodeColorToolbar
          activeColor={data.color}
          onSelect={(color, textColor) => updateNodeColor(id, color, textColor)}
        />
      )}
      <NodeResizer
        isVisible={selected}
        minWidth={MIN_NODE_WIDTH}
        minHeight={MIN_NODE_HEIGHT}
        color="var(--accent-primary)"
        handleStyle={{ width: 8, height: 8, borderRadius: 2 }}
      />
      <NodeShape shape={data.shape} color={data.color} selected={selected} />
      {/* One handle per side; `ConnectionMode.Loose` lets any side connect to any
       * other. Position-based ids keep the four same-type handles unambiguous so
       * edges route from the correct side. */}
      <Handle id="top" type="source" position={Position.Top} className={handleClass} />
      <Handle id="right" type="source" position={Position.Right} className={handleClass} />
      <Handle id="bottom" type="source" position={Position.Bottom} className={handleClass} />
      <Handle id="left" type="source" position={Position.Left} className={handleClass} />
      <div className="absolute inset-0 flex items-center justify-center px-3">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            className="nodrag nopan w-full resize-none overflow-hidden border-0 bg-transparent text-center text-sm leading-tight outline-none placeholder:text-copy-faint"
            style={{ color: data.textColor }}
            rows={1}
            value={draft}
            placeholder={LABEL_PLACEHOLDER}
            onChange={handleChange}
            onBlur={stopEditing}
            onKeyDown={handleKeyDown}
            onPointerDown={(event) => event.stopPropagation()}
          />
        ) : data.label ? (
          <span
            className="pointer-events-none wrap-break-word text-center text-sm"
            style={{ color: data.textColor }}
          >
            {data.label}
          </span>
        ) : (
          <span className="pointer-events-none text-center text-sm text-copy-faint">
            {LABEL_PLACEHOLDER}
          </span>
        )}
      </div>
    </div>
  )
}
