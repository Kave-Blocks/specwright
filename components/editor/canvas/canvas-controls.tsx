"use client"

import { useCallback } from "react"
import { useReactFlow } from "@xyflow/react"
import {
  useCanRedo,
  useCanUndo,
  useRedo,
  useUndo,
} from "@liveblocks/react/suspense"
import {
  Maximize,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { CanvasEdge, CanvasNode } from "@/types/canvas"

import { useKeyboardShortcuts, ZOOM_DURATION } from "@/hooks/useKeyboardShortcuts"

interface ControlButtonProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
}

function ControlButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full text-copy-muted transition-colors",
        "hover:bg-elevated hover:text-copy-primary",
        "disabled:pointer-events-none disabled:opacity-40"
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  )
}

/**
 * Floating pill control bar at the bottom-left of the canvas. Zoom controls
 * (zoom out / fit view / zoom in) drive the React Flow instance with a short
 * animation; history controls (undo / redo) drive Liveblocks history and dim
 * when there is nothing to undo/redo. The same actions are also bound to
 * keyboard shortcuts via `useKeyboardShortcuts`.
 */
export function CanvasControls() {
  const reactFlow = useReactFlow<CanvasNode, CanvasEdge>()

  const undo = useUndo()
  const redo = useRedo()
  const canUndo = useCanUndo()
  const canRedo = useCanRedo()

  const zoomIn = useCallback(() => {
    void reactFlow.zoomIn({ duration: ZOOM_DURATION })
  }, [reactFlow])

  const zoomOut = useCallback(() => {
    void reactFlow.zoomOut({ duration: ZOOM_DURATION })
  }, [reactFlow])

  const fitView = useCallback(() => {
    void reactFlow.fitView({ duration: ZOOM_DURATION })
  }, [reactFlow])

  useKeyboardShortcuts({ reactFlow, onUndo: undo, onRedo: redo })

  return (
    <div className="absolute bottom-4 left-[calc(1rem+var(--canvas-inset-left,0px))] z-10 transition-[left] duration-200 ease-out">
      <div className="flex items-center gap-1 rounded-full border border-surface-border bg-surface/90 p-1.5 shadow-lg backdrop-blur">
        <ControlButton icon={ZoomOut} label="Zoom out" onClick={zoomOut} />
        <ControlButton icon={Maximize} label="Fit view" onClick={fitView} />
        <ControlButton icon={ZoomIn} label="Zoom in" onClick={zoomIn} />

        <div className="mx-1 h-5 w-px bg-surface-border" aria-hidden />

        <ControlButton
          icon={Undo2}
          label="Undo"
          onClick={undo}
          disabled={!canUndo}
        />
        <ControlButton
          icon={Redo2}
          label="Redo"
          onClick={redo}
          disabled={!canRedo}
        />
      </div>
    </div>
  )
}
