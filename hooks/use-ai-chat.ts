"use client"

import { useCallback, useMemo } from "react"
import {
  useCreateFeedMessage,
  useFeedMessages,
  useSelf,
} from "@liveblocks/react"

import { MAX_CHAT_MESSAGES } from "@/lib/spec-agent/payload"
import {
  AI_CHAT_ASSISTANT_SENDER,
  AI_CHAT_FEED_ID,
  AI_CHAT_MAX_LENGTH,
  parseAiChatFeedMessage,
  type AiChatFeedMessage,
} from "@/types/tasks"

/** A validated chat message, keyed by its Liveblocks feed message id. */
export interface AiChatMessage extends AiChatFeedMessage {
  id: string
}

export interface AiChat {
  /**
   * Validated messages, oldest first. Malformed payloads are dropped.
   *
   * **Bounded, not complete.** The feed is fetched one page deep, so this holds
   * at most the {@link MAX_CHAT_MESSAGES} *most recent* messages: Liveblocks
   * returns a feed newest-first, and the `fetchMore` it exposes is never called
   * here. A longer conversation therefore keeps its recent tail and silently
   * drops the rest — there is no "load more" affordance yet.
   *
   * That bound is deliberate for the AI, which is the point of this feed: spec
   * generation is contracted to at most `MAX_CHAT_MESSAGES` of history anyway.
   * It is a real limit on *scrollback*, so wiring `fetchMore` into the chat UI
   * is the fix if reading past the tail ever matters.
   */
  messages: AiChatMessage[]
  /** True while the feed's first page is still loading. */
  isLoading: boolean
  /**
   * Set when the feed's first page failed to load. Surfaced rather than
   * swallowed: the feed fetch does **not** auto-retry, so a failure is permanent
   * for the session — and an unsurfaced one is indistinguishable from "no
   * messages yet", which is exactly how a broken chat once looked like an empty
   * one. See {@link useAiChat} for why this hook must not mount too early.
   */
  error: Error | undefined
  /**
   * This client's user id, or `null` until the room connection resolves it.
   * Identifies own messages, and gates sending (a message needs a sender).
   */
  selfId: string | null
  /** Publish a message to the room. Rejects if the write fails. */
  sendMessage: (content: string) => Promise<void>
  /**
   * Publish an AI reply to the room (Ghost AI's own line in the conversation —
   * a design's outcome, or an error). Written to the same feed as the people's
   * messages, so every participant sees it. Rejects if the write fails.
   */
  sendAssistantMessage: (content: string) => Promise<void>
}

/**
 * Read and write the room's `ai-chat` Liveblocks feed — the collaborative chat
 * every participant in the room shares. Kept strictly separate from
 * `ai-status-feed` (see `useAiStatus`), which carries AI progress, not chat.
 *
 * Uses the non-suspense hooks on purpose, like `useAiStatus`: chat loading must
 * not suspend the sidebar, and a feed that isn't reachable should degrade to an
 * empty conversation rather than throw.
 *
 * IMPORTANT — only mount this once the room's socket is connected. Liveblocks
 * fetches a feed's first page *over the WebSocket*: if the socket isn't
 * connected yet, the request is silently dropped from the flush buffer and
 * rejects after a 5s timeout, and because the feed resource is built with
 * `autoRetry: false` that error is cached for the lifetime of the client — the
 * chat then stays empty forever, even though writing new messages still works.
 * `AiArchitectTab` gates on the room status for exactly this reason.
 */
export function useAiChat(): AiChat {
  // `limit` is the *page size*, not a cap on `messages`: Liveblocks paginates the
  // feed and only ever holds the first page unless `fetchMore` is called, which
  // this hook does not do. Left at the default (50) that silently starves spec
  // generation, which slices the last MAX_CHAT_MESSAGES (100) off this list and
  // so could never see more than half of what it asks for.
  const result = useFeedMessages(AI_CHAT_FEED_ID, { limit: MAX_CHAT_MESSAGES })
  const createFeedMessage = useCreateFeedMessage()
  const self = useSelf()

  const feedMessages = result.messages
  const isLoading = result.isLoading
  const error = result.error

  const messages = useMemo(() => {
    if (!feedMessages) return []

    // Feed messages may arrive in any order, so sort before rendering. The sort
    // key is the feed's server-assigned `createdAt` (not the payload's
    // `timestamp`, which is the sender's clock and could be skewed); the
    // payload timestamp is only what we display.
    return [...feedMessages]
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .flatMap((message) => {
        // Anything on the feed is untrusted — it crosses the network from other
        // clients, and the feed's payload type also covers AI status messages.
        const data = parseAiChatFeedMessage(message.data)
        return data ? [{ id: message.id, ...data }] : []
      })
  }, [feedMessages])

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim().slice(0, AI_CHAT_MAX_LENGTH)
      if (!trimmed) return
      if (!self) {
        throw new Error("Not connected to the room yet")
      }

      const message: AiChatFeedMessage = {
        sender: { id: self.id, name: self.info.name || "Anonymous" },
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      }

      await createFeedMessage(AI_CHAT_FEED_ID, message)
    },
    [createFeedMessage, self]
  )

  const sendAssistantMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim().slice(0, AI_CHAT_MAX_LENGTH)
      if (!trimmed) return

      // The AI carries its own sender, so this doesn't wait for the room
      // connection the way a person's message does.
      const message: AiChatFeedMessage = {
        sender: { ...AI_CHAT_ASSISTANT_SENDER },
        role: "assistant",
        content: trimmed,
        timestamp: Date.now(),
      }

      await createFeedMessage(AI_CHAT_FEED_ID, message)
    },
    [createFeedMessage]
  )

  const selfId = self?.id ?? null

  return useMemo(
    () => ({
      messages,
      isLoading,
      error,
      selfId,
      sendMessage,
      sendAssistantMessage,
    }),
    [messages, isLoading, error, selfId, sendMessage, sendAssistantMessage]
  )
}
