"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  AlertCircle,
  ChevronDown,
  Loader2,
  Pencil,
  Trash2,
  Undo2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type {
  BuildUnitActionResult,
  BuildUnitPatch,
} from "@/hooks/use-project-build-units"
import { cn } from "@/lib/utils"
import {
  BUILD_UNIT_STATUS_DISPLAY,
  BUILD_UNIT_VERIFIED_DISPLAY,
  type BuildUnitDisplayEntry,
  type BuildUnitStatusValue,
  type BuildUnitSummary,
  type BuildUnitVerifiedValue,
} from "@/types/build-units"

/**
 * Collapsed-row badge treatment: the "Planned" card's shape in
 * `project-home-view.tsx`. `rounded-full` here is deliberate and is *not* the
 * chip radius below — a badge reports a value, a chip sets one, so they are
 * shaped apart on purpose.
 *
 * The fill is where it departs from that card, and the reason is contrast. A
 * badge carries 10px uppercase text, which is under every large-text
 * allowance, so each tone owes WCAG AA 4.5:1 — and on the `bg-subtle` fill the
 * quiet end of the table did not pay it (`text-copy-faint` 2.10:1,
 * `text-copy-muted` 4.27:1). Recessing the pill to `bg-base`, the darkest
 * registered surface, buys the whole table headroom (`text-copy-muted` reaches
 * 5.16:1, and no tone now sits under 5:1). Being opaque and darker than both
 * the card and the header's `hover:bg-elevated`, it also holds that ratio
 * steady while the row is hovered, which an unfilled badge would not.
 *
 * The border is what keeps the pill a visible shape once it is darker than the
 * card rather than lighter, matching the `border border-surface-border bg-base`
 * wells in `spec-markdown.tsx` and `starter-templates-modal.tsx`.
 *
 * The color is not baked in: each value carries its own `toneClass` from
 * `types/build-units.ts`, which is the single source of how a value is worded
 * and colored wherever it is shown.
 */
const BADGE =
  "rounded-full border border-surface-border bg-base px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase"

/**
 * Chip treatment — the established three states (selected / rest / hover),
 * at `rounded-xl` rather than the `rounded-full` of Discovery's option chips.
 *
 * Chip color never varies by value, unlike the badges: a chip row is a control,
 * and toning each option would read as five different kinds of thing rather
 * than one choice.
 */
const CHIP_BASE =
  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
const CHIP_SELECTED = "bg-accent-dim text-brand"
const CHIP_IDLE =
  "bg-subtle text-copy-muted hover:bg-elevated hover:text-copy-primary"

/** Which mutation this row currently has in flight. */
type PendingAction =
  | "status"
  | "verified"
  | "rename"
  | "delete"
  | "clear-supersession"

export interface BuildUnitRowProps {
  unit: BuildUnitSummary
  isExpanded: boolean
  onToggleExpand: () => void
  /** Bound to the unit's id by the list — the row never sees `projectId`. */
  onUpdate: (patch: BuildUnitPatch) => Promise<BuildUnitActionResult>
  /** Bound to the unit's id by the list. */
  onRemove: () => Promise<BuildUnitActionResult>
}

/**
 * One build unit: a disclosure whose header reports the unit's number, title,
 * summary, and current status/verification, and whose panel holds the controls
 * that change them.
 *
 * Every mutation in this row is serialized through a single `pendingAction`
 * that disables the whole panel while one is in flight. That is a correctness
 * requirement, not polish: `useProjectBuildUnits`'s `update` applies whatever
 * row the server returned by `id`, with no ordering guard, so a status PATCH
 * and a verification PATCH racing from the same row could resolve out of order
 * and silently revert the field that was just committed. One at a time makes
 * that impossible.
 *
 * Selection is pessimistic for the same reason it is cheap to be: the selected
 * chip is always literally `unit.status` / `unit.verified` from props, so it
 * moves only once the server has agreed, and a refusal needs no rollback.
 *
 * **Supersession is a third axis, not a status.** A unit replaced by a later
 * change gets one extra badge and one extra control, and loses nothing: its
 * status chip, its verification chip, its number, and its title all read exactly
 * as they did. A shipped, browser-verified unit that has been superseded shows
 * all three at once, because all three are true.
 */
export function BuildUnitRow({
  unit,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onRemove,
}: BuildUnitRowProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  /** The chip value a status/verification mutation is in flight for. */
  const [pendingChip, setPendingChip] = useState<string | null>(null)
  /**
   * Every failure in this row — status, verification, rename, delete — lands
   * here. The hook's own `error` is list-load only, so a refused rename shows
   * its message beside the input without the list blanking.
   *
   * Its lifetime is the interaction that produced it, from two directions:
   * every action clears it before its own attempt, so a stale failure never
   * sits beside an unrelated new one; and every path that *abandons* or resets
   * an attempt clears it too, so a message never outlives what it describes.
   * Nothing clears it on a timer — while the refused title is still in the
   * input, the reason it was refused stays with it.
   */
  const [rowError, setRowError] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState("")

  const renameInputRef = useRef<HTMLInputElement>(null)
  const renameButtonRef = useRef<HTMLButtonElement>(null)
  /** Set when rename mode is left deliberately, so focus is handed back. */
  const restoreRenameFocusRef = useRef(false)

  // Focus follows the swap between the Rename button and the inline form, in
  // both directions. Keyed on the transition rather than on mount, so
  // re-expanding a row that was left mid-rename does not steal focus from the
  // header the user just activated.
  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus()
      return
    }
    if (!restoreRenameFocusRef.current) return
    restoreRenameFocusRef.current = false
    renameButtonRef.current?.focus()
  }, [isRenaming])

  const panelId = `build-unit-${unit.id}-panel`
  const headerId = `build-unit-${unit.id}-header`
  const statusLabelId = `build-unit-${unit.id}-status-label`
  const verifiedLabelId = `build-unit-${unit.id}-verified-label`

  const statusEntry = displayEntry(BUILD_UNIT_STATUS_DISPLAY, unit.status)
  const verifiedEntry = displayEntry(BUILD_UNIT_VERIFIED_DISPLAY, unit.verified)

  /**
   * The panel is the only place `rowError` is shown, so the message is scoped
   * to it: working the disclosure ends the situation it described.
   *
   * Cleared in both directions, not just on collapse. The list is an accordion,
   * so opening another row closes this one without this handler running — but
   * the only way back to this panel is this header, so clearing on the way in
   * catches that case too, along with a mutation whose promise resolved after
   * the row was already closed. Without the inbound clear, either would ambush
   * the panel the next time it opens.
   */
  function handleToggleExpand() {
    setRowError(null)
    onToggleExpand()
  }

  async function selectStatus(value: BuildUnitStatusValue) {
    if (pendingAction !== null || value === unit.status) return

    setRowError(null)
    setPendingAction("status")
    setPendingChip(value)
    const result = await onUpdate({ status: value })
    setPendingAction(null)
    setPendingChip(null)
    if (!result.ok) setRowError(result.error)
  }

  async function selectVerified(value: BuildUnitVerifiedValue) {
    if (pendingAction !== null || value === unit.verified) return

    setRowError(null)
    setPendingAction("verified")
    setPendingChip(value)
    const result = await onUpdate({ verified: value })
    setPendingAction(null)
    setPendingChip(null)
    if (!result.ok) setRowError(result.error)
  }

  function startRename() {
    // The form opens on the current title, so whatever a previous attempt —
    // rename or otherwise — was complaining about is no longer on screen.
    setRowError(null)
    setRenameValue(unit.title)
    setIsRenaming(true)
  }

  function cancelRename() {
    // Abandoning the attempt takes its failure with it: the refused title goes
    // off screen, so the message about it goes too. Reached from the Cancel
    // button, from Escape, and from a successful save.
    setRowError(null)
    restoreRenameFocusRef.current = true
    setIsRenaming(false)
  }

  async function handleRenameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextTitle = renameValue.trim()
    if (pendingAction !== null || !nextTitle || nextTitle === unit.title) return

    setRowError(null)
    setPendingAction("rename")
    const result = await onUpdate({ title: nextTitle })
    setPendingAction(null)
    if (!result.ok) {
      // A taken title comes back as the route's 409 message, which stays
      // beside the input the user is still editing.
      setRowError(result.error)
      return
    }
    cancelRename()
  }

  /**
   * Disagree with an applied change about whether this unit is stale.
   *
   * Clearing is the only direction available: setting supersession needs a
   * change to point at, which a person cannot invent, so there is no counterpart
   * control and the route refuses any attempt to set it. Nothing else about the
   * unit moves — not its status, not its verification, not its title.
   */
  async function handleClearSupersession() {
    if (pendingAction !== null) return

    setRowError(null)
    setPendingAction("clear-supersession")
    const result = await onUpdate({ supersededByChange: null })
    setPendingAction(null)
    if (!result.ok) setRowError(result.error)
  }

  async function handleDelete() {
    if (pendingAction !== null) return

    setRowError(null)
    setPendingAction("delete")
    const result = await onRemove()
    // On success the list drops this row and unmounts it — there is no state
    // left to reset, and nowhere to show a message.
    if (result.ok) return
    setPendingAction(null)
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
        {/* Padded *up to* two digits — a three-digit sequence (the cap is 200)
         * is shown in full rather than truncated.
         *
         * `text-copy-muted`, not faint: the number is the unit's identity, so it
         * is text carrying information, and `--text-faint` is decoration-only
         * (2.39:1 here, 2.24:1 under the header's `hover:bg-elevated`). Muted
         * reaches 4.85:1 / 4.56:1. The cost is that it now sits at the same tone
         * as the summary and the neutral badges; `font-mono` and the fixed `w-7`
         * gutter are what keep it reading as an index rather than as prose. */}
        <span className="w-7 shrink-0 pt-0.5 font-mono text-xs text-copy-muted">
          {String(unit.sequence).padStart(2, "0")}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-copy-primary">
            {unit.title}
          </span>
          {unit.summary && (
            <span className="mt-1 block text-xs text-copy-muted">
              {unit.summary}
            </span>
          )}
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <ValueBadge prefix="Status" entry={statusEntry} />
            <ValueBadge prefix="Verification" entry={verifiedEntry} />
            {/* Only when there is a source spec. A hand-typed unit shows
              * nothing — absence is the signal, so there is no "added by hand"
              * counterpart badge to read past on every other row. */}
            {unit.specVersion !== null && (
              <SourceSpecBadge version={unit.specVersion} />
            )}
            {/* **Alongside** the status and verification badges, never in place
              * of them. A unit that read `shipped` / `browser` before a change
              * superseded it still reads `shipped` / `browser` after — the three
              * are independent axes and all three are true at once. */}
            {unit.supersededByChange !== null && (
              <SupersededBadge sequence={unit.supersededByChange} />
            )}
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
          <ChipRadioGroup
            labelId={statusLabelId}
            label="Status"
            options={BUILD_UNIT_STATUS_DISPLAY}
            selected={unit.status}
            pendingValue={pendingAction === "status" ? pendingChip : null}
            disabled={pendingAction !== null}
            onSelect={(value) => void selectStatus(value)}
          />

          <ChipRadioGroup
            labelId={verifiedLabelId}
            label="Verification"
            options={BUILD_UNIT_VERIFIED_DISPLAY}
            selected={unit.verified}
            pendingValue={pendingAction === "verified" ? pendingChip : null}
            disabled={pendingAction !== null}
            onSelect={(value) => void selectVerified(value)}
          />

          {/* Only on a superseded unit. There is no third chip row here, because
            * supersession is not a vocabulary a person picks from — it has one
            * value and one operation, removing it. */}
          {unit.supersededByChange !== null && (
            <div className="border-t border-surface-border pt-3">
              {/* The space after the expression is explicit. Written as a
                * literal it is the first thing on a text node that wraps to the
                * next source line, and the compiler trims it — which rendered
                * "Change 1replaced this unit's work." Caught in a browser pass;
                * the source read correctly, so only the painted pixels showed
                * it. Any `{expr} word` that wraps needs the same treatment. */}
              <p className="text-xs text-copy-muted">
                Change {unit.supersededByChange}{" "}
                replaced this unit&apos;s work. Its status and verification are
                untouched.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleClearSupersession()}
                disabled={pendingAction !== null}
                className="mt-2 text-copy-muted hover:text-copy-primary"
              >
                {pendingAction === "clear-supersession" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Undo2 className="h-3.5 w-3.5" />
                )}
                {pendingAction === "clear-supersession"
                  ? "Clearing…"
                  : "Not superseded"}
              </Button>
            </div>
          )}

          {isRenaming ? (
            // Inline, not in the header: the header *is* a button, and nesting
            // an input inside one is invalid and breaks keyboard navigation.
            <form
              onSubmit={(event) => void handleRenameSubmit(event)}
              className="flex items-center gap-2 border-t border-surface-border pt-3"
            >
              <Input
                ref={renameInputRef}
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") cancelRename()
                }}
                aria-label={`Rename ${unit.title}`}
                className="flex-1 text-sm"
              />
              <Button
                type="submit"
                size="sm"
                disabled={
                  !renameValue.trim() ||
                  renameValue.trim() === unit.title ||
                  pendingAction !== null
                }
                className="bg-brand text-white hover:bg-brand/90"
              >
                {pendingAction === "rename" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Save"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={cancelRename}
                disabled={pendingAction !== null}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2 border-t border-surface-border pt-3">
              <Button
                ref={renameButtonRef}
                type="button"
                variant="ghost"
                size="sm"
                onClick={startRename}
                disabled={pendingAction !== null}
                className="text-copy-muted hover:text-copy-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
                Rename
              </Button>

              {/* No confirmation. A unit is project *content*, like a
               * collaborator in the share dialog, not project *lifecycle* like
               * the project itself — and reaching this button already costs a
               * deliberate expand. */}
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => void handleDelete()}
                disabled={pendingAction !== null}
              >
                {pendingAction === "delete" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {pendingAction === "delete" ? "Deleting…" : "Delete"}
              </Button>
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
 * A value as the collapsed header reports it.
 *
 * The visible text stays bare, matching the unprefixed "Planned" badge it is
 * shaped after; the prefix rides on `aria-label`, which the header button's
 * accessible name folds in, so "Shipped" is never read out without saying what
 * it is the status of.
 */
function ValueBadge({
  prefix,
  entry,
}: {
  prefix: string
  entry: BuildUnitDisplayEntry<string>
}) {
  return (
    <span
      aria-label={`${prefix}: ${entry.label}`}
      className={cn(BADGE, entry.toneClass)}
    >
      {entry.label}
    </span>
  )
}

/**
 * Where a unit came from, when it came from a spec.
 *
 * Same {@link BADGE} treatment as the status and verification badges rather
 * than a new chip style, and `text-copy-muted` — the quietest tone that still
 * clears AA on the badge fill, and the one the neutral statuses already use, so
 * lineage reads as the quietest thing on the row. (The unit spec called this
 * `bg-subtle text-copy-muted`; `38` shipped the badge on `bg-base` because
 * `text-copy-muted` only reaches 4.27:1 on `bg-subtle`. The treatment is the
 * one that shipped.)
 *
 * The visible text stays bare like its neighbours; `aria-label` says what the
 * "v" means, since "from v2" read aloud does not.
 */
function SourceSpecBadge({ version }: { version: number }) {
  return (
    <span
      aria-label={`From spec version ${version}`}
      className={cn(BADGE, "text-copy-muted")}
    >
      from v{version}
    </span>
  )
}

/**
 * That a later change has replaced this unit's work.
 *
 * The same house {@link BADGE} at `text-copy-muted` as the lineage badge above,
 * and for the same reason: it is provenance, not a state of the work, so it must
 * not out-shout the status it sits beside. It is placed **after** status and
 * verification (and after the source-spec badge, which it belongs with) so a row
 * reads status → verification → provenance.
 *
 * Deliberately not a status badge, not a strikethrough, and not a dimmed row.
 * The unit still says what it was — a shipped unit reads `Shipped` right next to
 * this — because the record of what was built is the thing this whole unit
 * exists to preserve.
 *
 * The visible text stays bare like its neighbours; `aria-label` says what the
 * number is, since "replaced by 4" read aloud does not.
 */
function SupersededBadge({ sequence }: { sequence: number }) {
  return (
    <span
      aria-label={`Replaced by change ${sequence}`}
      className={cn(BADGE, "text-copy-muted")}
    >
      replaced by change {sequence}
    </span>
  )
}

/**
 * One vocabulary as a row of chips.
 *
 * A radio group rather than Discovery's `aria-pressed` toggles: these set one
 * value from a fixed set that is never empty and never multiple, which is what
 * `radio` means and what `aria-pressed` does not.
 *
 * Keyboard support is plain Tab-sequential buttons with native Enter/Space, not
 * the APG roving-tabindex arrow-key pattern. That satisfies WCAG 2.1.1 and
 * matches every other chip row in this app; upgrading to roving tabindex is a
 * cross-cutting change to make with Discovery, not to invent here.
 */
function ChipRadioGroup<V extends string>({
  labelId,
  label,
  options,
  selected,
  pendingValue,
  disabled,
  onSelect,
}: {
  labelId: string
  label: string
  options: readonly BuildUnitDisplayEntry<V>[]
  selected: V
  /** The value this group has a mutation in flight for, if any. */
  pendingValue: string | null
  disabled: boolean
  onSelect: (value: V) => void
}) {
  return (
    <div>
      {/* `aria-labelledby` points at the visible label, so the group's
       * accessible name cannot drift from what is on screen. */}
      <p id={labelId} className="text-xs font-medium text-copy-secondary">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="mt-2 flex flex-wrap gap-2"
      >
        {options.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="radio"
            aria-checked={selected === entry.value}
            disabled={disabled}
            onClick={() => onSelect(entry.value)}
            className={cn(
              CHIP_BASE,
              selected === entry.value ? CHIP_SELECTED : CHIP_IDLE
            )}
          >
            {pendingValue === entry.value && (
              <Loader2 className="h-3 w-3 animate-spin" />
            )}
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The display metadata for one value.
 *
 * The tables cover every member of their union, so the fallback is
 * unreachable — it exists so a vocabulary that grows without its table renders
 * something legible instead of needing a non-null assertion here.
 */
function displayEntry<V extends string>(
  table: readonly BuildUnitDisplayEntry<V>[],
  value: V
): BuildUnitDisplayEntry<V> {
  return (
    table.find((entry) => entry.value === value) ?? {
      value,
      label: value,
      toneClass: "text-copy-muted",
    }
  )
}
