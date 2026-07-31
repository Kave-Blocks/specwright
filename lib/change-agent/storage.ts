import { randomUUID } from "node:crypto";

import { get, put } from "@vercel/blob";

import { storedChangeProposalSchema } from "@/lib/change-agent/payload";
import type { StoredChangeProposal } from "@/lib/change-agent/payload";
import { prisma } from "@/lib/prisma";

/**
 * Persistence for change proposals: the document in Vercel Blob, the metadata
 * in Prisma.
 *
 * The same split `lib/spec-agent/storage.ts` uses, and for the same reason —
 * the artifact goes to Blob and only the resulting blob URL is written to the
 * database. The store is **private**, so that URL is not publicly fetchable and
 * is never handed to a client: it is only ever dereferenced through the SDK
 * behind an access check.
 */

/** Content type proposal documents are stored with. */
export const CHANGE_CONTENT_TYPE = "application/json";

/**
 * Object path for one stored proposal — `changes/{projectId}/{changeId}.json`,
 * mirroring `specs/{projectId}/{specId}.md`. Every change is a distinct
 * artifact keyed by its own id, so a new proposal never clobbers an earlier
 * one.
 */
export function changeBlobPath(projectId: string, changeId: string): string {
  return `changes/${projectId}/${changeId}.json`;
}

/** The stored change, as the caller needs to refer to it afterwards. */
export interface SavedProjectChange {
  id: string;
  sequence: number;
}

/**
 * Store a proposal: upload the document to Blob, then record the change row and
 * its impact rows.
 *
 * The id is minted up front rather than left to Prisma's `@default(cuid())`
 * because the blob path embeds it — one id names both the object and the row,
 * exactly as `saveProjectSpec` does. The upload happens **first**, and outside
 * the transaction, so a failed upload leaves no row pointing at a missing
 * artifact and burns no sequence number. A failure between the two leaves an
 * unreferenced blob, which is inert.
 *
 * The row and its impacts are written in **one** transaction, so a change is
 * never readable with a half-written impact list. The sequence comes from
 * incrementing `Project.nextChangeSequence` inside that same transaction: the
 * `UPDATE … RETURNING` holds a row lock on the `Project` row until commit, and
 * that lock is what serializes two members proposing at the same moment into
 * two different numbers rather than one collision. The number this change takes
 * is the returned value minus one. It is the identical shape used by
 * `createBuildUnit` and `saveProjectSpec` — one pattern, used three times.
 *
 * `proposal.affectedUnits` must already have been resolved to real unit ids by
 * `validate.ts`; an id that does not exist would fail the foreign key here.
 *
 * `projectId` must already be access-checked by the caller — this function does
 * not authorize.
 */
export async function saveProjectChange({
  projectId,
  authorId,
  request,
  baseSpecId,
  proposal,
}: {
  projectId: string;
  authorId: string;
  request: string;
  baseSpecId: string;
  proposal: StoredChangeProposal;
}): Promise<SavedProjectChange> {
  const changeId = randomUUID();

  const blob = await put(
    changeBlobPath(projectId, changeId),
    JSON.stringify(proposal),
    {
      access: "private",
      contentType: CHANGE_CONTENT_TYPE,
      // The path is already unique per change, so no suffix is needed — and
      // without `allowOverwrite`, an id collision fails loudly instead of
      // silently replacing an existing proposal.
      addRandomSuffix: false,
    },
  );

  return prisma.$transaction(async (tx) => {
    const { nextChangeSequence } = await tx.project.update({
      where: { id: projectId },
      data: { nextChangeSequence: { increment: 1 } },
      select: { nextChangeSequence: true },
    });

    return tx.projectChange.create({
      data: {
        id: changeId,
        projectId,
        sequence: nextChangeSequence - 1,
        request,
        baseSpecId,
        proposalPath: blob.url,
        authorId,
        // Nested so the impacts share the change's transaction — a change is
        // never readable with only some of the units it affects.
        impacts: {
          create: proposal.affectedUnits.map((unit) => ({
            buildUnitId: unit.buildUnitId,
            reason: unit.reason,
          })),
        },
      },
      select: { id: true, sequence: true },
    });
  });
}

/**
 * Read a stored proposal document back, or `null` when it cannot be read.
 *
 * `null` covers a row written before its upload landed, an artifact since
 * removed, and a document whose shape no longer parses — the caller cannot act
 * on the difference and the change itself is still perfectly readable without
 * it, which is why `ChangeResponse.proposal` is nullable.
 *
 * The bytes are re-validated with `storedChangeProposalSchema` rather than
 * cast: what comes back out of Blob is unknown external input just as much as
 * the model's output was, and it may predate a shape change.
 *
 * `proposalPath` must come from a row the caller has already access-checked.
 * This function dereferences whatever URL it is handed and does not authorize.
 */
export async function readChangeProposal(
  proposalPath: string | null,
): Promise<StoredChangeProposal | null> {
  if (!proposalPath) {
    return null;
  }

  // A private blob URL is not publicly fetchable — the SDK attaches the auth
  // token. `useCache: false` matches the canvas and spec reads: always the
  // stored bytes.
  const result = await get(proposalPath, {
    access: "private",
    useCache: false,
  });

  if (!result || result.statusCode !== 200) {
    return null;
  }

  // `.json()` throws on bytes that are not JSON at all, which is the same
  // "unreadable document" case as a shape that no longer parses — so it answers
  // the same way rather than failing the request that asked for the change.
  let body: unknown;
  try {
    body = await new Response(result.stream).json();
  } catch {
    return null;
  }

  const parsed = storedChangeProposalSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}
