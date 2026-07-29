import { ProjectHomeView } from "@/components/editor/home/project-home-view"
import { prisma } from "@/lib/prisma"
import { getAccessibleProject, getClerkIdentity } from "@/lib/project-access"

interface ProjectHomePageProps {
  params: Promise<{ roomId: string }>
}

/**
 * Project Home — the landing view for `/editor/[roomId]`. Reads three real,
 * already-available signals (whether Discovery has saved a brief, whether the
 * canvas has been saved, and a real generated-spec count) rather than
 * inventing status that isn't backed by data.
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

  const specCount = await prisma.projectSpec.count({
    where: { projectId: project.id },
  })

  return (
    <ProjectHomeView
      roomId={roomId}
      hasBrief={Boolean(project.architectureBrief)}
      hasCanvas={Boolean(project.canvasJsonPath)}
      specCount={specCount}
    />
  )
}
