"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { AlertCircle, ArrowLeft, Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { useDesignSubmit } from "@/hooks/use-design-submit"
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

/** Shown when `send` resolves `false` without a more specific error to show. */
const GENERIC_START_ERROR = "Couldn’t start the design. Please try again."

interface DiscoveryViewProps {
  /** Room/project id the composed brief is submitted into (room id ≡ project id). */
  projectId: string
}

/**
 * The guided architecture interview as a full page: the same question
 * catalog, chip rendering, and Review step from `lib/architecture-brief.ts`
 * (unchanged) that unit 33 shipped as a dialog, now its own route.
 *
 * `initialIdea` starts blank — there is no adjacent freeform textarea to
 * inherit from anymore now that Discovery is its own route (the freeform chat
 * lives on Canvas). `Generate` hands the composed brief to `useDesignSubmit`,
 * the same submit path Canvas's chat panel uses; on success it navigates to
 * Canvas, where the run is writing, and on failure it stays on Review with
 * the error shown.
 */
export function DiscoveryView({ projectId }: DiscoveryViewProps) {
  const router = useRouter()
  const { send, busy, error, clearError } = useDesignSubmit(projectId)

  const [answers, setAnswers] = useState<BriefAnswers>(DEFAULT_ANSWERS)
  const [step, setStep] = useState(0)
  /**
   * The Review step's text once the user has touched it. `null` means "still
   * the composed brief", so going Back and changing an answer recomposes — an
   * edit is cleared by the answer change that would otherwise be silently
   * overwritten by it, rather than by merely navigating.
   */
  const [editedBrief, setEditedBrief] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const totalSteps = BRIEF_QUESTIONS.length + 1
  // The last step is Review, which has no question behind it.
  const question = BRIEF_QUESTIONS[step] ?? null
  const isReview = question === null
  const brief = editedBrief ?? composeBrief(answers, "")

  function updateAnswer(
    key: keyof BriefAnswers,
    value: string | readonly string[]
  ) {
    setAnswers((previous) => ({ ...previous, [key]: value }) as BriefAnswers)
    setEditedBrief(null)
  }

  async function handleGenerate() {
    const trimmed = brief.trim()
    if (!trimmed || busy) return

    clearError()
    setSubmitError(null)
    // Fire alongside the run, not before it: persisting is a durability
    // improvement, so a failure here must not block, delay, or surface an
    // error on the flow the user is already watching.
    void persistBrief(projectId, trimmed)
    const started = await send(trimmed)
    if (started) {
      router.push(`/editor/${projectId}/canvas`)
    } else {
      setSubmitError(GENERIC_START_ERROR)
    }
  }

  const shownError = error ?? submitError

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden pl-(--canvas-inset-left,0px) transition-[padding-left] duration-200 ease-out">
      <div className="border-b border-surface-border px-6 py-3">
        <Link
          href={`/editor/${projectId}`}
          className="inline-flex items-center gap-1.5 text-xs text-copy-muted transition-colors hover:text-copy-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Project Home
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden px-6 py-6">
        <div className="shrink-0">
          <h1 className="font-heading text-xl font-medium text-copy-primary">
            {question ? question.title : "Review your brief"}
          </h1>
          <p className="mt-1 text-sm text-copy-muted">
            {question
              ? question.help
              : "Edit anything below — this exact text is what Specwright designs from."}
          </p>
        </div>

        <StepIndicator step={step} total={totalSteps} optional={question?.optional} />

        <ScrollArea className="flex-1 overflow-hidden">
          <div className="space-y-5 py-4">
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
                className="min-h-96 resize-none font-mono text-xs leading-relaxed"
              />
            )}
          </div>
        </ScrollArea>

        <div className="shrink-0 border-t border-surface-border pt-3">
          {shownError && (
            <p
              role="alert"
              className="mb-2 flex items-center gap-1.5 text-xs text-error"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{shownError}</span>
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
                // Skipping is just advancing: the question keeps its default,
                // and the default is disclosed under `## Assumptions` in the
                // brief.
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
                  disabled={busy || brief.trim().length === 0}
                  className="bg-accent-green text-(--bg-base) hover:bg-accent-green/90"
                >
                  {busy ? (
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
    </div>
  )
}

/**
 * Record the exact submitted brief on the project, best-effort. Lives here
 * rather than in `useDesignSubmit` because that hook is shared with Canvas's
 * freeform chat, and a one-line prompt typed into Canvas is not a brief.
 *
 * Failures are logged and swallowed — the same stance `ensureFeed`/`ensureRoom`
 * take in `lib/liveblocks.ts` for non-critical side writes.
 */
async function persistBrief(projectId: string, brief: string) {
  try {
    const response = await fetch(`/api/projects/${projectId}/brief`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief }),
    })
    if (!response.ok) {
      console.error("Failed to persist architecture brief", response.status)
    }
  } catch (error) {
    console.error("Failed to persist architecture brief", error)
  }
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
    <div className="flex shrink-0 items-center gap-3 border-b border-surface-border py-2.5">
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
