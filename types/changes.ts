/**
 * Shared change types that cross the API boundary.
 *
 * Kept out of `lib/change-agent/` on purpose, for the reason `types/specs.ts`
 * states at the top of its own file: those modules reach for the Prisma client,
 * `@vercel/blob`, and the AI SDK, so they are server-only, while these are the
 * shapes the Changes view and its data hook consume from the browser. Nothing
 * here imports from `lib/` or from the generated client under
 * `app/generated/prisma` — pulling either into a `"use client"` module would
 * drag the database client into the browser bundle.
 *
 * That split is also why the status vocabulary below is a string union rather
 * than the `ChangeStatus` Prisma enum it mirrors: the wire carries the lowercase
 * form and the translation to and from the SCREAMING_SNAKE enum member lives in
 * exactly one server-side place, exactly as `types/build-units.ts` documents.
 */

// The one cross-module import here, and it is to the sibling wire-type module
// rather than to anything server-side: applying a change answers with build
// unit rows, and re-declaring their shape would let the two drift.
import type { BuildUnitSummary } from "@/types/build-units"

/** Order the statuses are presented in — the source of order for the UI. */
const CHANGE_STATUS_ORDER = ["proposed", "applied", "discarded"] as const

/** Where a change sits in its lifecycle, as it travels on the wire. */
export type ChangeStatusValue = (typeof CHANGE_STATUS_ORDER)[number]

/** How one part of the architecture moves under a change. */
export type ChangeDeltaKind = "added" | "modified" | "removed"

/** Order the delta kinds are grouped in — added, then modified, then removed. */
export const CHANGE_DELTA_KIND_ORDER: readonly ChangeDeltaKind[] = [
  "added",
  "modified",
  "removed",
]

/**
 * One change as the client sees it — metadata only, no proposal document.
 *
 * `ProjectChange.proposalPath` (the private Blob URL) and `baseSpecId` are
 * deliberately absent: one is a blob URL, which is never handed to a client, and
 * the other a server-side matching detail. What the client actually renders is
 * the base spec's **version**, the same "return only what the client renders"
 * discipline that keeps `filePath` out of `ProjectSpecSummary` and `specId` out
 * of `BuildUnitSummary`.
 */
export interface ChangeSummary {
  id: string
  /** Position in the project's change order. Never renumbered; gaps are expected. */
  sequence: number
  /** The member's own words, as they typed them. */
  request: string
  status: ChangeStatusValue
  /** Version of the spec the proposal was reasoned against. */
  baseSpecVersion: number
  /** ISO-8601 — `Date` does not survive JSON. */
  createdAt: string
}

/** One line of the architecture delta: what moved, and how. */
export interface ChangeDeltaEntry {
  kind: ChangeDeltaKind
  /** The part of the system that moves — a service, a store, a boundary. */
  component: string
  detail: string
}

/**
 * An existing build unit the change affects.
 *
 * Carries the unit's **current title**, resolved server-side at read time from
 * the stored `buildUnitId` rather than baked into the proposal document when it
 * was written. A unit renamed after the proposal was made therefore reads under
 * its new name, and a unit deleted since simply does not appear — its impact row
 * cascaded away with it.
 */
export interface ChangeAffectedUnit {
  title: string
  /** The model's stated reason, kept so a reviewer can judge the claim. */
  reason: string
}

/** A piece of work the change implies but which does not exist yet. */
export interface ChangeProposedUnit {
  title: string
  summary: string | null
}

/**
 * The proposal document a client renders.
 *
 * The architecture is expressed **as a delta** — what is added, modified, and
 * removed — rather than as a restated system. A proposal is a change against a
 * known base (`ChangeSummary.baseSpecVersion`), so restating the whole would
 * both bury the actual change and go stale the moment the base moved.
 */
export interface ChangeProposal {
  summary: string
  architectureDelta: ChangeDeltaEntry[]
  affectedUnits: ChangeAffectedUnit[]
  proposedUnits: ChangeProposedUnit[]
  openQuestions: string[]
}

/** Response body of `GET /api/projects/{projectId}/changes`. */
export interface ChangeListResponse {
  changes: ChangeSummary[]
}

/**
 * Response body of `GET /api/projects/{projectId}/changes/{changeId}`.
 *
 * `proposal` is `null` when the row exists but its document could not be read —
 * a change stored before its upload landed, or an artifact since removed. The
 * change itself still renders; only the document is missing.
 */
export interface ChangeResponse {
  change: ChangeSummary
  proposal: ChangeProposal | null
}

/**
 * Response body of `POST /api/projects/{projectId}/changes/{changeId}/apply`.
 *
 * It reports what actually landed rather than echoing the proposal back: the
 * units created, the ids of the units now marked superseded, and the titles of
 * any proposed units skipped because a unit with that key already existed. A
 * skip is a no-op rather than an error, so it has to be *reported* or it is
 * invisible.
 */
export interface ChangeApplyResponse {
  created: BuildUnitSummary[]
  supersededUnitIds: string[]
  skippedTitles: string[]
}

/**
 * Body of the 409 that refuses a **stale** change — one whose base spec is no
 * longer the project's current version.
 *
 * It is its own shape, not a bare `{ error }`, because the client has to be
 * able to tell this refusal apart from every other one: it is the single case a
 * person can resolve by confirming, and confirming means echoing
 * `currentSpecVersion` back. Every other refusal is terminal.
 */
export interface ChangeStaleRefusal {
  error: string
  stale: {
    /** The version the proposal was reasoned against. */
    baseSpecVersion: number
    /** The version the project is on now. */
    currentSpecVersion: number
  }
}

/** How one vocabulary value is worded and colored wherever it is shown. */
export interface ChangeDisplayEntry {
  value: ChangeStatusValue
  label: string
  /**
   * A registered text-color token from `app/globals.css`.
   *
   * These are rendered in the house badge (`bg-base`), whose 10px text is under
   * every large-text allowance, so each tone owes WCAG AA 4.5:1 on that fill.
   * All three clear it — `text-copy-muted` 5.16:1, `text-brand` 9.74:1,
   * `text-success` 10.41:1. **No badge may take `text-copy-faint`**, which
   * clears 4.5:1 on no surface in this palette (`context/ui-context.md`).
   */
  toneClass: string
}

/**
 * Keyed by value so a vocabulary that gains a member fails the build here
 * rather than rendering an unlabeled, untoned badge.
 *
 * `proposed` takes `text-brand` because it is the one status that is asking for
 * something — a decision that has not been made yet — which is the same role
 * `in progress` plays in the build-unit vocabulary. `discarded` shares the
 * quiet `text-copy-muted` with every other settled-and-inert state.
 */
const STATUS_TONES: Record<ChangeStatusValue, Omit<ChangeDisplayEntry, "value">> =
  {
    proposed: { label: "Proposed", toneClass: "text-brand" },
    applied: { label: "Applied", toneClass: "text-success" },
    discarded: { label: "Discarded", toneClass: "text-copy-muted" },
  }

/**
 * The three statuses in display order — one source of order, wording, and color
 * for every surface that renders a change's status.
 */
export const CHANGE_STATUS_DISPLAY: readonly ChangeDisplayEntry[] =
  CHANGE_STATUS_ORDER.map((value) => ({ value, ...STATUS_TONES[value] }))

/** Wording for a delta kind. Tone is deliberately uniform — see below. */
const DELTA_KIND_LABELS: Record<ChangeDeltaKind, string> = {
  added: "Added",
  modified: "Modified",
  removed: "Removed",
}

/**
 * A delta kind's label.
 *
 * Kind is **not** color-coded. The obvious encoding is a green/red diff palette,
 * and this palette has no such pair — `text-success` exists but no matching
 * "destructive but not an error" red does, and `text-error` means *something
 * went wrong*, which a deliberate removal did not. Introducing a diff palette is
 * a design decision with no mandate here, so the kinds are separated by their
 * words and their grouping instead.
 */
export function changeDeltaKindLabel(kind: ChangeDeltaKind): string {
  return DELTA_KIND_LABELS[kind]
}
