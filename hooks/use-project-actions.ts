"use client"

import { useMemo, useState } from "react"

import { mockProjects, slugify, type Project } from "@/lib/projects"

type DialogState =
  | { type: "create" }
  | { type: "rename"; project: Project }
  | { type: "delete"; project: Project }
  | null

export interface UseProjectActions {
  projects: Project[]
  ownedProjects: Project[]
  sharedProjects: Project[]
  dialog: DialogState
  name: string
  slug: string
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

/**
 * Owns dialog, form, and loading state for project create/rename/delete.
 * Backed by mock data — mutations update local client state only, no API.
 */
export function useProjectActions(): UseProjectActions {
  const [projects, setProjects] = useState<Project[]>(mockProjects)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [name, setName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const ownedProjects = useMemo(
    () => projects.filter((project) => project.role === "owner"),
    [projects]
  )
  const sharedProjects = useMemo(
    () => projects.filter((project) => project.role === "collaborator"),
    [projects]
  )

  const slug = slugify(name)

  function openCreate() {
    setName("")
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

  function submitCreate() {
    const trimmed = name.trim()
    if (!trimmed) return

    setIsSubmitting(true)
    setProjects((current) => [
      {
        id: crypto.randomUUID(),
        name: trimmed,
        slug: slugify(trimmed),
        role: "owner",
      },
      ...current,
    ])
    setIsSubmitting(false)
    closeDialog()
  }

  function submitRename() {
    if (dialog?.type !== "rename") return
    const trimmed = name.trim()
    if (!trimmed) return

    const { project } = dialog
    setIsSubmitting(true)
    setProjects((current) =>
      current.map((item) =>
        item.id === project.id
          ? { ...item, name: trimmed, slug: slugify(trimmed) }
          : item
      )
    )
    setIsSubmitting(false)
    closeDialog()
  }

  function confirmDelete() {
    if (dialog?.type !== "delete") return

    const { project } = dialog
    setIsSubmitting(true)
    setProjects((current) => current.filter((item) => item.id !== project.id))
    setIsSubmitting(false)
    closeDialog()
  }

  return {
    projects,
    ownedProjects,
    sharedProjects,
    dialog,
    name,
    slug,
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
