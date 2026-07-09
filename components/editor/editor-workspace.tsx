"use client"

import { useState } from "react"

import { AiSidebar } from "@/components/editor/ai-sidebar"
import { CanvasRoom } from "@/components/editor/canvas/canvas-room"
import { ProjectActionsProvider } from "@/components/editor/project-actions-context"
import { ProjectDialogs } from "@/components/editor/project-dialogs"
import { ProjectSidebar } from "@/components/editor/project-sidebar"
import { ShareDialog } from "@/components/editor/share/share-dialog"
import { StarterTemplatesProvider } from "@/components/editor/starter-templates-context"
import { WorkspaceNavbar } from "@/components/editor/workspace-navbar"
import { useProjectActions } from "@/hooks/use-project-actions"
import type { Project } from "@/lib/projects"
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
 * the central `CanvasRoom` (Liveblocks-backed React Flow canvas). The AI panel
 * is still a placeholder.
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
  const projectActions = useProjectActions({ ownedProjects, sharedProjects })

  return (
    <ProjectActionsProvider value={projectActions}>
      <StarterTemplatesProvider
        value={{ isOpen: isTemplatesOpen, setOpen: setIsTemplatesOpen }}
      >
        <div className="flex flex-1 flex-col">
          <WorkspaceNavbar
            projectName={projectName}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen((isOpen) => !isOpen)}
            isAiSidebarOpen={isAiSidebarOpen}
            onToggleAiSidebar={() => setIsAiSidebarOpen((isOpen) => !isOpen)}
            onOpenShare={() => setIsShareOpen(true)}
            onOpenTemplates={() => setIsTemplatesOpen(true)}
          />

          {/* Mobile backdrop scrim — tapping outside the sidebar closes it. */}
          <div
            aria-hidden
            onClick={() => setIsSidebarOpen(false)}
            className={cn(
              "fixed inset-0 z-20 bg-black/50 backdrop-blur-sm transition-opacity duration-200 md:hidden",
              isSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          />

          {/* Docked workspace row: sidebar · canvas · AI panel. On desktop the
           * panels are in-flow columns so the canvas fills the remaining space;
           * on mobile they collapse to slide-over overlays. */}
          <div className="flex flex-1 overflow-hidden p-3 pt-[calc(var(--editor-navbar-height)+0.75rem)]">
            <ProjectSidebar
              docked
              isOpen={isSidebarOpen}
              onClose={() => setIsSidebarOpen(false)}
            />

            <main className="relative flex-1 overflow-hidden bg-base">
              <CanvasRoom roomId={projectId} />
            </main>

            <AiSidebar
              docked
              isOpen={isAiSidebarOpen}
              onClose={() => setIsAiSidebarOpen(false)}
            />
          </div>
        </div>

        <ProjectDialogs />

        <ShareDialog
          open={isShareOpen}
          projectId={projectId}
          isOwner={isOwner}
          onOpenChange={setIsShareOpen}
        />
      </StarterTemplatesProvider>
    </ProjectActionsProvider>
  )
}
