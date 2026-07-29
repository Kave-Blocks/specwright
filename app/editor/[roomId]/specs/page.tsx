import { SpecsView } from "@/components/editor/specs/specs-view"

interface SpecsPageProps {
  params: Promise<{ roomId: string }>
}

/** The `/editor/[roomId]/specs` route. Room id ≡ project id, so no extra data fetch is needed here. */
export default async function SpecsPage({ params }: SpecsPageProps) {
  const { roomId } = await params
  return <SpecsView projectId={roomId} />
}
