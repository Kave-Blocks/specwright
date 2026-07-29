# Specwright — Spec-Driven Dev Landscape & Open-Source Integration

**Doc type:** Chat handoff / context brief
**Source:** claude.ai conversation, continued here with the codebase in context
**Status:** Open discussion — nothing below is a locked decision

## Purpose

This carries a claude.ai conversation into Claude Code. The conversation researched the "spec-driven development" landscape and worked through whether Specwright's architecture-interview and spec-writing engine should build on existing open-source frameworks instead of from scratch. It has no codebase-specific detail — read the actual repo for that. Treat this as background and open questions to keep exploring, not a finished plan.

## 1. Specwright, in one paragraph

Specwright gives architecture direction by interviewing users about their target users and the nature of their project (POS system, FPS game, AI companion, etc.). It currently has three features: an architecture interview, a canvas for system-architecture diagrams, and AI-written specs. The longer-term vision is to grow past a one-time "foundational" helper into a superapp spanning the whole project lifecycle — the AI discusses the idea, teaches architecture, suggests tech stack and features (SQL choice, Next.js vs. React, Python/JS/TS, etc.), and tracks feature progress continuously instead of stopping after the initial scaffold.

## 2. The open question this conversation was working through

Real open-source projects already do pieces of what Specwright's interview/spec engine needs. Build from scratch, or lean on what exists?

Short answer from the conversation: **the reusable part is the prompt engineering and conventions, not a runtime dependency.** Neither relevant open-source project exposes an API — both are CLI/template tools meant to run inside a developer's terminal next to an already-configured coding agent. That reframes what "integrate it" can mean. Details in section 5.

## 3. Landscape (condensed)

Broader competitive research from the same conversation, for reference:

| Platform | Category | Business model |
|---|---|---|
| AWS Kiro | Spec-driven IDE | Free (50 credits) → ~$19/mo entry, credit-metered |
| GitHub Spec Kit | Open-source SDD toolkit | Free, MIT — monetizes the ecosystem, not the tool |
| BMAD-METHOD | Open-source agent framework | Free, MIT, npm install |
| Tessl | Spec-centric dev platform | VC-funded ($125M+), pre-GA pricing |
| ChatPRD | AI PRD coach | $8 → $15 → $24/user/mo, enterprise custom |
| CodeGuide.dev | Spec/context generator | Credit-based subscription |
| Eraser / DiagramGPT | AI architecture diagrams | Free (5 gens) → unlimited AI bundled into paid tiers |
| IcePanel | C4 architecture modeling | Free tier → paid team plans |
| Lovable | Full-stack app builder | Free → $25/$50/mo + metered credit burn |
| Bolt.new | Full-stack app builder | Free → ~$20+/mo, token-metered |
| v0 (Vercel) | UI generator | Free → $20/mo, token-metered |
| Replit Agent | Full-stack app builder | Free → $20–$100/mo, effort-based credits |
| Devin (Cognition) | Autonomous coding agent | Free → $20/$200/mo seat + credits; enterprise on ACU contracts |
| Linear | Issue tracking + AI agent | Free → $16/user/mo for agent features |

**Why it matters:** the landscape splits into elicitation-heavy/code-light (ChatPRD, CodeGuide, BMAD's planning agents) and code-heavy/elicitation-light (Lovable, Bolt, v0, classic Devin). Almost nothing sits in the real middle, and almost nobody treats the spec as a living document tracked against build progress across the *whole* lifecycle — most generate a spec once and hand it off, or track tasks with no memory of the original architecture reasoning. That gap is Specwright's actual differentiator, not the interview or the canvas alone.

## 4. The two directly relevant open-source projects

### GitHub Spec Kit — github.com/github/spec-kit
- Open source (MIT), maintained by GitHub, actively released.
- CLI tool (`specify`), installed via `uv tool install specify-cli` or PyPI. Not a hosted service or API.
- Works by handing structured slash commands (`/specify`, `/plan`, `/tasks`) to whichever coding agent is already running in the terminal — Claude Code, Copilot, Gemini CLI, and 30+ others.
- Flow: plain-language feature description → auto-numbered spec in `specs/[branch-name]/` → implementation plan → task breakdown → code.
- No intelligence of its own — the actual reasoning happens in whatever agent it's pointed at.

### BMAD-METHOD — github.com/bmad-code-org/BMAD-METHOD
- Open source (MIT), ~49K GitHub stars / 5.7K forks as of mid-2026, actively maintained (v6.x), created by Brian "BMad" Madison.
- Installed via `npx bmad-method install`; generates tool-specific command files (e.g. `.claude/commands/` for Claude Code).
- Runs a simulated agile team of specialized agent personas (Analyst, PM, Architect, Scrum Master, Dev, QA...) through a four-phase cycle: Analysis → Planning → Solutioning → Implementation.
- Same underlying mechanic as Spec Kit — no external runtime engine. The agents are structured markdown instructions that whatever LLM is running executes step by step.
- Explicitly covers the full lifecycle, not just the initial build — closer to Specwright's "not just foundational" ambition than Spec Kit is.

## 5. Three integration patterns discussed

### Pattern A — Borrow the prompt content as static files (do this first)
Pull the actual persona/template files from both repos (BMAD's `architect.md`, `pm.md`, `analyst.md`; Spec Kit's `specify`/`plan`/`tasks` templates) and adapt the wording into Specwright's own prompt library. Ordinary versioned content in the repo, called from Specwright's own LLM calls. No external dependency, nothing that breaks when they push an update.

```ts
// specwright/server/prompts/architecture-interview.md
// (adapted from BMAD's architect.md persona)

const systemPrompt = fs.readFileSync('./prompts/architecture-interview.md', 'utf-8');

const response = await anthropic.messages.create({
  model: 'claude-sonnet-5',
  system: systemPrompt,
  messages: conversationHistory,
});
```

### Pattern B — Match their output schema, not their code
Shape Specwright's spec-document schema so its sections mirror Spec Kit's spec.md/plan.md/tasks.md split (or Kiro's requirements/design/tasks). Lets an "export" feature drop a spec-kit-shaped folder into a user's existing project. Cheap if decided now, expensive to retrofit later.

Relevant coincidence: Spec Kit already auto-numbers feature specs into a `specs/[branch-name]/` directory — structurally close to the existing `context/feature-specs/` convention already in use (Specs 30–32, etc.). Worth checking whether that overlap is exploitable.

### Pattern C — Actually run it server-side via the Claude Agent SDK (heaviest, relevant later)
The Claude Agent SDK (renamed from Claude Code SDK — docs.anthropic.com/en/docs/claude-code/sdk/sdk-headless) drives a full headless Claude Code agent programmatically, with permission modes so it never blocks on a prompt. This is genuinely running Spec Kit as designed, just orchestrated by a backend instead of a human in a terminal:

```ts
import { query } from '@anthropic-ai/claude-agent-sdk';

// 1. scaffold a sandboxed workspace with spec-kit's own CLI
await exec('specify init ./workspace --integration claude-code');

// 2. drive a headless agent through it, streaming into the UI
for await (const message of query({
  prompt: '/specify Build a POS system for a small retail shop...',
  options: { cwd: './workspace', permissionMode: 'acceptEdits' },
})) {
  // stream progress into Specwright's canvas/UI
}

// 3. read back spec.md / plan.md / tasks.md, store in the DB
```
Illustrative shape — verify the exact function signature against current SDK docs before writing real code. Real infra cost: a sandboxed workspace per session, agent-run latency/cost on top of hosting, and a dependency on an external CLI's template structure.

**Working recommendation from the conversation:** A now — cheap, improves interview quality immediately. B baked into schema decisions now — free if planned early, costly retrofit later. C revisited once Specwright needs to actually execute and track work, not just produce documents about it — closer to the full-lifecycle vision than the current three features.

## 6. Connects to existing work

- **Corrected 2026-07-29, against the actual repo:** Ghost AI and Specwright are the same app, not two things to reconcile. Ghost AI was renamed to Specwright brand-only (commit `49afbda`, same GitHub repo via `gh repo rename`), zero behavior change. There was never a separate canvas product — the canvas is and always was this app's own canvas.
- The custom SVG canvas has Select/Hand/marquee tool modes shipped (Specs 30–32). Connector/edge creation is not a remaining gap — it existed from much earlier units and was hardened (a `Handle`/`isConnectable` bug fix) during Spec 32, not built fresh. There is no pending "connector tool" spec; Spec 33 is the architecture interview, unrelated.

## 7. Open questions to keep exploring

- Which pattern (A/B/C) to start with, now that the actual codebase is in view.
- ~~Whether the interview engine should be one system prompt or a multi-agent handoff (BMAD-style)~~ — **already decided, per `context/progress/33-architecture-interview.md`'s "Direction" section:** a multi-agent "Research Fleet" was explicitly considered and deferred as ~15× the token cost of a single-prompt chat, with no payoff for a 2-person internal tool. Project Home already reserves a disabled "Research Fleet" placeholder card for it. Treat as settled; revisit only if that calculus changes.
- **New, not in the original research:** `specwright` is already taken on npm by a same-category competitor — an AI agent that writes PRDs/design briefs/tech specs for Claude Code/Codex/Cursor (found and recorded in `context/progress/2026-07-19-rename-to-specwright.md`, not in this doc's original landscape table). Small today (7 stars, ~62 downloads/mo) but a direct name collision in the same category, not just a spelling clash. The team's own note: must resolve before shipping publicly.
- ~~What the progress-tracker's data model should look like — Linear's state-machine approach (todo → in progress → review → done, with ownership and history) came up as a possible reference point. No longer just hypothetical: `progress-tracker.md` is already ~244KB across 130+ dense prose entries in one chronological file, and is already hard to search.~~ — **addressed.** The file was 244KB in one chronological blob; it is now a ~14KB dashboard whose `## Unit Index` is exactly the keyed table this bullet asked for (`Status` + `Verified` per unit), with each unit's full narrative in its own `context/progress/NN-name.md`. Still open if the team wants ownership and state *history* per unit — the index carries a current state, not a transition log.

## 8. References

- GitHub Spec Kit: https://github.com/github/spec-kit
- BMAD-METHOD: https://github.com/bmad-code-org/BMAD-METHOD
- Claude Agent SDK (headless): https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-headless