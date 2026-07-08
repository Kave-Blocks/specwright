import { Plus } from "lucide-react"

import { EditorShell } from "@/components/editor/editor-shell"
import { Button } from "@/components/ui/button"

export default function EditorHomePage() {
  return (
    <EditorShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-heading text-2xl font-medium text-copy-primary">
          Create a project or open an existing one
        </h1>
        <p className="max-w-md text-sm text-copy-muted">
          Start a new architecture workspace, or choose a project from the
          sidebar.
        </p>
        <Button>
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>
    </EditorShell>
  )
}
