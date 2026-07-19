import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

import type {
  SpecChatMessage,
  SpecEdge,
  SpecNode,
} from "@/lib/spec-agent/payload";

/**
 * The model used to write a technical spec. Same provider and model the design
 * agent uses (`lib/design-agent/plan.ts`) — one AI provider, no abstraction over
 * it — kept as a constant so it is easy to bump.
 */
export const SPEC_MODEL = "gpt-4o-mini";

/** System prompt: what a good spec looks like, and the sections it must have. */
function buildSystemPrompt(): string {
  return [
    "You are Specwright, a senior software architect. You write a concise, technically precise specification for the system a team has drawn on a shared architecture canvas.",
    "",
    "You are given the canvas graph (nodes and the edges between them) and the conversation that produced it. The canvas is the source of truth for what the system contains; the conversation explains intent, constraints, and anything the diagram cannot show.",
    "",
    "NODE SHAPES tell you what a node is:",
    "- rectangle — general-purpose component or process",
    "- pill — a service or long-running process",
    "- cylinder — a database or storage",
    "- diamond — a decision or gateway",
    "- circle — an event or start/end endpoint",
    "- hexagon — an external system or trust boundary",
    "",
    "Edges are directed (source -> target) and their label says what flows between them.",
    "",
    "Write the spec in Markdown with these sections, in this order:",
    "1. `# <System Name>` — a title inferred from the diagram.",
    "2. `## Overview` — 2-4 sentences on what the system does and why.",
    "3. `## Architecture` — how the pieces fit together, following the flow of the diagram.",
    "4. `## Components` — one `###` subsection per node: its responsibility, what it talks to, and the key technical considerations.",
    "5. `## Data Flow` — the main request/data paths through the system, in order.",
    "6. `## Technical Considerations` — scaling, failure modes, security, and storage decisions the diagram implies.",
    "7. `## Open Questions` — what the canvas and conversation leave undecided. Omit this section entirely if nothing is genuinely unresolved.",
    "",
    "RULES:",
    "- Describe only what the canvas and conversation support. Where a detail is not specified, say so in Open Questions rather than inventing a decision.",
    "- Refer to components by their node labels so the spec and the diagram stay readable side by side.",
    "- Be specific and technical. No marketing language, no filler, no restating the prompt.",
    "- If the canvas is empty, write the spec from the conversation alone and say plainly in the Overview that nothing has been drawn yet.",
    "- Output raw Markdown only. Do not wrap the document in a code fence and do not add any commentary before or after it.",
  ].join("\n");
}

/** User prompt: the canvas graph plus the conversation that produced it. */
function buildUserPrompt(params: {
  chatHistory: SpecChatMessage[];
  nodes: SpecNode[];
  edges: SpecEdge[];
}): string {
  const nodes = params.nodes.map((node) => ({
    id: node.id,
    label: node.data?.label ?? "",
    shape: node.data?.shape ?? "rectangle",
  }));
  const edges = params.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.data?.label ?? "",
  }));

  const conversation =
    params.chatHistory.length > 0
      ? params.chatHistory
          .map((message) => `${message.role}: ${message.content}`)
          .join("\n")
      : "(no conversation — work from the canvas alone)";

  return [
    "Canvas graph (JSON):",
    JSON.stringify({ nodes, edges }),
    "",
    "Conversation that produced it:",
    conversation,
    "",
    "Write the technical specification for this system.",
  ].join("\n");
}

/**
 * Strip a code fence the model may have wrapped the whole document in, despite
 * being told not to. The spec is stored and rendered as Markdown, so a stray
 * ```` ```markdown ```` wrapper would render as one giant code block.
 */
function unwrapFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:markdown|md)?\r?\n([\s\S]*?)\r?\n?```$/.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

/**
 * Turn a canvas graph and its conversation into a Markdown technical spec.
 * Returns the spec as plain Markdown — persisting it is a separate concern and
 * does not happen here. Throws when `OPENAI_API_KEY` is missing, when the model
 * call fails, or when the model returns nothing usable.
 */
export async function generateSpecMarkdown(params: {
  chatHistory: SpecChatMessage[];
  nodes: SpecNode[];
  edges: SpecEdge[];
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const openai = createOpenAI({ apiKey });

  const { text } = await generateText({
    model: openai(SPEC_MODEL),
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(params),
  });

  const markdown = unwrapFence(text);
  if (!markdown) {
    throw new Error("The model returned an empty specification");
  }

  return markdown;
}
