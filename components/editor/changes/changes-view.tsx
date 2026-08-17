"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import { useRealtimeRun } from "@trigger.dev/react-hooks"
import {
  AlertCircle,
  Check,
  ChevronDown,
  GitPullRequest,
  Loader2,
  Sparkles,
  Trash2,
  Waypoints,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  useProjectChanges,
  type ApplyChangeResult,
  type ChangeActionResult,
  type ChangeRunHandle,
  type ProposeChangeResult,
  type PushToCanvasResult,
} from "@/hooks/use-project-changes"
import { isFinishedRunStatus } from "@/lib/trigger-run"
import { cn } from "@/lib/utils"
import type { canvasSync } from "@/trigger/canvas-sync"
import type { proposeChange } from "@/trigger/propose-change"
import {
  CHANGE_DELTA_KIND_ORDER,
  CHANGE_STATUS_DISPLAY,
  changeDeltaKindLabel,
  type ChangeApplyResponse,
  type ChangeCanvasPushOutcome,
  type ChangeDeltaEntry,
  type ChangeDisplayEntry,
  type ChangeProposal,
  type ChangeResponse,
  type ChangeStaleRefusal,
  type ChangeStatusValue,
  type ChangeSummary,
} from "@/types/changes"

/**
 * The house badge treatment, verbatim from `build-unit-row.tsx`'s `BADGE` —
 * shape, fill, and border. It is not a Build-only style: `context/ui-context.md`
 * records it as the badge every surface wears, and the reason the pill is
 * recessed to `bg-base` rather than sitting on `bg-subtle` is contrast. Badge
 * text is 10px, under every large-text allowance, so each tone owes WCAG AA
 * 4.5:1, which `text-copy-muted` does not pay on `bg-subtle` (4.27:1) but does
 * on `bg-base` (5.16:1). The border is what keeps the pill a visible shape once
 * it is darker than the card it sits on.
 *
 * Tone is never baked in here: a status badge takes its `toneClass` from
 * `CHANGE_STATUS_DISPLAY`, the single source of how a status is worded and
 * colored. **Delta kinds take no tone at all** — see {@link DeltaGroup}.
 */
const BADGE =
  "rounded-full border border-surface-border bg-base px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase"

/**
 * Chip treatment — the established three states (selected / rest / hover) at
 * `rounded-xl`, identical to the build-unit chips.
 *
 * Chip color never varies by value, unlike the badges above: the chip row is a
 * single control, and toning each option would read as four different kinds of
 * thing rather than one choice. That is also why the status *badge* on a row
 * carries `CHANGE_STATUS_DISPLAY`'s tone while the status *chip* that filters
 * for it does not — a badge reports a value, a chip sets one.
 */
const CHIP_BASE =
  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
const CHIP_SELECTED = "bg-accent-dim text-brand"
const CHIP_IDLE =
  "bg-subtle text-copy-muted hover:bg-elevated hover:text-copy-primary"

/** Shown when a proposal run failed without publishing a message of its own. */
const RUN_FAILED_ERROR =
  "Specwright couldn’t finish the change proposal. Please try again."
/** Shown when a canvas push run failed without reporting a reason of its own. */
const PUSH_FAILED_ERROR =
  "Specwright couldn’t add this change to the canvas. Please try again."
/** Shown when a stored proposal document could not be read back. */
const PROPOSAL_ERROR = "Couldn’t load this proposal. Please try again."
/** Status line while a run is in flight but has published nothing yet. */
const WORKING_FALLBACK = "Specwright is working…"

/** The "no filter" member of the filter chip row. */
const ALL_FILTER = "all" as const
type StatusFilter = ChangeStatusValue | typeof ALL_FILTER

interface ChangesViewProps {
  /** Room/project id whose changes this page lists (room id ≡ project id). */
  projectId: string
}

/**
 * The `/editor/[roomId]/changes` route: a request box at the top, then the
 * project's change proposals newest-first, one expanded at a time to reveal the
 * proposal it produced.
 *
 * One scrolling column, like Build rather than Specs' two-pane split — a
 * proposal is short enough to read inside the row that owns it, so there is no
 * second pane to preview into. Loading, error, and empty branches are
 * `specs-view.tsx`'s, including its rule that a background reload of a
 * populated list never falls back to the spinner.
 *
 * Applying a proposal happens here, from an expanded `PROPOSED` row, and it is
 * the **only** thing on this surface that writes anything outside the change
 * itself. It creates the proposal's new build units and marks the units it makes
 * stale as superseded; it rewrites no existing unit, touches the canvas not at
 * all, writes nothing to the Liveblocks room, generates no spec, and makes no
 * model call.
 */
export function ChangesView({ projectId }: ChangesViewProps) {
  const {
    changes,
    isLoading,
    error: listError,
    refresh,
    propose,
    discard,
    apply,
    pushToCanvas,
    markPushed,
  } = useProjectChanges(projectId)

  /** The single open row, if any — this is an accordion, not a tree. */
  const [expandedChangeId, setExpandedChangeId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL_FILTER)

  // Derived, not synced: a filter is a pure function of the list and the
  // selected chip, so it needs no effect and cannot go stale against a refresh.
  const visible =
    statusFilter === ALL_FILTER
      ? changes
      : changes.filter((change) => change.status === statusFilter)

  function toggleExpand(changeId: string) {
    const previous = expandedChangeId

    if (previous !== null && previous !== changeId) {
      // The panel about to be removed may still hold focus — a pointer click
      // does not focus the clicked button in every browser. Park focus on the
      // header of the row being closed rather than letting it fall to <body>
      // when its panel leaves the DOM.
      const panel = document.getElementById(`change-${previous}-panel`)
      if (panel?.contains(document.activeElement)) {
        document.getElementById(`change-${previous}-header`)?.focus()
      }
    }

    // Re-activating the open row's own header closes it: a disclosure toggles,
    // it is not a selection that can never be undone.
    setExpandedChangeId(previous === changeId ? null : changeId)
  }

  return (
    // `EditorRoomShell` publishes `--canvas-inset-left` (20rem while the
    // floating project sidebar is open). This view's controls sit in document
    // flow, so without the inset the sidebar renders on top of them.
    <div className="flex h-full flex-1 flex-col overflow-y-auto pl-(--canvas-inset-left,0px) transition-[padding-left] duration-200 ease-out">
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        {/* Above every list branch, unconditionally: a list that failed to load
         * must still let someone describe a change. It is also where the
         * "this project has no spec yet" refusal lands, which is a statement
         * about the request rather than about the list. */}
        <ChangeRequestForm onPropose={propose} onProposed={refresh} />

        {isLoading && changes.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-copy-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Loading changes…</span>
          </div>
        ) : listError ? (
          <p
            role="alert"
            className="flex items-center justify-center gap-1.5 py-10 text-xs text-error"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{listError}</span>
          </p>
        ) : changes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-subtle text-brand">
              <GitPullRequest className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-copy-primary">
                No changes yet
              </p>
              <p className="text-xs text-copy-muted">
                Describe a change above and Specwright will work out what it
                moves.
              </p>
            </div>
          </div>
        ) : (
          <>
            <StatusFilterChips
              selected={statusFilter}
              onSelect={setStatusFilter}
            />

            {visible.length === 0 ? (
              <p className="py-10 text-center text-xs text-copy-muted">
                No changes with that status.
              </p>
            ) : (
              // A plain list, not an ordered one: the sequence is rendered
              // explicitly on each row and gaps are expected, so a browser's own
              // numbering would disagree with the change's real number.
              <ul className="mt-4 flex flex-col gap-3">
                {visible.map((change) => (
                  <ChangeRow
                    key={change.id}
                    projectId={projectId}
                    change={change}
                    isExpanded={change.id === expandedChangeId}
                    onToggleExpand={() => toggleExpand(change.id)}
                    onDiscard={() => discard(change.id)}
                    onApply={(options) => apply(change.id, options)}
                    onPushToCanvas={() => pushToCanvas(change.id)}
                    onPushed={() => markPushed(change.id)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Filter the list by status.
 *
 * A radio group rather than `aria-pressed` toggles: it sets one value from a
 * fixed set that is never empty and never multiple, which is what `radio` means.
 * The options come from `CHANGE_STATUS_DISPLAY`, so their order and wording
 * cannot drift from the badges on the rows they filter — a status added to the
 * vocabulary appears here without this file changing.
 *
 * Rendered only when the project has at least one change: a control that can
 * only ever filter nothing down to nothing is noise beside the empty state.
 */
function StatusFilterChips({
  selected,
  onSelect,
}: {
  selected: StatusFilter
  onSelect: (value: StatusFilter) => void
}) {
  const options: { value: StatusFilter; label: string }[] = [
    { value: ALL_FILTER, label: "All" },
    ...CHANGE_STATUS_DISPLAY.map((entry) => ({
      value: entry.value as StatusFilter,
      label: entry.label,
    })),
  ]

  return (
    <div
      role="radiogroup"
      aria-label="Filter changes by status"
      className="mt-6 flex flex-wrap gap-2"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={selected === option.value}
          onClick={() => onSelect(option.value)}
          className={cn(
            CHIP_BASE,
            selected === option.value ? CHIP_SELECTED : CHIP_IDLE
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Ask for a proposal, and track the run that produces one.
 *
 * Progress rides on the **run's own metadata**, not on the room's
 * `ai-status-feed`: a proposal mutates nothing shared, so only the client that
 * asked for it tracks it — the same line `specs-view.tsx` follows, drawn in
 * `context/architecture-context.md` by what the work changes.
 *
 * Nothing is optimistically added to the list. `propose` starts a background
 * run and the change row does not exist until that run has stored it, so the
 * list is refreshed on completion instead.
 */
function ChangeRequestForm({
  onPropose,
  onProposed,
}: {
  onPropose: (request: string) => Promise<ProposeChangeResult>
  onProposed: () => void
}) {
  const [request, setRequest] = useState("")
  const [pending, setPending] = useState(false)
  const [activeRun, setActiveRun] = useState<ChangeRunHandle | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Guards the settle, so a run is only ever finished once. */
  const settledRunRef = useRef<string | null>(null)

  // Keyed by run id so a finished run's cached state can't settle the next one
  // instantly; idle (and quiet about the absent token) while nothing is running.
  const { run, error: runError } = useRealtimeRun<typeof proposeChange>(
    activeRun?.runId,
    {
      accessToken: activeRun?.token,
      enabled: activeRun !== null,
      id: activeRun?.runId,
      // The payload is the request we just sent — don't ship it back.
      skipColumns: ["payload"],
    }
  )

  const busy = pending || activeRun !== null

  const settle = useCallback(
    (failed: boolean, failureText: string | null) => {
      // Prefer the message the run itself published — that is how a task
      // explains a failure the generic line would misdescribe (a spent AI quota
      // says so, instead of "please try again", which cannot work). This is the
      // regression unit `37` fixed; do not overwrite it with a local constant.
      if (failed) {
        setError(failureText ?? RUN_FAILED_ERROR)
      } else {
        // The task stores the change before it completes, so by now the row
        // exists — reload the list to pick it up, and clear the box, since what
        // was typed in it is now the first row of that list.
        setRequest("")
        onProposed()
      }
      setActiveRun(null)
    },
    [onProposed]
  )

  // Close the run out once it finishes. Deliberately not `useRealtimeRun`'s
  // `onComplete`, which fires at most once per mount — a second proposal in the
  // same session would never settle and the box would stay disabled.
  useEffect(() => {
    if (!activeRun) return
    if (settledRunRef.current === activeRun.runId) return

    const isFinished =
      run?.id === activeRun.runId && isFinishedRunStatus(run.status)
    // A dropped subscription also ends tracking — otherwise a network blip would
    // leave the form disabled forever.
    if (!isFinished && !runError) return

    const runId = activeRun.runId
    const failed = Boolean(runError) || run?.status !== "COMPLETED"

    // A dropped subscription publishes nothing trustworthy — whatever metadata
    // is cached predates the drop — so only the run's own reported failure
    // supplies its message.
    const failureText = runError ? null : runFailureText(run?.metadata)

    // Deferred so the settle never sets state synchronously inside the effect.
    // The guard is claimed inside the timer, not before it: a later realtime
    // update would otherwise cancel this timer while the guard already read as
    // settled, and the run would hang.
    const timer = setTimeout(() => {
      settledRunRef.current = runId
      settle(failed, failureText)
    }, 0)
    return () => clearTimeout(timer)
  }, [activeRun, run, runError, settle])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const text = request.trim()
    if (!text || busy) return

    setError(null)
    setPending(true)
    const result = await onPropose(text)
    setPending(false)

    if (!result.ok) {
      // The text is not cleared: a refusal a person can act on — the 409 that
      // says to generate a spec first — is only actionable with the request
      // still in front of them.
      setError(result.error)
      return
    }

    setActiveRun(result.run)
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-3 rounded-xl border border-surface-border bg-surface p-4"
    >
      <div className="space-y-1.5">
        <label
          htmlFor="change-request"
          className="block text-xs font-medium text-copy-secondary"
        >
          Describe the change
        </label>
        {/* No `maxLength`: over-length text is truncated server-side rather
         * than rejected, the policy `MAX_BRIEF_LENGTH` documents for
         * human-typed text with no bound at its source. */}
        <Textarea
          id="change-request"
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          disabled={busy}
          placeholder="e.g. Move uploads off the API server and process them in a queue."
          className="min-h-20 resize-none text-sm"
        />
        <p className="text-xs text-copy-muted">
          Specwright proposes what this moves — it changes nothing on its own.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {activeRun && (
          <p
            role="status"
            aria-live="polite"
            className="mr-auto min-w-0 truncate text-xs text-copy-muted"
          >
            {runStatusText(run?.metadata)}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mr-auto flex min-w-0 items-center gap-1.5 text-xs text-error"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        <Button
          type="submit"
          size="sm"
          disabled={!request.trim() || busy}
          className="bg-brand text-white hover:bg-brand/90"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {busy ? "Proposing…" : "Propose change"}
        </Button>
      </div>
    </form>
  )
}

/**
 * One change: a disclosure whose header reports its number, the member's own
 * words, its status, and the spec version it was reasoned against, and whose
 * panel holds the proposal itself.
 *
 * The header *is* the button, and the discard control is inside the panel
 * rather than beside the header text — nesting one interactive element inside
 * another is invalid and breaks keyboard navigation, the rule `specs-view.tsx`
 * documents where it puts the download control outside its card button.
 *
 * A change is named by its `sequence`, never by its id: `change.id` is used only
 * to address the change's route, to key the list, and to build the ids that tie
 * the header to its panel.
 */
function ChangeRow({
  projectId,
  change,
  isExpanded,
  onToggleExpand,
  onDiscard,
  onApply,
  onPushToCanvas,
  onPushed,
}: {
  projectId: string
  change: ChangeSummary
  isExpanded: boolean
  onToggleExpand: () => void
  onDiscard: () => Promise<ChangeActionResult>
  onApply: (options?: {
    acknowledgedSpecVersion?: number
  }) => Promise<ApplyChangeResult>
  onPushToCanvas: () => Promise<PushToCanvasResult>
  onPushed: () => void
}) {
  const [discarding, setDiscarding] = useState(false)
  const [applying, setApplying] = useState(false)
  /**
   * A refused discard or apply lands here rather than in the hook's `error`,
   * which is list-load only — so the message appears inside this row without the
   * list blanking. Cleared in both directions of the disclosure, so it never
   * ambushes a panel that is opened later.
   */
  const [rowError, setRowError] = useState<string | null>(null)
  /**
   * Set by the one refusal a person can resolve: the proposal was reasoned
   * against an older spec version than the project is on now.
   *
   * It is kept apart from `rowError` on purpose. Every other refusal is a dead
   * end that only wants reading; this one carries two numbers and a second,
   * explicit confirmation, so it needs its own state to render that from.
   */
  const [stale, setStale] = useState<ChangeStaleRefusal["stale"] | null>(null)
  /** What the apply actually did, once one has succeeded from this panel. */
  const [outcome, setOutcome] = useState<ChangeApplyResponse | null>(null)

  const panelId = `change-${change.id}-panel`
  const headerId = `change-${change.id}-header`

  const statusEntry = statusDisplay(change.status)

  function handleToggleExpand() {
    setRowError(null)
    setStale(null)
    setOutcome(null)
    onToggleExpand()
  }

  async function handleDiscard() {
    if (discarding || applying) return

    setRowError(null)
    setDiscarding(true)
    const result = await onDiscard()
    setDiscarding(false)
    if (!result.ok) setRowError(result.error)
    // On success the row stays — discarding is a status change, not a delete —
    // and the hook has already flipped `change.status`, which re-renders the
    // badge and removes this button.
  }

  /**
   * Apply the change.
   *
   * `acknowledgedSpecVersion` is passed **only** from the stale confirmation,
   * carrying the number the server itself named. A refusal is never retried
   * automatically: the whole point of the refusal is that a person has to look
   * at the two versions and decide the proposal still holds.
   */
  async function handleApply(acknowledgedSpecVersion?: number) {
    if (applying || discarding) return

    setRowError(null)
    setOutcome(null)
    setApplying(true)
    const result = await onApply(
      acknowledgedSpecVersion === undefined
        ? undefined
        : { acknowledgedSpecVersion }
    )
    setApplying(false)

    if (result.ok) {
      setStale(null)
      // Reported rather than assumed: a proposed unit whose title collides with
      // an existing one is skipped, so "what landed" and "what was proposed" are
      // not the same list.
      setOutcome(result.outcome)
      return
    }

    if (result.kind === "stale") {
      setStale(result.stale)
      return
    }

    setStale(null)
    setRowError(result.error)
  }

  return (
    <li
      className={cn(
        "overflow-hidden rounded-2xl border bg-surface transition-colors",
        isExpanded ? "border-brand" : "border-surface-border"
      )}
    >
      <button
        type="button"
        id={headerId}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        onClick={handleToggleExpand}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {/* Padded *up to* two digits, like a build unit's number — a longer
         * sequence is shown in full rather than truncated. `text-copy-muted`,
         * not faint: the number is the change's identity, so it is text
         * carrying information, and `--text-faint` is decoration-only. */}
        <span className="w-7 shrink-0 pt-0.5 font-mono text-xs text-copy-muted">
          {String(change.sequence).padStart(2, "0")}
        </span>

        <span className="min-w-0 flex-1">
          {/* Clamped while collapsed so a long request cannot push the badges
           * off screen, and unclamped once open, where the member's own words
           * are the heading the proposal answers. */}
          <span
            className={cn(
              "block text-sm font-medium text-copy-primary",
              !isExpanded && "line-clamp-2"
            )}
          >
            {change.request}
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              aria-label={`Status: ${statusEntry.label}`}
              className={cn(BADGE, statusEntry.toneClass)}
            >
              {statusEntry.label}
            </span>
            {/* What the proposal was reasoned against. Same badge treatment at
             * `text-copy-muted`, the quietest tone a badge may take, so the
             * base version reads as the quietest thing on the row — the
             * treatment `38` gave a build unit's source-spec badge. The visible
             * text stays bare like its neighbour; `aria-label` says what the
             * "v" means, since "against v2" read aloud does not. */}
            <span
              aria-label={`Reasoned against spec version ${change.baseSpecVersion}`}
              className={cn(BADGE, "text-copy-muted")}
            >
              against v{change.baseSpecVersion}
            </span>
            <span className="text-xs text-copy-muted">
              {formatChangeDate(change.createdAt)}
            </span>
          </span>
        </span>

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-copy-faint transition-transform",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      {isExpanded && (
        <div
          id={panelId}
          className="space-y-4 border-t border-surface-border p-4"
        >
          {/* Mounted only while expanded, so the proposal document is fetched on
           * expand and dropped on collapse — the list itself carries metadata
           * only. */}
          <ProposalBody projectId={projectId} changeId={change.id} />

          {/* In the proposal body, above the actions: the mismatch is a
            * statement about *this proposal's* standing, so it belongs with the
            * proposal rather than beside the button. */}
          {stale && (
            <StaleNotice
              stale={stale}
              pending={applying}
              onConfirm={() => void handleApply(stale.currentSpecVersion)}
            />
          )}

          {outcome && <ApplyOutcome outcome={outcome} />}

          {change.status === "proposed" ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-surface-border pt-3">
              {/* The stale confirmation replaces this button rather than sitting
               * beside it — while a refusal is on screen, the only way forward
               * is the explicit confirm inside it. */}
              {!stale && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleApply()}
                  disabled={applying || discarding}
                  className="bg-brand text-white hover:bg-brand/90"
                >
                  {applying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {applying ? "Applying…" : "Apply change"}
                </Button>
              )}

              {/* No confirmation, and nothing is destroyed: discarding sets a
               * status, keeps the row, and keeps the stored proposal — a
               * proposal someone considered and rejected is a decision worth
               * keeping. Reaching this button already costs a deliberate
               * expand. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleDiscard()}
                disabled={discarding || applying}
                className="text-copy-muted hover:text-copy-primary"
              >
                {discarding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {discarding ? "Discarding…" : "Discard"}
              </Button>
            </div>
          ) : (
            /* An applied or discarded change is settled as far as the build
             * list goes: neither is reversible from here. Applied in particular
             * is not — the units it created exist and the units it superseded
             * are marked, so discarding it afterwards would claim a decision was
             * rejected while its effects stand. The endpoint refuses it too;
             * this is not the only guard.
             *
             * An applied change still has one step left, and it is the step
             * that keeps the project honest: its delta has to reach the canvas,
             * because the canvas is what a spec is written from. That control
             * lives here rather than beside Apply because pushing is the
             * *follow-on*, and because this is also where a change applied
             * before `43` shipped is found — otherwise those would be stranded
             * with no way to reach the canvas at all. */
            <div className="space-y-3 border-t border-surface-border pt-3">
              {/* Suppressed right after an apply, where the outcome above has
                * already said it in more detail. */}
              {!(change.status === "applied" && outcome) && (
                <p className="text-xs text-copy-muted">
                  {change.status === "applied"
                    ? "This change has been applied to the build list."
                    : "This change was discarded."}
                </p>
              )}

              {change.status === "applied" && (
                <CanvasPushAction
                  isPushed={change.canvasPushed}
                  onPush={onPushToCanvas}
                  onPushed={onPushed}
                />
              )}
            </div>
          )}

          {rowError && (
            <p
              role="alert"
              className="flex items-center gap-1.5 text-xs text-error"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{rowError}</span>
            </p>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * The stale-change refusal, and the second confirmation that resolves it.
 *
 * It reuses the error/alert treatment (`role="alert"`, `text-error`) rather than
 * introducing a warning colour: `--warning` is registered but reads as a
 * verification level in this app (`partial`), and inventing a third "caution"
 * tone for one surface is a design decision with no mandate here. The refusal
 * *is* a refusal — the request was rejected — so the alert treatment is honest.
 *
 * Both versions are named, because the number the proposal was reasoned against
 * and the number the project is on now are exactly what a person needs in order
 * to judge whether the proposal still holds. The confirmation echoes the current
 * one back, and the server re-validates it rather than trusting it.
 *
 * Nothing here retries automatically. A refusal that a machine can resolve on
 * its own was never a refusal.
 */
function StaleNotice({
  stale,
  pending,
  onConfirm,
}: {
  stale: ChangeStaleRefusal["stale"]
  pending: boolean
  onConfirm: () => void
}) {
  return (
    <div
      role="alert"
      className="space-y-2 rounded-xl border border-surface-border bg-base p-3"
    >
      <p className="flex items-start gap-1.5 text-xs text-error">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          This proposal was reasoned against spec version{" "}
          {stale.baseSpecVersion}, but the project is now on version{" "}
          {stale.currentSpecVersion}. The system it describes has moved since.
        </span>
      </p>
      <Button
        type="button"
        size="sm"
        onClick={onConfirm}
        disabled={pending}
        className="bg-brand text-white hover:bg-brand/90"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
        {pending
          ? "Applying…"
          : `Apply anyway against v${stale.currentSpecVersion}`}
      </Button>
    </div>
  )
}

/**
 * What an apply actually did.
 *
 * Reported rather than implied, and the skipped list is the reason: a proposed
 * unit whose title matches an existing one is **skipped, not created and not an
 * error**, so without this the panel would say "applied" while quietly having
 * created fewer units than the proposal listed.
 *
 * `role="status"` rather than `alert` — nothing went wrong, and this is the
 * result of an action the person just took.
 *
 * It also names the drift the apply just created (`42`). This is the moment the
 * spec falls behind, so it is the moment a person is most able to act on it —
 * the Specs view counts the same fact, but only once somebody goes looking.
 */
function ApplyOutcome({ outcome }: { outcome: ChangeApplyResponse }) {
  const created = outcome.created.length
  const superseded = outcome.supersededUnitIds.length

  return (
    <div
      role="status"
      className="space-y-1.5 rounded-xl border border-surface-border bg-base p-3"
    >
      <p className="text-xs text-copy-primary">
        Applied. {countLabel(created, "unit", "units")} created,{" "}
        {countLabel(superseded, "unit", "units")} marked superseded.
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
      <p className="text-xs text-copy-muted">
        Superseded units keep their status, verification, and position — see the
        Build tab.
      </p>
      {/* Unconditional, and it matches what the Specs view counts: drift is a
       * property of the change having been applied, not of how many units it
       * happened to create, so a proposal that created nothing still leaves the
       * spec describing a build list that has moved on.
       *
       * It still points at the canvas rather than at Generate Spec: a spec is
       * written from the canvas graph, and this apply did not touch it, so
       * regenerating now would produce a spec that misses this change while
       * clearing the drift count. Since `43` that instruction has a control
       * under it rather than being manual work — see `CanvasPushAction` below,
       * and `SpecDriftNotice` in specs-view.tsx for the same two states on the
       * other surface. */}
      <p className="text-xs text-copy-muted">
        The spec no longer describes this build list, and specs are written from
        the canvas — which this didn’t change.
      </p>
    </div>
  )
}

/**
 * Push an applied change's architecture delta onto the canvas, and track the run
 * that draws it.
 *
 * **Secondary treatment, never primary.** `41`'s Apply is the primary action on
 * this panel and stays so; this is the follow-on step, not a competing one.
 *
 * Progress rides on the room's shared `ai-status-feed`, not on this run's
 * metadata — the canvas is mutating live under everybody's eyes, which is the
 * design agent's existing behaviour and needs no new affordance here. What this
 * component tracks is only whether *its own* run has finished, so the control
 * can re-enable and the outcome can be reported.
 *
 * A pushed change offers nothing further. There is no re-push: the delta has
 * been drawn, and drawing it twice duplicates nodes. The endpoint refuses it as
 * well, so this is not the only guard.
 */
function CanvasPushAction({
  isPushed,
  onPush,
  onPushed,
}: {
  isPushed: boolean
  onPush: () => Promise<PushToCanvasResult>
  onPushed: () => void
}) {
  const [pending, setPending] = useState(false)
  const [activeRun, setActiveRun] = useState<ChangeRunHandle | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** What the push actually drew, once one has succeeded from this panel. */
  const [outcome, setOutcome] = useState<ChangeCanvasPushOutcome | null>(null)
  /** Guards the settle, so a run is only ever finished once. */
  const settledRunRef = useRef<string | null>(null)

  // Keyed by run id so a finished run's cached state can't settle the next one
  // instantly; idle (and quiet about the absent token) while nothing is running.
  const { run, error: runError } = useRealtimeRun<typeof canvasSync>(
    activeRun?.runId,
    {
      accessToken: activeRun?.token,
      enabled: activeRun !== null,
      id: activeRun?.runId,
      // The payload is the two ids we just sent — don't ship them back.
      skipColumns: ["payload"],
    }
  )

  const busy = pending || activeRun !== null

  const settle = useCallback(
    (failed: boolean, failureText: string | null, result: unknown) => {
      if (failed) {
        // Prefer the reason the run itself reported. Every refusal this task
        // raises is written for a person — "already on the canvas", "only an
        // applied change" — and the generic line would throw that away, which
        // is the regression `37` fixed on the other AI paths.
        setError(failureText ?? PUSH_FAILED_ERROR)
        setActiveRun(null)
        return
      }

      // The run's output crosses the network like any other realtime payload,
      // so its shape is checked rather than trusted.
      const pushed = readPushOutcome(result)
      setOutcome(pushed)
      // The canvas has been written and `canvasPushedAt` recorded by the time
      // the run completes, so the row stops offering the control from here on.
      onPushed()
      setActiveRun(null)
    },
    [onPushed]
  )

  // Close the run out once it finishes. Deliberately not `useRealtimeRun`'s
  // `onComplete`, which fires at most once per mount — a second push in the
  // same session would never settle and the control would stay disabled.
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
    // A dropped subscription publishes nothing trustworthy, so only the run's
    // own reported failure supplies its message.
    const failureText = runError ? null : runErrorText(run?.error)
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

  async function handlePush() {
    if (busy) return

    setError(null)
    setPending(true)
    const result = await onPush()
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setActiveRun(result.run)
  }

  // A push that has just landed reports what it drew. A change pushed in an
  // earlier session has no outcome to report, so it simply says so.
  if (outcome) {
    return <CanvasPushOutcome outcome={outcome} />
  }

  if (isPushed) {
    return (
      <p className="text-xs text-copy-muted">
        This change is on the canvas. A new spec will describe it.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-copy-muted">
        The canvas doesn’t show this change yet, and a spec is written from the
        canvas. Add it there before generating a new spec.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void handlePush()}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Waypoints className="h-3.5 w-3.5" />
          )}
          {busy ? "Adding to canvas…" : "Add to canvas"}
        </Button>

        {busy && (
          <p
            role="status"
            aria-live="polite"
            className="min-w-0 truncate text-xs text-copy-muted"
          >
            Specwright is drawing this on the canvas.
          </p>
        )}
      </div>

      {/* A failed push leaves the change unpushed, so the control above stays
        * available — this is a retriable state, not a dead end. */}
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-error">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

/**
 * What a canvas push actually drew.
 *
 * The same neutral well `41`'s apply outcome and `42`'s drift notice both use,
 * with `role="status"` and never `alert`: **nothing failed here**. A removal
 * that was not drawn is the designed behaviour, not an error.
 *
 * The skipped-removal list is the reason this well exists at all. A removal is
 * reported and never drawn — there is no honest way to render "retired" in this
 * palette, and deleting the node is the visual form of the rewrite `41` exists
 * to prevent — so a person who is not told would assume the canvas is now
 * complete. It follows the shape of `41`'s skipped-titles list: one line of
 * explanation, then the component names as items, with no second list treatment
 * invented for it.
 */
function CanvasPushOutcome({
  outcome,
}: {
  outcome: ChangeCanvasPushOutcome
}) {
  const drawn = [
    outcome.nodesAdded > 0
      ? `${countLabel(outcome.nodesAdded, "node", "nodes")} added`
      : null,
    outcome.edgesAdded > 0
      ? `${countLabel(outcome.edgesAdded, "connection", "connections")} added`
      : null,
    outcome.nodesUpdated > 0
      ? `${countLabel(outcome.nodesUpdated, "node", "nodes")} updated`
      : null,
  ].filter((part): part is string => part !== null)

  return (
    <div
      role="status"
      className="space-y-1.5 rounded-xl border border-surface-border bg-base p-3"
    >
      <p className="text-xs text-copy-primary">
        {drawn.length > 0
          ? `Added to the canvas — ${drawn.join(", ")}.`
          : "Added to the canvas. Nothing new needed drawing."}
      </p>

      {outcome.skippedRemovals.length > 0 && (
        <div className="text-xs text-copy-muted">
          <p>
            {countLabel(outcome.skippedRemovals.length, "part", "parts")} of the
            change retires something, which Specwright doesn’t remove for you —
            take these off the canvas yourself:
          </p>
          <ul className="mt-1 space-y-0.5">
            {outcome.skippedRemovals.map((component, index) => (
              <li key={`${component}-${index}`} className="flex gap-2">
                {/* Decoration, not content — the component name is the item —
                 * so `text-copy-faint` is licensed here. */}
                <span aria-hidden className="text-copy-faint">
                  •
                </span>
                <span>{component}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-copy-muted">
        A new spec generated from the canvas will now describe this change.
      </p>
    </div>
  )
}

/** "1 unit" / "3 units" — plural agreement, in one place. */
function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/**
 * Read a canvas-push outcome off a completed run's output.
 *
 * The output crosses the network exactly as run metadata does, so every field
 * is checked rather than trusted — the counts are rendered as numbers and the
 * removals as a list, and an unexpected shape must read as "nothing to report"
 * rather than as `undefined nodes added`. A run that completed with no usable
 * output still counts as a success: the canvas was written before the run
 * finished, and the outcome is a report about it, not the proof of it.
 */
function readPushOutcome(output: unknown): ChangeCanvasPushOutcome {
  const empty: ChangeCanvasPushOutcome = {
    nodesAdded: 0,
    nodesUpdated: 0,
    edgesAdded: 0,
    skippedRemovals: [],
    droppedOperations: 0,
  }

  if (typeof output !== "object" || output === null) return empty

  const record = output as Record<string, unknown>
  const count = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0

  return {
    nodesAdded: count(record.nodesAdded),
    nodesUpdated: count(record.nodesUpdated),
    edgesAdded: count(record.edgesAdded),
    skippedRemovals: Array.isArray(record.skippedRemovals)
      ? record.skippedRemovals.filter(
          (entry): entry is string => typeof entry === "string"
        )
      : [],
    droppedOperations: count(record.droppedOperations),
  }
}

/**
 * The message a failed run reported, or `null` when it reported none worth
 * showing — in which case the caller falls back to {@link PUSH_FAILED_ERROR}.
 *
 * Read off the run's `error` rather than its metadata, because this task
 * publishes its progress to the room's shared feed rather than onto the run.
 * Its refusals are `AbortTaskRunError`s whose messages are written for a person,
 * so showing them is what makes "already on the canvas" say that instead of
 * "please try again", which cannot work.
 */
function runErrorText(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null
  const message = (error as { message?: unknown }).message
  return typeof message === "string" && message.length > 0 ? message : null
}

/** The proposal document itself, once it has been read back. */
function ProposalBody({
  projectId,
  changeId,
}: {
  projectId: string
  changeId: string
}) {
  const { proposal, isLoading, error } = useChangeProposal(projectId, changeId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-xs text-copy-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Loading proposal…</span>
      </div>
    )
  }

  if (error) {
    return (
      <p
        role="alert"
        className="flex items-center justify-center gap-1.5 py-8 text-xs text-error"
      >
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span>{error}</span>
      </p>
    )
  }

  if (!proposal) {
    // The row exists but its document could not be read — stored before its
    // upload landed, or an artifact since removed. That is a missing document,
    // not a failed request, so it reads as an absence rather than an error.
    return (
      <p className="py-8 text-center text-xs text-copy-muted">
        This change has no stored proposal.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <Section title="Summary">
        <p className="text-sm text-copy-secondary">{proposal.summary}</p>
      </Section>

      {proposal.architectureDelta.length > 0 && (
        <Section title="Architecture delta">
          {/* Grouped by kind in `CHANGE_DELTA_KIND_ORDER` — added, then
           * modified, then removed — which is the one source of that order. */}
          <div className="space-y-3">
            {CHANGE_DELTA_KIND_ORDER.map((kind) => (
              <DeltaGroup
                key={kind}
                kind={kind}
                entries={proposal.architectureDelta.filter(
                  (entry) => entry.kind === kind
                )}
              />
            ))}
          </div>
        </Section>
      )}

      {proposal.affectedUnits.length > 0 && (
        <Section title="Affected units">
          {/* By title, resolved server-side from the stored unit id at read
           * time — so a unit renamed since reads under its new name, and one
           * deleted since simply is not here. */}
          <ul className="space-y-2">
            {proposal.affectedUnits.map((unit, index) => (
              <li
                key={`${unit.title}-${index}`}
                className="rounded-xl border border-surface-border bg-base p-3"
              >
                <p className="text-xs font-medium text-copy-primary">
                  {unit.title}
                </p>
                <p className="mt-1 text-xs text-copy-muted">{unit.reason}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {proposal.proposedUnits.length > 0 && (
        <Section title="Proposed units">
          {/* Proposed, not created: nothing on this surface writes a build
           * unit. These are the pieces of work the change implies. */}
          <ul className="space-y-2">
            {proposal.proposedUnits.map((unit, index) => (
              <li
                key={`${unit.title}-${index}`}
                className="rounded-xl border border-surface-border bg-base p-3"
              >
                <p className="text-xs font-medium text-copy-primary">
                  {unit.title}
                </p>
                {unit.summary && (
                  <p className="mt-1 text-xs text-copy-muted">{unit.summary}</p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {proposal.openQuestions.length > 0 && (
        <Section title="Open questions">
          <ul className="space-y-1.5">
            {proposal.openQuestions.map((question, index) => (
              <li
                key={`${question}-${index}`}
                className="flex gap-2 text-xs text-copy-muted"
              >
                {/* The bullet is decoration, not content — the question is the
                 * item — so `text-copy-faint` is licensed here. */}
                <span aria-hidden className="text-copy-faint">
                  •
                </span>
                <span>{question}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

/**
 * One kind of delta and the entries under it.
 *
 * The kind wears the house badge at `text-copy-muted` and **no per-kind color**.
 * The obvious encoding is a green/red diff palette, and this palette has no such
 * pair — `text-success` exists but no "destructive but not an error" red does,
 * and `text-error` means *something went wrong*, which a deliberate removal did
 * not. `types/changes.ts` states that at `changeDeltaKindLabel`; the kinds are
 * separated by their words and their grouping instead.
 *
 * Renders nothing when the kind has no entries, so a delta that only adds does
 * not carry two empty headings.
 */
function DeltaGroup({
  kind,
  entries,
}: {
  kind: ChangeDeltaEntry["kind"]
  entries: ChangeDeltaEntry[]
}) {
  if (entries.length === 0) return null

  const label = changeDeltaKindLabel(kind)

  return (
    <div>
      <span className={cn(BADGE, "text-copy-muted")}>{label}</span>
      <ul className="mt-2 space-y-2">
        {entries.map((entry, index) => (
          <li
            key={`${entry.component}-${index}`}
            className="rounded-xl border border-surface-border bg-base p-3"
          >
            <p className="text-xs font-medium text-copy-primary">
              {entry.component}
            </p>
            <p className="mt-1 text-xs text-copy-muted">{entry.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A titled block of the proposal. */
function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div>
      <h3 className="text-xs font-medium text-copy-secondary">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  )
}

interface ChangeProposalState {
  proposal: ChangeProposal | null
  isLoading: boolean
  error: string | null
}

/**
 * Fetch one change's proposal document through its access-checked route — the
 * only endpoint a client may read proposal content through, since the document
 * itself lives in a private blob store whose URL is never handed out.
 *
 * The document lives in this hook's state, which drops it the moment the row
 * collapses (the component unmounts) or a different change is opened (a fresh
 * `changeId` re-runs the effect). Modelled on `specs-view.tsx`'s
 * `useSpecContent`, including its rule that an aborted request is not an error.
 */
function useChangeProposal(
  projectId: string,
  changeId: string
): ChangeProposalState {
  const [proposal, setProposal] = useState<ChangeProposal | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(
          `/api/projects/${projectId}/changes/${changeId}`,
          { signal: controller.signal }
        )
        if (!response.ok) {
          throw new Error(`Change fetch failed (${response.status})`)
        }

        // Only the document is taken. The summary the row renders is the one
        // the list already loaded, so a second copy here could only disagree
        // with it.
        const { proposal: loaded } = (await response.json()) as ChangeResponse
        setProposal(loaded ?? null)
      } catch (fetchError) {
        // A superseded request is aborted on purpose — not an error.
        if (controller.signal.aborted) return
        console.error(fetchError)
        setError(PROPOSAL_ERROR)
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [projectId, changeId])

  return { proposal, isLoading, error }
}

/**
 * The display metadata for one status.
 *
 * `CHANGE_STATUS_DISPLAY` covers every member of the union, so the fallback is
 * unreachable — it exists so a vocabulary that grows without its table renders
 * something legible instead of needing a non-null assertion here. The fallback
 * tone is `text-copy-muted`, the quietest tone a badge may take; no badge may
 * take `text-copy-faint`.
 */
function statusDisplay(status: ChangeStatusValue): ChangeDisplayEntry {
  return (
    CHANGE_STATUS_DISPLAY.find((entry) => entry.value === status) ?? {
      value: status,
      label: status,
      toneClass: "text-copy-muted",
    }
  )
}

/** e.g. "Jul 12, 2026 at 9:41 AM". */
function formatChangeDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/**
 * The run's latest status line. Metadata crosses the network, so it is checked
 * rather than trusted — an unexpected shape falls back to a generic line.
 */
function runStatusText(metadata: unknown): string {
  if (typeof metadata !== "object" || metadata === null) return WORKING_FALLBACK
  const text = (metadata as { text?: unknown }).text
  return typeof text === "string" && text.length > 0 ? text : WORKING_FALLBACK
}

/**
 * The failure message the run published, or `null` when it published none worth
 * showing — in which case the caller falls back to {@link RUN_FAILED_ERROR}.
 *
 * Only the `error` phase's text is taken: a run can fail after last publishing
 * a "processing…" line, and showing that as the error would read as though the
 * proposal were still being written. Metadata crosses the network, so its shape
 * is checked rather than trusted, exactly as in {@link runStatusText}.
 */
function runFailureText(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null
  const record = metadata as { phase?: unknown; text?: unknown }
  if (record.phase !== "error") return null
  return typeof record.text === "string" && record.text.length > 0
    ? record.text
    : null
}
