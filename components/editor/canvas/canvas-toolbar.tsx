"use client"

import { LayoutTemplate, Sparkles } from "lucide-react"

import { SaveStatusButton } from "@/components/editor/save-status-button"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CanvasSaveStatus } from "@/types/canvas"

interface CanvasToolbarProps {
  saveStatus: CanvasSaveStatus
  onSave: () => void
  onOpenTemplates: () => void
  isAiSidebarOpen: boolean
  onToggleAiSidebar: () => void
}

/**
 * Canvas route's own secondary control bar: save status, starter templates,
 * and the AI chat panel toggle. These are meaningful only while the canvas is
 * the active route, so they live here rather than in the project-wide navbar
 * (`h-[var(--canvas-toolbar-height)]`, which the AI chat panel's fixed
 * positioning derives from).
 */
export function CanvasToolbar({
  saveStatus,
  onSave,
  onOpenTemplates,
  isAiSidebarOpen,
  onToggleAiSidebar,
}: CanvasToolbarProps) {
  return (
    <div className="flex h-[var(--canvas-toolbar-height)] shrink-0 items-center justify-end gap-1 border-b border-surface-border bg-surface px-3">
      <SaveStatusButton status={saveStatus} onSave={onSave} />
      <Button variant="ghost" size="sm" onClick={onOpenTemplates}>
        <LayoutTemplate className="h-4 w-4" />
        Templates
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
  )
}
