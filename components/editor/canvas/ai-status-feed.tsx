"use client"

import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react"

import { useAiStatus } from "@/hooks/use-ai-status"
import type { AiStatusPhase } from "@/types/tasks"
import { cn } from "@/lib/utils"

/** How long the final status lingers after the AI stops working. */
const DISMISS_MS = 4000

/**
 * A shared status feed for the AI agents, pinned to the top-center of the
 * canvas. It reads the room's `ai-status-feed` Liveblocks feed (via
 * `useAiStatus`), so every participant — not just the person who prompted — sees
 * the same live progress even with the AI sidebar closed. It shows only the most
 * recent status message; visibility follows the shared "working" presence, and
 * the final message lingers briefly before dismissing (so it never flashes a
 * stale terminal status on a fresh page load, when nothing is working).
 */
export function AiStatusFeed() {
  const { message, isWorking } = useAiStatus()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Show while an AI agent is working; once it stops, keep the final message
    // up briefly, then dismiss. Both updates are deferred (never a synchronous
    // setState in the effect body) so a stale terminal status can't linger and
    // renders don't cascade.
    if (isWorking) {
      const show = setTimeout(() => setVisible(true), 0)
      return () => clearTimeout(show)
    }
    const hide = setTimeout(() => setVisible(false), DISMISS_MS)
    return () => clearTimeout(hide)
  }, [isWorking])

  if (!visible || !message?.text) return null

  const phase: AiStatusPhase = message.phase ?? (isWorking ? "processing" : "complete")
  const isActive = phase === "start" || phase === "processing"

  return (
    <div className="pointer-events-none absolute top-4 left-1/2 z-20 -translate-x-1/2">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-full border border-surface-border bg-surface/95 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-sm"
      >
        <StatusIcon phase={phase} />
        <span
          className={cn(
            isActive && "text-ai-text",
            phase === "complete" && "text-success",
            phase === "error" && "text-error"
          )}
        >
          {message.text}
        </span>
      </div>
    </div>
  )
}

function StatusIcon({ phase }: { phase: AiStatusPhase }) {
  if (phase === "complete") {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
  }
  if (phase === "error") {
    return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-error" />
  }
  if (phase === "start") {
    return <Sparkles className="h-3.5 w-3.5 shrink-0 text-ai-text" />
  }
  return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ai-text" />
}
