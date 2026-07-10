"use client"

import {
  ClientSideSuspense,
  LiveblocksProvider,
  RoomProvider,
} from "@liveblocks/react/suspense"
import { Loader2 } from "lucide-react"

import { Canvas } from "./canvas"
import { CanvasErrorBoundary } from "./canvas-error-boundary"

interface CanvasRoomProps {
  /** Liveblocks room id — the project id, which doubles as the room id. */
  roomId: string
}

/**
 * Client-side wrapper that sets up the Liveblocks room for a single project's
 * canvas: connects via the auth endpoint, joins the room, and renders the
 * React Flow canvas behind loading and error fallbacks.
 */
export function CanvasRoom({ roomId }: CanvasRoomProps) {
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth">
      <RoomProvider
        id={roomId}
        initialPresence={{ cursor: null, thinking: false }}
      >
        <CanvasErrorBoundary fallback={<CanvasError />}>
          <ClientSideSuspense fallback={<CanvasLoading />}>
            {/* The room id is the project id; the canvas uses it to autosave. */}
            <Canvas projectId={roomId} />
          </ClientSideSuspense>
        </CanvasErrorBoundary>
      </RoomProvider>
    </LiveblocksProvider>
  )
}

function CanvasLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-copy-muted">
      <Loader2 className="size-4 animate-spin" />
      <span>Loading canvas…</span>
    </div>
  )
}

function CanvasError() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-6 text-center">
      <p className="text-sm text-copy-muted">Couldn’t connect to the canvas</p>
      <p className="text-xs text-copy-faint">
        Check your connection and reload the page to try again.
      </p>
    </div>
  )
}
