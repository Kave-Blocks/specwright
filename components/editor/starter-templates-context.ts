"use client"

import { createContext, useContext } from "react"

/**
 * Bridges the starter-templates modal's open state across the Liveblocks room
 * boundary. The navbar button that opens the modal lives outside the room, while
 * the modal and its import action live inside the canvas (inside the room, where
 * the collaborative node/edge state is available). `EditorWorkspace` owns the
 * state and provides it here; `CanvasFlow` consumes it to render the modal.
 */
export interface StarterTemplatesControls {
  /** Whether the starter-templates modal is open. */
  isOpen: boolean
  /** Open or close the starter-templates modal. */
  setOpen: (open: boolean) => void
}

const StarterTemplatesContext = createContext<StarterTemplatesControls | null>(
  null
)

export const StarterTemplatesProvider = StarterTemplatesContext.Provider

export function useStarterTemplates(): StarterTemplatesControls {
  const controls = useContext(StarterTemplatesContext)
  if (!controls) {
    throw new Error(
      "useStarterTemplates must be used within a StarterTemplatesProvider"
    )
  }
  return controls
}
