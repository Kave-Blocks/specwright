"use client"

import { useState, type ReactNode } from "react"

import { EditorNavbar } from "@/components/editor/editor-navbar"
import { ProjectActionsProvider } from "@/components/editor/project-actions-context"
import { ProjectDialogs } from "@/components/editor/project-dialogs"
import { ProjectSidebar } from "@/components/editor/project-sidebar"
import { useProjectActions } from "@/hooks/use-project-actions"
import { cn } from "@/lib/utils"

interface EditorShellProps {
  children: ReactNode
}

export function EditorShell({ children }: EditorShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const projectActions = useProjectActions()

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
        <main className="flex flex-1 flex-col pt-14">{children}</main>
      </div>

      <ProjectDialogs />
    </ProjectActionsProvider>
  )
}
