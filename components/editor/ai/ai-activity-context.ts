"use client"

import { createContext, useContext } from "react"

import type { AiStatusFeedMessage } from "@/types/tasks"

/**
 * Shared AI activity state (the latest status feed message + whether an AI agent
 * is working), lifted out of the Liveblocks room so the AI sidebar can read it.
 */
export interface AiActivity {
  /** True while an AI agent is actively working (shared presence). */
  isWorking: boolean
  /** Latest validated status message from the shared feed, or null. */
  status: AiStatusFeedMessage | null
}

export const IDLE_AI_ACTIVITY: AiActivity = { isWorking: false, status: null }

/**
 * Bridges shared AI activity across the Liveblocks room boundary. The status
 * lives inside the room (feed + presence), but the AI sidebar renders outside it
 * (as a flex sibling of the canvas). `EditorWorkspace` owns the state and
 * provides this setter; a small bridge rendered inside `CanvasFlow` reads the
 * room's `useAiStatus()` and reports it up through `setActivity`. Mirrors the
 * `CanvasSaveProvider` pattern already used for the autosave indicator.
 */
export interface AiActivityControls {
  /** Report the latest AI activity up to the sidebar. */
  setActivity: (activity: AiActivity) => void
}

const AiActivityControlsContext = createContext<AiActivityControls | null>(null)

export const AiActivityControlsProvider = AiActivityControlsContext.Provider

export function useAiActivityControls(): AiActivityControls {
  const controls = useContext(AiActivityControlsContext)
  if (!controls) {
    throw new Error(
      "useAiActivityControls must be used within an AiActivityControlsProvider"
    )
  }
  return controls
}
