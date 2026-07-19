"use client"

import { useState } from "react"
import { AlertCircle, Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  BRIEF_QUESTIONS,
  DEFAULT_ANSWERS,
  composeBrief,
  type BriefAnswers,
  type BriefField,
} from "@/lib/architecture-brief"
import { cn } from "@/lib/utils"

/** Chip treatment, shared by single- and multi-select. */
const CHIP =
  "rounded-full px-3 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
const CHIP_SELECTED = "bg-accent-dim text-brand"
const CHIP_IDLE =
  "bg-subtle text-copy-muted hover:bg-elevated hover:text-copy-primary"

interface ArchitectureInterviewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Whatever is already typed into the freeform prompt, carried into the brief. */
  initialIdea: string
  /**
   * Submit the composed brief through the tab's existing design path. Resolves
   * `true` once the run has started, which is when the dialog closes.
   */
  onGenerate: (brief: string) => Promise<boolean>
  /** True while any design run is in flight (this client's or a collaborator's). */
  busy: boolean
}

/**
 * The guided architecture interview: a short, fully skippable set of questions
 * that composes a structured project brief and submits it in place of a one-line
 * prompt.
 *
 * It is an *additional entry point*, not a second generation path — `onGenerate`
 * hands the composed text straight to the same `POST /api/ai/design` submit the
 * freeform prompt uses, so there is no new route, token call, or realtime hook
 * here. The only thing that differs between the two entries is the prompt text.
 *
 * The body is a child that only exists while the dialog is open, so closing it
 * unmounts the answers — a fresh interview every time, with no reset effect to
 * keep in sync (the same pattern `spec-preview-dialog.tsx` uses for spec bodies).
 */
export function ArchitectureInterview({
  open,
  onOpenChange,
  initialIdea,
  onGenerate,
  busy,
}: ArchitectureInterviewProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 rounded-3xl border border-surface-border bg-surface p-0 sm:max-w-lg">
        {open && (
          <InterviewBody
            initialIdea={initialIdea}
            onGenerate={onGenerate}
            onClose={() => onOpenChange(false)}
            busy={busy}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function InterviewBody({
  initialIdea,
  onGenerate,
  onClose,
  busy,
}: {
  initialIdea: string
  onGenerate: (brief: string) => Promise<boolean>
  onClose: () => void
  busy: boolean
}) {
  const [answers, setAnswers] = useState<BriefAnswers>(() => ({
    ...DEFAULT_ANSWERS,
    // The freeform prompt is the first answer, not a separate thing to retype.
    idea: initialIdea.trim(),
  }))
  const [step, setStep] = useState(0)
  /**
   * The Review step's text once the user has touched it. `null` means "still the
   * composed brief", so going Back and changing an answer recomposes — an edit
   * is cleared by the answer change that would otherwise be silently overwritten
   * by it, rather than by merely navigating.
   */
  const [editedBrief, setEditedBrief] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalSteps = BRIEF_QUESTIONS.length + 1
  // The last step is Review, which has no question behind it.
  const question = BRIEF_QUESTIONS[step] ?? null
  const isReview = question === null
  const brief = editedBrief ?? composeBrief(answers, initialIdea)

  /**
   * Write one answer.
   *
   * This is the single place the catalog's per-field types are widened, and it
   * is sound because both halves of the pair come from the same catalog entry: a
   * text field's `key` is typed `FreeTextKey` and a chip's `value` comes from the
   * `options` declared next to its `key`, so a field can only ever produce a
   * value its own answer accepts. `BriefAnswers` and all of `composeBrief` stay
   * strictly typed on the other side of it.
   *
   * Every write also clears a Review edit, because that edit was made against a
   * brief this answer is no longer part of.
   */
  function updateAnswer(
    key: keyof BriefAnswers,
    value: string | readonly string[]
  ) {
    setAnswers((previous) => ({ ...previous, [key]: value }) as BriefAnswers)
    setEditedBrief(null)
  }

  async function handleGenerate() {
    const trimmed = brief.trim()
    if (!trimmed || submitting || busy) return

    setSubmitting(true)
    setError(null)
    try {
      const started = await onGenerate(trimmed)
      // The run is tracked by the tab from here — its status strip and disabled
      // input are where a run in flight is watched, so the modal gets out of the
      // way rather than holding the user behind it for the whole generation.
      if (started) onClose()
      else setError("Couldn’t start the design. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const isGenerating = submitting || busy

  return (
    <div className="flex max-h-[85vh] flex-col overflow-hidden">
      {/* pr-12 keeps the title clear of the Dialog's absolute close button. */}
      <DialogHeader className="border-b border-surface-border px-5 py-4 pr-12">
        <DialogTitle className="text-copy-primary">
          {question ? question.title : "Review your brief"}
        </DialogTitle>
        <DialogDescription className="text-copy-muted">
          {question
            ? question.help
            : "Edit anything below — this exact text is what Specwright designs from."}
        </DialogDescription>
      </DialogHeader>

      <StepIndicator
        step={step}
        total={totalSteps}
        optional={question?.optional}
      />

      <ScrollArea className="flex-1 overflow-hidden">
        <div className="space-y-5 px-5 py-4">
          {question ? (
            question.fields.map((field) => (
              <QuestionField
                key={field.key}
                field={field}
                answers={answers}
                onChange={updateAnswer}
              />
            ))
          ) : (
            <Textarea
              value={brief}
              onChange={(event) => setEditedBrief(event.target.value)}
              aria-label="Project brief"
              className="min-h-80 resize-none font-mono text-xs leading-relaxed"
            />
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-surface-border px-5 py-3">
        {error && (
          <p
            role="alert"
            className="mb-2 flex items-center gap-1.5 text-xs text-error"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStep((current) => current - 1)}
            disabled={step === 0}
          >
            Back
          </Button>

          <div className="flex items-center gap-2">
            {!isReview && (
              // Skipping is just advancing: the question keeps its default, and
              // the default is disclosed under `## Assumptions` in the brief.
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep((current) => current + 1)}
                className="text-copy-muted"
              >
                Skip
              </Button>
            )}
            {isReview ? (
              <Button
                type="button"
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating || brief.trim().length === 0}
                className="bg-accent-green text-(--bg-base) hover:bg-accent-green/90"
              >
                {isGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Generate
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => setStep((current) => current + 1)}
                className="bg-brand text-white hover:bg-brand/90"
              >
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** "Step 3 of 9", plus a segment per step so progress is visible throughout. */
function StepIndicator({
  step,
  total,
  optional,
}: {
  step: number
  total: number
  optional?: boolean
}) {
  return (
    <div className="flex items-center gap-3 border-b border-surface-border px-5 py-2.5">
      <span className="shrink-0 text-xs text-copy-muted">
        Step {step + 1} of {total}
        {optional && " · optional"}
      </span>
      <div className="flex flex-1 gap-1" aria-hidden>
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              index <= step ? "bg-brand" : "bg-subtle"
            )}
          />
        ))}
      </div>
    </div>
  )
}

/** One field of one question: a text box, or a row of single/multi chips. */
function QuestionField({
  field,
  answers,
  onChange,
}: {
  field: BriefField
  answers: BriefAnswers
  onChange: (key: keyof BriefAnswers, value: string | readonly string[]) => void
}) {
  return (
    <div className="space-y-2">
      <label
        className="block text-xs font-medium text-copy-secondary"
        htmlFor={field.kind === "text" ? `brief-${field.key}` : undefined}
      >
        {field.label}
      </label>

      {field.kind === "text" ? (
        field.multiline ? (
          <Textarea
            id={`brief-${field.key}`}
            value={answers[field.key]}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder={field.placeholder}
            className="max-h-32 min-h-16 resize-none text-sm"
          />
        ) : (
          <Input
            id={`brief-${field.key}`}
            value={answers[field.key]}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder={field.placeholder}
            className="text-sm"
          />
        )
      ) : (
        <ChipGroup field={field} answers={answers} onChange={onChange} />
      )}
    </div>
  )
}

/**
 * A row of selectable pill chips for one option set — multi-select adds and
 * removes, single-select replaces.
 *
 * The current answer is read once as a plain `readonly string[]` / `string`. Each
 * option set has its own literal key union, so reading `answers[field.key]`
 * inline would leave `.includes()` with an intersection of every set's element
 * type (`never`) as its parameter; widening once here keeps the comparison
 * honest and the strict types where they matter — in `BriefAnswers` and the
 * composer.
 */
function ChipGroup({
  field,
  answers,
  onChange,
}: {
  field: Extract<BriefField, { kind: "single" | "multi" }>
  answers: BriefAnswers
  onChange: (key: keyof BriefAnswers, value: string | readonly string[]) => void
}) {
  const picked: readonly string[] =
    field.kind === "multi" ? answers[field.key] : [answers[field.key]]

  return (
    <div className="flex flex-wrap gap-2">
      {field.options.map((option) => {
        const selected = picked.includes(option.value)

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() =>
              onChange(
                field.key,
                field.kind === "single"
                  ? option.value
                  : selected
                    ? picked.filter((entry) => entry !== option.value)
                    : [...picked, option.value]
              )
            }
            className={cn(CHIP, selected ? CHIP_SELECTED : CHIP_IDLE)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
