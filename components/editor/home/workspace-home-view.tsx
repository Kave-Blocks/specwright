import Link from "next/link"

import { HOUSE_BADGE } from "@/components/editor/house-badge"
import { CARD_SHELL } from "@/components/editor/home/mode-card"
import { StartWorkCards } from "@/components/editor/home/start-work-cards"
import type { WorkspaceProject } from "@/lib/projects"
import { cn } from "@/lib/utils"

/**
 * How many projects the grid shows. The sidebar holds the remainder, and it is
 * always open to the same list, so the copy above the grid must never imply the
 * grid is all of them. There is deliberately no "all projects" route: the
 * sidebar already is one.
 */
const GRID_CAP = 6

interface WorkspaceHomeViewProps {
  ownedProjects: WorkspaceProject[]
  sharedProjects: WorkspaceProject[]
}

/**
 * Workspace Home — the landing view for `/editor`.
 *
 * It replaces a single hardcoded sentence ("Create a project or open an
 * existing one") that told a returning user with two projects in the sidebar to
 * create one. Every branch below is read off the user's real state, and every
 * fragment of a card's status line is composed from a persisted column.
 *
 * A Server Component, as `project-home-view.tsx` is: `EditorShell` is the
 * client boundary and takes server-rendered `children`. The one interactive
 * piece, `StartWorkCards`, is its own `"use client"` leaf.
 */
export function WorkspaceHomeView({
  ownedProjects,
  sharedProjects,
}: WorkspaceHomeViewProps) {
  const hasOwned = ownedProjects.length > 0
  const hasShared = sharedProjects.length > 0

  // Owned first, then shared. The two lists arrive each ordered by activity but
  // cannot be interleaved by it: `WorkspaceProject` deliberately carries no
  // `updatedAt`, so there is no key to merge-sort on — and owned-first is the
  // honest priority for a screen about resuming your own work anyway.
  const gridProjects = (hasOwned ? [...ownedProjects, ...sharedProjects] : sharedProjects).slice(
    0,
    GRID_CAP,
  )

  return (
    // Two divs on purpose: the inset is padding, and padding on the *centred*
    // box insets its content instead of shifting the box, which is the bug
    // `progress/2026-07-29-sidebar-overlay-layout-fix.md` records. The
    // transition matches the sidebar's own, so content and sidebar move
    // together — and with the sidebar closed the property resolves to `0px` and
    // the grid takes the full width.
    <div className="flex flex-1 flex-col pl-(--canvas-inset-left,0px) transition-[padding-left] duration-200 ease-out">
      {/* `m-auto`, not `justify-center` on the parent: this screen can carry a
       * full grid *and* the start cards, and a centred flex container whose
       * content overflows puts its top out of reach of any scrollbar. Auto
       * margins centre while there is free space and collapse to zero when
       * there is not, so a tall workspace scrolls from the top instead. */}
      <div className="m-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10">
        {hasOwned ? (
          <>
            <section>
              <SectionHeading
                title="Jump back in"
                description="Your most recent work. The sidebar has every project you can open."
                as="h1"
              />
              <ProjectGrid projects={gridProjects} />
            </section>
            <section>
              <SectionHeading
                title="Start something new"
                description="Three ways in. Each one creates the project first."
                as="h2"
              />
              <StartWorkCards />
            </section>
          </>
        ) : hasShared ? (
          <>
            <section>
              {/* Never "you have no projects": the sidebar is on screen, listing
               * the ones below, and would visibly contradict it. */}
              <SectionHeading
                title="Shared with you"
                description="These projects belong to someone else and you have been added to them. When you want one of your own, start it below."
                as="h1"
              />
              <ProjectGrid projects={gridProjects} />
            </section>
            <section>
              <SectionHeading
                title="Start your own"
                description="Three ways in. Each one creates the project first."
                as="h2"
              />
              <StartWorkCards />
            </section>
          </>
        ) : (
          // True first run: no grid at all, and the start cards carry the
          // screen. One sentence says what a project is, because nothing else
          // on screen can.
          <section>
            <SectionHeading
              title="Start your first project"
              description="A Specwright project is one system design: describe it in plain English, an AI agent maps it onto a shared canvas you and your collaborators refine, and the finished graph becomes a Markdown technical spec."
              as="h1"
            />
            <StartWorkCards />
          </section>
        )}
      </div>
    </div>
  )
}

interface SectionHeadingProps {
  title: string
  description: string
  as: "h1" | "h2"
}

function SectionHeading({ title, description, as }: SectionHeadingProps) {
  const Heading = as

  return (
    <div className="mb-6">
      <Heading
        className={cn(
          "font-heading font-medium text-copy-primary",
          as === "h1" ? "text-2xl" : "text-lg",
        )}
      >
        {title}
      </Heading>
      <p className="mt-1 text-sm text-copy-muted">{description}</p>
    </div>
  )
}

function ProjectGrid({ projects }: { projects: WorkspaceProject[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  )
}

/**
 * One project, compressed to what fits: its name, whether it is someone else's,
 * and one composed status line. No description — `Project.description` is never
 * written by anything in this app, so rendering it would invent state, which is
 * the failure this whole screen exists to fix.
 */
function ProjectCard({ project }: { project: WorkspaceProject }) {
  return (
    <Link href={`/editor/${project.slug}`} className={CARD_SHELL}>
      <div className="flex items-start justify-between gap-3">
        {/* `min-w-0` on the heading itself, not only on this flex row: a flex
         * item's default `min-width: auto` floors it at its own content width,
         * so `truncate` would have no box narrower than the text to clip
         * against. That was a real overlap bug at 768px, not a theoretical one. */}
        <h2 className="min-w-0 flex-1 truncate font-heading text-sm font-medium text-copy-primary">
          {project.name}
        </h2>
        {/* Only collaborator projects are badged. Owned ones get no
         * counterpart — absence is the signal, the same rule the source-spec
         * badge and the drift notice already follow. */}
        {project.role === "collaborator" && (
          <span className={cn(HOUSE_BADGE, "shrink-0 text-copy-muted")}>
            Shared
          </span>
        )}
      </div>
      <p className="text-xs font-medium text-copy-muted">
        {statusLine(project)}
      </p>
    </Link>
  )
}

/**
 * The project's state in one line, fragments joined with this repo's inline
 * separator.
 *
 * Zero-valued fragments are **omitted**, where Project Home states them ("No
 * specs yet"). That is not drift and must not be read as drift: a mode card is
 * the door to *one* mode, so naming what is behind it is the content; a project
 * card compresses a whole project, so absence is the signal. The canvas
 * fragment is always present, so the line is never empty and needs no zero
 * case.
 *
 * It deliberately carries no open-change count. That is arguably the most
 * action-worthy signal here, but a four-fragment line gets long; it is one
 * `_count` and one fragment if that changes.
 */
function statusLine(project: WorkspaceProject): string {
  // Wording verbatim from Project Home's Canvas card.
  const fragments = [project.hasCanvas ? "Canvas saved" : "Empty canvas"]

  if (project.specCount > 0) {
    fragments.push(project.specCount === 1 ? "1 spec" : `${project.specCount} specs`)
  }

  // Wording verbatim from Project Home's Build card, including its deliberate
  // lack of a singular/plural branch: the line has no noun to inflect, so
  // "1 of 1 shipped" is already correct English.
  if (project.buildUnitCount > 0) {
    fragments.push(
      `${project.shippedBuildUnitCount} of ${project.buildUnitCount} shipped`,
    )
  }

  return fragments.join(" · ")
}
