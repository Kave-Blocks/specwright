import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { AccessDenied } from "@/components/editor/access-denied"
import { EditorRoom } from "@/components/editor/editor-room"
import { EditorRoomShell } from "@/components/editor/editor-room-shell"
import { getAccessibleProject, getClerkIdentity } from "@/lib/project-access"
import { getEditorHomeProjects } from "@/lib/projects-data"

interface EditorRoomLayoutProps {
  params: Promise<{ roomId: string }>
  children: ReactNode
}

/**
 * Shared shell for every route under `/editor/[roomId]` (Home, Discovery,
 * Canvas, Specs): the auth/access gate, the Liveblocks room connection, and
 * the project-wide chrome (navbar, project sidebar, dialogs, share) all live
 * here once instead of being duplicated per route.
 */
export default async function EditorRoomLayout({
  params,
  children,
}: EditorRoomLayoutProps) {
  const { roomId } = await params

  const identity = await getClerkIdentity()
  if (!identity) {
    redirect("/sign-in")
  }

  const project = await getAccessibleProject(roomId, identity)
  if (!project) {
    return <AccessDenied />
  }

  const { ownedProjects, sharedProjects } = await getEditorHomeProjects()

  return (
    <EditorRoomShell
      projectId={project.id}
      projectName={project.name}
      isOwner={project.ownerId === identity.userId}
      ownedProjects={ownedProjects}
      sharedProjects={sharedProjects}
    >
      {/* The room connection is project-wide, not Canvas-only: Discovery also
       * publishes to `ai-chat` and Specs also reads it. */}
      <EditorRoom roomId={project.id}>{children}</EditorRoom>
    </EditorRoomShell>
  )
}
