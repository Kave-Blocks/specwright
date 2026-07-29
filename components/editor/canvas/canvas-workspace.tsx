"use client"

import { useMemo, useRef, useState, type CSSProperties } from "react"

import {
  AiActivityControlsProvider,
  IDLE_AI_ACTIVITY,
  type AiActivity,
} from "@/components/editor/ai/ai-activity-context"
import { AiChatPanel } from "@/components/editor/ai/ai-chat-panel"
import { CanvasSaveProvider } from "@/components/editor/canvas/canvas-save-context"
import { CanvasSurface } from "@/components/editor/canvas/canvas-surface"
import { CanvasToolbar } from "@/components/editor/canvas/canvas-toolbar"
import { StarterTemplatesProvider } from "@/components/editor/starter-templates-context"
import type { CanvasSaveStatus } from "@/types/canvas"

interface CanvasWorkspaceProps {
  projectId: string
}

/**
 * Client shell for the `/editor/[roomId]/canvas` route: the React Flow canvas
 * plus the controls that only make sense while it's the active route (save
 * status, starter templates, the AI chat panel). Auth, the Liveblocks room,
 * the project sidebar, and Share are project-wide and live one level up in
 * `EditorRoomShell`.
 *
 * Narrowed from the former `EditorWorkspace`, which also owned those
 * project-wide pieces before Discovery and Specs became their own routes.
 */
export function CanvasWorkspace({ projectId }: CanvasWorkspaceProps) {
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false)
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState<CanvasSaveStatus>("idle")
  const [aiActivity, setAiActivity] = useState<AiActivity>(IDLE_AI_ACTIVITY)

  // Bridge for the canvas autosave, which runs inside the Liveblocks room while
  // its status indicator lives in `CanvasToolbar`. The canvas reports status
  // through `setSaveStatus` and registers its immediate-save handler on
  // `saveNowRef`.
  const saveNowRef = useRef<(() => void) | null>(null)
  const saveControls = useMemo(
    () => ({ setStatus: setSaveStatus, saveNowRef }),
    []
  )

  // Bridge for shared AI activity: the status feed + presence live inside the
  // Liveblocks room, while the AI chat panel renders outside it. A bridge in
  // `CanvasFlow` reports activity up through `setActivity` (stable identity).
  const aiActivityControls = useMemo(
    () => ({ setActivity: setAiActivity }),
    []
  )

  return (
    <StarterTemplatesProvider
      value={{ isOpen: isTemplatesOpen, setOpen: setIsTemplatesOpen }}
    >
      <AiActivityControlsProvider value={aiActivityControls}>
        <CanvasSaveProvider value={saveControls}>
          <div className="flex flex-1 flex-col overflow-hidden">
            <CanvasToolbar
              saveStatus={saveStatus}
              onSave={() => saveNowRef.current?.()}
              onOpenTemplates={() => setIsTemplatesOpen(true)}
              isAiSidebarOpen={isAiSidebarOpen}
              onToggleAiSidebar={() =>
                setIsAiSidebarOpen((isOpen) => !isOpen)
              }
            />

            <div className="relative flex flex-1 overflow-hidden p-3">
              {/* Pushes the floating canvas chrome (zoom controls, presence
               * avatars) clear of the AI chat panel when it's open;
               * `--canvas-inset-left` cascades down from `EditorRoomShell`. */}
              <main
                className="relative flex-1 overflow-hidden bg-base"
                style={
                  {
                    "--canvas-inset-right": isAiSidebarOpen ? "20rem" : "0px",
                  } as CSSProperties
                }
              >
                <CanvasSurface roomId={projectId} />
              </main>

              <AiChatPanel
                projectId={projectId}
                aiActivity={aiActivity}
                isOpen={isAiSidebarOpen}
                onClose={() => setIsAiSidebarOpen(false)}
              />
            </div>
          </div>
        </CanvasSaveProvider>
      </AiActivityControlsProvider>
    </StarterTemplatesProvider>
  )
}
