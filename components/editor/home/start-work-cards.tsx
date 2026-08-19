"use client"

import { Compass, LayoutTemplate, Plus, type LucideIcon } from "lucide-react"

import {
  CARD_ICON_TILE,
  CARD_SHELL,
} from "@/components/editor/home/mode-card"
import { useProjectActionsContext } from "@/components/editor/project-actions-context"
import { cn } from "@/lib/utils"

/**
 * The three ways to start work from Workspace Home. The `"use client"` leaf of
 * an otherwise server-rendered screen: every card opens the create dialog, so
 * this needs `useProjectActionsContext`, and nothing else on the view does.
 *
 * All three create a project first. Discovery and the starter-design picker are
 * destinations the create dialog routes to afterwards — there is no active
 * Liveblocks room at `/editor`, and both of those surfaces need one.
 */
export function StartWorkCards() {
  const { openCreate } = useProjectActionsContext()

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StartWorkCard
        icon={Plus}
        title="New project"
        description="An empty workspace. Draw the architecture yourself, or prompt the AI once you are in."
        onClick={() => openCreate()}
      />
      <StartWorkCard
        icon={Compass}
        title="Start with a guided interview"
        description="A short, fully skippable interview that composes a structured brief and hands it to the AI in place of a one-line prompt."
        onClick={() => openCreate("discovery")}
      />
      <StartWorkCard
        icon={LayoutTemplate}
        title="Browse starter designs"
        description="Begin from a prebuilt system design — monolith, microservices, event-driven, serverless — and edit from there."
        onClick={() => openCreate("canvas-templates")}
      />
    </div>
  )
}

interface StartWorkCardProps {
  icon: LucideIcon
  title: string
  description: string
  onClick: () => void
}

/**
 * A mode card's shell on a `<button>` rather than a `<Link>`: these open a
 * dialog, they do not navigate. `text-left` is the only addition the element
 * change costs — a button centres its text where an anchor does not.
 */
function StartWorkCard({
  icon: Icon,
  title,
  description,
  onClick,
}: StartWorkCardProps) {
  return (
    <button type="button" onClick={onClick} className={cn(CARD_SHELL, "text-left")}>
      <span className={cn(CARD_ICON_TILE, "text-brand")}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="block">
        <span className="block font-heading text-sm font-medium text-copy-primary">
          {title}
        </span>
        <span className="mt-1 block text-xs text-copy-muted">{description}</span>
      </span>
    </button>
  )
}
