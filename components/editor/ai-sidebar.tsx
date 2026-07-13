"use client"

import { Bot, X } from "lucide-react"

import { AiArchitectTab } from "@/components/editor/ai/ai-architect-tab"
import type { AiActivity } from "@/components/editor/ai/ai-activity-context"
import { SpecsTab } from "@/components/editor/ai/specs-tab"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

interface AiSidebarProps {
  isOpen: boolean
  onClose: () => void
  /** Room/project id the AI Architect generates into (room id ≡ project id). */
  projectId: string
  /** Shared AI activity (status feed + working state), bridged out of the room. */
  aiActivity: AiActivity
  /**
   * When true, the panel docks as an in-flow column on desktop (sharing the
   * row with the canvas) while staying a slide-over overlay on mobile.
   */
  docked?: boolean
}

/*
 * Token mapping — the spec describes colors with loose names; per the spec's
 * "use existing project color tokens" rule they resolve to the real tokens:
 *   text-primary-text → text-copy-primary   text-muted-text  → text-copy-muted
 *   bg-accent (tab)   → bg-accent-dim        text-accent      → text-brand
 *   text-accent-text  → text-brand           bg-brand-dim     → bg-accent-dim
 *   bg-accent (button)→ bg-brand
 * The sidebar surface keeps its existing `bg-surface/95` (a real token that
 * supports the /95 opacity modifier, unlike the standalone `bg-base` utility).
 */

/** Active-tab styling: brand-tinted accent; inactive stays muted. */
const TAB_TRIGGER_CLASS =
  "text-copy-muted data-active:bg-accent-dim data-active:text-brand dark:data-active:bg-accent-dim dark:data-active:text-brand"

/**
 * Floating AI chat sidebar for a `/editor/[roomId]` room. Open/close state is
 * owned by the parent; this component renders the sidebar surface (header +
 * tabbed AI Architect / Specs UI). It renders inside `EditorRoom`, so the
 * AI Architect tab can read and write the room's shared `ai-chat` feed.
 */
export function AiSidebar({
  isOpen,
  onClose,
  projectId,
  aiActivity,
  docked = false,
}: AiSidebarProps) {
  return (
    <aside
      aria-hidden={!isOpen}
      className={cn(
        // Card visuals shared by both variants.
        "z-30 flex w-80 flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface/95 shadow-2xl backdrop-blur-sm",
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
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-ai-text">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-heading text-base font-medium text-copy-primary">
              AI Workspace
            </h2>
            <p className="truncate text-xs text-copy-muted">
              Collaborate with Ghost AI
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

      <Tabs
        defaultValue="architect"
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="px-4 pt-3">
          <TabsList className="w-full">
            <TabsTrigger
              value="architect"
              className={cn("flex-1", TAB_TRIGGER_CLASS)}
            >
              AI Architect
            </TabsTrigger>
            <TabsTrigger
              value="specs"
              className={cn("flex-1", TAB_TRIGGER_CLASS)}
            >
              Specs
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="architect" className="flex-1 overflow-hidden">
          <AiArchitectTab projectId={projectId} aiActivity={aiActivity} />
        </TabsContent>
        <TabsContent value="specs" className="flex-1 overflow-hidden">
          <SpecsTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </aside>
  )
}
