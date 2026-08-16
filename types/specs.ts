/**
 * Shared spec types that cross the API boundary.
 *
 * Kept out of `lib/spec-agent/storage.ts` on purpose: that module reaches for
 * `node:crypto` and `@vercel/blob`, so it is server-only, while these are the
 * shapes the sidebar's Specs tab consumes.
 */

/**
 * One spec as the client sees it — metadata only.
 *
 * `ProjectSpec.filePath` (the private Blob URL) is deliberately absent: a blob
 * URL is never handed to a client, and the Markdown is only ever read back
 * through the access-checked download route. The `filename` is derived
 * server-side from the version, since the model stores no filename column.
 */
export interface ProjectSpecSummary {
  id: string
  /**
   * Per-project version, assigned once and never reused. This is what the UI
   * labels a spec by — "Version 3" — so no spec id is ever user-visible.
   */
  version: number
  /** Name the spec downloads as, e.g. `spec-v3.md`. */
  filename: string
  /** ISO-8601 — `Date` does not survive JSON. */
  createdAt: string
}

/**
 * Response body of `GET /api/projects/{projectId}/specs`.
 *
 * The two drift fields ride on the listing rather than on a route of their own:
 * the one surface that renders them — the Specs view — already calls this on
 * mount, so a second endpoint would double the requests to say one number.
 */
export interface ProjectSpecListResponse {
  specs: ProjectSpecSummary[]
  /**
   * Applied changes reasoned against the version that is still current — work
   * the spec does not describe. `0` when the spec is up to date, and `0` when
   * the project has no spec at all.
   *
   * Derived from columns that already exist, never stored: see
   * `countAppliedChangesSinceCurrentSpec` in `lib/changes.ts`.
   */
  appliedSinceCurrentSpec: number
  /**
   * The version the count is measured against, or `null` with no specs.
   *
   * A plain number, like `ProjectSpecSummary.version` — no spec id and no
   * change id travels here, the same discipline that keeps `filePath` off the
   * summary.
   */
  currentSpecVersion: number | null
}

/**
 * The one endpoint a client may read a spec through — for the file download and
 * for the preview alike. It serves the Markdown as an attachment, which only
 * affects a browser *navigation*: a `fetch()` of the same URL reads the body as
 * text, so the preview needs no second route (and still never touches Blob).
 */
export function specDownloadUrl(projectId: string, specId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/specs/${encodeURIComponent(specId)}/download`
}
