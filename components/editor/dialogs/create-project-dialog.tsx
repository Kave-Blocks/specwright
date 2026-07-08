"use client"

import type { FormEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

interface CreateProjectDialogProps {
  open: boolean
  name: string
  slug: string
  isSubmitting: boolean
  onOpenChange: (open: boolean) => void
  onNameChange: (name: string) => void
  onSubmit: () => void
}

export function CreateProjectDialog({
  open,
  name,
  slug,
  isSubmitting,
  onOpenChange,
  onNameChange,
  onSubmit,
}: CreateProjectDialogProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a project</DialogTitle>
          <DialogDescription>
            Name your new architecture workspace. Its slug is generated
            automatically.
          </DialogDescription>
        </DialogHeader>

        <form id="create-project-form" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="create-project-name"
              className="text-sm font-medium text-copy-primary"
            >
              Project name
            </label>
            <Input
              id="create-project-name"
              autoFocus
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Payments Platform"
            />
            <p className="text-xs text-copy-muted">
              Slug:{" "}
              <span className="font-mono text-brand">
                {slug || "your-project"}
              </span>
            </p>
          </div>
        </form>

        <DialogFooter>
          <DialogClose
            render={<Button variant="ghost" type="button" />}
          >
            Cancel
          </DialogClose>
          <Button
            type="submit"
            form="create-project-form"
            disabled={!name.trim() || isSubmitting}
          >
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
