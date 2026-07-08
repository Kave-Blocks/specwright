"use client"

import { Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface AiSidebarProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Right-hand slide-over placeholder for the future AI chat panel. Mirrors the
 * floating overlay treatment of the left `ProjectSidebar` and holds no real
 * chat logic yet.
 */
export function AiSidebar({ isOpen, onClose }: AiSidebarProps) {
  return (
    <aside
      aria-hidden={!isOpen}
      className={cn(
        "fixed right-3 z-30 flex w-80 flex-col rounded-2xl border border-surface-border bg-surface/95 shadow-2xl backdrop-blur-sm transition-transform duration-200 ease-out top-[calc(var(--editor-navbar-height)+0.75rem)] h-[calc(100vh-var(--editor-navbar-height)-1.5rem)]",
        isOpen
          ? "translate-x-0"
          : "translate-x-[calc(100%+1rem)] pointer-events-none"
      )}
    >
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-medium text-copy-primary">
          <Sparkles className="h-4 w-4 text-ai-text" />
          AI Assistant
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close AI sidebar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-copy-muted">AI chat coming soon</p>
        <p className="text-xs text-copy-faint">
          Generate and refine your design with the AI assistant.
        </p>
      </div>
    </aside>
  )
}
