"use client"

import {
  LayoutTemplate,
  PanelLeftClose,
  PanelLeftOpen,
  Share2,
  Sparkles,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface WorkspaceNavbarProps {
  projectName: string
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  isAiSidebarOpen: boolean
  onToggleAiSidebar: () => void
  onOpenShare: () => void
  onOpenTemplates: () => void
}

export function WorkspaceNavbar({
  projectName,
  isSidebarOpen,
  onToggleSidebar,
  isAiSidebarOpen,
  onToggleAiSidebar,
  onOpenShare,
  onOpenTemplates,
}: WorkspaceNavbarProps) {
  const SidebarToggleIcon = isSidebarOpen ? PanelLeftClose : PanelLeftOpen

  return (
    <header className="fixed inset-x-0 top-0 z-40 grid h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-surface-border bg-surface px-3">
      <div className="flex items-center justify-self-start">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          <SidebarToggleIcon className="h-5 w-5" />
        </Button>
      </div>

      <div className="min-w-0 justify-self-center px-4">
        <p className="truncate font-heading text-sm font-medium text-copy-primary">
          {projectName}
        </p>
      </div>

      <div className="flex items-center gap-1 justify-self-end">
        <Button variant="ghost" size="sm" onClick={onOpenTemplates}>
          <LayoutTemplate className="h-4 w-4" />
          Templates
        </Button>
        <Button variant="outline" size="sm" onClick={onOpenShare}>
          <Share2 className="h-4 w-4" />
          Share
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleAiSidebar}
          aria-pressed={isAiSidebarOpen}
          aria-label={
            isAiSidebarOpen ? "Close AI assistant" : "Open AI assistant"
          }
          className={cn(isAiSidebarOpen && "bg-elevated text-ai-text")}
        >
          <Sparkles className="h-5 w-5" />
        </Button>
      </div>
    </header>
  )
}
