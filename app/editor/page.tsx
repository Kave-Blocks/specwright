import { EditorShell } from "@/components/editor/editor-shell"
import { NewProjectButton } from "@/components/editor/new-project-button"
import { getEditorHomeProjects } from "@/lib/projects-data"

export default async function EditorHomePage() {
  const { ownedProjects, sharedProjects } = await getEditorHomeProjects()

  return (
    <EditorShell ownedProjects={ownedProjects} sharedProjects={sharedProjects}>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-heading text-2xl font-medium text-copy-primary">
          Create a project or open an existing one
        </h1>
        <p className="max-w-md text-sm text-copy-muted">
          Start a new architecture workspace, or choose a project from the
          sidebar.
        </p>
        <NewProjectButton />
      </div>
    </EditorShell>
  )
}
