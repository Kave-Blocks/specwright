"use client"

import { useParams, useRouter } from "next/navigation"
import { useState } from "react"

import { slugify, type Project } from "@/lib/projects"

type DialogState =
  | { type: "create" }
  | { type: "rename"; project: Project }
  | { type: "delete"; project: Project }
  | null

export interface UseProjectActions {
  ownedProjects: Project[]
  sharedProjects: Project[]
  dialog: DialogState
  name: string
  roomId: string
  isSubmitting: boolean
  setName: (name: string) => void
  openCreate: () => void
  openRename: (project: Project) => void
  openDelete: (project: Project) => void
  closeDialog: () => void
  submitCreate: () => void
  submitRename: () => void
  confirmDelete: () => void
}

interface UseProjectActionsInput {
  ownedProjects: Project[]
  sharedProjects: Project[]
}

/** Short, URL-safe suffix that keeps room ids unique per project name. */
function generateSuffix(): string {
  return Math.random().toString(36).slice(2, 8)
}

/**
 * Owns dialog and form state for project create/rename/delete and drives the
 * real project API. Project lists are provided by the server component; after
 * each mutation the router is refreshed (or navigated) so the server re-reads
 * the data rather than the hook holding an optimistic local copy.
 */
export function useProjectActions({
  ownedProjects,
  sharedProjects,
}: UseProjectActionsInput): UseProjectActions {
  const router = useRouter()
  const params = useParams<{ roomId?: string }>()
  const activeRoomId = typeof params.roomId === "string" ? params.roomId : null

  const [dialog, setDialog] = useState<DialogState>(null)
  const [name, setName] = useState("")
  const [suffix, setSuffix] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // The project id and Liveblocks room id are the same value: the slugified
  // name plus a stable suffix generated when the create dialog opens.
  const roomId = `${slugify(name) || "project"}-${suffix}`

  function openCreate() {
    setName("")
    setSuffix(generateSuffix())
    setDialog({ type: "create" })
  }

  function openRename(project: Project) {
    setName(project.name)
    setDialog({ type: "rename", project })
  }

  function openDelete(project: Project) {
    setDialog({ type: "delete", project })
  }

  function closeDialog() {
    setDialog(null)
  }

  async function submitCreate() {
    const trimmed = name.trim()
    if (!trimmed || isSubmitting) return

    const id = roomId
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: trimmed }),
      })
      if (!response.ok) {
        throw new Error(`Failed to create project (${response.status})`)
      }
      closeDialog()
      router.push(`/editor/${id}`)
    } catch (error) {
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitRename() {
    if (dialog?.type !== "rename" || isSubmitting) return
    const trimmed = name.trim()
    if (!trimmed) return

    const { project } = dialog
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!response.ok) {
        throw new Error(`Failed to rename project (${response.status})`)
      }
      closeDialog()
      router.refresh()
    } catch (error) {
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function confirmDelete() {
    if (dialog?.type !== "delete" || isSubmitting) return

    const { project } = dialog
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        throw new Error(`Failed to delete project (${response.status})`)
      }
      closeDialog()
      if (activeRoomId === project.id) {
        router.push("/editor")
      } else {
        router.refresh()
      }
    } catch (error) {
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    ownedProjects,
    sharedProjects,
    dialog,
    name,
    roomId,
    isSubmitting,
    setName,
    openCreate,
    openRename,
    openDelete,
    closeDialog,
    submitCreate,
    submitRename,
    confirmDelete,
  }
}
