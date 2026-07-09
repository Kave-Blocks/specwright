"use client"

import { useCallback, useMemo, type DragEvent } from "react"
import { useLiveblocksFlow } from "@liveblocks/react-flow"
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeTypes,
} from "@xyflow/react"

import { createCanvasNode } from "@/lib/canvas-node"
import {
  CANVAS_NODE_TYPE,
  SHAPE_DRAG_MIME,
  type CanvasEdge,
  type CanvasNode,
  type ShapeDragPayload,
} from "@/types/canvas"

import { CanvasNodeRenderer } from "./canvas-node"
import { ShapePanel } from "./shape-panel"

import "@xyflow/react/dist/style.css"
import "@liveblocks/react-flow/styles.css"

/**
 * The React Flow canvas, wired to Liveblocks Storage via `useLiveblocksFlow`.
 * Nodes, edges, and change handlers are synced across every user in the room.
 * Rendered inside a `ClientSideSuspense` boundary, so it uses suspense mode and
 * `nodes`/`edges` are always ready arrays here.
 *
 * Wrapped in `ReactFlowProvider` so the drop handler can call `useReactFlow` to
 * convert dropped screen coordinates into canvas coordinates.
 */
export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasFlow />
    </ReactFlowProvider>
  )
}

function CanvasFlow() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, onDelete } =
    useLiveblocksFlow<CanvasNode, CanvasEdge>({
      suspense: true,
      nodes: { initial: [] },
      edges: { initial: [] },
    })

  const { screenToFlowPosition } = useReactFlow<CanvasNode, CanvasEdge>()

  const nodeTypes = useMemo<NodeTypes>(
    () => ({ [CANVAS_NODE_TYPE]: CanvasNodeRenderer }),
    []
  )

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }, [])

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()

      const raw = event.dataTransfer.getData(SHAPE_DRAG_MIME)
      if (!raw) return

      let payload: ShapeDragPayload
      try {
        payload = JSON.parse(raw) as ShapeDragPayload
      } catch {
        return
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const node = createCanvasNode(payload.shape, payload.size, position)

      onNodesChange([{ type: "add", item: node }])
    },
    [onNodesChange, screenToFlowPosition]
  )

  return (
    <div
      className="relative h-full w-full"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <ReactFlow<CanvasNode, CanvasEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDelete={onDelete}
        connectionMode={ConnectionMode.Loose}
        colorMode="dark"
        fitView
      >
        {/* Colors are raw strings because React Flow props can't take Tailwind
         * tokens; values mirror the ui-context palette (base/surface/border). */}
        <Background variant={BackgroundVariant.Dots} color="#2a2a30" />
        <MiniMap
          pannable
          zoomable
          bgColor="#111114"
          maskColor="rgba(8, 8, 9, 0.65)"
          nodeColor="#2a2a30"
          nodeStrokeColor="#3a3a42"
        />
      </ReactFlow>
      <ShapePanel />
    </div>
  )
}
