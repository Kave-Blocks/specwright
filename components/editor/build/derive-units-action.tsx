"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useRealtimeRun } from "@trigger.dev/react-hooks"
import { AlertCircle, Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import type {
  BuildUnitRunHandle,
  DeriveUnitsActionResult,
} from "@/hooks/use-project-build-units"
import {
  isFinishedRunStatus,
  runMetadataFailureText,
  runMetadataText,
} from "@/lib/trigger-run"
import { cn } from "@/lib/utils"
import type { DeriveUnitsResult, deriveUnits } from "@/trigger/derive-units"

/** Shown when a derivation run failed without publishing a message of its own. */
const RUN_FAILED_ERROR =
  "Specwright couldn’t derive your build units. Please try again."
/** Status line while a run is in flight but has published nothing yet. */
const WORKING_FALLBACK = "Specwright is working…"

/**
 * The standing note under the control, and the reason it is unconditional.
 *
 * A button that offers to fill somebody's build list from an AI is exactly the
 * thing a person is right to be nervous about, and `38`'s producer contract is
 * the answer: match on `key`, add what does not exist, never touch the rest.
 * Saying so before the run is what makes the action safe to try.
 */
const SAFETY_NOTE =
  "Deriving only adds units. It never edits, renames, reorders, or removes one you already have."

/** Why the control is disabled while the project has no spec to derive from. */
const NO_SPEC_REASON =
  "This project has no spec yet — generate one on the Specs tab, since build units are derived from it."
/** Why it is disabled while the answer to that question is still in flight. */
const SPEC_LOADING_REASON = "Checking whether this project has a spec…"

/**
 * What the Build view knows about the project's specs when it renders this.
 *
 * Four states rather than a boolean, because "no spec" and "we do not know yet"
 * must never render the same: a control that flashes "generate a spec first"
 * before the spec list has loaded teaches somebody something false about their
 * own project. `unknown` is the spec list having *failed* to load — the
 * affordance cannot be honest either way, so the control stays available and
 * the route's 409 answers it, which is the real guard regardless.
 */
export type DeriveSpecAvailability =
  | "loading"
  | "available"
  | "none"
  | "unknown"

interface DeriveUnitsActionProps {
  /**
   * Visual weight. `primary` in the empty state — an empty build list beside a
   * generated spec is the situation this action exists for — and `secondary`
   * once the list has units, where the add form is the primary way to add one
   * and this must not compete with it.
   */
  treatment: "primary" | "secondary"
  /** Whether the project has a spec, as far as the caller can tell. */
  specAvailability: DeriveSpecAvailability
  /** Start a run. Returns a handle to track, never the units themselves. */
  onDerive: () => Promise<DeriveUnitsActionResult>
  /** Reload the build list — the run has written it by the time this fires. */
  onDerived: () => void
}

/**
 * Derive a project's build units from its current spec, and track the run that
 * writes them — unit `46`, the caller `44` deliberately stopped short of.
 *
 * Progress rides on the **run's own metadata** rather than the room's shared
 * `ai-status-feed`, because that is where `44` publishes it: a build list is
 * "the one project resource with no second layer", so a derivation follows the
 * spec and proposal path rather than the design agent's broadcast path. Reading
 * it is `GenerateSpecAction`'s shape in `specs-view.tsx`, now shared through
 * `lib/trigger-run.ts` rather than copied a third time.
 *
 * Nothing is inserted optimistically. The run writes the units, so the list is
 * refreshed when it completes and the outcome is read off the run's output.
 */
export function DeriveUnitsAction({
  treatment,
  specAvailability,
  onDerive,
  onDerived,
}: DeriveUnitsActionProps) {
  const [pending, setPending] = useState(false)
  const [activeRun, setActiveRun] = useState<BuildUnitRunHandle | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** What the last derivation from this control actually wrote. */
  const [outcome, setOutcome] = useState<DeriveUnitsResult | null>(null)
  /** Guards the settle, so a run is only ever finished once. */
  const settledRunRef = useRef<string | null>(null)
  const noteId = useId()

  // Keyed by run id so a finished run's cached state can't settle the next one
  // instantly; idle (and quiet about the absent token) while nothing is running.
  const { run, error: runError } = useRealtimeRun<typeof deriveUnits>(
    activeRun?.runId,
    {
      accessToken: activeRun?.token,
      enabled: activeRun !== null,
      id: activeRun?.runId,
      // The payload is the two ids the route resolved — don't ship them back.
      skipColumns: ["payload"],
    },
  )

  const busy = pending || activeRun !== null
  const blockedReason =
    specAvailability === "loading"
      ? SPEC_LOADING_REASON
      : specAvailability === "none"
        ? NO_SPEC_REASON
        : null

  const settle = useCallback(
    (failed: boolean, failureText: string | null, result: unknown) => {
      if (failed) {
        // Prefer the reason the run itself published. Every refusal `44` raises
        // is an `AbortTaskRunError` worded for a person — "this project has no
        // specification", "a newer specification than the one this run was
        // started for" — and the generic line would throw that away, which is
        // the regression `37` fixed and this must not bring back.
        setError(failureText ?? RUN_FAILED_ERROR)
        setActiveRun(null)
        return
      }

      // The units are written before the run completes, so the list can be
      // reloaded first and the report read off the run's output second.
      onDerived()
      // That output crosses the network exactly as metadata does, so its shape
      // is checked rather than trusted.
      setOutcome(readDeriveOutcome(result))
      setActiveRun(null)
    },
    [onDerived],
  )

  // Close the run out once it finishes. Deliberately not `useRealtimeRun`'s
  // `onComplete`, which fires at most once per mount — a second derivation in
  // the same session would never settle and the control would stay disabled.
  useEffect(() => {
    if (!activeRun) return
    if (settledRunRef.current === activeRun.runId) return

    const isFinished =
      run?.id === activeRun.runId && isFinishedRunStatus(run.status)
    // A dropped subscription also ends tracking — otherwise a network blip would
    // leave the control disabled forever.
    if (!isFinished && !runError) return

    const runId = activeRun.runId
    const failed = Boolean(runError) || run?.status !== "COMPLETED"
    // A dropped subscription publishes nothing trustworthy — whatever metadata
    // is cached predates the drop — so only the run's own reported failure
    // supplies its message.
    const failureText = runError ? null : runMetadataFailureText(run?.metadata)
    const output = run?.output

    // Deferred so the settle never sets state synchronously inside the effect.
    // The guard is claimed inside the timer, not before it: a later realtime
    // update would otherwise cancel this timer while the guard already read as
    // settled, and the run would hang.
    const timer = setTimeout(() => {
      settledRunRef.current = runId
      settle(failed, failureText, output)
    }, 0)
    return () => clearTimeout(timer)
  }, [activeRun, run, runError, settle])

  async function handleDerive() {
    if (busy || blockedReason) return

    setError(null)
    // The previous report described a different run — it must not stand beside
    // the one now starting.
    setOutcome(null)
    setPending(true)
    const result = await onDerive()
    setPending(false)

    if (!result.ok) {
      // Includes the route's 409 for a project with no spec, worded for a
      // person by the route and shown as it is.
      setError(result.error)
      return
    }

    setActiveRun(result.run)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={treatment === "primary" ? "default" : "secondary"}
          size="sm"
          onClick={() => void handleDerive()}
          disabled={busy || blockedReason !== null}
          aria-describedby={noteId}
          className={cn(
            // The primary treatment is Generate Spec's, which is the same
            // shape of action on the neighbouring tab.
            treatment === "primary" && "bg-brand text-white hover:bg-brand/90",
          )}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {busy ? "Deriving…" : "Derive from spec"}
        </Button>

        {busy && (
          <p
            role="status"
            aria-live="polite"
            className="min-w-0 truncate text-xs text-copy-muted"
          >
            {runMetadataText(run?.metadata, WORKING_FALLBACK)}
          </p>
        )}
      </div>

      {/* The reason replaces the note while the control is disabled, and the
       * button points at it either way — a disabled control that says nothing
       * about why teaches nothing, and "generate a spec first" is the
       * actionable half of the message. */}
      <p id={noteId} className="text-xs text-copy-muted">
        {blockedReason ?? SAFETY_NOTE}
      </p>

      {/* A failed run wrote nothing, so the control above stays available —
       * this is a retriable state, not a dead end. */}
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-error">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {outcome && <DeriveUnitsOutcome outcome={outcome} />}
    </div>
  )
}

/**
 * What a derivation actually wrote.
 *
 * The same neutral well `41`'s apply outcome, `42`'s drift notice, and `43`'s
 * push outcome all use, with `role="status"` and never `alert`: **nothing
 * failed here**. A derivation that creates nothing is the *expected* result of
 * running it twice — every derived key already exists — so it says so plainly
 * rather than reading as a fault.
 *
 * **Skips and drops are different facts and read differently.** A skip means
 * the build list already had that work; a drop means the model returned an
 * entry with no usable title. `44`'s producer counts them apart on purpose, and
 * collapsing them here would waste that. The skipped list follows the shape
 * `41`'s already has — a line of explanation, then the titles as items, the
 * bullet as `text-copy-faint` decoration — and invents no second treatment.
 */
function DeriveUnitsOutcome({ outcome }: { outcome: DeriveUnitsResult }) {
  return (
    <div
      role="status"
      className="space-y-1.5 rounded-xl border border-surface-border bg-base p-3"
    >
      <p className="text-xs text-copy-primary">
        {outcome.createdCount > 0
          ? `Derived from your spec — ${countLabel(
              outcome.createdCount,
              "unit",
              "units",
            )} added.`
          : "Nothing new to add — your build list already covers this spec."}
      </p>

      {outcome.skippedTitles.length > 0 && (
        <div className="text-xs text-copy-muted">
          <p>
            {countLabel(outcome.skippedTitles.length, "unit", "units")} skipped —
            the build list already has one with that title:
          </p>
          <ul className="mt-1 space-y-0.5">
            {outcome.skippedTitles.map((title, index) => (
              <li key={`${title}-${index}`} className="flex gap-2">
                {/* Decoration, not content — the title is the item — so
                 * `text-copy-faint` is licensed here. */}
                <span aria-hidden className="text-copy-faint">
                  •
                </span>
                <span>{title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outcome.droppedCount > 0 && (
        <p className="text-xs text-copy-muted">
          {countLabel(outcome.droppedCount, "entry", "entries")} dropped —
          Specwright couldn’t read a usable title from what the model returned,
          so nothing was created from{" "}
          {outcome.droppedCount === 1 ? "it" : "them"}.
        </p>
      )}
    </div>
  )
}

/** `{n} unit` / `{n} units`, mirroring the same helper in `changes-view.tsx`. */
function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/**
 * Read a derivation outcome off a completed run's output.
 *
 * The output crosses the network exactly as run metadata does, so every field
 * is checked rather than trusted — the counts are rendered as numbers and the
 * skips as a list, and an unexpected shape must read as "nothing to report"
 * rather than as `undefined units added`. A run that completed with no usable
 * output still counts as a success: the units were written before the run
 * finished, and this is a report about them, not the proof of them.
 */
function readDeriveOutcome(output: unknown): DeriveUnitsResult {
  const empty: DeriveUnitsResult = {
    createdCount: 0,
    skippedTitles: [],
    droppedCount: 0,
  }

  if (typeof output !== "object" || output === null) return empty

  const record = output as Record<string, unknown>
  const count = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0

  return {
    createdCount: count(record.createdCount),
    skippedTitles: Array.isArray(record.skippedTitles)
      ? record.skippedTitles.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    droppedCount: count(record.droppedCount),
  }
}
