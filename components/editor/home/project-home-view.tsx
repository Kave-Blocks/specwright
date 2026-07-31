import Link from "next/link"
import {
  ArrowRight,
  Compass,
  FileText,
  GitPullRequest,
  ListChecks,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react"

interface ProjectHomeViewProps {
  /** Room/project id (room id ≡ project id) the mode cards link into. */
  roomId: string
  /** Whether Discovery has been run and its brief saved (`Project.architectureBrief`). */
  hasBrief: boolean
  /** Whether the project has a saved canvas (`Project.canvasJsonPath`). */
  hasCanvas: boolean
  /** Real count of generated specs (`ProjectSpec` rows for this project). */
  specCount: number
  /** Real count of build units (`ProjectBuildUnit` rows for this project). */
  buildUnitCount: number
  /** How many of those build units a person has marked `shipped`. */
  shippedBuildUnitCount: number
  /**
   * Change proposals still awaiting a decision (`ProjectChange` rows at
   * `proposed`). Applied and discarded changes are deliberately excluded — the
   * card reports what is waiting on a person, not how many changes ever existed.
   */
  openChangeCount: number
}

/**
 * Project Home: "where do you want to work?" instead of assuming Canvas.
 * Five real mode cards plus one non-interactive placeholder for a future
 * mode — none locked or gated behind another's state.
 *
 * Changes was added as the fifth card and the placeholder moved to sixth,
 * rather than the placeholder's slot being reused: it names Research Fleet, a
 * deferred product direction of its own, so replacing it would quietly delete
 * that decision instead of adding a mode beside it.
 */
export function ProjectHomeView({
  roomId,
  hasBrief,
  hasCanvas,
  specCount,
  buildUnitCount,
  shippedBuildUnitCount,
  openChangeCount,
}: ProjectHomeViewProps) {
  return (
    <div className="h-full pl-(--canvas-inset-left,0px) transition-[padding-left] duration-200 ease-out">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-center overflow-y-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="font-heading text-2xl font-medium text-copy-primary">
            Where do you want to work?
          </h1>
          <p className="mt-1 text-sm text-copy-muted">
            Every mode is reachable at any time — nothing here is locked behind
            another.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ModeCard
            href={`/editor/${roomId}/discovery`}
            icon={Compass}
            title="Architecture Interview"
            description="A short guided interview that composes a structured project brief and hands it to the AI in place of a one-line prompt."
            // No line before a brief exists: "not started" is not a state worth
            // asserting, and there is no equivalent phrasing on the other cards.
            status={hasBrief ? "Brief composed" : undefined}
          />
          <ModeCard
            href={`/editor/${roomId}/canvas`}
            icon={Workflow}
            title="Canvas"
            description="The collaborative system-design canvas — prompt the AI, or draw the architecture yourself."
            status={hasCanvas ? "Canvas saved" : "Empty canvas"}
          />
          <ModeCard
            href={`/editor/${roomId}/specs`}
            icon={FileText}
            title="Specs"
            description="Generated Markdown technical specs for this project, ready to preview or download."
            status={
              specCount === 0
                ? "No specs yet"
                : specCount === 1
                  ? "1 spec generated"
                  : `${specCount} specs generated`
            }
          />
          <ModeCard
            href={`/editor/${roomId}/build`}
            icon={ListChecks}
            title="Build"
            description="The units of work this project intends to ship, each with a status and a verification level the team owns."
            // Deliberately not the Specs card's singular/plural branch: the
            // line has no noun to inflect, so "1 of 1 shipped" is already
            // correct English and a variant would only add a way to disagree.
            status={
              buildUnitCount === 0
                ? "No units yet"
                : `${shippedBuildUnitCount} of ${buildUnitCount} shipped`
            }
          />
          <ModeCard
            href={`/editor/${roomId}/changes`}
            icon={GitPullRequest}
            title="Changes"
            description="Describe a change in plain English and get back what it moves in the architecture, which units it makes stale, and what new work it implies."
            // The Specs card's singular/plural branch, for the same reason it
            // has one: "1 changes awaiting review" has a noun to inflect and
            // would read as a bug. Only changes still at `proposed` are counted,
            // so this line goes back to zero once they have been dealt with.
            status={
              openChangeCount === 0
                ? "No changes yet"
                : openChangeCount === 1
                  ? "1 awaiting review"
                  : `${openChangeCount} awaiting review`
            }
          />
          <PlannedModeCard
            icon={Users}
            title="Research Fleet"
            description="A manager agent dispatching a team of specialist agents to research and critique the design together, live."
          />
        </div>
      </div>
    </div>
  )
}

interface ModeCardProps {
  href: string
  icon: LucideIcon
  title: string
  description: string
  status?: string
}

function ModeCard({ href, icon: Icon, title, description, status }: ModeCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-4 rounded-2xl border border-surface-border p-5 transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-brand">
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
 * The badge is unit 38's shipped treatment verbatim (`BADGE` in
 * `components/editor/build/build-unit-row.tsx`) — this card is the one 38's
 * collapsed-row badges were modelled on, and the two must not drift again.
 */
function PlannedModeCard({ icon: Icon, title, description }: PlannedModeCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-surface-border p-5">
      <div className="flex items-start justify-between">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-copy-muted">
          <Icon className="h-5 w-5" />
        </span>
        <span className="shrink-0 rounded-full border border-surface-border bg-base px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide text-copy-muted uppercase">
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
