# AI Harness Notes

Working notes from a session on porting GitHub Copilot agent modes to Claude Code, and
on what separates prompting from a harness. Concepts are portable; the findings marked
**[specwright]** are repo-specific.

Not an implementation record — this documents tooling and method, so it does not belong
in `context/progress/`.

---

## 1. The levels of complexity

Six levels. The spine is not "more machinery" — each level **moves one more decision
from a human to a system.**

| Level | Unit of control | What you engineer | Who closes the loop |
|---|---|---|---|
| **L0** Prompt engineering | The message | Wording, examples, role framing | Human, every turn |
| **L1** Context engineering | The window | What the model *sees* — retrieval, file layout, doc structure, progressive disclosure | Human, every task |
| **L2** Tool / action engineering | The action space | What the model *can do* — tool design, allowlists, schemas | Human, per session |
| **L3** Orchestration | The task graph | Division of labor, fan-out, sequencing, handoff contracts | Human, per run |
| **L4** Harness | The run | Gates, failure policy, termination, observability | **The system** |
| **L5** Loop | The campaign | Unattended iteration; the harness's verdicts feed back as input | The system, over many runs |

### Failure mode at each level

- **L0** — Works once, doesn't reproduce. Same prompt, different outcome.
- **L1** — Relevant information is present but ignored. Dilution: the more you add, the
  less any single instruction binds.
- **L2** — The model does something it was told not to do, because nothing stopped it.
- **L3** — Coordination overhead exceeds the benefit. The orchestrator becomes the
  bottleneck, or agents hand off malformed work.
- **L4** — Gates too weak to catch real failures, or so noisy they get disabled.
- **L5** — Drift. The system optimizes against the gates rather than the goal.

---

## 2. Two corrections to the intuition

**"Orchestration is one step behind the harness."** True as a *description* of how people
build — orchestration is visible and satisfying, so it gets built first. False as a
*recommendation*. Orchestration without gates is just prompting with extra steps and
more places to fail. **Correct build order inverts it: gates before agents.**

**"The loop is the last step."** No — the loop is the *innermost* thing, present from L0.
There is always a loop: observe → act → observe. What changes across levels is **who
closes it and how long it can run unattended.** At L0 you are the loop. At L5 the system
is.

**L4 is the phase change.** Once something other than the model can say *"no, that
failed,"* you can leave the room. Until then, L5 is not autonomy — it is unsupervised
drift.

---

## 3. What a harness is

A model is a probabilistic function. A harness is the **deterministic machinery around it**
that makes the system reliable even though the component isn't.

The word carries from *test harness* (the fixture that sets up, executes, asserts) and
*eval harness* (`lm-evaluation-harness` — the fixed apparatus that runs a model the same
way every time). Both senses mean the same thing: **the harness is the part that doesn't
vary.** That is what makes results comparable and failures attributable.

Claude Code *is* a harness. Agent definition files are configuration for one.

### The diagnostic

> **If the model ignored every word of your prompt, what would still be true?**

That set is your harness. Everything else is a wish.

### The canonical illustration

A debugger prompt that ends with a required summary field:

```
VERIFIED BY: <command run and its result>
```

**The model writes that line.** A model that actually ran `pnpm build` and one that typed
`VERIFIED BY: pnpm build ✓` without running anything produce byte-identical output. The
transcript cannot distinguish them.

That is a *specified* verification, not a *built* one. The harness version is a hook that
runs the command outside the model's control and blocks on failure.

### Prompt vs. harness

| Prompt | Harness |
|---|---|
| "Never write code while planning" | `tools: Read, Grep, Glob` — no Edit tool exists |
| "Verify the build after changes" | `PostToolUse` hook runs `tsc --noEmit`, exit 2 blocks |
| "Return file assignments in the plan" | JSON Schema forces the shape; invalid output retries |
| "Don't let parallel agents collide" | `isolation: "worktree"` — collision is impossible |
| Degrades with context length | Invariant |
| Unverifiable | Observable, attributable |

**Rule: anything you can enforce, stop prompting for.**

---

## 4. The eight harness components

1. **Context assembly** — deterministic rules for what the model sees
2. **Tool mediation** — what's reachable at all
3. **Control flow** — who runs when, in what order
4. **Verification gates** — automated checks that run regardless of model claims
5. **Failure policy** — what happens when a gate fails (retry / revert / escalate)
6. **Durable state** — artifacts that survive the session
7. **Observability** — can you tell what happened and why
8. **Termination** — when it stops

**#4 is the keystone.** Without it, 1–3 and 5–8 are decoration: everything reduces to the
model self-reporting success.

---

## 5. Global vs. project scope

> **Global agents must *discover*. Project agents may *assume*.**

The test: does it name a path, a script name, or a convention? Then it is project-scoped.
A global planner that says *"read `context/architecture-context.md`"* is broken in every
repo that doesn't have that file. One that says *"find and read this repo's architecture
docs"* works everywhere.

| Global — `~/.claude/` | Project — `<repo>/` |
|---|---|
| `settings.json` — model, effort, permissions, hooks | `.claude/settings.json` — committed, shared |
| `agents/*.md` | `.claude/settings.local.json` — personal, gitignored |
| `skills/` | `.claude/agents/*.md` |
| `CLAUDE.md` | `AGENTS.md` / `CLAUDE.md` |

Project overrides global; more specific wins. **A project agent shadows a global one of
the same name** — so a generic global `coder` can be replaced per-repo with one that knows
the local standards, under the same invocation.

### The scoping trap: gates are project-scoped

Putting a `tsc --noEmit` gate in global settings is tempting — one config, every repo
protected. Don't. It depends on three repo facts: the package runner, a root
`tsconfig.json`, and TypeScript being present at all. Fired across a mixed set of
projects it errors on every edit in the ones without TypeScript.

**A gate that fails for the wrong reason is worse than no gate, because it gets disabled.**

Either scope it to the project, or guard it globally: `[ -f tsconfig.json ] || exit 0`.

Corollary in the other direction: project-specific entries (absolute paths, stale PIDs)
accumulating in *global* permissions is the same mistake inverted, at the layer where
over-granting actually costs something.

---

## 6. Porting Copilot agent modes → Claude Code

Copilot: `~/Library/Application Support/Code/User/prompts/Name.agent.md`
Claude Code: `~/.claude/agents/name.md` or `<repo>/.claude/agents/name.md`

Mechanical differences:

- **Drop the `.agent.md` suffix** — `planner.md`, not `Planner.agent.md`
- **`model:`** takes one value: `opus` / `sonnet` / `haiku` / `fable` / `inherit`. Not an
  array. `inherit` is a trap — it silently promotes a Sonnet-intended agent to Opus when
  the main session is Opus. **Pin explicitly.**
- **`tools:`** is a bare comma-separated list of Claude Code tool names, not a quoted
  array. `execute` → `Bash`. MCP tools use full `mcp__server__tool` names. No `vscode`
  equivalent.
- **`#context7` / `#fetch`** don't exist. Substitute repo-local docs first, then WebFetch.
- **The body below `---` carries over unchanged** — it's just a system prompt.

### An Orchestrator cannot be a subagent

Subagents don't get the Agent tool, so an orchestrator subagent is a dead end — it
receives a task and has nothing to delegate to. **The main session is the orchestrator.**

Orchestrator content therefore belongs in `CLAUDE.md` / `AGENTS.md`. This is a promotion:
routing rules in `CLAUDE.md` apply to every turn, rather than only when the orchestrator
is remembered.

### Two rules worth dropping on the way over

- **"Always call Planner first, no matter how simple"** — a full agent round-trip to fix a
  typo. This rule exists to compensate for a weaker orchestrator; it's not a constraint
  worth importing. Make it threshold-based: plan when work spans multiple files or touches
  architecture.
- **"Prefer full-file rewrites over micro-edits"** — an artifact of a less reliable edit
  tool. Claude Code's `Edit` is exact string replacement that fails loudly on mismatch.
  Rewrites cost 10–50× the tokens and turn a 3-line diff into an unreviewable blob.
  **Invert it.**

Also drop the toolless-orchestrator design. The main loop reading one file to route
correctly is far cheaper than a subagent round-trip that returns a summary of that file.

---

## 7. The interface bug worth remembering

A generic class of L3 failure, found in a real pair of agent files:

- The **Orchestrator** said: *"The Planner's response includes file assignments for each
  step. Use these to determine parallelization."*
- The **Planner's** documented output format was: summary, ordered steps, edge cases, open
  questions. **No file assignments. No dependency graph.**

The orchestrator's entire parallelization algorithm depended on a field the planner never
promised to emit. So either it invented the file lists — violating its own "never write
implementation details" rule — or it silently serialized everything.

**Not a wording problem. A missing interface.** Two prose documents shaking hands is not a
contract.

The fix is L2/L4, not L0: a **JSON Schema** on the planner's output *forces* the tool call
and validates the shape, with automatic retry on mismatch. The handshake becomes a
validated type.

**General lesson: when agent A consumes agent B's output, that output needs a schema, not
a described format.**

---

## 8. Critique patterns worth reusing

Recurring flaws found across five agent definitions:

1. **Prose contradicted by tools** — "You do NOT write code" while granting `edit`. If the
   constraint is real, express it in the tool list.
2. **Asymmetric rigor** — the debugger required 2–3 evaluated alternatives with trade-offs;
   the planner required one unargued plan. Backwards: architecture decisions are harder to
   reverse than bug fixes, so they deserve *more* comparison.
3. **Unsatisfiable instructions** — "write a test that would have caught this bug" in a
   repo with no test framework. The fallback branch is the only one that ever runs.
4. **Duplicated standards** — an agent restating rules that already live in a repo doc.
   Two copies drift. **Reference, don't restate.**
5. **Redundant discovery** — a designer re-deriving design tokens from config every run
   when they're already documented. Wasteful, and risks the spec diverging from the
   documented truth. Better: read the doc, spot-check the code, **flag divergence as a
   finding.**
6. **Dead weight from other projects** — WinUI/WPF guidance in a Next.js repo.
7. **No verification step** — the coder had "favor testable behavior" and never ran a
   command.
8. **Missing scope fence** — one agent said "only design what was explicitly requested";
   the others had no equivalent, so they sprawl.

---

## 9. Claude Code mechanisms by level

| Level | Mechanism |
|---|---|
| L1 Context | `CLAUDE.md` / `AGENTS.md` auto-load, `@file` imports, per-agent system prompts, skills (progressive disclosure) |
| L2 Tools | `tools:` frontmatter, `permissions` in `settings.json`, JSON Schema on structured output |
| L3 Orchestration | `Agent` tool (model-decided routing) or `Workflow` tool (deterministic JS: `pipeline()`, `parallel()`, loops) |
| L4 Harness | **Hooks** (`PostToolUse`, `Stop`) — exit code 2 blocks and feeds stderr back as an error that must be addressed |
| L5 Loop | Stop hooks as termination conditions, loop-until-dry patterns, scheduled runs |

**Model decides *what*; the script decides *when*.** Dependency analysis and phase batching
are graph problems with correct answers — give them to code, not to a probabilistic
function. Parallelization rules become `pipeline()`. File-conflict-prevention strategies
become `isolation: "worktree"`.

### When new configuration takes effect

Verified empirically on 2026-07-30, in the session that wrote both:

| Config | Activation |
|---|---|
| `settings.json` hooks | **Hot-loaded** — a hook written mid-session fires on the next matching tool call |
| `agents/*.md` | **Snapshotted at session start** — a new agent is `not found` until restart |

This asymmetry is worth knowing when building a harness, because it inverts the obvious
assumption. The gate you just wrote is already protecting you; the agent you just wrote is not
callable yet. Test a gate immediately, restart before testing an agent.

---

## 10. **[specwright]** Repo facts and current standing

Verified by inspection:

- Next.js **16.2.10**; `tsconfig.json` has `strict: true`
- Scripts: `dev`, `build`, `lint`, `simulate:cursor`, `trigger:dev`, `trigger:deploy`
- **No test framework** — no vitest, jest, playwright, or testing-library. Available gates
  are `eslint` and `tsc`/`build` only.
- ~~**No hooks configured**, globally or in-repo. No project `settings.json` exists.~~ — built
  2026-07-30, see [`progress/2026-07-30-agent-harness.md`](progress/2026-07-30-agent-harness.md).
- ~~No global `~/.claude/CLAUDE.md`.~~ — written 2026-07-30.
- `AGENTS.md` directs reading ~660 lines across six `context/*.md` files before any
  implementation or architectural decision — one generic prompt serving every task type.

### Level standing

As of 2026-07-30, after the build recorded in
[`progress/2026-07-30-agent-harness.md`](progress/2026-07-30-agent-harness.md):

| Level | Status |
|---|---|
| L0 Prompt | ✅ Solid |
| L1 Context | ✅ Strong — the `context/*.md` set is better than most |
| L2 Tools | ✅ Closed — `planner` / `researcher` / `designer` have no `Edit`, `Write`, or `Bash` |
| L3 Orchestration | ⚠️ Contract written, not yet validated — the planner now promises per-step `files` + `dependsOn`, but only `Workflow`'s `agent()` can enforce a schema (§7) |
| L4 Harness | ✅ `tsc` on every TS edit (`PostToolUse`, exit 2) and `lint` on stop, both guarded |
| L5 Loop | — not attempted; now possible |

**Strongest existing component: durable state.** `context/progress/NN-name.md` plus a unit
index in `progress-tracker.md` is real harness state, and better than most setups.

**Known drift** (visible in git log — evidence that L1 prose alone doesn't hold): the
progress-recording convention has needed correction more than once
(`docs: point the workflow conventions at context/progress/`,
`docs: correct rename entry and record the name-collision risk`). This is the case for a
mechanical `context-recorder` rather than a paragraph in `AGENTS.md`.

---

## 11. Action plan

Ordered by reliability gained per unit of effort. **Gates first** — agents without gates
are prompts with extra steps.

Items 1–6 were built on 2026-07-30; the detail, deviations, and verification are in
[`progress/2026-07-30-agent-harness.md`](progress/2026-07-30-agent-harness.md).

### Project — specwright

1. ✅ `.claude/settings.json` — `PostToolUse` on `Edit|Write` → `tsc --noEmit`; `Stop` → `lint`.
   Both live in `.claude/hooks/*.sh` so they can guard; every guard exits 0, never non-zero.
2. ✅ `.claude/agents/coder.md` — references `code-standards.md`, does not restate it
3. ✅ `.claude/agents/designer.md` — reads `ui-context.md`, read-only, flags divergence
4. ✅ `.claude/agents/context-recorder.md` — owns the `context/progress/` ritual (`haiku`)

### Global

5. ✅ `~/.claude/CLAUDE.md` — routing rules (error fast-path, plan-threshold, never-tell-HOW)
   plus model routing
6. ✅ `~/.claude/agents/{planner,debugger,researcher,coder,designer}.md` — discovery-based, no
   hardcoded paths. `coder` and `designer` were added here too, rather than staying project-only,
   so every repo gets them; specwright's shadow them by name.
7. ⚠️ Partial — `~/.claude/schemas/plan.schema.json` exists and the planner's output format
   requires `files` + `dependsOn`, but the `Agent` tool takes no `schema` parameter. Only
   `Workflow`'s `agent()` enforces one, so today the shape is described, not validated. The schema
   file makes that upgrade a drop-in.
8. ❌ Not done — clean project-specific entries out of global `permissions` (absolute `darbs`
   paths, a stale `kill 76551`). Deleting from a global config needs an explicit decision.

### Next, in order

- Route one real unit through `planner` → `designer` → `coder` → `context-recorder` and see where
  the handoffs actually leak. The contracts are untested against live work.
- Watch whether the `tsc` gate's latency on every TS write is tolerable in practice. If not, the
  fallback is `Stop`-only rather than a weaker gate.
- A test framework is the largest remaining gap. `tsc` and `lint` cannot verify behaviour, which
  is why so many index rows read `structural`.

### Model routing

Pin explicitly; never `inherit`.

| Agent | Model |
|---|---|
| `planner` | `opus` |
| `coder` | `opus` |
| `debugger` | `opus` |
| `designer` | `sonnet` |
| `researcher` | `sonnet` |
| `context-recorder` | `haiku` |

`fable` is never a harness default — not writing it is the entire mechanism.

---

## 12. The limit

A harness improves **consistency and enforcement**, not raw capability. It won't make the
model smarter about an architecture; the quality of `architecture-context.md` does that.

Real costs: subagents return conclusions, not full context — so work where the whole
picture must be held in one place (bug hunting across files under active edit) is *worse*
delegated. And gates add latency to every write.

Finally: **the model can build the harness but cannot be it.** The point is a system that
holds when the model inside it drifts at turn 80, or is over-confident, or skips a step.
The model is the component being harnessed, not the guarantor — which is why the tool-list
and hook layers matter more than any prose in the agent files, however good the prose gets.
