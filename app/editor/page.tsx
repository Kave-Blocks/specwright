import { EditorShell } from "@/components/editor/editor-shell"
import { WorkspaceHomeView } from "@/components/editor/home/workspace-home-view"
import { getWorkspaceHomeProjects } from "@/lib/projects-data"

/**
 * Workspace Home — the app's landing screen, since `app/page.tsx` redirects
 * every authenticated user here.
 *
 * One fetch feeds both the shell and the view: `WorkspaceProject` extends
 * `Project`, so the same arrays satisfy `EditorShell`'s sidebar props and the
 * view's richer ones.
 */
export default async function EditorHomePage() {
  const { ownedProjects, sharedProjects } = await getWorkspaceHomeProjects()

  return (
    <EditorShell ownedProjects={ownedProjects} sharedProjects={sharedProjects}>
      <WorkspaceHomeView
        ownedProjects={ownedProjects}
        sharedProjects={sharedProjects}
      />
    </EditorShell>
  )
}
