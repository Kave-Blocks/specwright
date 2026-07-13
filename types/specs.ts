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
 * server-side from the spec id, since the model stores no filename column.
 */
export interface ProjectSpecSummary {
  id: string
  /** Name the spec downloads as, e.g. `spec-{id}.md`. */
  filename: string
  /** ISO-8601 — `Date` does not survive JSON. */
  createdAt: string
}

/** Response body of `GET /api/projects/{projectId}/specs`. */
export interface ProjectSpecListResponse {
  specs: ProjectSpecSummary[]
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
