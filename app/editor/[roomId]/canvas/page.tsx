import { CanvasWorkspace } from "@/components/editor/canvas/canvas-workspace"
import {
  CANVAS_TEMPLATES_PARAM,
  CANVAS_TEMPLATES_PARAM_VALUE,
} from "@/lib/canvas-route"

interface CanvasPageProps {
  params: Promise<{ roomId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The `/editor/[roomId]/canvas` route. Room id ≡ project id, so no extra data
 * fetch is needed here.
 *
 * `?templates=1` lands with the starter-design picker already open — the tail
 * of "Browse starter designs" on Workspace Home, which creates the project
 * first because template import runs client-side inside an active Liveblocks
 * room and there is none at `/editor`.
 *
 * The param is read **here, on the server**, and handed down as a boolean, the
 * repo's page-reads / component-receives pattern. `useSearchParams` in the
 * client component would need a Suspense boundary for the same result.
 */
export default async function CanvasPage({
  params,
  searchParams,
}: CanvasPageProps) {
  const [{ roomId }, query] = await Promise.all([params, searchParams])

  return (
    <CanvasWorkspace
      projectId={roomId}
      openTemplatesOnMount={
        query[CANVAS_TEMPLATES_PARAM] === CANVAS_TEMPLATES_PARAM_VALUE
      }
    />
  )
}
