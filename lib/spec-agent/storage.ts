import { randomUUID } from "node:crypto";

import { get, put } from "@vercel/blob";

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

/**
 * Filename a downloaded spec is saved as — `spec-v3.md`, the version people
 * refer to the spec by rather than the id they never see. The version is
 * server-assigned and numeric, so it is as safe in a `Content-Disposition`
 * header as the id was.
 */
export function specDownloadFilename(version: number): string {
  return `spec-v${version}.md`;
}

/** The stored spec, as the caller needs to refer to it afterwards. */
export interface SavedProjectSpec {
  id: string;
  version: number;
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
 * unreferenced blob, which is inert. It also stays **outside** the transaction
 * below, so a failed upload burns no version.
 *
 * The version comes from `Project.nextSpecVersion`, taken and used in one
 * transaction for the same reason and in the same shape as
 * `createBuildUnit`'s sequence (`lib/build-units.ts`): the `UPDATE … RETURNING`
 * holds a row lock on the `Project` row until commit, and that lock is what
 * serializes two concurrent generations into two different versions rather than
 * one collision. The number this spec takes is the returned value minus one.
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

  return prisma.$transaction(async (tx) => {
    const { nextSpecVersion } = await tx.project.update({
      where: { id: projectId },
      data: { nextSpecVersion: { increment: 1 } },
      select: { nextSpecVersion: true },
    });

    return tx.projectSpec.create({
      data: {
        id: specId,
        projectId,
        version: nextSpecVersion - 1,
        filePath: blob.url,
      },
      select: { id: true, version: true, filePath: true },
    });
  });
}

/**
 * Read a stored spec's Markdown back out of Blob.
 *
 * A private blob URL is not publicly fetchable — the SDK attaches the auth
 * token — and `useCache: false` matches every other read in the app: always the
 * stored bytes. A failure **throws** rather than degrading to an empty string:
 * both callers reason *against* the spec, and reasoning against nothing is not
 * a weaker answer, it is a wrong one. A change is a delta against a base; a
 * derived build list is the spec's own contents restated as work.
 *
 * It lives here, beside `saveProjectSpec`, because two modules read it — the
 * change path (`lib/change-agent/propose.ts`, where it started, private) and
 * the unit derivation path (`lib/unit-agent/derive.ts`, unit `44`). Two readers
 * of one artifact is how two different policies for an unreadable spec come to
 * exist.
 */
export async function readSpecMarkdown(filePath: string): Promise<string> {
  const result = await get(filePath, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) {
    throw new Error("The project's spec could not be read");
  }
  return await new Response(result.stream).text();
}
