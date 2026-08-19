"use client"

import { useState, type FormEvent } from "react"
import { AlertCircle, ListChecks, Loader2, Plus } from "lucide-react"

import { BuildUnitRow } from "@/components/editor/build/build-unit-row"
import {
  DeriveUnitsAction,
  type DeriveSpecAvailability,
} from "@/components/editor/build/derive-units-action"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  useProjectBuildUnits,
  type BuildUnitActionResult,
  type BuildUnitDraft,
} from "@/hooks/use-project-build-units"
import { useProjectSpecs } from "@/hooks/use-project-specs"

interface BuildViewProps {
  /** Room/project id whose units this page lists (room id ≡ project id). */
  projectId: string
}

/**
 * The `/editor/[roomId]/build` route: an always-visible add form over the
 * project's units in build order, each expanding to reveal the controls that
 * change its status, its verification level, its title, or remove it.
 *
 * One scrolling column rather than Specs' two-pane split — there is no second
 * thing to preview, only a list and its controls. Loading, error, and empty
 * branches are `specs-view.tsx`'s, including its rule that a background reload
 * of a populated list never falls back to the spinner.
 */
export function BuildView({ projectId }: BuildViewProps) {
  const {
    units,
    isLoading,
    error: listError,
    refresh,
    create,
    update,
    remove,
    derive,
  } = useProjectBuildUnits(projectId)

  /*
   * The Build view does not know whether the project has a spec, and deriving
   * needs one. This is the endpoint that already reports it, so it is reused
   * rather than a field being added to the build-unit listing — and the answer
   * is used only to *shape the affordance*. `POST /api/ai/units`'s own 409 is
   * still the guard.
   */
  const {
    specs,
    isLoading: isSpecsLoading,
    error: specsError,
  } = useProjectSpecs(projectId)

  const specAvailability: DeriveSpecAvailability =
    specs.length > 0
      ? "available"
      : specsError
        ? // The list failed, so nothing is known — a control that claimed "no
          // spec" here would state a fact it does not have. Left available for
          // the route to answer.
          "unknown"
        : isSpecsLoading
          ? "loading"
          : "none"

  // Only once the list has actually resolved to nothing. Deriving takes the
  // primary treatment there and nowhere else, so a populated Build tab must not
  // flash a loud button on every visit while its list loads.
  const listIsEmpty = !isLoading && !listError && units.length === 0

  /** The single open row, if any — this is an accordion, not a tree. */
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null)

  function toggleExpand(unitId: string) {
    const previous = expandedUnitId

    if (previous !== null && previous !== unitId) {
      // The panel about to be removed may still hold focus — a pointer click
      // does not focus the clicked button in every browser. Park focus on the
      // header of the row being closed rather than letting it fall to <body>
      // when its panel leaves the DOM.
      const panel = document.getElementById(`build-unit-${previous}-panel`)
      if (panel?.contains(document.activeElement)) {
        document.getElementById(`build-unit-${previous}-header`)?.focus()
      }
    }

    // Re-activating the open row's own header closes it: a disclosure toggles,
    // it is not a selection that can never be undone.
    setExpandedUnitId(previous === unitId ? null : unitId)
  }

  return (
    // `EditorRoomShell` publishes `--canvas-inset-left` (20rem while the
    // floating project sidebar is open). This view's controls sit in document
    // flow, so without the inset the sidebar renders on top of them.
    <div className="flex h-full flex-1 flex-col overflow-y-auto pl-(--canvas-inset-left,0px) transition-[padding-left] duration-200 ease-out">
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        {/* Above every list branch, unconditionally: a list that failed to load
         * must still let someone add a unit. */}
        <AddUnitForm onCreate={create} />

        {/* Above every list branch too, and for the same reason: a list that
         * failed to load can still be derived into. Keeping it out of the
         * branches is also what lets it report what a run wrote — inside the
         * empty block it would unmount the moment the refreshed list arrived,
         * taking the report with it. */}
        <div className="mt-3">
          <DeriveUnitsAction
            treatment={listIsEmpty ? "primary" : "secondary"}
            specAvailability={specAvailability}
            onDerive={derive}
            onDerived={refresh}
          />
        </div>

        {isLoading && units.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-copy-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Loading build units…</span>
          </div>
        ) : listError ? (
          <p
            role="alert"
            className="flex items-center justify-center gap-1.5 py-10 text-xs text-error"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{listError}</span>
          </p>
        ) : units.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-subtle text-brand">
              <ListChecks className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-copy-primary">
                No units yet
              </p>
              <p className="text-xs text-copy-muted">
                Add your first build unit above to start tracking progress, or
                derive the list from your spec.
              </p>
            </div>
          </div>
        ) : (
          /*
           * An ordered list because the numbering *is* the content here: a
           * unit's sequence is its identity, not a display order.
           *
           * Rendered exactly as the server ordered it, superseded units
           * included. **A superseded unit is never reordered, hidden, dimmed, or
           * collapsed**, and no filter defaults to excluding it: the build list
           * is the record of what a team built, and a unit that was replaced is
           * part of that record. Its supersession shows as one more badge on the
           * row, beside — never instead of — the status and verification it
           * already had.
           */
          <ol className="mt-6 flex flex-col gap-3">
            {units.map((unit) => (
              <BuildUnitRow
                key={unit.id}
                unit={unit}
                isExpanded={unit.id === expandedUnitId}
                onToggleExpand={() => toggleExpand(unit.id)}
                onUpdate={(patch) => update(unit.id, patch)}
                onRemove={() => remove(unit.id)}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

/**
 * The add form, kept in this file rather than split out: it owns one piece of
 * state and appears once, the same reason `specs-view.tsx` keeps its generate
 * action inline.
 *
 * Pending state is local. The hook deliberately owns none, so the spinner here
 * belongs to this form and cannot leak into a row.
 */
function AddUnitForm({
  onCreate,
}: {
  onCreate: (draft: BuildUnitDraft) => Promise<BuildUnitActionResult>
}) {
  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedTitle = title.trim()
    if (!trimmedTitle || pending) return

    setError(null)
    setPending(true)
    const trimmedSummary = summary.trim()
    const result = await onCreate({
      title: trimmedTitle,
      summary: trimmedSummary || undefined,
    })
    setPending(false)

    if (!result.ok) {
      // Neither field is cleared on failure — the text is the user's, and a
      // refused title is the one they need in front of them to change it.
      setError(result.error)
      return
    }

    setTitle("")
    setSummary("")
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-3 rounded-2xl border border-surface-border bg-surface p-4"
    >
      <div className="space-y-1.5">
        <label
          htmlFor="new-build-unit-title"
          className="block text-xs font-medium text-copy-secondary"
        >
          Title
        </label>
        {/* No `maxLength` on either field: over-length text is truncated
         * server-side rather than rejected, the policy `MAX_BRIEF_LENGTH`
         * documents for human-typed text with no bound at its source. */}
        <Input
          id="new-build-unit-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What is this unit of work?"
          className="text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="new-build-unit-summary"
          className="block text-xs font-medium text-copy-secondary"
        >
          Summary <span className="text-copy-muted">(optional)</span>
        </label>
        <Textarea
          id="new-build-unit-summary"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="What does finishing it mean?"
          className="min-h-16 resize-none text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {error && (
          <p
            role="alert"
            className="mr-auto flex items-center gap-1.5 text-xs text-error"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={!title.trim() || pending}
          className="bg-brand text-white hover:bg-brand/90"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {pending ? "Adding…" : "Add unit"}
        </Button>
      </div>
    </form>
  )
}
