"use client"

import { useUser } from "@clerk/nextjs"
import { useOthers } from "@liveblocks/react/suspense"
import { useStore, type ReactFlowState } from "@xyflow/react"

import { Cursor } from "./cursor"

/** Select the viewport transform `[translateX, translateY, zoom]` from the store. */
const selectTransform = (state: ReactFlowState) => state.transform

/**
 * Overlay layer that renders live cursors for every other participant.
 *
 * Presence stores each cursor in flow coordinates (broadcast on mouse move), so
 * cursors stay anchored to the canvas content as any viewer pans or zooms. Here
 * we map those flow coordinates back into pane pixels using React Flow's
 * viewport transform, mirroring how the pane itself is transformed. The current
 * user is never drawn (`useOthers` already excludes them, and we also guard on
 * the Clerk id to skip the user's own extra tabs). The layer is non-interactive
 * so it never intercepts canvas input.
 */
export function LiveCursors() {
  const { user } = useUser()
  const currentUserId = user?.id ?? null
  const others = useOthers()
  const [translateX, translateY, zoom] = useStore(selectTransform)

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {others.map((other) => {
        const cursor = other.presence.cursor
        if (!cursor || other.id === currentUserId) return null

        return (
          <Cursor
            key={other.connectionId}
            x={cursor.x * zoom + translateX}
            y={cursor.y * zoom + translateY}
            name={other.info.name}
            color={other.info.color}
          />
        )
      })}
    </div>
  )
}
