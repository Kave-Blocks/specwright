"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"

import type { CanvasNode } from "@/types/canvas"

/**
 * Basic renderer for the custom canvas node type. For this unit every shape is
 * drawn as a simple bordered rectangle with its label centered; shape-specific
 * visuals (diamond, cylinder, hexagon, …) are added later. Connection handles
 * sit on all four sides so nodes can be linked.
 */
export function CanvasNodeRenderer({ data }: NodeProps<CanvasNode>) {
  return (
    <div
      className="flex h-full w-full items-center justify-center rounded-xl border border-surface-border px-3 text-center text-sm text-copy-primary"
      style={{ backgroundColor: data.color }}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <span className="pointer-events-none break-words">{data.label}</span>
    </div>
  )
}
