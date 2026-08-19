"use client"

import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"

import {
  CanvasGraphProvider,
  EMPTY_CANVAS_GRAPH,
  type CanvasGraph,
} from "@/components/editor/canvas/canvas-graph-context"
import { ProjectActionsProvider } from "@/components/editor/project-actions-context"
import { ProjectDialogs } from "@/components/editor/project-dialogs"
import { ProjectSidebar } from "@/components/editor/project-sidebar"
import { ShareDialog } from "@/components/editor/share/share-dialog"
import { WorkspaceNavbar } from "@/components/editor/workspace-navbar"
import { useProjectActions } from "@/hooks/use-project-actions"
import type { Project } from "@/lib/projects"
import { cn } from "@/lib/utils"

interface EditorRoomShellProps {
  projectId: string
  projectName: string
  isOwner: boolean
  ownedProjects: Project[]
  sharedProjects: Project[]
  children: ReactNode
}

/**
 * Project-wide chrome shared by every route under `/editor/[roomId]`: the
 * navbar (logo, sidebar toggle, project name, mode-switcher, Share), the
 * project-switcher sidebar, and the create/rename/delete + share dialogs.
 * Route content (Home, Discovery, Canvas, Specs) renders as `children`.
 *
 * Also owns the live canvas graph bridge (`CanvasGraphProvider`). It has to
 * live above the routed content rather than inside the Canvas route: only
 * Canvas's `CanvasFlow` writes to it, but Specs reads it from an entirely
 * different route, so the ref has to outlive navigation between the two.
 */
export function EditorRoomShell({
  projectId,
  projectName,
  isOwner,
  ownedProjects,
  sharedProjects,
  children,
}: EditorRoomShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const projectActions = useProjectActions({ ownedProjects, sharedProjects })

  const graphRef = useRef<CanvasGraph>(EMPTY_CANVAS_GRAPH)
  const graphControls = useMemo(() => ({ graphRef }), [])

  return (
    <ProjectActionsProvider value={projectActions}>
      <div className="flex flex-1 flex-col">
        <WorkspaceNavbar
          roomId={projectId}
          projectName={projectName}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((isOpen) => !isOpen)}
          onOpenShare={() => setIsShareOpen(true)}
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

        <CanvasGraphProvider value={graphControls}>
          {/* `--canvas-inset-left` cascades down to any route's floating
           * canvas chrome (zoom controls, presence avatars) that needs to
           * clear this sidebar when it's open — set once here rather than in
           * every route that might need it. */}
          <div
            className="relative flex flex-1 flex-col overflow-hidden pt-[var(--editor-navbar-height)]"
            style={
              {
                "--canvas-inset-left": isSidebarOpen
                  ? "var(--project-sidebar-width)"
                  : "0px",
              } as CSSProperties
            }
          >
            {children}
          </div>
        </CanvasGraphProvider>
      </div>

      <ProjectDialogs />

      <ShareDialog
        open={isShareOpen}
        projectId={projectId}
        isOwner={isOwner}
        onOpenChange={setIsShareOpen}
      />
    </ProjectActionsProvider>
  )
}
