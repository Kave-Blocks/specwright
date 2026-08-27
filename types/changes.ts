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
  /**
   * Whether this change's architecture delta has been drawn on the canvas.
   *
   * A **boolean, not the `canvasPushedAt` timestamp it derives from**: what the
   * client renders is whether a control is available, not a date, and `39`'s
   * discipline is to send only what the client renders — the same reason
   * `filePath` stays off `ProjectSpecSummary` and `specId` off
   * `BuildUnitSummary`. Nothing on any surface says *when* a change was pushed.
   */
  canvasPushed: boolean
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
 * One node a canvas write-back changed in place, rather than added.
 *
 * It carries the label the node had **before** the push because that is the
 * only thing a person can check the operation against. "1 node updated" names
 * neither the node nor what it used to be called, so a correct relabel goes
 * unnoticed and an incorrect one is undiscoverable — which is exactly how the
 * 2026-08-27 live proof came within one sentence of not noticing that a node
 * called `Orders Service` had stopped existing.
 *
 * `label` is what it carries now. The two are **equal** when the operation
 * changed only the node's shape or colour, which is a real and unremarkable
 * outcome rather than a bug — the renderer says nothing about a rename in that
 * case.
 */
export interface ChangeCanvasNodeUpdate {
  /** What the node was called on the canvas before this change was drawn. */
  previousLabel: string
  /** What it is called now — the same string when only its styling changed. */
  label: string
}

/**
 * What a canvas write-back actually did, returned as the `canvas-sync` run's
 * output and rendered by the Changes view.
 *
 * It reports what **landed**, exactly as `ChangeApplyResponse` does and for the
 * same reason: the plan the model returned and the plan that was applied are not
 * the same list, so echoing the proposal back would overstate the canvas.
 *
 * The counts are additive only. There is no `nodesRemoved` or `edgesRemoved`
 * field to report, because {@link filterAdditivePlan} removes every destructive
 * operation before anything is applied — the absence of those two numbers is
 * itself the contract.
 */
export interface ChangeCanvasPushOutcome {
  nodesAdded: number
  nodesUpdated: number
  edgesAdded: number
  /**
   * The nodes behind `nodesUpdated`, each with the label it had before.
   *
   * A count on its own cannot be checked by the person reading it, and an
   * update is the one operation here that overwrites something rather than
   * adding to it. Naming what each node used to be called is what makes a wrong
   * target visible at all.
   */
  updatedNodes: ChangeCanvasNodeUpdate[]
  /**
   * Nodes an `updateNode` was **refused** against, by the label they still
   * carry on the canvas.
   *
   * Deliberately not folded into {@link ChangeCanvasPushOutcome.droppedOperations}:
   * that number means *the model asked to destroy or rearrange somebody's work*
   * and is normally zero, so hiding a routine mis-aimed update inside it would
   * both cost the counter its "this should not happen" meaning and bury the
   * refusal. Reported rather than swallowed, for the same reason
   * {@link ChangeCanvasPushOutcome.skippedRemovals} is: a `modified` entry that
   * vanishes silently leaves the canvas and the change disagreeing with nobody
   * told.
   */
  refusedUpdates: string[]
  /**
   * Components in the delta's `removed` group, which are **reported and never
   * drawn**.
   *
   * A person is told rather than left to notice: a canvas that silently kept a
   * retired component overstates the system. The reasoning for not drawing them
   * — no honest "retired" tone in this palette, and deleting the node is the
   * visual form of the rewrite `41` exists to prevent — is in
   * `lib/canvas-sync/plan.ts`.
   */
  skippedRemovals: string[]
  /**
   * Destructive operations the filter dropped before anything reached the
   * canvas. Normally `0`; a non-zero value means the model asked to delete,
   * move, or resize somebody's work and was stopped in code rather than by the
   * prompt.
   */
  droppedOperations: number
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
