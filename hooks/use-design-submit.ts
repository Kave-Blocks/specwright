"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRealtimeRun } from "@trigger.dev/react-hooks"

import { useAiChat } from "@/hooks/use-ai-chat"
import { isFinishedRunStatus } from "@/lib/trigger-run"
import type { designAgent } from "@/trigger/design-agent"

/** AI reply posted when a run finishes but the model summarized nothing. */
const DESIGN_DONE_MESSAGE = "Done — your architecture is on the canvas."

/** AI reply posted when the run itself fails, or can no longer be tracked. */
const DESIGN_FAILED_MESSAGE =
  "Specwright couldn’t finish the design. Please try again."

/** AI reply posted when the design request never starts. */
const DESIGN_START_ERROR_MESSAGE =
  "Specwright couldn’t start the design. Please try again."

/**
 * Shown inline — the one error the chat feed can't carry, by definition: the
 * write to the feed is what failed.
 */
const SEND_ERROR_MESSAGE = "Couldn’t send your message. Please try again."

/** The design run this client is currently tracking. */
interface ActiveRun {
  runId: string
  /** Run-scoped read token from the trigger route, for `useRealtimeRun`. */
  publicToken: string
}

export interface UseDesignSubmitResult {
  /**
   * Publish `text` to the room's shared `ai-chat` feed and start a design run.
   * Resolves `true` once the run is under way (which is when a caller like the
   * Discovery view should navigate away or close), `false` if it never
   * started (in which case `error` explains why, when there is one to show).
   */
  send: (text: string) => Promise<boolean>
  /** True while this client's request is in flight or its run is still going. */
  busy: boolean
  error: string | null
  clearError: () => void
}

/**
 * The single submit path for handing a prompt — freeform or a composed
 * interview brief — to the design agent: publish it to the room's shared
 * `ai-chat` feed, start the durable design task via `POST /api/ai/design`,
 * track the run with `useRealtimeRun`, and post Specwright's closing line (or
 * the failure message) back to the feed once it settles.
 *
 * Both the Canvas chat panel and the Discovery view call this instead of each
 * owning a copy — they differ only in the text they hand it. Extracted
 * unchanged from what was `AiArchitectChat`'s inline `send`/`activeRun`
 * tracking; the mechanics here are a relocation, not a rewrite.
 */
export function useDesignSubmit(projectId: string): UseDesignSubmitResult {
  const [pending, setPending] = useState(false)
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Guards the completion reply, so a run can only ever be settled once. */
  const settledRunRef = useRef<string | null>(null)

  const { selfId, sendMessage, sendAssistantMessage } = useAiChat()

  // Track the design run with the token the trigger route handed back. `id` is
  // keyed to the run so the previous run's cached state is dropped rather than
  // bleeding into the next one; `enabled` keeps the hook idle (and quiet about
  // the missing token) while no run is in flight.
  const { run, error: runError } = useRealtimeRun<typeof designAgent>(
    activeRun?.runId,
    {
      accessToken: activeRun?.publicToken,
      enabled: activeRun !== null,
      id: activeRun?.runId,
      // The payload is just the prompt we already have — don't ship it back.
      skipColumns: ["payload"],
    }
  )

  // A message needs a sender, so sending waits for the room connection.
  const canSend = selfId !== null
  const busy = pending || activeRun !== null

  /** Post Specwright's closing line, then drop the run (re-enabling the input). */
  const settleRun = useCallback(
    async (content: string) => {
      try {
        await sendAssistantMessage(content)
      } catch (publishError) {
        console.error(publishError)
        setError(SEND_ERROR_MESSAGE)
      } finally {
        setActiveRun(null)
      }
    },
    [sendAssistantMessage]
  )

  // Close out the run once it finishes. Deliberately not `useRealtimeRun`'s
  // `onComplete`: that fires at most once per mount, so a second prompt in the
  // same session would never settle and the caller would stay disabled forever.
  useEffect(() => {
    if (!activeRun) return
    if (settledRunRef.current === activeRun.runId) return

    const isFinished =
      run?.id === activeRun.runId && isFinishedRunStatus(run.status)
    // A subscription that errors out also ends the run's tracking — otherwise a
    // dropped connection would leave the caller locked.
    if (!isFinished && !runError) return

    const runId = activeRun.runId
    const summary = run?.output?.planSummary?.trim()
    const content =
      run?.status === "COMPLETED"
        ? summary || DESIGN_DONE_MESSAGE
        : DESIGN_FAILED_MESSAGE

    // Deferred so the settle never sets state synchronously inside the effect.
    // The guard is claimed inside the timer, not before it: a later realtime
    // update would otherwise cancel this timer while the guard already read as
    // settled, and the run would hang with the caller disabled.
    const timer = setTimeout(() => {
      settledRunRef.current = runId
      void settleRun(content)
    }, 0)
    return () => clearTimeout(timer)
  }, [activeRun, run, runError, settleRun])

  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim()
      if (!trimmed || busy || !canSend) return false

      setPending(true)
      setError(null)

      try {
        // Publish to the shared chat feed first — the caller only treats the
        // message as sent once it's really in the room.
        await sendMessage(trimmed)
      } catch (sendError) {
        console.error(sendError)
        setError(SEND_ERROR_MESSAGE)
        setPending(false)
        return false
      }

      try {
        const response = await fetch("/api/ai/design", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // No `roomId`: the route derives the room from the project it
          // access-checked, so sending one would be an ignored (and, before
          // that route was scoped, forgeable) claim about which room to write.
          body: JSON.stringify({ prompt: trimmed, projectId }),
        })
        if (!response.ok) {
          throw new Error(`Design request failed (${response.status})`)
        }

        const { runId, publicToken } = (await response.json()) as {
          runId?: string
          publicToken?: string
        }
        if (!runId || !publicToken) {
          throw new Error("Design response is missing the run details")
        }

        setActiveRun({ runId, publicToken })
        return true
      } catch (designError) {
        console.error(designError)
        // Errors belong in the conversation, so everyone sees why nothing came.
        void sendAssistantMessage(DESIGN_START_ERROR_MESSAGE).catch(
          (publishError) => {
            console.error(publishError)
            setError(DESIGN_START_ERROR_MESSAGE)
          }
        )
        return false
      } finally {
        setPending(false)
      }
    },
    [busy, canSend, projectId, sendAssistantMessage, sendMessage]
  )

  const clearError = useCallback(() => setError(null), [])

  return { send, busy, error, clearError }
}
