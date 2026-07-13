/**
 * Shared Liveblocks feed types.
 *
 * Two room-scoped feeds, deliberately kept separate:
 *
 * - `ai-status-feed` — AI progress. The AI agents (design generation now, spec
 *   generation later) publish their progress here so every participant sees the
 *   same live status, not just the person who triggered it.
 * - `ai-chat` — collaborative room chat. Messages people type in the AI sidebar,
 *   shared with everyone in the room.
 *
 * This module owns both feeds' message payloads (their union is the Liveblocks
 * `FeedMessageData`) plus the validators used to check incoming messages before
 * they are displayed.
 */

import { z } from "zod"

/** Liveblocks feed id for the shared AI status feed (create-or-reuse). */
export const AI_STATUS_FEED_ID = "ai-status-feed"

/** Liveblocks feed id for the shared room chat feed (create-or-reuse). */
export const AI_CHAT_FEED_ID = "ai-chat"

/** Lifecycle step an AI status message reports. */
export type AiStatusPhase = "start" | "processing" | "complete" | "error"

const AI_STATUS_PHASES: readonly AiStatusPhase[] = [
  "start",
  "processing",
  "complete",
  "error",
]

/**
 * Payload of a single `ai-status-feed` message — stored as the Liveblocks
 * `FeedMessageData`. Kept intentionally small and generic: `text` is the
 * human-readable status line shown to every participant, and `phase` (optional)
 * lets the UI pick an icon / active state. A plain object type (not an
 * `interface`) so it satisfies Liveblocks' `Json` constraint.
 */
export type AiStatusFeedMessage = {
  /** Human-readable status line shown to every participant. */
  text?: string
  /** Optional lifecycle phase, used to pick an icon and active/terminal state. */
  phase?: AiStatusPhase
}

function isAiStatusPhase(value: unknown): value is AiStatusPhase {
  return (
    typeof value === "string" &&
    (AI_STATUS_PHASES as readonly string[]).includes(value)
  )
}

/**
 * Validate an untrusted feed message payload before displaying it. Returns a
 * well-typed {@link AiStatusFeedMessage} when the shape is valid (a plain object
 * whose optional `text` is a string and optional `phase` is a known phase), or
 * `null` when it is malformed — callers skip rendering `null`.
 */
export function parseAiStatusFeedMessage(
  data: unknown
): AiStatusFeedMessage | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null
  }

  const record = data as Record<string, unknown>

  if (record.text !== undefined && typeof record.text !== "string") return null
  if (record.phase !== undefined && !isAiStatusPhase(record.phase)) return null

  const message: AiStatusFeedMessage = {}
  if (typeof record.text === "string") message.text = record.text
  if (isAiStatusPhase(record.phase)) message.phase = record.phase
  return message
}

/** Longest chat message accepted into the `ai-chat` feed. */
export const AI_CHAT_MAX_LENGTH = 2000

/**
 * Sender stamped on `"assistant"` messages in the `ai-chat` feed. A feed message
 * has no author of its own, so the AI needs an identity in the payload just like
 * a person does; the id matches the AI's presence id in the room.
 */
export const AI_CHAT_ASSISTANT_SENDER = {
  id: "ghost-ai",
  name: "Ghost AI",
} as const

/**
 * Payload of a single `ai-chat` message. A Liveblocks feed message only carries
 * an id, timestamps, and this opaque `data` — it does not record an author — so
 * the sender travels in the payload. `role` is `"user"` for everything written
 * today; `"assistant"` is reserved for AI replies (not produced yet).
 *
 * Validated with Zod, and the type is inferred from the schema so the two can't
 * drift. Inferring (rather than declaring an `interface`) also keeps it a plain
 * object type, which is what Liveblocks' `Json` constraint requires.
 */
export const aiChatFeedMessageSchema = z.object({
  sender: z.object({
    /** Liveblocks/Clerk user id of the sender — used to detect own messages. */
    id: z.string().min(1),
    /** Display name shown above the message bubble. */
    name: z.string().min(1),
  }),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(AI_CHAT_MAX_LENGTH),
  /** Unix ms the sender composed the message, shown next to their name. */
  timestamp: z.number().int().nonnegative(),
})

export type AiChatFeedMessage = z.infer<typeof aiChatFeedMessageSchema>

/**
 * Validate an untrusted `ai-chat` payload before displaying it. Returns a clean
 * {@link AiChatFeedMessage} (unknown keys stripped) when the shape is valid, or
 * `null` when it is malformed — callers skip rendering `null`. Anything on the
 * feed is untrusted input: it crosses the network from other clients.
 */
export function parseAiChatFeedMessage(data: unknown): AiChatFeedMessage | null {
  const result = aiChatFeedMessageSchema.safeParse(data)
  return result.success ? result.data : null
}
