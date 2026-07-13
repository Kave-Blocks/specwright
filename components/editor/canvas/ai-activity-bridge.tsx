"use client"

import { useEffect } from "react"

import { useAiActivityControls } from "@/components/editor/ai/ai-activity-context"
import { useAiStatus } from "@/hooks/use-ai-status"

/**
 * Renders nothing. Runs inside the Liveblocks room (in `CanvasFlow`) where the
 * shared AI status is available, and reports it up to `EditorWorkspace` so the
 * AI sidebar — which lives outside the room — can display it. `useAiStatus`
 * returns stable references (memoized), so this only pushes on real changes.
 */
export function AiActivityBridge() {
  const { isWorking, message } = useAiStatus()
  const { setActivity } = useAiActivityControls()

  useEffect(() => {
    setActivity({ isWorking, status: message })
  }, [isWorking, message, setActivity])

  return null
}
