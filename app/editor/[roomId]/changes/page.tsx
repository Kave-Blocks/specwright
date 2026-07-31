import { ChangesView } from "@/components/editor/changes/changes-view"

interface ChangesPageProps {
  params: Promise<{ roomId: string }>
}

/**
 * The `/editor/[roomId]/changes` route. Room id ≡ project id, so no extra data
 * fetch is needed here — the access gate and the room connection both live in
 * the shared `/editor/[roomId]` layout, exactly as they do for `specs`.
 */
export default async function ChangesPage({ params }: ChangesPageProps) {
  const { roomId } = await params
  return <ChangesView projectId={roomId} />
}
