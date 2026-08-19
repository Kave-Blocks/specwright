import Link from "next/link"
import { ArrowRight, type LucideIcon } from "lucide-react"

import { HOUSE_BADGE } from "@/components/editor/house-badge"
import { cn } from "@/lib/utils"

/**
 * The shape every card in this app's home surfaces wears: one radius, one
 * border, one padding, one internal rhythm. Kept module-private — nothing
 * outside this file renders a card that is *only* a shape.
 */
const CARD_BASE =
  "flex flex-col gap-4 rounded-2xl border border-surface-border p-5"

/**
 * The interactive card shell — {@link CARD_BASE} plus the hover and focus
 * affordances — exported so Workspace Home's project cards and action cards
 * wear the identical container without `ModeCard` being bent to serve three
 * shapes. Project Home and Workspace Home must read as one system, so there is
 * exactly one card language and this is it.
 *
 * It carries `group`, so a child may key off `group-hover:` the way
 * {@link ModeCard}'s arrow does.
 */
export const CARD_SHELL = `group ${CARD_BASE} transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none`

/**
 * The icon tile every card leads with. Split shell-from-tone the same way
 * {@link HOUSE_BADGE} is: the tile is `bg-subtle` everywhere, and the caller
 * passes the icon's tone — `text-brand` on a real destination,
 * `text-copy-muted` on the non-interactive planned card.
 */
export const CARD_ICON_TILE =
  "flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle"

interface ModeCardProps {
  href: string
  icon: LucideIcon
  title: string
  description: string
  status?: string
}

export function ModeCard({
  href,
  icon: Icon,
  title,
  description,
  status,
}: ModeCardProps) {
  return (
    <Link href={href} className={CARD_SHELL}>
      <div className="flex items-start justify-between">
        <span className={cn(CARD_ICON_TILE, "text-brand")}>
          <Icon className="h-5 w-5" />
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-copy-faint transition-colors group-hover:text-copy-muted" />
      </div>
      <div>
        <h2 className="font-heading text-sm font-medium text-copy-primary">
          {title}
        </h2>
        <p className="mt-1 text-xs text-copy-muted">{description}</p>
      </div>
      {status && <p className="text-xs font-medium text-copy-muted">{status}</p>}
    </Link>
  )
}

interface PlannedModeCardProps {
  icon: LucideIcon
  title: string
  description: string
}

/**
 * Non-interactive placeholder for a future mode — the multi-agent "Research
 * Fleet" concept recorded as the team's deferred long-term direction. No
 * link, no hover state, no arrow: it must read as planned, not broken.
 *
 * Deliberately carries **no `opacity-50`**. Opacity on the container forms a
 * compositing group: the whole subtree flattens at 50% against the page
 * (`--bg-base`, since this card has no fill of its own), so every child's
 * contrast is measured on the composited value, not the token. That put the
 * badge and description at 1.93:1 and 2.08:1. `opacity-100` on a descendant
 * does not escape an ancestor's group, so the only fix is not to open one.
 *
 * Subordination is carried instead by three signals that cost no contrast:
 * a `text-copy-muted` title where the four real cards take `text-copy-primary`,
 * no arrow affordance, and no hover or focus state.
 *
 * The badge is the shared house treatment ({@link HOUSE_BADGE}) — this card is
 * the one unit 38's collapsed-row badges were modelled on, and the two must not
 * drift again, which is why the string now lives in one file rather than three.
 */
export function PlannedModeCard({
  icon: Icon,
  title,
  description,
}: PlannedModeCardProps) {
  return (
    <div className={CARD_BASE}>
      <div className="flex items-start justify-between">
        <span className={cn(CARD_ICON_TILE, "text-copy-muted")}>
          <Icon className="h-5 w-5" />
        </span>
        <span className={cn(HOUSE_BADGE, "shrink-0 text-copy-muted")}>
          Planned
        </span>
      </div>
      <div>
        <h2 className="font-heading text-sm font-medium text-copy-muted">
          {title}
        </h2>
        <p className="mt-1 text-xs text-copy-muted">{description}</p>
      </div>
    </div>
  )
}
