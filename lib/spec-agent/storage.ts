import { randomUUID } from "node:crypto";

import { put } from "@vercel/blob";

import { prisma } from "@/lib/prisma";

/**
 * Persistence for generated specs: Markdown in Vercel Blob, metadata in Prisma.
 *
 * This is the same split the canvas uses (`lib/canvas-storage.ts` +
 * `PUT /api/projects/[projectId]/canvas`) — the artifact goes to Blob and only
 * the resulting blob URL is written to the database. The store is **private**,
 * so that URL is not publicly fetchable: it is only ever dereferenced through
 * the SDK behind an access check (see the spec download route).
 */

/** Content type Markdown specs are stored and served with. */
export const SPEC_CONTENT_TYPE = "text/markdown";

/**
 * Object path for one generated spec in Vercel Blob — `specs/{projectId}/{specId}.md`
 * (`architecture-context.md` → Storage Model). Unlike the canvas, which
 * overwrites a single object per project, every spec is a distinct artifact
 * keyed by its own id, so past specs are never clobbered by a new generation.
 */
export function specBlobPath(projectId: string, specId: string): string {
  return `specs/${projectId}/${specId}.md`;
}

/** Filename a downloaded spec is saved as. The id is server-generated, so it is safe in the header. */
export function specDownloadFilename(specId: string): string {
  return `spec-${specId}.md`;
}

/** The stored spec, as the caller needs to refer to it afterwards. */
export interface SavedProjectSpec {
  id: string;
  filePath: string;
}

/**
 * Store a generated spec: upload the Markdown to Blob, then record the metadata
 * row that links it to the project.
 *
 * The id is minted up front rather than left to Prisma's `@default(cuid())`
 * because the blob path embeds it — one id names both the object and the row.
 * The upload happens first so the row is only ever written once the artifact it
 * points at actually exists; a failed upload therefore leaves no dangling
 * `ProjectSpec` (the reverse order could). A failure between the two leaves an
 * unreferenced blob, which is inert.
 *
 * `projectId` must already be access-checked by the caller — this function does
 * not authorize.
 */
export async function saveProjectSpec({
  projectId,
  markdown,
}: {
  projectId: string;
  markdown: string;
}): Promise<SavedProjectSpec> {
  const specId = randomUUID();

  const blob = await put(specBlobPath(projectId, specId), markdown, {
    access: "private",
    contentType: SPEC_CONTENT_TYPE,
    // The path is already unique per spec, so no suffix is needed — and without
    // `allowOverwrite`, an id collision would fail loudly instead of silently
    // replacing an existing spec.
    addRandomSuffix: false,
  });

  return prisma.projectSpec.create({
    data: { id: specId, projectId, filePath: blob.url },
    select: { id: true, filePath: true },
  });
}
