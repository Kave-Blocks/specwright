"use client"

import { useUser } from "@clerk/nextjs"
import {
  shallow,
  useOther,
  useOthersConnectionIds,
} from "@liveblocks/react/suspense"
import { useStore, type ReactFlowState } from "@xyflow/react"

import { Cursor } from "./cursor"

/** Select the viewport transform `[translateX, translateY, zoom]` from the store. */
const selectTransform = (state: ReactFlowState) => state.transform

/**
 * Overlay layer that renders live cursors for every other participant.
 *
 * Presence stores each cursor in flow coordinates (broadcast on mouse move), so
 * cursors stay anchored to the canvas content as any viewer pans or zooms. This
 * layer applies React Flow's viewport transform to a wrapper — mirroring how the
 * pane itself is transformed — and each `Cursor` then positions itself in flow
 * coordinates inside it. Keeping the viewport transform on an ancestor is what
 * lets the cursor's own smoothing transition animate *only* real cursor movement:
 * panning and zooming move the wrapper instantly, with no transition to lag
 * behind the content.
 *
 * The layer is non-interactive so it never intercepts canvas input.
 */
export function LiveCursors() {
  const { user } = useUser()
  const currentUserId = user?.id ?? null
  const connectionIds = useOthersConnectionIds()
  const [translateX, translateY, zoom] = useStore(selectTransform)

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div
        className="absolute top-0 left-0 h-full w-full origin-top-left"
        style={{
          transform: `translate(${translateX}px, ${translateY}px) scale(${zoom})`,
        }}
      >
        {connectionIds.map((connectionId) => (
          <RemoteCursor
            key={connectionId}
            connectionId={connectionId}
            currentUserId={currentUserId}
            zoom={zoom}
          />
        ))}
      </div>
    </div>
  )
}

interface RemoteCursorProps {
  connectionId: number
  /** The signed-in user's id, so their own other tabs are not drawn. */
  currentUserId: string | null
  zoom: number
}

/**
 * One participant's cursor, subscribed on its own.
 *
 * Each cursor reads only the presence it actually draws, through a selector with
 * a shallow equality check. That keeps one participant's mouse movement from
 * re-rendering every *other* participant's cursor — which is what a single
 * unselected `useOthers()` in the parent would do, at up to ten updates a second
 * per person.
 */
function RemoteCursor({ connectionId, currentUserId, zoom }: RemoteCursorProps) {
  const other = useOther(
    connectionId,
    (other) => ({
      id: other.id,
      x: other.presence.cursor?.x ?? null,
      y: other.presence.cursor?.y ?? null,
      thinking: other.presence.thinking,
      name: other.info.name,
      color: other.info.color,
    }),
    shallow
  )

  // Off-canvas (cursor cleared to null), or one of the current user's own tabs.
  if (other.x === null || other.y === null) return null
  if (other.id === currentUserId) return null

  return (
    <Cursor
      x={other.x}
      y={other.y}
      zoom={zoom}
      name={other.name}
      color={other.color}
      thinking={other.thinking}
    />
  )
}
