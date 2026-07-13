"use client"

import { useMemo } from "react"
import { useFeedMessages, useOthers } from "@liveblocks/react"

import {
  AI_STATUS_FEED_ID,
  parseAiStatusFeedMessage,
  type AiStatusFeedMessage,
} from "@/types/tasks"

export interface AiStatus {
  /** The most recent validated status message from the shared feed, or null. */
  message: AiStatusFeedMessage | null
  /**
   * True while any AI agent is actively working, derived from shared presence
   * (`thinking`). Presence has a TTL, so this self-heals if a worker dies
   * mid-run — unlike the feed, whose last message would otherwise linger.
   */
  isWorking: boolean
}

/**
 * Read the shared AI activity state for the current room: the latest message
 * from the `ai-status-feed` Liveblocks feed (validated before use) plus whether
 * an AI agent is currently working. Both are shared, so every participant sees
 * the same status regardless of who triggered the generation.
 *
 * Uses the non-suspense feed hook on purpose: feed loading must not re-suspend
 * the canvas, and a missing feed (before the first generation ever runs) should
 * degrade to "no status" rather than throwing to the error boundary.
 */
export function useAiStatus(): AiStatus {
  const result = useFeedMessages(AI_STATUS_FEED_ID)

  // Selected down to a boolean on purpose. A bare `useOthers()` would re-render
  // every consumer of this hook on each remote cursor move (presence carries the
  // cursor too); this only re-renders when the answer actually flips.
  const isWorking = useOthers((others) =>
    others.some((other) => other.presence.thinking === true)
  )

  const messages = result.messages

  const message = useMemo(() => {
    if (!messages || messages.length === 0) return null
    // Feed messages may arrive in any order — pick the most recent by createdAt.
    let newest = messages[0]
    for (const candidate of messages) {
      if (candidate.createdAt > newest.createdAt) newest = candidate
    }
    return parseAiStatusFeedMessage(newest.data)
  }, [messages])

  return useMemo(() => ({ message, isWorking }), [message, isWorking])
}
