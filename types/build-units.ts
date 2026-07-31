/**
 * Shared build-unit types that cross the API boundary.
 *
 * Kept out of `lib/build-units.ts` on purpose: that module reaches for the
 * Prisma client, so it is server-only, while these are the shapes the Build
 * view and its data hook consume from the browser. Nothing here imports from
 * `lib/` or from the generated client under `app/generated/prisma` — pulling
 * either into a `"use client"` module would drag the database client into the
 * browser bundle.
 *
 * That split is also why the vocabularies below are strings rather than the
 * Prisma enums they mirror: the wire carries the lowercase vocabulary of
 * `context/progress-tracker.md`'s `## Unit Index` (`"in progress"`, with the
 * space) so the API and the tracker read identically, and the translation
 * to and from the SCREAMING_SNAKE enum members lives only in
 * `lib/build-units.ts`.
 */

/** Order the status chips are offered in — the source of order for the UI. */
const BUILD_UNIT_STATUS_ORDER = [
  "specced",
  "in progress",
  "shipped",
  "deferred",
  "blocked",
] as const

/** A unit's build status, as it travels on the wire. */
export type BuildUnitStatusValue = (typeof BUILD_UNIT_STATUS_ORDER)[number]

/**
 * Order the verification chips are offered in, least → most rigorous, so a
 * chip row reads left-to-right as increasing verification.
 */
const BUILD_UNIT_VERIFIED_ORDER = [
  "none",
  "structural",
  "partial",
  "browser",
] as const

/** How far a unit has been verified, as it travels on the wire. */
export type BuildUnitVerifiedValue = (typeof BUILD_UNIT_VERIFIED_ORDER)[number]

/**
 * Who created a unit: a person, a spec it was derived from, or an applied
 * change proposal.
 */
export type BuildUnitSourceValue = "manual" | "spec" | "change"

/**
 * One build unit as the client sees it.
 *
 * `ProjectBuildUnit.key` (the slug derived from the title) is deliberately
 * absent: it is the natural key a future automatic producer matches a spec's
 * units against, a server-side matching detail with nothing to render. The
 * same "return only what the client renders" discipline keeps
 * `ProjectSpec.filePath` out of `ProjectSpecSummary`, and is why the lineage
 * below travels as the source spec's *version* rather than its `specId`.
 */
export interface BuildUnitSummary {
  id: string
  /** Position in build order. Never renumbered, and gaps are expected. */
  sequence: number
  title: string
  summary: string | null
  status: BuildUnitStatusValue
  verified: BuildUnitVerifiedValue
  source: BuildUnitSourceValue
  /**
   * Version of the spec this unit came from, or `null` when it came from no
   * spec — either because a person typed it, or because the spec it pointed at
   * was removed and the link was nulled out. `source` is what distinguishes
   * those two cases.
   */
  specVersion: number | null
  /**
   * The **sequence** of the change that made this unit stale, or `null` when
   * nothing has. The change's `sequence` rather than its id, following the same
   * "return only what the client renders" discipline that sends `specVersion`
   * above instead of `specId` — a change is named by its number everywhere a
   * person sees one.
   *
   * It is a **third axis, not a status**: a unit that reads `shipped` /
   * `browser` and carries this too reads all three at once, and each is true.
   * Nothing about the unit's other columns changes when it is set.
   */
  supersededByChange: number | null
  /** ISO-8601 — `Date` does not survive JSON. */
  createdAt: string
  /** ISO-8601 — `Date` does not survive JSON. */
  updatedAt: string
}

/** Response body of `GET /api/projects/{projectId}/build-units`. */
export interface BuildUnitListResponse {
  units: BuildUnitSummary[]
}

/** Response body of the single-unit create and update routes. */
export interface BuildUnitResponse {
  unit: BuildUnitSummary
}

/** How one vocabulary value is worded and colored wherever it is shown. */
export interface BuildUnitDisplayEntry<V extends string> {
  value: V
  label: string
  /**
   * A registered text-color token from `app/globals.css`.
   *
   * A collapsed-row badge renders this at 10px, which is under every
   * large-text allowance, so each tone has to clear WCAG AA's 4.5:1 against
   * the badge fill (`bg-base` — see the `BADGE` note in
   * `components/editor/build/build-unit-row.tsx`). `text-copy-faint` cannot:
   * 2.53:1 on `bg-base` is its best case anywhere in this palette, so it is
   * unusable at this size on any surface, not just the one it was on.
   */
  toneClass: string
}

/** The wording and tone of a value, before its `value` is folded back in. */
type DisplayTone = Omit<BuildUnitDisplayEntry<string>, "value">

/**
 * Keyed by value so a vocabulary that gains a member fails the build here
 * rather than rendering an unlabeled, untoned chip.
 *
 * `specced` and `deferred` share `text-copy-muted` rather than being separated
 * by brightness. It is the quietest tone that clears AA on the badge fill
 * (5.16:1), which keeps both neutral, no-work-has-happened statuses below
 * every semantically colored one — `blocked` at 6.13:1 is the next rung up.
 * Nothing registered sits between it and `text-copy-secondary`, and using
 * `text-copy-secondary` (11.11:1) for `specced` would make the *default*
 * status the loudest badge on the row, out-shouting `in progress` and
 * `shipped`. Trading one grey step for that inversion is the wrong way round;
 * the labels still read differently, so only the redundant tonal encoding is
 * lost.
 */
const STATUS_TONES: Record<BuildUnitStatusValue, DisplayTone> = {
  specced: { label: "Specced", toneClass: "text-copy-muted" },
  "in progress": { label: "In progress", toneClass: "text-brand" },
  shipped: { label: "Shipped", toneClass: "text-success" },
  deferred: { label: "Deferred", toneClass: "text-copy-muted" },
  blocked: { label: "Blocked", toneClass: "text-error" },
}

/** `none` and `structural` are toned together for the reason above. */
const VERIFIED_TONES: Record<BuildUnitVerifiedValue, DisplayTone> = {
  none: { label: "None", toneClass: "text-copy-muted" },
  structural: { label: "Structural", toneClass: "text-copy-muted" },
  partial: { label: "Partial", toneClass: "text-warning" },
  browser: { label: "Browser", toneClass: "text-success" },
}

/**
 * The five statuses in chip order — one source of order, wording, and color
 * for every surface that renders a status.
 */
export const BUILD_UNIT_STATUS_DISPLAY: readonly BuildUnitDisplayEntry<BuildUnitStatusValue>[] =
  BUILD_UNIT_STATUS_ORDER.map((value) => ({ value, ...STATUS_TONES[value] }))

/** The four verification levels in chip order, least → most rigorous. */
export const BUILD_UNIT_VERIFIED_DISPLAY: readonly BuildUnitDisplayEntry<BuildUnitVerifiedValue>[] =
  BUILD_UNIT_VERIFIED_ORDER.map((value) => ({ value, ...VERIFIED_TONES[value] }))
