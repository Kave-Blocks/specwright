"use client"

import { Plus } from "lucide-react"

import { useProjectActionsContext } from "@/components/editor/project-actions-context"
import { Button } from "@/components/ui/button"

export function NewProjectButton() {
  const { openCreate } = useProjectActionsContext()

  return (
    <Button onClick={openCreate}>
      <Plus className="h-4 w-4" />
      New Project
    </Button>
  )
}
