"use client"

import { useState } from "react"

import { AiSidebar } from "@/components/editor/ai-sidebar"
import { ProjectActionsProvider } from "@/components/editor/project-actions-context"
import { ProjectDialogs } from "@/components/editor/project-dialogs"
import { ProjectSidebar } from "@/components/editor/project-sidebar"
import { WorkspaceNavbar } from "@/components/editor/workspace-navbar"
import { useProjectActions } from "@/hooks/use-project-actions"
import type { Project } from "@/lib/projects"
import { cn } from "@/lib/utils"

interface EditorWorkspaceProps {
  projectName: string
  ownedProjects: Project[]
  sharedProjects: Project[]
}

/**
 * Client shell for a single `/editor/[roomId]` room. Owns the open/closed
 * state for both slide-over panels and composes the workspace chrome around a
 * central canvas placeholder. No canvas, Liveblocks, or AI logic yet — this is
 * the layout shell only.
 */
export function EditorWorkspace({
  projectName,
  ownedProjects,
  sharedProjects,
}: EditorWorkspaceProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false)
  const projectActions = useProjectActions({ ownedProjects, sharedProjects })

  return (
    <ProjectActionsProvider value={projectActions}>
      <div className="flex flex-1 flex-col">
        <WorkspaceNavbar
          projectName={projectName}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((isOpen) => !isOpen)}
          isAiSidebarOpen={isAiSidebarOpen}
          onToggleAiSidebar={() => setIsAiSidebarOpen((isOpen) => !isOpen)}
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

        <ProjectSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <AiSidebar
          isOpen={isAiSidebarOpen}
          onClose={() => setIsAiSidebarOpen(false)}
        />

        <main className="flex flex-1 pt-14">
          <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-base text-center">
            <p className="text-sm text-copy-muted">Canvas coming soon</p>
            <p className="text-xs text-copy-faint">
              The real-time collaborative canvas will render here.
            </p>
          </div>
        </main>
      </div>

      <ProjectDialogs />
    </ProjectActionsProvider>
  )
}
