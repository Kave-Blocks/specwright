"use client"

import { CreateProjectDialog } from "@/components/editor/dialogs/create-project-dialog"
import { DeleteProjectDialog } from "@/components/editor/dialogs/delete-project-dialog"
import { RenameProjectDialog } from "@/components/editor/dialogs/rename-project-dialog"
import { useProjectActionsContext } from "@/components/editor/project-actions-context"

export function ProjectDialogs() {
  const {
    dialog,
    name,
    slug,
    isSubmitting,
    setName,
    closeDialog,
    submitCreate,
    submitRename,
    confirmDelete,
  } = useProjectActionsContext()

  function handleOpenChange(open: boolean) {
    if (!open) closeDialog()
  }

  return (
    <>
      <CreateProjectDialog
        open={dialog?.type === "create"}
        name={name}
        slug={slug}
        isSubmitting={isSubmitting}
        onOpenChange={handleOpenChange}
        onNameChange={setName}
        onSubmit={submitCreate}
      />
      <RenameProjectDialog
        open={dialog?.type === "rename"}
        name={name}
        currentName={dialog?.type === "rename" ? dialog.project.name : ""}
        isSubmitting={isSubmitting}
        onOpenChange={handleOpenChange}
        onNameChange={setName}
        onSubmit={submitRename}
      />
      <DeleteProjectDialog
        open={dialog?.type === "delete"}
        projectName={dialog?.type === "delete" ? dialog.project.name : ""}
        isSubmitting={isSubmitting}
        onOpenChange={handleOpenChange}
        onConfirm={confirmDelete}
      />
    </>
  )
}
