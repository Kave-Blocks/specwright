import { DiscoveryView } from "@/components/editor/discovery/discovery-view"

interface DiscoveryPageProps {
  params: Promise<{ roomId: string }>
}

/** The `/editor/[roomId]/discovery` route. Room id ≡ project id, so no extra data fetch is needed here. */
export default async function DiscoveryPage({ params }: DiscoveryPageProps) {
  const { roomId } = await params
  return <DiscoveryView projectId={roomId} />
}
