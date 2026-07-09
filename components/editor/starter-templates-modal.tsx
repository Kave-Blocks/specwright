"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

import { StarterTemplatePreview } from "./starter-template-preview"
import { CANVAS_TEMPLATES, type CanvasTemplate } from "./starter-templates"

interface StarterTemplatesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the chosen template; the modal closes after invoking it. */
  onImport: (template: CanvasTemplate) => void
}

/**
 * Import dialog for the starter template library. Shows each template as a card
 * with a lightweight diagram preview, its name, description, and an import
 * button. Importing hands the template to `onImport` and closes the dialog —
 * the caller is responsible for replacing the canvas contents.
 */
export function StarterTemplatesModal({
  open,
  onOpenChange,
  onImport,
}: StarterTemplatesModalProps) {
  function handleImport(template: CanvasTemplate) {
    onImport(template)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>
            Import a prebuilt system design to start from. This replaces the
            current canvas.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="grid gap-4 pr-1 sm:grid-cols-2">
            {CANVAS_TEMPLATES.map((template) => (
              <article
                key={template.id}
                className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface p-4"
              >
                <div className="overflow-hidden rounded-xl border border-surface-border bg-base">
                  <StarterTemplatePreview template={template} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-heading text-sm font-medium text-copy-primary">
                    {template.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs text-copy-muted">
                    {template.description}
                  </p>
                </div>
                <Button
                  className="mt-auto w-full"
                  onClick={() => handleImport(template)}
                >
                  Use template
                </Button>
              </article>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
