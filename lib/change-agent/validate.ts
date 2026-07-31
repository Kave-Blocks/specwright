import {
  MAX_AFFECTED_UNITS,
  MAX_DELTA_ENTRIES,
  MAX_OPEN_QUESTIONS,
  MAX_PROPOSAL_TEXT_LENGTH,
  MAX_PROPOSED_UNITS,
} from "@/lib/change-agent/payload";
import type {
  ChangeProposalDraft,
  StoredAffectedUnit,
  StoredChangeProposal,
} from "@/lib/change-agent/payload";
import { normalizeUnitSummary, normalizeUnitTitle } from "@/lib/build-units";
import type { ChangeContextUnit } from "@/lib/change-agent/propose";

/**
 * The boundary between what a model said and what this system stores.
 *
 * `context/code-standards.md` requires unknown external input to be validated
 * before it is trusted, and a model's output is exactly that: it crosses a
 * network boundary from a system nobody here controls. Passing the schema in
 * `payload.ts` proved the *shape* only — that a `key` is a string, not that it
 * names a unit that exists.
 *
 * So nothing here is taken on trust:
 *
 * - Every `affectedUnits[].key` is resolved against the project's actual units.
 *   **A key that does not resolve is dropped and never stored.** A hallucinated
 *   unit reference must not reach a response, where a reviewer would read it as
 *   a real claim about real work.
 * - Every array is cut to its cap (see `payload.ts` for why the caps cannot
 *   live on the model-facing schema).
 * - Every string is trimmed and bounded, and proposed units go through the same
 *   `normalizeUnitTitle`/`normalizeUnitSummary` a person's typed unit does — so
 *   a proposal cannot carry a title that could not have been created by hand.
 */

/** Trim, bound, trim again — the `boundedText` shape used across the app. */
function boundedText(value: string, max = MAX_PROPOSAL_TEXT_LENGTH): string {
  return value.trim().slice(0, max).trim();
}

/** A validated proposal, plus what had to be thrown away to get it. */
export interface ValidatedChangeProposal {
  /** The document as it will be stored — ids only, everything bounded. */
  document: StoredChangeProposal;
  /**
   * How many `affectedUnits` entries were discarded: a key that matched no unit
   * in the project, or a second entry for a unit already named.
   *
   * Returned rather than silently swallowed so the run can log it. A model that
   * frequently invents keys is a **prompt problem**, and one that is completely
   * invisible unless it is counted — the proposal that reaches the member looks
   * perfectly well-formed either way, just quieter than it should be.
   */
  droppedAffectedUnits: number;
}

/**
 * Turn a model's draft into a storable document.
 *
 * `units` is the same list the model was shown (`loadChangeContext`), so a key
 * resolves here if and only if the model was actually given it. Pure — it reads
 * no database and writes nothing; storing is `storage.ts`'s job.
 */
export function validateChangeProposal(
  draft: ChangeProposalDraft,
  units: ChangeContextUnit[],
): ValidatedChangeProposal {
  const unitIdByKey = new Map(units.map((unit) => [unit.key, unit.id]));

  const affectedUnits: StoredAffectedUnit[] = [];
  // A unit already named cannot be named twice: `@@unique([changeId, buildUnitId])`
  // would reject the second row, failing the whole insert over a duplicate the
  // model volunteered. Dropping it here keeps the rest of the proposal.
  const seenUnitIds = new Set<string>();
  let droppedAffectedUnits = 0;

  for (const entry of draft.affectedUnits) {
    if (affectedUnits.length >= MAX_AFFECTED_UNITS) {
      droppedAffectedUnits += 1;
      continue;
    }

    const buildUnitId = unitIdByKey.get(entry.key.trim());
    if (!buildUnitId || seenUnitIds.has(buildUnitId)) {
      droppedAffectedUnits += 1;
      continue;
    }

    seenUnitIds.add(buildUnitId);
    affectedUnits.push({ buildUnitId, reason: boundedText(entry.reason) });
  }

  const architectureDelta = draft.architectureDelta
    .slice(0, MAX_DELTA_ENTRIES)
    .map((entry) => ({
      kind: entry.kind,
      component: boundedText(entry.component),
      detail: boundedText(entry.detail),
    }))
    // An entry naming no component says nothing about the architecture.
    .filter((entry) => entry.component.length > 0);

  const proposedUnits = draft.proposedUnits
    .slice(0, MAX_PROPOSED_UNITS)
    .map((unit) => ({
      title: normalizeUnitTitle(unit.title),
      summary: normalizeUnitSummary(unit.summary),
    }))
    // `normalizeUnitTitle` returns `null` for a blank title, and a unit with no
    // title is not work anyone can act on — the same rejection a person's
    // titleless unit gets at the create route.
    .filter((unit): unit is { title: string; summary: string | null } =>
      Boolean(unit.title),
    );

  const openQuestions = draft.openQuestions
    .slice(0, MAX_OPEN_QUESTIONS)
    .map((question) => boundedText(question))
    .filter((question) => question.length > 0);

  return {
    document: {
      summary: boundedText(draft.summary),
      architectureDelta,
      affectedUnits,
      proposedUnits,
      openQuestions,
    },
    droppedAffectedUnits,
  };
}
