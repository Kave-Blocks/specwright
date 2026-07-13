import { specDownloadUrl } from "@/types/specs"

/**
 * Trigger a browser download of one spec.
 *
 * The download route answers with `Content-Disposition: attachment`, so the
 * browser saves the file and stays on the page — we hand it the URL and let it
 * do the work rather than buffering the Markdown ourselves. It is a same-origin
 * request, so the caller's Clerk session cookie rides along and the route's
 * access check runs exactly as it does for any other request.
 *
 * Browser-only (it touches `document`); call it from a client component.
 */
export function downloadSpec(
  projectId: string,
  specId: string,
  filename: string
): void {
  const link = document.createElement("a")
  link.href = specDownloadUrl(projectId, specId)
  link.download = filename
  // Firefox only honors a click on a link that is in the document.
  document.body.append(link)
  link.click()
  link.remove()
}
