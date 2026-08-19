import {
  Compass,
  FileText,
  GitPullRequest,
  ListChecks,
  Users,
  Workflow,
} from "lucide-react"

import {
  ModeCard,
  PlannedModeCard,
} from "@/components/editor/home/mode-card"

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
