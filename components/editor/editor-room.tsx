"use client"

import type { ReactNode } from "react"
import { LiveblocksProvider, RoomProvider } from "@liveblocks/react/suspense"

interface EditorRoomProps {
  /** Liveblocks room id — the project id, which doubles as the room id. */
  roomId: string
  children: ReactNode
}

/**
 * Connects the editor to its Liveblocks room and provides room context to
 * everything inside it. It wraps the whole workspace row — not just the canvas —
 * because the AI sidebar is a room participant too: it subscribes to the
 * `ai-chat` feed and writes messages into it, alongside the canvas's storage,
 * presence, and `ai-status-feed` subscriptions. One provider, one connection.
 */
export function EditorRoom({ roomId, children }: EditorRoomProps) {
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth">
      <RoomProvider
        id={roomId}
        initialPresence={{ cursor: null, thinking: false, selection: null }}
      >
        {children}
      </RoomProvider>
    </LiveblocksProvider>
  )
}
