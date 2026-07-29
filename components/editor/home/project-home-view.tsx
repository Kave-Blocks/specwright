import Link from "next/link"
import {
  ArrowRight,
  Compass,
  FileText,
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
}

/**
 * Project Home: "where do you want to work?" instead of assuming Canvas.
 * Three real mode cards plus one non-interactive placeholder for a future
 * mode — none locked or gated behind another's state.
 */
export function ProjectHomeView({
  roomId,
  hasBrief,
  hasCanvas,
  specCount,
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
      {status && <p className="text-xs font-medium text-copy-faint">{status}</p>}
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
 * link, no hover state: it must read as planned, not broken.
 */
function PlannedModeCard({ icon: Icon, title, description }: PlannedModeCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-surface-border p-5 opacity-50">
      <div className="flex items-start justify-between">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-copy-muted">
          <Icon className="h-5 w-5" />
        </span>
        <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide text-copy-muted uppercase">
          Planned
        </span>
      </div>
      <div>
        <h2 className="font-heading text-sm font-medium text-copy-primary">
          {title}
        </h2>
        <p className="mt-1 text-xs text-copy-muted">{description}</p>
      </div>
    </div>
  )
}
