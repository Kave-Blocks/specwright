"use client"

import { Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface AiSidebarProps {
  isOpen: boolean
  onClose: () => void
  /**
   * When true, the panel docks as an in-flow column on desktop (sharing the
   * row with the canvas) while staying a slide-over overlay on mobile.
   */
  docked?: boolean
}

/**
 * Right-hand slide-over placeholder for the future AI chat panel. Mirrors the
 * docking treatment of the left `ProjectSidebar` and holds no real chat logic
 * yet.
 */
export function AiSidebar({ isOpen, onClose, docked = false }: AiSidebarProps) {
  return (
    <aside
      aria-hidden={!isOpen}
      className={cn(
        // Card visuals shared by both variants.
        "z-30 flex w-80 flex-col rounded-2xl border border-surface-border bg-surface/95 shadow-2xl backdrop-blur-sm",
        // Mobile overlay positioning (base) — docked mode overrides at md+.
        "fixed right-3 top-[calc(var(--editor-navbar-height)+0.75rem)] h-[calc(100vh-var(--editor-navbar-height)-1.5rem)]",
        docked
          ? "transition-[transform,margin,opacity] duration-200 ease-out md:relative md:right-auto md:top-auto md:z-auto md:h-auto md:shrink-0"
          : "transition-transform duration-200 ease-out",
        isOpen
          ? cn("translate-x-0", docked && "md:ml-3")
          : cn(
              "translate-x-[calc(100%+1rem)] pointer-events-none",
              docked && "md:-ml-80 md:translate-x-0 md:opacity-0"
            )
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
