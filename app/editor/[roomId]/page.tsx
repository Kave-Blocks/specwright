import { redirect } from "next/navigation"

import { AccessDenied } from "@/components/editor/access-denied"
import { EditorWorkspace } from "@/components/editor/editor-workspace"
import { getAccessibleProject, getClerkIdentity } from "@/lib/project-access"
import { getEditorHomeProjects } from "@/lib/projects-data"

interface EditorRoomPageProps {
  params: Promise<{ roomId: string }>
}

export default async function EditorRoomPage({ params }: EditorRoomPageProps) {
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
    <EditorWorkspace
      projectName={project.name}
      ownedProjects={ownedProjects}
      sharedProjects={sharedProjects}
    />
  )
}
