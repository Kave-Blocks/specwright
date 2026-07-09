"use client"

import Link from "next/link"
import { Pencil, Plus, Trash2, X } from "lucide-react"

import { useProjectActionsContext } from "@/components/editor/project-actions-context"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Project } from "@/lib/projects"
import { cn } from "@/lib/utils"

interface ProjectSidebarProps {
  isOpen: boolean
  onClose: () => void
  /**
   * When true, the panel docks as an in-flow column on desktop (pushing the
   * canvas to the remaining space) while staying a slide-over overlay on
   * mobile. Defaults to the pure floating-overlay treatment used by the
   * `/editor` home shell.
   */
  docked?: boolean
}

export function ProjectSidebar({
  isOpen,
  onClose,
  docked = false,
}: ProjectSidebarProps) {
  const {
    ownedProjects,
    sharedProjects,
    activeRoomId,
    openCreate,
    openRename,
    openDelete,
  } = useProjectActionsContext()

  return (
    <aside
      aria-hidden={!isOpen}
      className={cn(
        // Card visuals shared by both variants.
        "z-30 flex w-80 flex-col rounded-2xl border border-surface-border bg-surface/95 shadow-2xl backdrop-blur-sm",
        // Mobile overlay positioning (base) — docked mode overrides at md+.
        "fixed left-3 top-[calc(var(--editor-navbar-height)+0.75rem)] h-[calc(100vh-var(--editor-navbar-height)-1.5rem)]",
        docked
          ? "transition-[transform,margin,opacity] duration-200 ease-out md:relative md:left-auto md:top-auto md:z-auto md:h-auto md:shrink-0"
          : "transition-transform duration-200 ease-out",
        isOpen
          ? cn("translate-x-0", docked && "md:mr-3")
          : cn(
              "-translate-x-[calc(100%+1rem)] pointer-events-none",
              docked && "md:-mr-80 md:translate-x-0 md:opacity-0"
            )
      )}
    >
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
        <h2 className="font-heading text-base font-medium text-copy-primary">
          Projects
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close sidebar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs
        defaultValue="my-projects"
        className="flex flex-1 flex-col overflow-hidden px-4 pt-3"
      >
        <TabsList className="w-full">
          <TabsTrigger value="my-projects" className="flex-1">
            My Projects
          </TabsTrigger>
          <TabsTrigger value="shared" className="flex-1">
            Shared
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my-projects" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {ownedProjects.length === 0 ? (
              <p className="px-1 py-8 text-center text-sm text-copy-muted">
                No projects yet
              </p>
            ) : (
              <ul className="flex flex-col gap-1 py-2">
                {ownedProjects.map((project) => (
                  <ProjectItem
                    key={project.id}
                    project={project}
                    isActive={project.id === activeRoomId}
                    onRename={() => openRename(project)}
                    onDelete={() => openDelete(project)}
                  />
                ))}
              </ul>
            )}
          </ScrollArea>
        </TabsContent>
        <TabsContent value="shared" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {sharedProjects.length === 0 ? (
              <p className="px-1 py-8 text-center text-sm text-copy-muted">
                No shared projects yet
              </p>
            ) : (
              <ul className="flex flex-col gap-1 py-2">
                {sharedProjects.map((project) => (
                  <ProjectItem
                    key={project.id}
                    project={project}
                    isActive={project.id === activeRoomId}
                  />
                ))}
              </ul>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <div className="border-t border-surface-border p-4">
        <Button className="w-full" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>
    </aside>
  )
}

interface ProjectItemProps {
  project: Project
  isActive?: boolean
  onRename?: () => void
  onDelete?: () => void
}

function ProjectItem({
  project,
  isActive = false,
  onRename,
  onDelete,
}: ProjectItemProps) {
  const showActions = Boolean(onRename || onDelete)

  return (
    <li
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2 rounded-xl px-2 py-2 transition-colors",
        isActive ? "bg-accent-dim" : "hover:bg-elevated"
      )}
    >
      <Link
        href={`/editor/${project.slug}`}
        className="min-w-0 flex-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <p
          className={cn(
            "truncate text-sm",
            isActive ? "text-brand" : "text-copy-primary"
          )}
        >
          {project.name}
        </p>
        <p className="truncate font-mono text-xs text-copy-muted">
          {project.slug}
        </p>
      </Link>

      {showActions && (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRename}
            aria-label={`Rename ${project.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label={`Delete ${project.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </li>
  )
}
