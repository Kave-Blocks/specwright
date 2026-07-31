import { BuildUnitStatus, ChangeStatus } from "@/app/generated/prisma/enums"
import { ProjectHomeView } from "@/components/editor/home/project-home-view"
import { prisma } from "@/lib/prisma"
import { getAccessibleProject, getClerkIdentity } from "@/lib/project-access"

interface ProjectHomePageProps {
  params: Promise<{ roomId: string }>
}

/**
 * Project Home — the landing view for `/editor/[roomId]`. Reads four real,
 * already-available signals (whether Discovery has saved a brief, whether the
 * canvas has been saved, a real generated-spec count, and how many build units
 * exist and how many of them have shipped) rather than inventing status that
 * isn't backed by data.
 *
 * `identity`/`project` are re-derived here (not passed down from the layout,
 * which Next.js layouts cannot do) — but both calls are wrapped in `cache()`
 * in `lib/project-access.ts`, so this shares the layout's lookup rather than
 * re-querying. The null branches below are unreachable in practice: the
 * layout already redirects or renders `AccessDenied` before this page runs.
 */
export default async function ProjectHomePage({ params }: ProjectHomePageProps) {
  const { roomId } = await params

  const identity = await getClerkIdentity()
  if (!identity) return null

  const project = await getAccessibleProject(roomId, identity)
  if (!project) return null

  // Four independent counts over the same project — issued together so Home
  // costs one round trip rather than four sequential ones.
  const [
    specCount,
    buildUnitCount,
    shippedBuildUnitCount,
    openChangeCount,
  ] = await Promise.all([
    prisma.projectSpec.count({ where: { projectId: project.id } }),
    prisma.projectBuildUnit.count({ where: { projectId: project.id } }),
    prisma.projectBuildUnit.count({
      where: { projectId: project.id, status: BuildUnitStatus.SHIPPED },
    }),
    // Only the changes still awaiting a decision. An applied or discarded
    // proposal has already been dealt with, so counting it would turn the card's
    // status line into a total that never goes down.
    prisma.projectChange.count({
      where: { projectId: project.id, status: ChangeStatus.PROPOSED },
    }),
  ])

  return (
    <ProjectHomeView
      roomId={roomId}
      hasBrief={Boolean(project.architectureBrief)}
      hasCanvas={Boolean(project.canvasJsonPath)}
      specCount={specCount}
      buildUnitCount={buildUnitCount}
      shippedBuildUnitCount={shippedBuildUnitCount}
      openChangeCount={openChangeCount}
    />
  )
}
