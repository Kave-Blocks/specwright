import { ChangeStatus } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/**
 * Who may be pushed to the canvas, and recording that a push happened.
 *
 * The rule lives here rather than in the route or the task because **both** ask
 * it, for different reasons and at different moments: `POST /api/ai/canvas`
 * asks so it can refuse before a run is started and a model call is spent (the
 * discipline `40` set), and `trigger/canvas-sync.ts` asks again because the
 * change may have moved between the trigger and the run. Two copies of one
 * refusal rule is how the two come to disagree.
 *
 * `projectId` must already be access-checked by the caller — this module does
 * not authorize. Every read is scoped to `{ id, projectId }`, which is what
 * stops a change id from another project being reachable through a project the
 * caller does belong to.
 */

/** The change, as a push needs it. */
export interface PushableChange {
  id: string;
  /** Private blob URL of the stored proposal; the delta is read out of it. */
  proposalPath: string | null;
}

/**
 * Why a push was refused.
 *
 * - `not-found` — no change with that id in that project.
 * - `not-applied` — still proposed, or discarded. A change that has not been
 *   accepted has no standing to alter the diagram everyone is looking at.
 * - `already-pushed` — its delta has already been drawn. There is no re-push:
 *   drawing the same delta twice duplicates nodes.
 */
export type LoadPushableResult =
  | { ok: true; change: PushableChange }
  | { ok: false; reason: "not-found" | "not-applied" | "already-pushed" };

/** Read one change and decide whether its delta may be drawn. */
export async function loadPushableChange(
  projectId: string,
  changeId: string,
): Promise<LoadPushableResult> {
  const change = await prisma.projectChange.findFirst({
    where: { id: changeId, projectId },
    select: { id: true, status: true, canvasPushedAt: true, proposalPath: true },
  });

  if (!change) {
    return { ok: false, reason: "not-found" };
  }
  if (change.status !== ChangeStatus.APPLIED) {
    return { ok: false, reason: "not-applied" };
  }
  if (change.canvasPushedAt !== null) {
    return { ok: false, reason: "already-pushed" };
  }

  return {
    ok: true,
    change: { id: change.id, proposalPath: change.proposalPath },
  };
}

/**
 * Record that this change's delta reached the canvas.
 *
 * Called **only after the room mutation has succeeded**, never before. A CRDT
 * write is not transactional with Postgres, so claiming the push up front would
 * mark a change drawn that a crash left half-drawn or not drawn at all — and
 * `null` is the retry state, so that change could never be pushed again. The
 * cost of the ordering is stated plainly: two members pushing the same change
 * at the same instant can both get past {@link loadPushableChange} and both
 * draw, because nothing between them is atomic. The pre-check in the route and
 * the re-check in the task narrow that window to the length of one model call;
 * closing it entirely would mean claiming the push first, which trades a rare
 * duplicate for a routine unrecoverable one.
 *
 * The `canvasPushedAt: null` scope is on the write itself rather than on a read
 * before it, so the timestamp records the *first* push rather than the last.
 */
export async function markChangePushed(
  projectId: string,
  changeId: string,
): Promise<void> {
  await prisma.projectChange.updateMany({
    where: { id: changeId, projectId, canvasPushedAt: null },
    data: { canvasPushedAt: new Date() },
  });
}
