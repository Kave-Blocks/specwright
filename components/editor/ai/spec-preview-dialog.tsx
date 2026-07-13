"use client"

import { useEffect, useState } from "react"
import { AlertCircle, Download, Loader2 } from "lucide-react"

import { SpecMarkdown } from "@/components/editor/ai/spec-markdown"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { downloadSpec } from "@/lib/spec-download"
import { specDownloadUrl, type ProjectSpecSummary } from "@/types/specs"

const CONTENT_ERROR = "Couldn’t load this spec. Please try again."

interface SpecPreviewDialogProps {
  projectId: string
  /** The spec being previewed, or `null` when the modal is closed. */
  spec: ProjectSpecSummary | null
  onClose: () => void
}

/**
 * Preview one generated spec as rendered Markdown.
 *
 * The body is a child that only exists while a spec is selected, so closing the
 * modal unmounts it and the Markdown is dropped — spec content is never held in
 * frontend state beyond the life of the preview.
 *
 * Escape, the focus trap, and the close button all come from the Dialog
 * primitive; nothing is hand-rolled here.
 */
export function SpecPreviewDialog({
  projectId,
  spec,
  onClose,
}: SpecPreviewDialogProps) {
  return (
    <Dialog
      open={spec !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[85vh] gap-0 rounded-3xl border border-surface-border bg-surface p-0 sm:max-w-2xl">
        {spec && (
          <SpecPreviewBody
            projectId={projectId}
            spec={spec}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function SpecPreviewBody({
  projectId,
  spec,
  onClose,
}: {
  projectId: string
  spec: ProjectSpecSummary
  onClose: () => void
}) {
  const { content, isLoading, error } = useSpecContent(projectId, spec.id)

  return (
    <div className="flex max-h-[85vh] flex-col overflow-hidden">
      {/* pr-12 keeps the title clear of the Dialog's absolute close button. */}
      <DialogHeader className="border-b border-surface-border px-5 py-4 pr-12">
        <DialogTitle className="truncate text-copy-primary">
          {spec.filename}
        </DialogTitle>
        <DialogDescription className="text-copy-muted">
          Generated {formatSpecDate(spec.createdAt)}
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="flex-1 overflow-hidden">
        <div className="px-5 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-copy-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Loading spec…</span>
            </div>
          ) : error ? (
            <p
              role="alert"
              className="flex items-center justify-center gap-1.5 py-12 text-xs text-error"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          ) : (
            <SpecMarkdown content={content ?? ""} />
          )}
        </div>
      </ScrollArea>

      <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-3">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => downloadSpec(projectId, spec.id, spec.filename)}
          className="bg-brand text-white hover:bg-brand/90"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </Button>
      </div>
    </div>
  )
}

interface SpecContent {
  content: string | null
  isLoading: boolean
  error: string | null
}

/**
 * Fetch one spec's Markdown through the access-checked download route — the only
 * endpoint a client may read a spec through. Its `Content-Disposition:
 * attachment` only governs a browser *navigation*; a `fetch` reads the body as
 * text, so no Blob URL is ever touched from here and no second route is needed.
 *
 * The content lives in this hook's state, which dies with the modal.
 */
function useSpecContent(projectId: string, specId: string): SpecContent {
  const [content, setContent] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(specDownloadUrl(projectId, specId), {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Spec fetch failed (${response.status})`)
        }

        setContent(await response.text())
      } catch (fetchError) {
        // Closing the modal aborts the request on purpose — not an error.
        if (controller.signal.aborted) return
        console.error(fetchError)
        setError(CONTENT_ERROR)
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [projectId, specId])

  return { content, isLoading, error }
}

/** e.g. "Jul 12, 2026 at 9:41 AM". */
export function formatSpecDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
