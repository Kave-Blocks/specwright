/**
 * Proves the canvas write-back (unit 43) at the **library and database layer**,
 * against the real Postgres and the real Blob store.
 *
 * There is **no model call and no Liveblocks room anywhere in this script**, and
 * that is deliberate rather than a shortcut. The three things this unit must
 * never get wrong — that a destructive operation cannot reach the canvas, that
 * an update cannot land on a node the change never named, and that a change
 * cannot be drawn twice — are all decided before any room is touched: two by a
 * filter over a plan, the third by a rule over two columns. Feeding a
 * hand-authored plan through the filter proves the guard holds *regardless of
 * what the model emits*, which hoping the model behaves never could. The
 * `update` phase then applies what survived to an **in-memory** flow (a `Map`,
 * not a room — see `memoryFlow`) so it can read the labels back.
 *
 * What a passing run proves — unit 43's "Check When Done" list, at the layer
 * this script can reach:
 * - `filter`: a plan containing `deleteNode`, `deleteEdge`, `moveNode`, and
 *   `resizeNode` has exactly those dropped and the additive three kept, with
 *   order preserved and the drop counted. An all-destructive plan applies
 *   nothing. A malformed plan is passed through untouched so `applyDesignPlan`
 *   still fails loudly on it rather than silently doing nothing.
 * - `update`: the 2026-08-27 failure, reproduced — an `updateNode` against a
 *   node the delta never names is dropped, reported by the label that node
 *   still carries, counted apart from the destructive drops, and the node reads
 *   `Orders Service` after the surviving plan is applied. An update against a
 *   node the delta *does* name is permitted despite differing in case or
 *   whitespace, lands, and reports the label the node had before — so the rule
 *   cannot pass by refusing everything.
 * - `prompt`: added and modified components reach the prompt, removed ones do
 *   not, the additive intent is stated, and `skippedRemovals` names the removed
 *   components and only those.
 * - `guard`: a `PROPOSED` change and a `DISCARDED` change are both refused; an
 *   `APPLIED` one is allowed; a second push of the same change is refused; a
 *   change id from another project is `not-found` through this project.
 * - `retry`: a change that was never marked stays pushable — the failed-push
 *   state is the same `null` a fresh change has, so a failure is retriable by
 *   construction rather than by a recovery path.
 * - `drift`: pushing a change lowers `unpushedSinceCurrentSpec` and leaves
 *   `appliedSinceCurrentSpec` alone. That asymmetry is the unit's contract with
 *   `42`: the spec really is still behind until it is rewritten, so only
 *   generating one clears the drift.
 *
 * What a passing run does **not** prove:
 * - Anything that touches a Liveblocks room: that `applyDesignPlan` adds the
 *   nodes, that participants see them arrive, that pre-existing nodes survive,
 *   or that the AI presence appears and clears.
 * - Anything at the HTTP layer: not the route's 409s, not the 404 masking, not
 *   the signed-out or non-member paths.
 * - Anything the model does. Whether a good prompt produces a good diagram is
 *   not a check a script can make.
 * - Anything in the browser: the push control's states and the drift notice's
 *   two wordings are unobserved here.
 *
 * Data safety. Every project this script touches is one it created, named with
 * the `verify-canvas-push-` prefix, and deleted in a `finally` — including on
 * failure. Nothing pre-existing is read or mutated. Blobs uploaded here are left
 * behind when their rows cascade away; they are inert.
 *
 * Usage (from the repo root):
 *   npm run verify:canvas -- filter
 *   npm run verify:canvas -- update
 *   npm run verify:canvas -- prompt
 *   npm run verify:canvas -- guard
 *   npm run verify:canvas -- retry
 *   npm run verify:canvas -- drift
 *   npm run verify:canvas -- all
 *
 * Environment (from `.env.local`):
 *   DATABASE_URL            required for `guard`, `retry`, `drift`
 *   BLOB_READ_WRITE_TOKEN   required for the same three — the proposal JSON is
 *                           really uploaded
 *
 * `filter`, `update`, and `prompt` are pure library checks and need neither.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

import type { MutableFlow } from "@liveblocks/react-flow/node";

import type { CanvasSyncNode, CanvasSyncScope } from "@/lib/canvas-sync/plan";
import type { DesignPlan } from "@/lib/design-agent/plan";
import type { CanvasEdge, CanvasNode } from "@/types/canvas";
import type { ChangeDeltaEntry } from "@/types/changes";

const PROJECT_PREFIX = "verify-canvas-push-";
const OWNER_ID = "verify-canvas-push-owner";
const AUTHOR_ID = "verify-canvas-push-author";
const SPEC_MARKDOWN =
  "# Fixture spec\n\nWritten by scripts/verify-canvas-write-back.ts.\n";

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

/** Deferred so `.env.local` is loaded before the Prisma client is constructed. */
async function deps() {
  const { prisma } = await import("@/lib/prisma");
  const { saveProjectChange } = await import("@/lib/change-agent/storage");
  const { applyChange } = await import("@/lib/changes/apply");
  const { countAppliedChangesSinceCurrentSpec } = await import("@/lib/changes");
  const { loadPushableChange, markChangePushed } = await import(
    "@/lib/canvas-sync/change"
  );
  const { saveProjectSpec } = await import("@/lib/spec-agent/storage");
  const { deriveBuildUnitKey } = await import("@/lib/build-units");
  return {
    prisma,
    saveProjectChange,
    applyChange,
    countAppliedChangesSinceCurrentSpec,
    loadPushableChange,
    markChangePushed,
    saveProjectSpec,
    deriveBuildUnitKey,
  };
}

type Deps = Awaited<ReturnType<typeof deps>>;

/** The plan module has no runtime dependencies, so it loads on its own. */
async function planDeps() {
  return import("@/lib/canvas-sync/plan");
}

/**
 * `applyDesignPlan`, which reaches no network either — its only Liveblocks
 * dependency is the `MutableFlow` *type*, so it will operate on the in-memory
 * flow {@link memoryFlow} builds.
 */
async function applyDeps() {
  return import("@/lib/design-agent/apply");
}

/**
 * A `MutableFlow` that is a `Map`, not a room.
 *
 * The filter's contract is that a refused operation never reaches
 * `applyDesignPlan`, and the thing that actually matters is one step further
 * on: that the node's label is still there afterwards. Asserting the operation
 * is absent from an array proves the first; running the filtered plan through
 * the real apply path and reading the label back proves the second, which is
 * what the live proof of 2026-08-27 found broken.
 *
 * Only the members `applyDesignPlan` calls are implemented — the cast is
 * honest about the rest being absent, and any use of one would fail loudly here
 * rather than quietly pass.
 */
function memoryFlow(seed: CanvasSyncNode[]) {
  const nodes = new Map<string, CanvasNode>(
    seed.map((node) => [
      node.id,
      {
        id: node.id,
        type: "canvasNode",
        position: { x: 0, y: 0 },
        data: {
          label: node.data.label,
          color: "#1F1F1F",
          textColor: "#EDEDED",
          shape: "rectangle",
        },
      } as CanvasNode,
    ]),
  );
  const edges = new Map<string, CanvasEdge>();

  const flow = {
    get nodes() {
      return [...nodes.values()];
    },
    get edges() {
      return [...edges.values()];
    },
    getNode: (id: string) => nodes.get(id),
    getEdge: (id: string) => edges.get(id),
    addNode: (node: CanvasNode) => {
      nodes.set(node.id, node);
    },
    updateNode: (
      id: string,
      partial: Partial<CanvasNode> | ((node: CanvasNode) => CanvasNode),
    ) => {
      const node = nodes.get(id);
      if (!node) return;
      nodes.set(
        id,
        typeof partial === "function" ? partial(node) : { ...node, ...partial },
      );
    },
    updateNodeData: (id: string, partial: Partial<CanvasNode["data"]>) => {
      const node = nodes.get(id);
      if (!node) return;
      nodes.set(id, { ...node, data: { ...node.data, ...partial } });
    },
    removeNode: (id: string) => {
      nodes.delete(id);
    },
    addEdge: (edge: CanvasEdge) => {
      edges.set(edge.id, edge);
    },
    removeEdge: (id: string) => {
      edges.delete(id);
    },
  };

  return {
    flow: flow as unknown as MutableFlow<CanvasNode, CanvasEdge>,
    labelOf: (id: string) => nodes.get(id)?.data.label ?? null,
    nodeCount: () => nodes.size,
  };
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/** A project with one build unit and no spec yet. */
async function seedProject(d: Deps, suffix: string) {
  const project = await d.prisma.project.create({
    data: { ownerId: OWNER_ID, name: `${PROJECT_PREFIX}${suffix}` },
    select: { id: true },
  });

  const { nextBuildUnitSequence } = await d.prisma.project.update({
    where: { id: project.id },
    data: { nextBuildUnitSequence: { increment: 1 } },
    select: { nextBuildUnitSequence: true },
  });
  const sequence = nextBuildUnitSequence - 1;

  const unit = await d.prisma.projectBuildUnit.create({
    data: {
      projectId: project.id,
      sequence,
      key: d.deriveBuildUnitKey("Fixture unit", sequence),
      title: "Fixture unit",
      summary: "Summary",
      status: "SHIPPED",
      verified: "BROWSER",
    },
    select: { id: true },
  });

  return { project, unit };
}

/** A fixed proposal document. No model involved. */
function fixtureProposal(buildUnitIds: string[], label: string) {
  return {
    summary: `Add ${label}.`,
    architectureDelta: [
      {
        kind: "added" as const,
        component: `${label} component`,
        detail: "Fixture delta.",
      },
    ],
    affectedUnits: buildUnitIds.map((buildUnitId) => ({
      buildUnitId,
      reason: "Touches the fixture path.",
    })),
    proposedUnits: [{ title: label, summary: `Summary for ${label}.` }],
    openQuestions: [],
  };
}

/** Save a change against `baseSpecId`, leaving it `PROPOSED`. */
async function saveFixtureChange(
  d: Deps,
  projectId: string,
  baseSpecId: string,
  buildUnitIds: string[],
  label: string,
) {
  return d.saveProjectChange({
    projectId,
    authorId: AUTHOR_ID,
    request: `Add ${label}`,
    baseSpecId,
    proposal: fixtureProposal(buildUnitIds, label),
  });
}

/** Save a change and apply it, asserting the apply landed. */
async function applyFixtureChange(
  d: Deps,
  projectId: string,
  baseSpecId: string,
  buildUnitIds: string[],
  label: string,
) {
  const saved = await saveFixtureChange(
    d,
    projectId,
    baseSpecId,
    buildUnitIds,
    label,
  );
  const result = await d.applyChange(projectId, saved.id);
  check(
    `fixture apply "${label}" succeeded`,
    result.ok,
    result.ok ? "" : result.reason,
  );
  return saved;
}

/* -------------------------------------------------------------------------- */
/* Phases                                                                      */
/* -------------------------------------------------------------------------- */

async function filterPhase() {
  console.log(
    "\nfilter — destructive operations are dropped in code before anything is applied",
  );
  const { filterAdditivePlan } = await planDeps();

  // Hand-authored, deliberately. The whole point of the filter is that it holds
  // whatever the model emits, so this must not depend on what the model emits.
  const plan: DesignPlan = {
    summary: "Mixed plan",
    operations: [
      { op: "addNode", id: "queue", label: "Queue", shape: "cylinder" },
      { op: "deleteNode", id: "api-gateway" },
      { op: "addEdge", id: "api->queue", source: "api", target: "queue" },
      { op: "moveNode", id: "api", x: 999, y: 999 },
      { op: "updateNode", id: "api", label: "API" },
      { op: "resizeNode", id: "api", width: 10, height: 10 },
      { op: "deleteEdge", id: "api->db" },
    ],
  };

  // The update above is a legitimate one — the delta names the node it targets —
  // so this phase still measures the destructive filter and nothing else. The
  // update-target rule has its own phase below.
  const scope: CanvasSyncScope = {
    nodes: [
      { id: "api", data: { label: "API server" } },
      { id: "api-gateway", data: { label: "API Gateway" } },
    ],
    architectureDelta: [
      { kind: "modified", component: "API server", detail: "Renamed." },
    ],
  };

  const { plan: filtered, dropped } = filterAdditivePlan(plan, scope);
  const kept = filtered.operations.map((operation) => operation.op);

  check(
    "the three additive operations survive",
    kept.length === 3 &&
      kept.includes("addNode") &&
      kept.includes("addEdge") &&
      kept.includes("updateNode"),
    kept.join(", "),
  );
  check(
    "deleteNode is dropped",
    !kept.includes("deleteNode"),
    kept.join(", "),
  );
  check(
    "deleteEdge is dropped",
    !kept.includes("deleteEdge"),
    kept.join(", "),
  );
  check("moveNode is dropped", !kept.includes("moveNode"), kept.join(", "));
  check("resizeNode is dropped", !kept.includes("resizeNode"), kept.join(", "));
  check("the four drops are counted", dropped === 4, String(dropped));
  check(
    "the surviving operations keep their order",
    kept.join(",") === "addNode,addEdge,updateNode",
    kept.join(","),
  );
  check(
    "the original plan is not mutated",
    plan.operations.length === 7,
    String(plan.operations.length),
  );

  // A plan made entirely of destructive operations must apply nothing at all,
  // rather than partially.
  const destructive: DesignPlan = {
    summary: "All destructive",
    operations: [
      { op: "deleteNode", id: "a" },
      { op: "deleteEdge", id: "a->b" },
      { op: "moveNode", id: "b", x: 0, y: 0 },
    ],
  };
  const allDropped = filterAdditivePlan(destructive, scope);
  check(
    "an all-destructive plan applies nothing",
    allDropped.plan.operations.length === 0 && allDropped.dropped === 3,
    `${allDropped.plan.operations.length} kept, ${allDropped.dropped} dropped`,
  );

  // Model output is not schema-validated at runtime, so a malformed plan can
  // reach the filter. It must pass through, so `applyDesignPlan` still fails on
  // it with its own clear message instead of the filter turning it into a
  // silent no-op.
  const malformed = { summary: "Broken" } as unknown as DesignPlan;
  const passthrough = filterAdditivePlan(malformed, scope);
  check(
    "a malformed plan passes through untouched rather than becoming a no-op",
    passthrough.plan === malformed && passthrough.dropped === 0,
    String(passthrough.dropped),
  );
  check(
    "and reports neither an update nor a refusal",
    passthrough.refusedUpdates.length === 0 &&
      passthrough.updatedNodes.length === 0,
    `${passthrough.refusedUpdates.length}, ${passthrough.updatedNodes.length}`,
  );
}

/**
 * The Microservices starter template, which was the canvas baseline during the
 * 2026-08-27 live proof. Nothing here is called "Realtime canvas" — that is the
 * whole point of using it.
 */
const MICROSERVICES: CanvasSyncNode[] = [
  { id: "ms-client", data: { label: "Client" } },
  { id: "ms-gateway", data: { label: "API Gateway" } },
  { id: "ms-auth", data: { label: "Auth Service" } },
  { id: "ms-users", data: { label: "Users Service" } },
  { id: "ms-orders", data: { label: "Orders Service" } },
  { id: "ms-users-db", data: { label: "Users DB" } },
  { id: "ms-orders-db", data: { label: "Orders DB" } },
];

async function updatePhase() {
  console.log(
    "\nupdate — an updateNode is permitted only against a node the delta names",
  );
  const { filterAdditivePlan } = await planDeps();
  const { applyDesignPlan } = await applyDeps();

  /* --- The failure this rule exists to stop, reproduced exactly. ---------- */

  // Observed on 2026-08-27: the delta named "Realtime canvas", no such node
  // existed, and the model aimed the update at `ms-orders` — relabelling
  // "Orders Service" out of existence while leaving its id, position and both
  // its edges intact, so nothing about the diagram looked wrong.
  const observed: DesignPlan = {
    summary: "Record the realtime canvas change",
    operations: [
      { op: "addNode", id: "sync-queue", label: "Sync Queue", shape: "cylinder" },
      { op: "updateNode", id: "ms-orders", label: "Realtime Canvas" },
      {
        op: "addEdge",
        id: "sync-queue->ms-orders",
        source: "sync-queue",
        target: "ms-orders",
      },
    ],
  };
  const observedScope: CanvasSyncScope = {
    nodes: MICROSERVICES,
    architectureDelta: [
      { kind: "added", component: "Sync Queue", detail: "Buffers updates." },
      {
        kind: "modified",
        component: "Realtime canvas",
        detail: "Writes through the queue.",
      },
    ],
  };

  const refused = filterAdditivePlan(observed, observedScope);
  const refusedOps = refused.plan.operations.map((operation) => operation.op);

  check(
    "an update against a node the delta never names is dropped",
    !refusedOps.includes("updateNode"),
    refusedOps.join(","),
  );
  // The assertion the live proof would have failed: apply what survived the
  // filter to the baseline canvas and read the label back.
  const canvas = memoryFlow(MICROSERVICES);
  const summary = applyDesignPlan(canvas.flow, refused.plan);
  check(
    "so `Orders Service` is still labelled `Orders Service` afterwards",
    canvas.labelOf("ms-orders") === "Orders Service",
    canvas.labelOf("ms-orders") ?? "gone",
  );
  check(
    "every baseline node survives, and the added one joins them",
    canvas.nodeCount() === MICROSERVICES.length + 1,
    String(canvas.nodeCount()),
  );
  check(
    "and the apply path reports no update at all",
    summary.nodesUpdated === 0 && summary.nodesAdded === 1,
    `${summary.nodesAdded} added, ${summary.nodesUpdated} updated`,
  );
  check(
    "the refusal names the node by the label it still carries",
    refused.refusedUpdates.join(",") === "Orders Service",
    refused.refusedUpdates.join(","),
  );
  check(
    "the refusal is NOT counted as a destructive drop",
    refused.dropped === 0,
    String(refused.dropped),
  );
  check(
    "no update is reported as having been made",
    refused.updatedNodes.length === 0,
    String(refused.updatedNodes.length),
  );
  check(
    "and the rest of the plan is untouched, in order",
    refusedOps.join(",") === "addNode,addEdge",
    refusedOps.join(","),
  );

  /* --- The legitimate case, which must not be dropped with it. ------------ */

  // A human-written delta will not match a node label exactly. A rule strict
  // enough to fail on case is worse than the bug it fixes.
  const legitimateScope: CanvasSyncScope = {
    nodes: [
      { id: "rt-canvas", data: { label: "Realtime Canvas" } },
      { id: "ms-orders", data: { label: "Orders Service" } },
    ],
    architectureDelta: [
      {
        kind: "modified",
        component: "Realtime canvas",
        detail: "Writes through the queue.",
      },
    ],
  };
  const legitimate = filterAdditivePlan(
    {
      summary: "Update the canvas node",
      operations: [
        { op: "updateNode", id: "rt-canvas", label: "Realtime Canvas (queued)" },
      ],
    },
    legitimateScope,
  );

  check(
    "an update against a node the delta names is permitted, case and all",
    legitimate.plan.operations.length === 1 &&
      legitimate.plan.operations[0]?.op === "updateNode",
    legitimate.plan.operations.map((operation) => operation.op).join(","),
  );
  check(
    "and nothing is refused",
    legitimate.refusedUpdates.length === 0,
    legitimate.refusedUpdates.join(","),
  );
  check(
    "the outcome carries the label the node had before",
    legitimate.updatedNodes[0]?.previousLabel === "Realtime Canvas",
    legitimate.updatedNodes[0]?.previousLabel ?? "none",
  );
  check(
    "and the label it carries now",
    legitimate.updatedNodes[0]?.label === "Realtime Canvas (queued)",
    legitimate.updatedNodes[0]?.label ?? "none",
  );

  // The other half of the rule: it must not pass by dropping everything.
  const legitimateCanvas = memoryFlow(legitimateScope.nodes);
  applyDesignPlan(legitimateCanvas.flow, legitimate.plan);
  check(
    "the permitted update really lands on the node the delta named",
    legitimateCanvas.labelOf("rt-canvas") === "Realtime Canvas (queued)",
    legitimateCanvas.labelOf("rt-canvas") ?? "gone",
  );
  check(
    "and no other node on that canvas moves",
    legitimateCanvas.labelOf("ms-orders") === "Orders Service",
    legitimateCanvas.labelOf("ms-orders") ?? "gone",
  );

  // Stray whitespace is the other difference that carries no meaning.
  const spaced = filterAdditivePlan(
    {
      summary: "Update the canvas node",
      operations: [{ op: "updateNode", id: "rt-canvas", label: "Canvas" }],
    },
    {
      nodes: [{ id: "rt-canvas", data: { label: " Realtime   Canvas " } }],
      architectureDelta: legitimateScope.architectureDelta,
    },
  );
  check(
    "leading, trailing and doubled whitespace do not defeat the match",
    spaced.plan.operations.length === 1 && spaced.refusedUpdates.length === 0,
    spaced.refusedUpdates.join(","),
  );

  // An update that only restyles a node renames nothing, and must not be
  // reported as though it had.
  const restyled = filterAdditivePlan(
    {
      summary: "Recolour the canvas node",
      operations: [{ op: "updateNode", id: "rt-canvas", color: "blue" }],
    },
    legitimateScope,
  );
  check(
    "a restyle keeps the node's label as both the previous and current one",
    restyled.updatedNodes[0]?.previousLabel === "Realtime Canvas" &&
      restyled.updatedNodes[0]?.label === "Realtime Canvas",
    `${restyled.updatedNodes[0]?.previousLabel} / ${restyled.updatedNodes[0]?.label}`,
  );

  /* --- The edges of the rule. --------------------------------------------- */

  // `added` says the canvas does not have that part yet. A node already
  // carrying the name is somebody else's, so relabelling it is the same
  // overwrite by another route.
  const addedOnly = filterAdditivePlan(
    {
      summary: "Draw the sync queue",
      operations: [{ op: "updateNode", id: "queue", label: "Sync Queue v2" }],
    },
    {
      nodes: [{ id: "queue", data: { label: "Sync Queue" } }],
      architectureDelta: [
        { kind: "added", component: "Sync Queue", detail: "Buffers updates." },
      ],
    },
  );
  check(
    "an `added` entry does not license an update against a node of that name",
    addedOnly.plan.operations.length === 0 &&
      addedOnly.refusedUpdates.join(",") === "Sync Queue",
    addedOnly.refusedUpdates.join(","),
  );

  // Nor does a `removed` one — removals are reported and never drawn, and a
  // relabel is not a removal.
  const removedOnly = filterAdditivePlan(
    {
      summary: "Retire the socket writer",
      operations: [{ op: "updateNode", id: "sock", label: "Retired" }],
    },
    {
      nodes: [{ id: "sock", data: { label: "Direct socket writer" } }],
      architectureDelta: [
        {
          kind: "removed",
          component: "Direct socket writer",
          detail: "Replaced.",
        },
      ],
    },
  );
  check(
    "a `removed` entry does not license an update either",
    removedOnly.plan.operations.length === 0 &&
      removedOnly.refusedUpdates.join(",") === "Direct socket writer",
    removedOnly.refusedUpdates.join(","),
  );

  // An id that is not on the canvas has no label to report, so the refusal
  // falls back to the name the operation wanted to give it rather than reading
  // as an empty bullet.
  const unknownId = filterAdditivePlan(
    {
      summary: "Update a node that is not there",
      operations: [{ op: "updateNode", id: "ghost", label: "Realtime canvas" }],
    },
    legitimateScope,
  );
  check(
    "an update against an id that is not on the canvas is refused",
    unknownId.plan.operations.length === 0,
    String(unknownId.plan.operations.length),
  );
  check(
    "and is reported under the label it proposed, never as an empty name",
    unknownId.refusedUpdates.join(",") === "Realtime canvas",
    unknownId.refusedUpdates.join(","),
  );

  // The two kinds of drop are separate numbers because they mean different
  // things: one is the model asking to destroy work, the other is a legitimate
  // operation aimed at the wrong node.
  const both = filterAdditivePlan(
    {
      summary: "One of each",
      operations: [
        { op: "deleteNode", id: "ms-orders" },
        { op: "updateNode", id: "ms-orders", label: "Realtime Canvas" },
        { op: "updateNode", id: "rt-canvas", label: "Realtime Canvas (queued)" },
        { op: "addNode", id: "queue", label: "Sync Queue", shape: "cylinder" },
      ],
    },
    legitimateScope,
  );
  check(
    "a destructive drop and a refused update are counted apart",
    both.dropped === 1 && both.refusedUpdates.length === 1,
    `${both.dropped} dropped, ${both.refusedUpdates.length} refused`,
  );
  check(
    "the permitted update survives alongside them",
    both.plan.operations.map((operation) => operation.op).join(",") ===
      "updateNode,addNode",
    both.plan.operations.map((operation) => operation.op).join(","),
  );
  check(
    "and only the permitted one is reported as updated",
    both.updatedNodes.length === 1 &&
      both.updatedNodes[0]?.previousLabel === "Realtime Canvas",
    String(both.updatedNodes.length),
  );

  // A delta with no `modified` entry at all licenses no update whatsoever.
  const noModified = filterAdditivePlan(
    {
      summary: "Additions only",
      operations: [
        { op: "updateNode", id: "rt-canvas", label: "Something else" },
        { op: "addNode", id: "queue", label: "Sync Queue", shape: "cylinder" },
      ],
    },
    {
      nodes: legitimateScope.nodes,
      architectureDelta: [
        { kind: "added", component: "Sync Queue", detail: "Buffers updates." },
      ],
    },
  );
  check(
    "a delta with no modified entry permits no update at all",
    noModified.plan.operations.map((operation) => operation.op).join(",") ===
      "addNode" && noModified.refusedUpdates.length === 1,
    noModified.plan.operations.map((operation) => operation.op).join(","),
  );
}

async function promptPhase() {
  console.log(
    "\nprompt — added and modified reach the model; removed is reported, never drawn",
  );
  const { buildCanvasSyncPrompt, skippedRemovals } = await planDeps();

  const architectureDelta: ChangeDeltaEntry[] = [
    { kind: "added", component: "Upload queue", detail: "Buffers uploads." },
    { kind: "modified", component: "API server", detail: "Stops processing." },
    { kind: "removed", component: "Sync worker", detail: "No longer needed." },
    { kind: "removed", component: "Temp store", detail: "Replaced." },
  ];

  const prompt = buildCanvasSyncPrompt({
    summary: "Move uploads off the API server.",
    architectureDelta,
  });

  check(
    "the change summary reaches the prompt",
    prompt.includes("Move uploads off the API server."),
  );
  check("an added component reaches the prompt", prompt.includes("Upload queue"));
  check(
    "a modified component reaches the prompt",
    prompt.includes("API server"),
  );
  check(
    "a removed component never reaches the prompt",
    !prompt.includes("Sync worker") && !prompt.includes("Temp store"),
  );
  check(
    "the prompt states the additive intent rather than leaving it to the system prompt",
    prompt.includes("EXTENDING"),
  );
  check(
    "the prompt names the operations it must not emit",
    prompt.includes("deleteNode") &&
      prompt.includes("deleteEdge") &&
      prompt.includes("moveNode") &&
      prompt.includes("resizeNode"),
  );

  const removals = skippedRemovals(architectureDelta);
  check(
    "removals are reported by component name, in order",
    removals.join(",") === "Sync worker,Temp store",
    removals.join(","),
  );

  // A delta of nothing but removals still reaches the prompt builder, because
  // removals are reported rather than drawn.
  const removalsOnly = buildCanvasSyncPrompt({
    summary: "Retire the sync worker.",
    architectureDelta: [architectureDelta[2]!],
  });
  check(
    "a removals-only delta asks for an empty operations list",
    removalsOnly.includes("empty operations list"),
  );

  const none = skippedRemovals([architectureDelta[0]!]);
  check(
    "a delta with no removals reports none",
    none.length === 0,
    String(none.length),
  );
}

async function guardPhase() {
  console.log(
    "\nguard — only an applied, unpushed change may be drawn, and only once",
  );
  const d = await deps();
  const a = await seedProject(d, `guard-a-${process.pid}`);
  const b = await seedProject(d, `guard-b-${process.pid}`);

  try {
    const specA = await d.saveProjectSpec({
      projectId: a.project.id,
      markdown: SPEC_MARKDOWN,
    });
    const specB = await d.saveProjectSpec({
      projectId: b.project.id,
      markdown: SPEC_MARKDOWN,
    });

    // Still PROPOSED — saved and left alone.
    const proposed = await saveFixtureChange(
      d,
      a.project.id,
      specA.id,
      [a.unit.id],
      "Offline queue",
    );
    const proposedResult = await d.loadPushableChange(
      a.project.id,
      proposed.id,
    );
    check(
      "a proposed change is refused",
      !proposedResult.ok && proposedResult.reason === "not-applied",
      proposedResult.ok ? "allowed" : proposedResult.reason,
    );

    const discarded = await saveFixtureChange(
      d,
      a.project.id,
      specA.id,
      [a.unit.id],
      "Retry policy",
    );
    await d.prisma.projectChange.update({
      where: { id: discarded.id },
      data: { status: "DISCARDED" },
    });
    const discardedResult = await d.loadPushableChange(
      a.project.id,
      discarded.id,
    );
    check(
      "a discarded change is refused",
      !discardedResult.ok && discardedResult.reason === "not-applied",
      discardedResult.ok ? "allowed" : discardedResult.reason,
    );

    const applied = await applyFixtureChange(
      d,
      a.project.id,
      specA.id,
      [a.unit.id],
      "Sync worker",
    );
    const first = await d.loadPushableChange(a.project.id, applied.id);
    check(
      "an applied, unpushed change is allowed",
      first.ok,
      first.ok ? "" : first.reason,
    );
    check(
      "its stored proposal travels with it, so the delta can be read",
      first.ok && typeof first.change.proposalPath === "string",
    );

    // A change id from another project must not be reachable through a project
    // the caller does belong to — it matches nothing and reads as not-found.
    const crossProject = await d.loadPushableChange(b.project.id, applied.id);
    check(
      "a change id from another project reads as not-found, not as pushable",
      !crossProject.ok && crossProject.reason === "not-found",
      crossProject.ok ? "allowed" : crossProject.reason,
    );

    await d.markChangePushed(a.project.id, applied.id);

    const second = await d.loadPushableChange(a.project.id, applied.id);
    check(
      "a second push of the same change is refused",
      !second.ok && second.reason === "already-pushed",
      second.ok ? "allowed" : second.reason,
    );

    // The timestamp records the *first* push, so a stray second mark cannot
    // move it.
    const afterFirst = await d.prisma.projectChange.findUniqueOrThrow({
      where: { id: applied.id },
      select: { canvasPushedAt: true },
    });
    await d.markChangePushed(a.project.id, applied.id);
    const afterSecond = await d.prisma.projectChange.findUniqueOrThrow({
      where: { id: applied.id },
      select: { canvasPushedAt: true },
    });
    check(
      "marking twice does not move the recorded push time",
      afterFirst.canvasPushedAt?.getTime() ===
        afterSecond.canvasPushedAt?.getTime(),
      `${afterFirst.canvasPushedAt?.toISOString()} vs ${afterSecond.canvasPushedAt?.toISOString()}`,
    );

    // A change in project B is untouched by anything done to A's.
    const untouched = await d.prisma.projectChange.count({
      where: { projectId: b.project.id, canvasPushedAt: { not: null } },
    });
    check(
      "no change in the other project was marked",
      untouched === 0,
      String(untouched),
    );
    check("project B's spec exists for the fixture", specB.version >= 1);

    const missing = await d.loadPushableChange(a.project.id, "no-such-change");
    check(
      "an unknown change id reads as not-found",
      !missing.ok && missing.reason === "not-found",
      missing.ok ? "allowed" : missing.reason,
    );
  } finally {
    await d.prisma.project.delete({ where: { id: a.project.id } });
    await d.prisma.project.delete({ where: { id: b.project.id } });
  }
}

async function retryPhase() {
  console.log(
    "\nretry — a push that never completed leaves the change pushable again",
  );
  const d = await deps();
  const { project, unit } = await seedProject(d, `retry-${process.pid}`);

  try {
    const spec = await d.saveProjectSpec({
      projectId: project.id,
      markdown: SPEC_MARKDOWN,
    });
    const applied = await applyFixtureChange(
      d,
      project.id,
      spec.id,
      [unit.id],
      "Offline queue",
    );

    // The failed-push state *is* the fresh state: `canvasPushedAt` is only ever
    // written after the room mutation succeeds, so a run that died at any point
    // before that leaves the column exactly as it is now.
    const row = await d.prisma.projectChange.findUniqueOrThrow({
      where: { id: applied.id },
      select: { canvasPushedAt: true },
    });
    check(
      "applying a change does not mark it pushed",
      row.canvasPushedAt === null,
      String(row.canvasPushedAt),
    );

    const retriable = await d.loadPushableChange(project.id, applied.id);
    check(
      "so the change is still pushable after a failed push",
      retriable.ok,
      retriable.ok ? "" : retriable.reason,
    );

    // And a successful one closes it.
    await d.markChangePushed(project.id, applied.id);
    const closed = await d.loadPushableChange(project.id, applied.id);
    check(
      "a successful push closes it",
      !closed.ok && closed.reason === "already-pushed",
      closed.ok ? "allowed" : closed.reason,
    );
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function driftPhase() {
  console.log(
    "\ndrift — pushing lowers the unpushed count and leaves the drift count alone",
  );
  const d = await deps();
  const { project, unit } = await seedProject(d, `drift-${process.pid}`);

  try {
    const spec = await d.saveProjectSpec({
      projectId: project.id,
      markdown: SPEC_MARKDOWN,
    });

    const one = await applyFixtureChange(
      d,
      project.id,
      spec.id,
      [unit.id],
      "Offline queue",
    );
    await applyFixtureChange(d, project.id, spec.id, [unit.id], "Retry policy");

    const before = await d.countAppliedChangesSinceCurrentSpec(project.id);
    check(
      "two applied changes count as 2 of drift",
      before.appliedSinceCurrentSpec === 2,
      String(before.appliedSinceCurrentSpec),
    );
    check(
      "and all 2 are unpushed",
      before.unpushedSinceCurrentSpec === 2,
      String(before.unpushedSinceCurrentSpec),
    );

    await d.markChangePushed(project.id, one.id);

    const after = await d.countAppliedChangesSinceCurrentSpec(project.id);
    check(
      "pushing one lowers the unpushed count to 1",
      after.unpushedSinceCurrentSpec === 1,
      String(after.unpushedSinceCurrentSpec),
    );
    check(
      "and leaves the drift count at 2 — pushing never clears drift",
      after.appliedSinceCurrentSpec === 2,
      String(after.appliedSinceCurrentSpec),
    );
    check(
      "the version it is measured against is unchanged",
      after.currentSpecVersion === spec.version,
      `${after.currentSpecVersion} vs ${spec.version}`,
    );

    // Only generating a spec clears the drift, and it clears the unpushed count
    // with it — the changes are no longer "since" the current version at all.
    const second = await d.saveProjectSpec({
      projectId: project.id,
      markdown: SPEC_MARKDOWN,
    });
    const regenerated = await d.countAppliedChangesSinceCurrentSpec(project.id);
    check(
      "generating a spec clears the drift count",
      regenerated.appliedSinceCurrentSpec === 0,
      String(regenerated.appliedSinceCurrentSpec),
    );
    check(
      "and the unpushed count with it",
      regenerated.unpushedSinceCurrentSpec === 0,
      String(regenerated.unpushedSinceCurrentSpec),
    );
    check(
      "against the new version",
      regenerated.currentSpecVersion === second.version,
      `${regenerated.currentSpecVersion} vs ${second.version}`,
    );

    // A project with no specs answers zero for both rather than failing.
    const bare = await seedProject(d, `drift-bare-${process.pid}`);
    try {
      const none = await d.countAppliedChangesSinceCurrentSpec(bare.project.id);
      check(
        "a project with no specs reports 0 unpushed rather than erroring",
        none.unpushedSinceCurrentSpec === 0 && none.currentSpecVersion === null,
        `${none.unpushedSinceCurrentSpec}, ${none.currentSpecVersion}`,
      );
    } finally {
      await d.prisma.project.delete({ where: { id: bare.project.id } });
    }
  } finally {
    await d.prisma.project.delete({ where: { id: project.id } });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const phase = args.find((a) => !a.startsWith("--")) ?? "all";

  const run = {
    filter: filterPhase,
    update: updatePhase,
    prompt: promptPhase,
    guard: guardPhase,
    retry: retryPhase,
    drift: driftPhase,
  };

  if (phase === "all") {
    for (const fn of Object.values(run)) await fn();
  } else if (phase in run) {
    await run[phase as keyof typeof run]();
  } else {
    console.error(
      `Unknown phase "${phase}". One of: ${Object.keys(run).join(", ")}, all`,
    );
    process.exit(1);
  }

  console.log(
    failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
