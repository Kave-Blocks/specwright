"use client"

import { useState, type CSSProperties, type ReactNode } from "react"

import { EditorNavbar } from "@/components/editor/editor-navbar"
import { ProjectActionsProvider } from "@/components/editor/project-actions-context"
import { ProjectDialogs } from "@/components/editor/project-dialogs"
import { ProjectSidebar } from "@/components/editor/project-sidebar"
import { useProjectActions } from "@/hooks/use-project-actions"
import type { Project } from "@/lib/projects"
import { cn } from "@/lib/utils"

interface EditorShellProps {
  ownedProjects: Project[]
  sharedProjects: Project[]
  children: ReactNode
}

export function EditorShell({
  ownedProjects,
  sharedProjects,
  children,
}: EditorShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const projectActions = useProjectActions({ ownedProjects, sharedProjects })

  return (
    <ProjectActionsProvider value={projectActions}>
      <div className="flex flex-1 flex-col">
        <EditorNavbar
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((isOpen) => !isOpen)}
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

        <ProjectSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        {/* Publishes `--canvas-inset-left` the way `EditorRoomShell` does, so
         * in-flow content on this shell (Workspace Home's project grid) can pad
         * itself clear of the `fixed` sidebar. A single centred block got away
         * with sitting partly under it; a grid does not. */}
        <main
          className="flex flex-1 flex-col pt-[var(--editor-navbar-height)]"
          style={
            {
              "--canvas-inset-left": isSidebarOpen
                ? "var(--project-sidebar-width)"
                : "0px",
            } as CSSProperties
          }
        >
          {children}
        </main>
      </div>

      <ProjectDialogs />
    </ProjectActionsProvider>
  )
}
