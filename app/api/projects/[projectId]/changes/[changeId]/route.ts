import { NextResponse } from "next/server";

import { withProjectMember } from "@/lib/api-auth";
import { readChangeProposal } from "@/lib/change-agent/storage";
import { changeStatusToWire, parseChangeStatus } from "@/lib/changes";
import { prisma } from "@/lib/prisma";
import type {
  ChangeAffectedUnit,
  ChangeProposal,
  ChangeResponse,
  ChangeSummary,
} from "@/types/changes";

/**
 * One change proposal: read it, or discard it.
 *
 * Both handlers use `withProjectMember`, not `withProjectOwner` — the reasoning
 * is written out in the sibling collection route: a change is project content,
 * not project lifecycle.
 *
 * Both also scope the row to **`{ id: changeId, projectId }`**, using the
 * guard-resolved `project.id` rather than the raw path param. That pairing is
 * what stops a change id belonging to another project from being reachable
 * through a project the caller does belong to: the row simply does not match,
 * and the caller gets the same 404 an unknown id gets — the row-scoping pattern
 * of `build-units/[unitId]/route.ts` and `collaborators/[collaboratorId]`.
 *
 * Neither handler returns `proposalPath` or `baseSpecId`. One is a private blob
 * URL, which is never handed to a client, and the other a server-side matching
 * detail; the client sees the base spec's `version` instead.
 */

const NOT_FOUND = "Not found";

/**
 * Read one change and its stored proposal.
 *
 * The proposal document lives in a **private** blob store, so its URL is never
 * handed to the client — this route is the only way to read it, and the blob is
 * dereferenced only after the access check and the row scoping have both
 * passed, exactly as the spec download route does it.
 *
 * `proposal` is `null` when the document cannot be read: a row written before
 * its upload landed, an artifact since removed, or a shape that no longer
 * parses (`readChangeProposal` collapses all three). The change itself still
 * renders — the missing document is not a reason to fail the request that asked
 * for the change.
 */
export const GET = withProjectMember<{
  projectId: string;
  changeId: string;
}>(async (_request, { params: { changeId }, project }) => {
  const change = await prisma.projectChange.findFirst({
    // Scoped by both ids: this is the check that the change belongs to the
    // project the caller was authorized for, not merely that it exists.
    where: { id: changeId, projectId: project.id },
    select: {
      id: true,
      sequence: true,
      request: true,
      status: true,
      createdAt: true,
      // Read to dereference the blob, and deliberately dropped before the
      // response is built.
      proposalPath: true,
      baseSpec: { select: { version: true } },
      // The impact rows are what resolve a stored `buildUnitId` to the unit's
      // **current** title. A unit deleted since cascaded its impact row away
      // with it, so it is simply absent here.
      impacts: {
        select: { buildUnitId: true, buildUnit: { select: { title: true } } },
      },
    },
  });

  if (!change) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  const stored = await readChangeProposal(change.proposalPath);

  const summary: ChangeSummary = {
    id: change.id,
    sequence: change.sequence,
    request: change.request,
    status: changeStatusToWire(change.status),
    baseSpecVersion: change.baseSpec.version,
    createdAt: change.createdAt.toISOString(),
  };

  /*
   * Titles are resolved **at read time**, never baked into the stored document.
   * The document holds `{ buildUnitId, reason }` because an id is the one
   * stable reference: `38` re-derives a unit's key on rename, and a title
   * copied into the proposal would go stale the moment someone edited it. So a
   * unit renamed since the proposal was made reads under its new name here, and
   * a unit deleted since does not appear at all — its impact row cascaded away,
   * `titles` has no entry for it, and the stored entry is dropped.
   *
   * The document's own order is preserved (the order the model reasoned in),
   * and the reason comes from the document rather than the impact row: the two
   * are written from the same source in one transaction, and the document is
   * already the thing being rendered.
   */
  const titles = new Map(
    change.impacts.map((impact) => [impact.buildUnitId, impact.buildUnit.title]),
  );

  const proposal: ChangeProposal | null = stored
    ? {
        summary: stored.summary,
        architectureDelta: stored.architectureDelta,
        affectedUnits: stored.affectedUnits.reduce<ChangeAffectedUnit[]>(
          (resolved, unit) => {
            const title = titles.get(unit.buildUnitId);
            if (title !== undefined) {
              resolved.push({ title, reason: unit.reason });
            }
            return resolved;
          },
          [],
        ),
        proposedUnits: stored.proposedUnits,
        openQuestions: stored.openQuestions,
      }
    : null;

  const payload: ChangeResponse = { change: summary, proposal };
  return NextResponse.json(payload);
});

/**
 * Discard a change.
 *
 * It sets `status` to `DISCARDED` and **does not remove the row**: a proposal
 * someone considered and rejected is a decision worth keeping, and the stored
 * document stays in place with it so the reasoning can still be read back. That
 * is also why this is a status write rather than a delete of the blob — nothing
 * is destroyed here.
 *
 * `updateMany` rather than `update` so the write itself carries the
 * `{ id, projectId }` scope: `update` takes a unique `where`, which would mean
 * proving the scope in a separate read and then writing on the id alone.
 * A count of zero is the same 404 an unknown id gets.
 *
 * Discarding an already-discarded change is a no-op that answers the same way —
 * idempotent, because the caller cannot act on the difference.
 *
 * An **applied** change, however, is refused. Unit `41` made `APPLIED` a state a
 * change really reaches, and it is not reversible from here: the units that
 * change created exist and the units it superseded are marked, so discarding it
 * would leave the record claiming a decision was rejected while its effects
 * stand. The `status: { not: APPLIED }` scope is on the write itself, so the
 * refusal is decided by the database rather than by a read that could go stale
 * between the check and the update.
 */
export const DELETE = withProjectMember<{
  projectId: string;
  changeId: string;
}>(async (_request, { params: { changeId }, project }) => {
  // The status comes through `lib/changes.ts` rather than from the Prisma enum
  // directly, so a route still never names an enum member. `parseChangeStatus`
  // is honest about unknown input instead of defaulting, and a route may not
  // fabricate a member to work around that — hence the branch, which is
  // unreachable while "discarded" is part of the wire vocabulary.
  const discarded = parseChangeStatus("discarded");
  if (!discarded) {
    return NextResponse.json({ error: "Unknown status" }, { status: 500 });
  }

  const applied = parseChangeStatus("applied");
  if (!applied) {
    return NextResponse.json({ error: "Unknown status" }, { status: 500 });
  }

  const { count } = await prisma.projectChange.updateMany({
    where: { id: changeId, projectId: project.id, status: { not: applied } },
    data: { status: discarded },
  });

  if (count === 0) {
    // Nothing matched, which is two different situations: the change does not
    // exist in this project (404), or it exists and is applied (409). Only a
    // second read can tell them apart, and it is only reached on a refusal.
    const existing = await prisma.projectChange.findFirst({
      where: { id: changeId, projectId: project.id },
      select: { id: true },
    });
    return existing
      ? NextResponse.json(
          { error: "An applied change can’t be discarded." },
          { status: 409 },
        )
      : NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  // `{ ok: true }` — the shape the sibling write routes (`brief`, `build-units`)
  // answer a successful write with.
  return NextResponse.json({ ok: true });
});
