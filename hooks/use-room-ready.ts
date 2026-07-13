"use client"

import { useEffect, useState } from "react"
import { useStatus } from "@liveblocks/react"

/**
 * True once the room's socket has connected — and it stays true afterwards.
 *
 * Anything that reads a Liveblocks **feed** must wait for this. Liveblocks
 * fetches a feed's first page *over the WebSocket*: a fetch issued before the
 * socket connects is dropped from the flush buffer, rejects after a 5s timeout,
 * and — because the feed resource is built with `autoRetry: false` — that error
 * is cached for the lifetime of the client. The sidebar mounts with the
 * workspace, well before the room connects (the auth endpoint has to check
 * Clerk, hit the database, and ensure the room and its feeds first), so a feed
 * read on mount would *never* load, even though writes still work.
 *
 * The latch matters: a later blip drops the status to `"reconnecting"`, and
 * unmounting the reader then would throw away in-flight UI state (a draft
 * message, a run being tracked). The first page is already loaded by that point,
 * so there is nothing to re-gate.
 */
export function useRoomReady(): boolean {
  const status = useStatus()
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (isReady || status !== "connected") return
    // Deferred so this never sets state synchronously inside the effect.
    const timer = setTimeout(() => setIsReady(true), 0)
    return () => clearTimeout(timer)
  }, [status, isReady])

  return isReady
}
