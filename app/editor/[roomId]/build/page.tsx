import { BuildView } from "@/components/editor/build/build-view"

interface BuildPageProps {
  params: Promise<{ roomId: string }>
}

/** The `/editor/[roomId]/build` route. Room id ≡ project id, so no extra data fetch is needed here. */
export default async function BuildPage({ params }: BuildPageProps) {
  const { roomId } = await params
  return <BuildView projectId={roomId} />
}
