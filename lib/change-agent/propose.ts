import { createOpenAI } from "@ai-sdk/openai";
import { get } from "@vercel/blob";
import { generateObject } from "ai";

import { deriveBuildUnitKey, listBuildUnits } from "@/lib/build-units";
import { parseCanvasSnapshot } from "@/lib/canvas-storage";
import { prisma } from "@/lib/prisma";
import {
  MAX_AFFECTED_UNITS,
  MAX_DELTA_ENTRIES,
  MAX_OPEN_QUESTIONS,
  MAX_PROPOSED_UNITS,
  changeProposalSchema,
} from "@/lib/change-agent/payload";
import type { ChangeProposalDraft } from "@/lib/change-agent/payload";
import { MAX_EDGES, MAX_NODES } from "@/lib/spec-agent/payload";
import { readSpecMarkdown } from "@/lib/spec-agent/storage";
import type { BuildUnitStatusValue } from "@/types/build-units";

/**
 * The model that reasons about a change against an existing system.
 *
 * Deliberately **its own constant, not `SPEC_MODEL`**. Writing a spec is prose
 * generation from a diagram; proposing a change means holding a spec, a canvas,
 * and a live list of build units in mind at once and returning a structured
 * delta over them. That is the harder task, and the two must be raisable — or
 * lowered — independently of each other.
 */
export const CHANGE_MODEL = "gpt-4o";

/* -------------------------------------------------------------------------- */
/* Context                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One existing build unit as the model is shown it.
 *
 * The `key` is **derived** (`deriveBuildUnitKey`) rather than read from the
 * `ProjectBuildUnit.key` column, and that is safe because the two use the same
 * derivation and `updateBuildUnit` re-derives on every rename. It also does not
 * matter if they ever diverged: the key is never stored by this path. It exists
 * only so the model has a short, stable-looking handle to refer to a unit by,
 * and `validate.ts` resolves it back to an `id` against **this same list**. The
 * vocabulary is therefore self-consistent within a run by construction.
 */
export interface ChangeContextUnit {
  id: string;
  key: string;
  title: string;
  summary: string | null;
  status: BuildUnitStatusValue;
}

/** Everything the model reasons over, all of it read server-side. */
export interface ChangeContext {
  /** The spec version the proposal is a delta against. */
  baseSpec: { id: string; version: number; markdown: string };
  /** The project's persisted Discovery brief, or `null` if never run. */
  architectureBrief: string | null;
  /** The saved canvas graph, or `null` when nothing has been saved yet. */
  canvas: { nodes: CanvasGraphNode[]; edges: CanvasGraphEdge[] } | null;
  /** The project's build units in build order. */
  units: ChangeContextUnit[];
}

/** A canvas node reduced to what the model reasons about. */
interface CanvasGraphNode {
  id: string;
  label: string;
  shape: string;
}

/** A canvas edge reduced to its endpoints and what flows between them. */
interface CanvasGraphEdge {
  source: string;
  target: string;
  label: string;
}

/*
 * `readSpecMarkdown` used to live here, private to this module. `44` reads the
 * same bytes to derive a project's first build units, so it moved to
 * `lib/spec-agent/storage.ts` — beside the function that wrote them — rather
 * than being written a second time. Two readers of one artifact is how two
 * different failure policies for an unreadable spec come to exist.
 */

/**
 * Read the saved canvas graph, reduced to the fields the model reasons about.
 *
 * Unlike the spec, an unreadable canvas is **not** fatal: it is supporting
 * context, and the project may simply never have saved one. It degrades to
 * `null`.
 *
 * The node and edge counts are cut to the same `MAX_NODES`/`MAX_EDGES` the spec
 * path bounds a request with. The graph is trusted here (it was read
 * server-side), so this is not a validation step — it is the same runaway guard
 * against pushing an absurd canvas into a prompt.
 */
async function readCanvasGraph(
  canvasJsonPath: string | null,
): Promise<ChangeContext["canvas"]> {
  if (!canvasJsonPath) {
    return null;
  }

  const result = await get(canvasJsonPath, {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200) {
    return null;
  }

  const snapshot = parseCanvasSnapshot(await new Response(result.stream).json());
  if (!snapshot) {
    return null;
  }

  return {
    nodes: snapshot.nodes.slice(0, MAX_NODES).map((node) => ({
      id: node.id,
      label: node.data?.label ?? "",
      shape: node.data?.shape ?? "rectangle",
    })),
    edges: snapshot.edges.slice(0, MAX_EDGES).map((edge) => ({
      source: edge.source,
      target: edge.target,
      label: edge.data?.label ?? "",
    })),
  };
}

/**
 * Gather everything a proposal is reasoned from, for one project.
 *
 * Returns `null` when the project has **no spec**, which is not an error: a
 * change is a delta and there is nothing to delta against, so the caller
 * refuses rather than spending a model call. (`POST /api/ai/change` catches the
 * same condition earlier, before a run is even started; this is the check that
 * still holds if the last spec were deleted between the two.)
 *
 * Every field is read from `projectId` — which the caller has **already
 * access-checked** — and none of it is ever accepted from a request body. That
 * is the rule unit `36` established for the architecture brief, applied here to
 * the spec, the canvas, and the unit list as well.
 */
export async function loadChangeContext(
  projectId: string,
): Promise<ChangeContext | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { architectureBrief: true, canvasJsonPath: true },
  });

  if (!project) {
    return null;
  }

  // Newest by `version`, not `createdAt`: the version is the number people
  // refer to a spec by and is assigned from a counter, so it is the ordering
  // that cannot disagree with what the UI shows.
  const baseSpec = await prisma.projectSpec.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, filePath: true },
  });

  if (!baseSpec) {
    return null;
  }

  const [markdown, canvas, units] = await Promise.all([
    readSpecMarkdown(baseSpec.filePath),
    readCanvasGraph(project.canvasJsonPath),
    listBuildUnits(projectId),
  ]);

  return {
    baseSpec: { id: baseSpec.id, version: baseSpec.version, markdown },
    architectureBrief: project.architectureBrief,
    canvas,
    units: units.map((unit) => ({
      id: unit.id,
      key: deriveBuildUnitKey(unit.title, unit.sequence),
      title: unit.title,
      summary: unit.summary,
      status: unit.status,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Prompts                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * System prompt: what a proposal is, and the two rules it must not break.
 *
 * The first is that the architecture is expressed **as a delta**. A proposal is
 * a change against a known base, so restating the system would both bury the
 * actual change and go stale the moment the base moved.
 *
 * The second is that a unit is referenced only by a key it was handed. This is
 * stated plainly and more than once because it is the failure the whole
 * validation step downstream exists to catch — an invented key is silently
 * dropped, so a model that guesses produces a quietly incomplete proposal.
 *
 * The array caps are stated in prose rather than as schema bounds: OpenAI's
 * strict structured outputs reject `maxItems` (see `payload.ts`), so this is
 * where the model learns them, and `validate.ts` is what enforces them.
 */
function buildSystemPrompt(): string {
  return [
    "You are Specwright, a senior software architect. A member of the team has described a change they want to make to a system that already has a written specification. You produce a structured proposal for that change. You do not apply anything — a person decides what happens next.",
    "",
    "You are given: the change request in the member's own words, the current technical specification, the architecture brief from the Discovery interview (when one exists), the canvas graph the spec was written from, and the project's existing build units.",
    "",
    "ARCHITECTURE DELTA:",
    "- Express the architecture as a **delta**: what is added, what is modified, what is removed. Do not restate the system.",
    "- An entry is only worth writing if the change actually moves that part. A component the change does not touch does not belong in the delta.",
    "- Name components as the current specification names them, so the proposal and the spec read side by side.",
    `- At most ${MAX_DELTA_ENTRIES} entries. If a change appears to touch more than that, you are listing rather than reasoning.`,
    "",
    "AFFECTED UNITS:",
    "- These are **existing** build units the change makes stale — work already planned or done that this change invalidates or forces a revision of.",
    "- Reference a unit **only** by a `key` from the list of build units you were given, copied exactly.",
    "- **Never invent a key.** Do not guess one, do not derive one from a title, and do not use a key for a unit that is not in the list. A key you were not given is discarded, and the impact you meant to report is lost.",
    "- If the change affects no existing unit, return an empty list. That is a legitimate answer.",
    `- At most ${MAX_AFFECTED_UNITS} entries.`,
    "",
    "PROPOSED UNITS:",
    "- These are pieces of work the change implies that do **not** exist yet. Do not restate an existing unit here — if the work is already a unit, it belongs under affected units.",
    "- Title them the way the existing units are titled: short and imperative.",
    `- At most ${MAX_PROPOSED_UNITS} entries.`,
    "",
    "OPEN QUESTIONS:",
    "- What this change leaves genuinely undecided, or where the request and the current specification conflict. Return an empty list if nothing is unresolved — do not manufacture a question.",
    `- At most ${MAX_OPEN_QUESTIONS} entries.`,
    "",
    "RULES:",
    "- Reason only from the specification, the brief, the canvas, and the units you were given. Where the request is ambiguous, raise it as an open question rather than deciding it yourself.",
    "- Be specific and technical. No marketing language, no filler, no restating the request back.",
  ].join("\n");
}

/** User prompt: the request, then everything it is a change against. */
function buildUserPrompt(params: {
  request: string;
  context: ChangeContext;
}): string {
  const { request, context } = params;

  const units =
    context.units.length > 0
      ? JSON.stringify(
          context.units.map((unit) => ({
            key: unit.key,
            title: unit.title,
            summary: unit.summary ?? "",
            status: unit.status,
          })),
        )
      : "(none — this project has no build units yet, so no existing unit can be affected)";

  const canvas = context.canvas
    ? JSON.stringify(context.canvas)
    : "(none — no canvas has been saved for this project)";

  const brief =
    context.architectureBrief ??
    "(none — this project has no recorded architecture brief)";

  return [
    "Change request (the member's own words):",
    request,
    "",
    `Current technical specification (version ${context.baseSpec.version}) — the base this change is a delta against:`,
    context.baseSpec.markdown,
    "",
    "Architecture brief (from the Discovery interview, if run):",
    brief,
    "",
    "Canvas graph (JSON):",
    canvas,
    "",
    "Existing build units (JSON) — the only keys you may reference:",
    units,
    "",
    "Produce the structured change proposal.",
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* The call                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Turn a plain-English change request into a structured proposal.
 *
 * Uses **`generateObject`**, not the `generateText` the spec path uses, and
 * that is the one substantive departure from the existing AI path. A spec is
 * prose because a spec *is* prose — a person reads it. A proposal is acted on:
 * unit `41` applies it, which means something has to read `affectedUnits` and
 * `proposedUnits` as data. Parsing that back out of Markdown would be inventing
 * a format the provider already offers to guarantee.
 *
 * What comes back is **shape-checked, not trusted**. Every string is
 * unnormalized and every `key` is unresolved; `validate.ts` is the boundary
 * that turns this into something storable. Throws when `OPENAI_API_KEY` is
 * missing, when the call fails, or when the model returns nothing usable —
 * matching `generateSpecMarkdown`.
 */
export async function generateChangeProposal(params: {
  request: string;
  context: ChangeContext;
}): Promise<ChangeProposalDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const openai = createOpenAI({ apiKey });

  const { object } = await generateObject({
    model: openai(CHANGE_MODEL),
    schema: changeProposalSchema,
    schemaName: "ChangeProposal",
    schemaDescription:
      "A structured proposal for a change to an existing system: what moves in the architecture, which existing build units it makes stale, what new work it implies, and what it leaves open.",
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(params),
  });

  // The schema guarantees the fields exist, not that the model said anything.
  // An empty summary with nothing in any array is a non-answer, and storing it
  // would leave a member staring at a blank proposal with no way to tell it
  // apart from a real one.
  const isEmpty =
    object.summary.trim().length === 0 &&
    object.architectureDelta.length === 0 &&
    object.affectedUnits.length === 0 &&
    object.proposedUnits.length === 0;

  if (isEmpty) {
    throw new Error("The model returned an empty change proposal");
  }

  return object;
}
