import type {
  DesignOperation,
  DesignOperationName,
  DesignPlan,
} from "@/lib/design-agent/plan";
import type {
  ChangeCanvasNodeUpdate,
  ChangeDeltaEntry,
} from "@/types/changes";

/**
 * Turning an applied change's architecture delta into a canvas mutation —
 * the prompt on the way in, and the operation filter on the way out.
 *
 * **There is no model call in this module and no second design model.** The
 * prompt composed here is handed to `generateDesignPlan` in
 * `lib/design-agent/plan.ts` exactly as a freeform design request is, so
 * `DESIGN_MODEL` stays the one place the model is named. "Through the existing
 * design path" is the whole shape of this unit: what is new is *what the model
 * is asked for* and *what it is allowed to do with the answer*, not a second
 * generator.
 */

/* -------------------------------------------------------------------------- */
/* Prompt                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The delta kinds that reach the prompt at all.
 *
 * `removed` is excluded **here**, not filtered downstream, because a removal
 * that never reaches the model is a removal the model cannot be tempted to draw
 * as a deletion. See {@link skippedRemovals} for why removals are reported
 * rather than drawn.
 */
const PROMPTED_KINDS: readonly ChangeDeltaEntry["kind"][] = [
  "added",
  "modified",
];

/** What a canvas write-back is composed from — the change, as it was proposed. */
export interface CanvasSyncPromptInput {
  /** The proposal's own summary, so the model knows what the change is for. */
  summary: string;
  /** The proposal's architecture delta. `removed` entries are ignored. */
  architectureDelta: ChangeDeltaEntry[];
}

/**
 * Compose the request string {@link generateDesignPlan} takes as its `prompt`.
 *
 * `generateDesignPlan` already sends the current canvas as `current`, and its
 * system prompt already tells the model to reuse existing node ids when the
 * canvas has content. That is **not** enough on its own: the same function
 * serves freeform design, where replacing the graph outright is legitimate, so
 * the additive intent has to be stated by the request itself.
 *
 * The prompt is a wish, though, not a guarantee — `40` records that this model
 * invents identifiers it was never given. {@link filterAdditivePlan} is what
 * actually holds; this only stops the model from wasting its answer on
 * operations that would be thrown away.
 */
export function buildCanvasSyncPrompt(input: CanvasSyncPromptInput): string {
  const entries = input.architectureDelta.filter((entry) =>
    PROMPTED_KINDS.includes(entry.kind),
  );

  const added = entries.filter((entry) => entry.kind === "added");
  const modified = entries.filter((entry) => entry.kind === "modified");

  const lines: string[] = [
    "An architecture change has been approved for this system and now has to be recorded on the existing diagram.",
    "",
    `Change: ${input.summary}`,
    "",
    "You are EXTENDING the diagram that already exists, not drawing a new one.",
    "- Every node currently on the canvas stays exactly where it is, with the size and position it has.",
    "- Attach new edges to the node ids already on the canvas (they are listed in the current canvas state below) or to nodes you add in this same plan.",
    "- Place new nodes in empty space near the parts of the system they relate to, following the layout rules.",
    "- Emit only addNode, updateNode, and addEdge. Do not emit deleteNode, deleteEdge, moveNode, or resizeNode — people laid this canvas out by hand.",
  ];

  if (added.length > 0) {
    lines.push(
      "",
      "ADD a node for each of these, connected to what it relates to:",
      ...added.map((entry) => `- ${entry.component}: ${entry.detail}`),
    );
  }

  if (modified.length > 0) {
    lines.push(
      "",
      "These existing parts change. Update the matching node if one exists (its label, shape, or colour), or add it if the diagram never had it:",
      ...modified.map((entry) => `- ${entry.component}: ${entry.detail}`),
    );
  }

  if (added.length === 0 && modified.length === 0) {
    // A delta of nothing but removals still reaches here, because removals are
    // reported rather than drawn. Say so plainly instead of sending a prompt
    // with an empty instruction list, which the model would fill in itself.
    lines.push(
      "",
      "This change adds and modifies nothing on the diagram. Return an empty operations list.",
    );
  }

  return lines.join("\n");
}

/**
 * The components in a delta's `removed` group — reported to the person, never
 * drawn.
 *
 * **This is a deliberate limit, not an oversight.** There is no honest way to
 * render "retired" in this palette: `red` means *something went wrong*
 * (`context/ui-context.md`) and a planned removal did not go wrong, while
 * `neutral` is the default fill and so says nothing. Inventing a third tone for
 * one surface is a design decision with no mandate — the same call `40` made in
 * refusing to colour-code delta kinds and `41` made in refusing a warning colour
 * for its stale notice.
 *
 * Deleting the node instead is the one thing this project's core value forbids.
 * `41` exists because a record of what was built must survive being replaced,
 * and a canvas node is that record in visual form.
 *
 * So a removal travels to the UI as a name, and a person removes it on the
 * canvas with the context to know what else it was holding up. Reporting it is
 * not optional: a canvas that silently kept a retired component overstates the
 * system, and nobody would know to look.
 */
export function skippedRemovals(
  architectureDelta: ChangeDeltaEntry[],
): string[] {
  return architectureDelta
    .filter((entry) => entry.kind === "removed")
    .map((entry) => entry.component);
}

/* -------------------------------------------------------------------------- */
/* Operation filter                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The only operations a canvas write-back may apply. Everything else is dropped.
 *
 * Declared as the allow-list rather than as a deny-list of the four destructive
 * verbs, so an operation added to `DesignOperationName` later is dropped by
 * default instead of silently inheriting permission to run here.
 */
const ALLOWED_OPERATIONS: readonly DesignOperationName[] = [
  "addNode",
  "updateNode",
  "addEdge",
];

/**
 * The part of a canvas node this filter reads: which node it is, and what it is
 * currently called.
 *
 * Structural rather than an import of `CanvasNode`, so this module keeps the
 * property the rest of it has — nothing here depends on React Flow, Liveblocks,
 * or anything with a runtime — and a check can hand-author one. `CanvasNode`
 * satisfies it as it stands.
 */
export interface CanvasSyncNode {
  id: string;
  data: { label: string };
}

/**
 * What the change named and what the canvas holds — everything the filter needs
 * to tell a legitimate `updateNode` from a mis-aimed one.
 *
 * Required, not optional. A caller that forgets it would silently get the old
 * unconstrained behaviour back, and this is the argument the whole module makes
 * about prompts: a rule that can be skipped is not a rule.
 */
export interface CanvasSyncScope {
  /** The canvas as it was read before the plan was generated. */
  nodes: CanvasSyncNode[];
  /**
   * The change's architecture delta. Only its `modified` entries license an
   * update: `added` says the canvas does not have that part yet, so a node
   * already carrying that label is somebody else's, and relabelling it is the
   * exact overwrite this rule exists to stop.
   */
  architectureDelta: ChangeDeltaEntry[];
}

/**
 * Fold a label to the form the two sides are compared in: trimmed, lowercased,
 * and with internal whitespace runs collapsed.
 *
 * **Why this much and no more.** A delta is written by a person (or a model
 * reading one) and a node label is typed by a person, so `Realtime canvas` and
 * `Realtime Canvas` are the same component and a rule strict enough to fail
 * that ordinary case would be worse than the bug it fixes. Case and stray
 * whitespace are the differences that carry no meaning.
 *
 * **Why not looser.** Substring or token-overlap matching is the obvious next
 * step and it reintroduces exactly the failure this exists to prevent:
 * architecture labels share generic words — `Service`, `DB`, `Queue`,
 * `Gateway` — so `Users Service` would license an update against
 * `Orders Service`. The two failure modes are not symmetrical. Too strict and
 * the change is drawn as a **new node**: additive, visible, and something a
 * person can merge by hand. Too loose and a node keeps its id, position, and
 * edges while quietly becoming a different thing, which is the one loss nothing
 * downstream can detect — the next spec generated from that canvas will
 * describe the new label as though it had always been there.
 */
function normaliseLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The normalised labels a `modified` entry in this delta names. */
function modifiedLabels(architectureDelta: ChangeDeltaEntry[]): Set<string> {
  const labels = new Set<string>();
  for (const entry of architectureDelta) {
    if (entry?.kind !== "modified") continue;
    if (typeof entry.component !== "string") continue;
    const label = normaliseLabel(entry.component);
    if (label.length > 0) labels.add(label);
  }
  return labels;
}

/** Current label by node id, for the nodes that have one. */
function labelsById(nodes: CanvasSyncNode[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const node of nodes) {
    if (typeof node?.id !== "string") continue;
    const label = node.data?.label;
    if (typeof label === "string") labels.set(node.id, label);
  }
  return labels;
}

/** A plan with its destructive operations removed, and what was removed. */
export interface FilteredPlan {
  /** The plan as it will be applied — additive operations only. */
  plan: DesignPlan;
  /**
   * How many **destructive** operations were dropped before anything was
   * applied. Normally `0`; a non-zero value means the model asked to delete,
   * move, or resize somebody's work.
   *
   * A refused `updateNode` is deliberately **not** counted here — see
   * {@link FilteredPlan.refusedUpdates}.
   */
  dropped: number;
  /**
   * Nodes an `updateNode` was refused against, named by the label they still
   * carry. A node with no label to name (an id that is not on the canvas at
   * all) falls back to the label the operation wanted to give it, and then to
   * the id, so a refusal is never reported as an empty string.
   */
  refusedUpdates: string[];
  /** The permitted updates, each carrying the label its node had before. */
  updatedNodes: ChangeCanvasNodeUpdate[];
}

/**
 * Strip every destructive operation from a plan **before it reaches
 * `applyDesignPlan`**.
 *
 * This is a filter in code, not an instruction in a prompt, and that is the
 * whole point of it. A prompt is a wish; unit `40` already records that this
 * model invents identifiers it was never given, and a hallucinated `deleteNode`
 * would remove a node a person drew — along with `applyDesignPlan`'s cascade of
 * every edge touching it. The one thing this unit must never do is destroy
 * canvas work in order to record a change.
 *
 * `moveNode` and `resizeNode` go too. They are not destructive in the same
 * sense, but they rearrange a shared document that people laid out by hand, and
 * nothing in an architecture delta justifies moving somebody else's diagram.
 *
 * **`updateNode` survives only against a node the change actually names.** It
 * is on the allow-list because redrawing a modified component is the point of a
 * `modified` delta, but the operation overwrites a node's identity rather than
 * adding to the diagram, and on 2026-08-27 it did: a delta entry
 * `modified: Realtime canvas` was applied to a node labelled `Orders Service`,
 * which kept its id, its position and both its edges while ceasing to be the
 * thing it recorded. That is the same harm as a move and worse — a move is
 * visible at a glance and trivially undone, an identity overwrite is neither.
 * So the target's **current** label must match a `modified` entry in this
 * change's delta ({@link normaliseLabel} states how loosely), and an update
 * aimed anywhere else is refused. In the prompt, not in code, this would be a
 * wish; the file already makes that argument about `deleteNode`.
 *
 * A refusal is counted apart from {@link FilteredPlan.dropped} because the two
 * mean different things: `dropped` is the model asking to destroy or rearrange
 * work and should never be non-zero, while a refused update is a legitimate
 * operation aimed at the wrong target, which is ordinary. One number would hide
 * the ordinary case inside the alarm.
 *
 * This is **not** a second layer of the validation `applyDesignPlan` already
 * does. That function skips operations that are *invalid* — an edge to a
 * missing node, an update to an unknown id. These are operations that are
 * perfectly valid and would succeed, which is exactly why they have to be
 * removed before they get there.
 *
 * A plan whose `operations` is not an array is passed through untouched:
 * `applyDesignPlan` already fails on it with a clear message, and swallowing it
 * here would turn a malformed model response into a silent no-op.
 */
export function filterAdditivePlan(
  plan: DesignPlan,
  scope: CanvasSyncScope,
): FilteredPlan {
  if (!Array.isArray(plan?.operations)) {
    return { plan, dropped: 0, refusedUpdates: [], updatedNodes: [] };
  }

  const named = modifiedLabels(scope.architectureDelta);
  const labels = labelsById(scope.nodes);

  const operations: DesignOperation[] = [];
  const refusedUpdates: string[] = [];
  const updatedNodes: ChangeCanvasNodeUpdate[] = [];
  let dropped = 0;

  for (const operation of plan.operations) {
    if (!ALLOWED_OPERATIONS.includes(operation?.op)) {
      dropped += 1;
      continue;
    }

    if (operation.op === "updateNode") {
      // The label the node carries *now*, not the one the operation proposes —
      // what is being protected is the identity already on the canvas.
      const previousLabel = labels.get(operation.id);
      const proposed =
        typeof operation.label === "string" && operation.label.trim().length > 0
          ? operation.label
          : null;

      if (previousLabel === undefined || !named.has(normaliseLabel(previousLabel))) {
        refusedUpdates.push(previousLabel ?? proposed ?? operation.id);
        continue;
      }

      // `label` is absent when the operation only restyles the node, and then
      // nothing about its identity moves — report it as unchanged rather than
      // as a rename to nothing.
      updatedNodes.push({ previousLabel, label: proposed ?? previousLabel });
    }

    operations.push(operation);
  }

  return {
    plan: { ...plan, operations },
    dropped,
    refusedUpdates,
    updatedNodes,
  };
}
