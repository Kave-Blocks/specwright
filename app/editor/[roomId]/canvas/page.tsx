import { CanvasWorkspace } from "@/components/editor/canvas/canvas-workspace"

interface CanvasPageProps {
  params: Promise<{ roomId: string }>
}

/** The `/editor/[roomId]/canvas` route. Room id ≡ project id, so no extra data fetch is needed here. */
export default async function CanvasPage({ params }: CanvasPageProps) {
  const { roomId } = await params
  return <CanvasWorkspace projectId={roomId} />
}
