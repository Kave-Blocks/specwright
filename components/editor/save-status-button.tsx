"use client"

import { AlertCircle, Check, Cloud, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CanvasSaveStatus } from "@/types/canvas"

interface SaveStatusConfig {
  icon: typeof Cloud
  label: string
  /** Token-driven text color for the current state. */
  className: string
  /** Longer hint surfaced as the native tooltip / accessible label. */
  hint: string
}

const SAVE_STATUS: Record<CanvasSaveStatus, SaveStatusConfig> = {
  idle: {
    icon: Cloud,
    label: "Save",
    className: "text-copy-muted",
    hint: "Save the canvas",
  },
  saving: {
    icon: Loader2,
    label: "Saving…",
    className: "text-copy-muted",
    hint: "Saving canvas…",
  },
  saved: {
    icon: Check,
    label: "Saved",
    className: "text-success",
    hint: "All changes saved",
  },
  error: {
    icon: AlertCircle,
    label: "Error",
    className: "text-error",
    hint: "Saving failed — click to retry",
  },
}

interface SaveStatusButtonProps {
  status: CanvasSaveStatus
  /** Flush an immediate save (manual save or error retry). */
  onSave: () => void
}

/**
 * Navbar Save button that doubles as the autosave status indicator. Autosave
 * persists on its own; clicking forces an immediate save (and retries on error).
 */
export function SaveStatusButton({ status, onSave }: SaveStatusButtonProps) {
  const { icon: Icon, label, className, hint } = SAVE_STATUS[status]
  const isSaving = status === "saving"

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onSave}
      disabled={isSaving}
      title={hint}
      aria-label={hint}
      className={cn("min-w-19 justify-start", className)}
    >
      <Icon className={cn("h-4 w-4", isSaving && "animate-spin")} />
      {label}
    </Button>
  )
}
