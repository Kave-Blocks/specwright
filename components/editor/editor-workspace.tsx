"use client"

import { useMemo, useRef, useState } from "react"

import { AiSidebar } from "@/components/editor/ai-sidebar"
import {
  AiActivityControlsProvider,
  IDLE_AI_ACTIVITY,
  type AiActivity,
} from "@/components/editor/ai/ai-activity-context"
import { CanvasSurface } from "@/components/editor/canvas/canvas-surface"
import {
  CanvasGraphProvider,
  EMPTY_CANVAS_GRAPH,
  type CanvasGraph,
} from "@/components/editor/canvas/canvas-graph-context"
import { CanvasSaveProvider } from "@/components/editor/canvas/canvas-save-context"
import { EditorRoom } from "@/components/editor/editor-room"
import { ProjectActionsProvider } from "@/components/editor/project-actions-context"
import { ProjectDialogs } from "@/components/editor/project-dialogs"
import { ProjectSidebar } from "@/components/editor/project-sidebar"
import { ShareDialog } from "@/components/editor/share/share-dialog"
import { StarterTemplatesProvider } from "@/components/editor/starter-templates-context"
import { WorkspaceNavbar } from "@/components/editor/workspace-navbar"
import { useProjectActions } from "@/hooks/use-project-actions"
import type { Project } from "@/lib/projects"
import type { CanvasSaveStatus } from "@/types/canvas"
import { cn } from "@/lib/utils"

interface EditorWorkspaceProps {
  projectId: string
  projectName: string
  isOwner: boolean
  ownedProjects: Project[]
  sharedProjects: Project[]
}

/**
 * Client shell for a single `/editor/[roomId]` room. Owns the open/closed
 * state for both slide-over panels and composes the workspace chrome around
 * the central `CanvasSurface` (Liveblocks-backed React Flow canvas). Shared AI
 * activity (status feed + presence) is bridged out of the canvas to the AI panel.
 */
export function EditorWorkspace({
  projectId,
  projectName,
  isOwner,
  ownedProjects,
  sharedProjects,
}: EditorWorkspaceProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState<CanvasSaveStatus>("idle")
  const [aiActivity, setAiActivity] = useState<AiActivity>(IDLE_AI_ACTIVITY)
  const projectActions = useProjectActions({ ownedProjects, sharedProjects })

  // Bridge for the canvas autosave, which runs inside the Liveblocks room while
  // its status indicator lives in the navbar. The canvas reports status through
  // `setSaveStatus` and registers its immediate-save handler on `saveNowRef`.
  const saveNowRef = useRef<(() => void) | null>(null)
  const saveControls = useMemo(
    () => ({ setStatus: setSaveStatus, saveNowRef }),
    []
  )

  // Bridge for shared AI activity: the status feed + presence live inside the
  // Liveblocks room, while the AI sidebar renders outside it. A bridge in
  // `CanvasFlow` reports activity up through `setAiActivity` (stable identity).
  const aiActivityControls = useMemo(
    () => ({ setActivity: setAiActivity }),
    []
  )

  // Bridge for the live canvas graph: the collaborative nodes/edges live inside
  // the room, while the AI sidebar's "Generate Spec" action — which has to send
  // them — renders outside it. A ref, so a drag never re-renders the workspace.
  const graphRef = useRef<CanvasGraph>(EMPTY_CANVAS_GRAPH)
  const graphControls = useMemo(() => ({ graphRef }), [])

  return (
    <ProjectActionsProvider value={projectActions}>
      <StarterTemplatesProvider
        value={{ isOpen: isTemplatesOpen, setOpen: setIsTemplatesOpen }}
      >
        <AiActivityControlsProvider value={aiActivityControls}>
          <CanvasGraphProvider value={graphControls}>
            <CanvasSaveProvider value={saveControls}>
              <div className="flex flex-1 flex-col">
                <WorkspaceNavbar
                  projectName={projectName}
                  isSidebarOpen={isSidebarOpen}
                  onToggleSidebar={() => setIsSidebarOpen((isOpen) => !isOpen)}
                  isAiSidebarOpen={isAiSidebarOpen}
                  onToggleAiSidebar={() =>
                    setIsAiSidebarOpen((isOpen) => !isOpen)
                  }
                  onOpenShare={() => setIsShareOpen(true)}
                  onOpenTemplates={() => setIsTemplatesOpen(true)}
                  saveStatus={saveStatus}
                  onSave={() => saveNowRef.current?.()}
                />

                {/* Mobile backdrop scrim — tapping outside the sidebar closes it. */}
                <div
                  aria-hidden
                  onClick={() => setIsSidebarOpen(false)}
                  className={cn(
                    "fixed inset-0 z-20 bg-black/50 backdrop-blur-sm transition-opacity duration-200 md:hidden",
                    isSidebarOpen
                      ? "opacity-100"
                      : "pointer-events-none opacity-0"
                  )}
                />

                {/* Docked workspace row: sidebar · canvas · AI panel. On desktop the
                 * panels are in-flow columns so the canvas fills the remaining space;
                 * on mobile they collapse to slide-over overlays.
                 *
                 * The whole row lives inside the Liveblocks room: the canvas needs it
                 * for storage/presence, and the AI sidebar needs it for the `ai-chat`
                 * feed — one room connection shared by both. */}
                <EditorRoom roomId={projectId}>
                  <div className="flex flex-1 overflow-hidden p-3 pt-[calc(var(--editor-navbar-height)+0.75rem)]">
                    <ProjectSidebar
                      docked
                      isOpen={isSidebarOpen}
                      onClose={() => setIsSidebarOpen(false)}
                    />

                    <main className="relative flex-1 overflow-hidden bg-base">
                      <CanvasSurface roomId={projectId} />
                    </main>

                    <AiSidebar
                      docked
                      projectId={projectId}
                      aiActivity={aiActivity}
                      isOpen={isAiSidebarOpen}
                      onClose={() => setIsAiSidebarOpen(false)}
                    />
                  </div>
                </EditorRoom>
              </div>

              <ProjectDialogs />

              <ShareDialog
                open={isShareOpen}
                projectId={projectId}
                isOwner={isOwner}
                onOpenChange={setIsShareOpen}
              />
            </CanvasSaveProvider>
          </CanvasGraphProvider>
        </AiActivityControlsProvider>
      </StarterTemplatesProvider>
    </ProjectActionsProvider>
  )
}
