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

interface RenameProjectDialogProps {
  open: boolean
  name: string
  currentName: string
  isSubmitting: boolean
  onOpenChange: (open: boolean) => void
  onNameChange: (name: string) => void
  onSubmit: () => void
}

export function RenameProjectDialog({
  open,
  name,
  currentName,
  isSubmitting,
  onOpenChange,
  onNameChange,
  onSubmit,
}: RenameProjectDialogProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>
            Renaming{" "}
            <span className="font-medium text-copy-primary">
              {currentName}
            </span>
            . Pick a new name for this workspace.
          </DialogDescription>
        </DialogHeader>

        <form id="rename-project-form" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="rename-project-name"
              className="text-sm font-medium text-copy-primary"
            >
              Project name
            </label>
            <Input
              id="rename-project-name"
              autoFocus
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </div>
        </form>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost" type="button" />}>
            Cancel
          </DialogClose>
          <Button
            type="submit"
            form="rename-project-form"
            disabled={!name.trim() || isSubmitting}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
