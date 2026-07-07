"use client"

import { Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

interface ProjectSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function ProjectSidebar({ isOpen, onClose }: ProjectSidebarProps) {
  return (
    <aside
      aria-hidden={!isOpen}
      className={cn(
        "fixed top-[4.25rem] left-3 z-30 flex h-[calc(100vh-5rem)] w-80 flex-col rounded-2xl border border-surface-border bg-surface/95 shadow-2xl backdrop-blur-sm transition-transform duration-200 ease-out",
        isOpen
          ? "translate-x-0"
          : "-translate-x-[calc(100%+1rem)] pointer-events-none"
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
            <p className="px-1 py-8 text-center text-sm text-copy-muted">
              No projects yet
            </p>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="shared" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <p className="px-1 py-8 text-center text-sm text-copy-muted">
              No shared projects yet
            </p>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <div className="border-t border-surface-border p-4">
        <Button className="w-full">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>
    </aside>
  )
}
