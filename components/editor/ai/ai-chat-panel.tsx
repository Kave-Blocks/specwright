"use client"

import { Bot, X } from "lucide-react"

import { AiArchitectTab } from "@/components/editor/ai/ai-architect-tab"
import type { AiActivity } from "@/components/editor/ai/ai-activity-context"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface AiChatPanelProps {
  isOpen: boolean
  onClose: () => void
  /** Room/project id the AI Architect generates into (room id ≡ project id). */
  projectId: string
  /** Shared AI activity (status feed + working state), bridged out of the room. */
  aiActivity: AiActivity
}

/**
 * Floating AI chat panel for the `/editor/[roomId]/canvas` route. Renders the
 * AI Architect chat directly — Specs is its own route now (`ai-sidebar.tsx`'s
 * former `Tabs`/`Specs` tab is gone), so there is no tab chrome to switch
 * between.
 */
export function AiChatPanel({
  isOpen,
  onClose,
  projectId,
  aiActivity,
}: AiChatPanelProps) {
  return (
    <aside
      aria-hidden={!isOpen}
      className={cn(
        "fixed right-3 top-[calc(var(--editor-navbar-height)+var(--canvas-toolbar-height)+0.75rem)] z-30 flex h-[calc(100vh-var(--editor-navbar-height)-var(--canvas-toolbar-height)-1.5rem)] w-80 flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface/95 shadow-2xl backdrop-blur-sm",
        "transition-transform duration-200 ease-out",
        isOpen
          ? "translate-x-0"
          : "pointer-events-none translate-x-[calc(100%+1rem)]"
      )}
    >
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-ai-text">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-heading text-base font-medium text-copy-primary">
              AI Workspace
            </h2>
            <p className="truncate text-xs text-copy-muted">
              Collaborate with Specwright
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close AI sidebar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden">
        <AiArchitectTab projectId={projectId} aiActivity={aiActivity} />
      </div>
    </aside>
  )
}
