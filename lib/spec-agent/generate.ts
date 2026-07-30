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

/**
 * System prompt: what a good spec looks like, and the sections it must have.
 *
 * Takes the brief rather than only describing it in the abstract, because the
 * `## Tech Stack` instructions differ by branch: with a brief the model is told
 * to read it and flag conflicts against the canvas; without one it is told to
 * say so plainly instead of inventing a stack. Only the applicable branch is
 * emitted, so the model is never handed rules for a situation it isn't in.
 */
function buildSystemPrompt(architectureBrief: string | null): string {
  const hasBrief = architectureBrief !== null;

  return [
    "You are Specwright, a senior software architect. You write a concise, technically precise specification for the system a team has drawn on a shared architecture canvas.",
    "",
    "You are given the canvas graph (nodes and the edges between them), the conversation that produced it, and — when the team ran the Discovery interview — a structured architecture brief. The canvas is the source of truth for what the system contains; the conversation explains intent, constraints, and anything the diagram cannot show.",
    "",
    'When an architecture brief is present, it is the authoritative statement for storage, consistency, and stack decisions specifically. A `cylinder` shape only means "a database or storage" — not which kind — so the brief\'s `Data shapes` and `Consistency` answers, not the shape alone, are what ground those decisions.',
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
    "4. `## Tech Stack` — the concrete data model, consistency model, and preferred stack/cloud.",
    "5. `## Components` — one `###` subsection per node: its responsibility, what it talks to, and the key technical considerations.",
    "6. `## Data Flow` — the main request/data paths through the system, in order.",
    "7. `## Technical Considerations` — scaling, failure modes, security, and storage decisions the diagram implies.",
    "8. `## Open Questions` — what the canvas and conversation leave undecided. Omit this section entirely if nothing is genuinely unresolved.",
    "",
    "TECH STACK RULES:",
    "- `## Tech Stack` is never omitted. Unlike `## Open Questions`, it appears in every spec you write.",
    ...(hasBrief
      ? [
          "- Draw it from the architecture brief's `## Data` and `## Constraints` sections — its `Core entities`, `Data shapes`, `Consistency`, and `Preferred stack / cloud` lines.",
          "- Where the brief states a field as `not specified`, say so plainly here. An unanswered field is not licence to pick a default or invent a stack.",
          "- Where the brief's Data or Constraints answers conflict with what the canvas graph shows (say the brief answers `document` while the graph's `cylinder` nodes and edges plainly describe a relational, multi-table join pattern), state the brief's answer in `## Tech Stack` and raise the conflict under `## Open Questions`. Never silently resolve it in favour of one or the other.",
        ]
      : [
          "- No architecture brief was recorded for this project. Say that plainly in this section, then describe only what the canvas graph and the conversation imply about storage, consistency, and stack. Do not name a stack neither of them supports.",
        ]),
    "- `## Tech Stack` states *what* is used; `## Technical Considerations` covers how those choices scale, fail, and get secured. Do not re-list there what `## Tech Stack` already named.",
    "",
    "RULES:",
    "- Describe only what the canvas and conversation support. Where a detail is not specified, say so in Open Questions rather than inventing a decision.",
    "- Refer to components by their node labels so the spec and the diagram stay readable side by side.",
    "- Be specific and technical. No marketing language, no filler, no restating the prompt.",
    "- If the canvas is empty, write the spec from the conversation alone and say plainly in the Overview that nothing has been drawn yet.",
    "- Output raw Markdown only. Do not wrap the document in a code fence and do not add any commentary before or after it.",
  ].join("\n");
}

/**
 * User prompt: the canvas graph, the architecture brief, and the conversation
 * that produced them.
 *
 * The brief is its own labeled block rather than being folded into the
 * conversation: it is a set of structured, deliberate answers, whereas the chat
 * history is freeform. It is passed through whole — it was already bounded to
 * 20,000 characters when persisted (`PUT /api/projects/[projectId]/brief`), so
 * it is not cut again here. (The `ai-chat` feed's own copy of a brief *is* cut,
 * to `AI_CHAT_MAX_LENGTH`, but that bound exists for chat display and has
 * nothing to do with this run.)
 */
function buildUserPrompt(params: {
  chatHistory: SpecChatMessage[];
  nodes: SpecNode[];
  edges: SpecEdge[];
  architectureBrief: string | null;
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

  const brief =
    params.architectureBrief ??
    "(none — this project has no recorded architecture brief)";

  return [
    "Canvas graph (JSON):",
    JSON.stringify({ nodes, edges }),
    "",
    "Architecture brief (from the Discovery interview, if run):",
    brief,
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
 * Turn a canvas graph, its architecture brief, and its conversation into a
 * Markdown technical spec. Returns the spec as plain Markdown — persisting it
 * is a separate concern and does not happen here. Throws when `OPENAI_API_KEY`
 * is missing, when the model call fails, or when the model returns nothing
 * usable.
 *
 * `architectureBrief` is the project's persisted Discovery brief, or `null`
 * when Discovery has never been run. It is read server-side by the caller from
 * an already access-checked project — it is never client-supplied.
 */
export async function generateSpecMarkdown(params: {
  chatHistory: SpecChatMessage[];
  nodes: SpecNode[];
  edges: SpecEdge[];
  architectureBrief: string | null;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const openai = createOpenAI({ apiKey });

  const { text } = await generateText({
    model: openai(SPEC_MODEL),
    system: buildSystemPrompt(params.architectureBrief),
    prompt: buildUserPrompt(params),
  });

  const markdown = unwrapFence(text);
  if (!markdown) {
    throw new Error("The model returned an empty specification");
  }

  return markdown;
}
