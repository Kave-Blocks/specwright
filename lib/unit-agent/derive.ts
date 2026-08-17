import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";

import { deriveBuildUnitKey, listBuildUnits } from "@/lib/build-units";
import { prisma } from "@/lib/prisma";
import { readSpecMarkdown } from "@/lib/spec-agent/storage";
import {
  MAX_DERIVED_UNITS,
  derivedUnitsSchema,
  type DerivedUnits,
} from "@/lib/unit-agent/payload";

/**
 * The model that reads a spec and returns the work it implies.
 *
 * Deliberately **its own constant**, not `SPEC_MODEL` and not `CHANGE_MODEL`.
 * Naming it separately is the whole point of the convention `lib/change-agent/
 * propose.ts` set: the three tasks are different difficulties and must be
 * raisable independently. This one reads one document and decomposes it, which
 * is closer to the change path's structured reasoning than to the spec path's
 * prose generation — so it starts where `CHANGE_MODEL` is rather than where
 * `SPEC_MODEL` is.
 */
export const UNIT_MODEL = "gpt-4o";

/* -------------------------------------------------------------------------- */
/* Context                                                                     */
/* -------------------------------------------------------------------------- */

/** One unit the project already has, as the prompt needs to name it. */
interface ExistingUnit {
  key: string;
  title: string;
}

/** Everything the derivation reasons over, all of it read server-side. */
export interface DeriveContext {
  spec: { id: string; version: number; markdown: string };
  existing: ExistingUnit[];
}

/**
 * Load a project's current spec and its existing units.
 *
 * `null` means the project has no spec, which is the one refusal decided before
 * a model call is spent — `40`'s discipline, and the same refusal
 * `POST /api/ai/change` answers with a 409.
 *
 * The spec is the **highest version**, read from the spec rows rather than from
 * `Project.nextSpecVersion - 1`: that column records the last number *assigned*
 * and diverges the moment a spec is removed. This is the ordering
 * `loadChangeContext` uses, for the identical reason.
 */
export async function loadDeriveContext(
  projectId: string,
): Promise<DeriveContext | null> {
  const spec = await prisma.projectSpec.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, filePath: true },
  });

  if (!spec) {
    return null;
  }

  const [markdown, units] = await Promise.all([
    readSpecMarkdown(spec.filePath),
    listBuildUnits(projectId),
  ]);

  return {
    spec: { id: spec.id, version: spec.version, markdown },
    // The key is what the producer matches on, so it is what the prompt shows —
    // re-derived here rather than selected, because `key` is server-side only
    // and never leaves `lib/build-units.ts` through `UNIT_SELECT`.
    existing: units.map((unit) => ({
      key: deriveBuildUnitKey(unit.title, unit.sequence),
      title: unit.title,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Prompt                                                                      */
/* -------------------------------------------------------------------------- */

const SYSTEM_PROMPT = `You decompose a technical specification into an ordered list of build units.

A build unit is one coherent increment of work — something a developer could pick up, finish, and verify on its own. It is not a task, not a subtask, and not a layer of the stack.

Rules:
- Order the units so that each one only depends on units before it.
- Give each a short imperative title naming what it delivers, not how.
- The summary is one sentence on what the unit covers. Omit it (null) rather than padding.
- Derive units only from what the specification actually describes. Do not invent scope it does not mention.
- Never repeat work that an existing unit already covers.
- Prefer fewer, larger units over many small ones. A specification of ordinary size implies something like five to fifteen units.`;

/**
 * Compose the request. The existing units are listed by title so the model can
 * avoid repeating them; the *reason* they must not be repeated is not left to
 * the prompt alone, because a prompt is a wish — `lib/unit-agent/produce.ts`
 * drops a colliding key in code regardless of what comes back. This block is
 * how the model produces a better answer, not how the system stays correct.
 */
function buildDerivePrompt(context: DeriveContext): string {
  const blocks = [
    `## Specification (version ${context.spec.version})`,
    context.spec.markdown,
  ];

  if (context.existing.length > 0) {
    blocks.push(
      "## Build units this project already has",
      "Do not propose any of these again. Propose only work the specification describes that is not already covered here.",
      context.existing.map((unit) => `- ${unit.title}`).join("\n"),
    );
  } else {
    blocks.push(
      "## Build units this project already has",
      "None. This is the project's first set.",
    );
  }

  blocks.push(
    `Return at most ${MAX_DERIVED_UNITS} units.`,
  );

  return blocks.join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* The call                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One model call, returning a **validated object** rather than prose.
 *
 * `generateObject`, not `generateText` — the same departure `40` made and for
 * the same reason: a build list has to be acted on, so it must arrive already
 * shaped rather than as text somebody parses. Validation failures therefore
 * surface here, at the boundary, instead of as a malformed write later.
 *
 * The API key is read at call time rather than at module load, so importing
 * this module (as the route bundle transitively does, through the payload
 * schemas) does not require the key to be present.
 */
export async function generateDerivedUnits(
  context: DeriveContext,
): Promise<DerivedUnits> {
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const { object } = await generateObject({
    model: openai(UNIT_MODEL),
    schema: derivedUnitsSchema,
    system: SYSTEM_PROMPT,
    prompt: buildDerivePrompt(context),
  });

  return object;
}
