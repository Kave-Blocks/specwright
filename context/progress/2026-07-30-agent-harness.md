# Agent Harness — Gates and Agent Definitions

Acted on the action plan in [`context/ai-harness-notes.md`](../ai-harness-notes.md) §11. Two
layers went in: **verification gates for this repo** (the L4 hole — previously nothing outside the
model could say "that failed"), and **agent definitions** split between global discovery-based
versions and specwright-specific ones that shadow them.

Gates first, deliberately. Agents without gates are prompts with extra steps.

## Gates — `.claude/settings.json` + `.claude/hooks/`

Two hooks, both real scripts rather than inline commands so they can guard properly:

- **[`.claude/hooks/typecheck.sh`](../../.claude/hooks/typecheck.sh)** — `PostToolUse` on
  `Edit|Write|NotebookEdit`. Extracts `tool_input.file_path` from the hook payload, skips unless
  it is `.ts`/`.tsx`/`.mts`/`.cts`, then runs `node_modules/.bin/tsc --noEmit` and **exits 2** on
  failure, which blocks and feeds the errors back as work that must be addressed.
- **[`.claude/hooks/lint.sh`](../../.claude/hooks/lint.sh)** — `Stop`. Runs `npm run lint` and
  exits 2 on failure. Guards on `stop_hook_active`, which is load-bearing: without it, a lint
  error the model cannot fix becomes an infinite stop/continue loop.

Every other guard in both scripts exits **0** (pass), never non-zero: missing `tsconfig.json`,
missing `node_modules/.bin/tsc` or `eslint`, no `lint` script, unparseable payload. A gate that
fails for a reason unrelated to the edit gets disabled, which is worse than no gate.

Both use `$CLAUDE_PROJECT_DIR` rather than a hardcoded path, so they survive being run from a
subdirectory.

### Verified

Baseline first: `npx tsc --noEmit` and `npm run lint` both exit 0 on the current tree, so neither
gate fires spuriously. Then five cases driven by piping hook payloads into the scripts directly:

| Case | Expected | Result |
| --- | --- | --- |
| typecheck, `.md` edit | skip, exit 0 | ✅ |
| typecheck, clean `.ts` edit | pass, exit 0 | ✅ |
| typecheck, `.ts` with a deliberate `TS2322` | **block, exit 2** | ✅ blocked, error echoed |
| lint, `stop_hook_active: true` | skip, exit 0 | ✅ (no loop) |
| lint, normal stop | pass, exit 0 | ✅ |

The block case used a throwaway `__gate_probe.ts` removed in the same command; confirmed gone
afterwards.

**Then observed firing live**, which is the verification that actually matters: a `Write` of
`__harness-probe.ts` containing a deliberate `TS2322` came back as a `PostToolUse` blocking error
carrying tsc's real output. The probe was deleted and `tsc` confirmed clean again. The gate runs at
the tool layer, so it applies identically to every agent and to the main session — proving it
blocks one write proves it blocks all of them.

Incidental finding worth keeping, recorded in the notes' §9: **`settings.json` hooks are hot-loaded
mid-session, but `agents/*.md` are snapshotted at session start.** The gates were live immediately;
`coder` returned `Agent type 'coder' not found` in the same session. The obvious assumption is
backwards. Agent definitions therefore remain **unverified against live work** until a restart —
test a gate immediately, restart before testing an agent.

## Agents

Split along the rule in the notes' §5: **global agents must discover, project agents may assume.**

**Global — `~/.claude/agents/`** (work in any repo; hardcode no paths):

| Agent | Model | Tools |
| --- | --- | --- |
| `planner` | `opus` | read-only |
| `debugger` | `opus` | mutating |
| `researcher` | `sonnet` | read-only |
| `coder` | `opus` | mutating |
| `designer` | `sonnet` | read-only |
| `browser-qa` | `sonnet` | Playwright MCP + `Bash`/`Skill`, no `Edit`/`Write` |

`browser-qa` was not in the notes' plan. It exists for a cost reason: **a tool result lands in
whichever context made the call and is re-sent on every later turn there.** Browser snapshots and
screenshots are bulky, so driving the browser from an Opus main session pays for them repeatedly.
Pinned to Sonnet in a subagent, the bulk stays in Sonnet's context and only a text report returns.
`~/.claude/CLAUDE.md` now routes all browser verification there and states the general rule.

**Project — `.claude/agents/`** (shadow the global ones of the same name):

| Agent | Model | Notes |
| --- | --- | --- |
| `coder` | `opus` | Names `code-standards.md` / `architecture-context.md`, the npm scripts, the absence of a test framework, and the two gates |
| `designer` | `sonnet` | Reads `ui-context.md` as the source of truth; read-only |
| `context-recorder` | `haiku` | Owns this ritual — `_TEMPLATE.md` + `### Recording Progress` |

Also added `~/.claude/CLAUDE.md` (routing rules, the plan threshold, the error fast-path,
WHAT-not-HOW delegation, model pinning) and `~/.claude/schemas/plan.schema.json`.

### What the tool lists fix

The notes recorded L2 as "leaky — read-only agents granted edit access". Closed structurally:
`planner`, `researcher`, and both `designer`s have no `Edit`, `Write`, or `Bash`. "You do not
write code" is now a fact about the tool list rather than a sentence in a prompt.

Validated all eight definitions mechanically — `name` matches filename, `model` is a legal single
value and never `inherit`, every tool name is real, `description` is substantive enough to route
on. All eight pass.

### Deviations from the notes' plan

- **`coder` and `designer` were planned as project-only.** Written as global *and* project pairs
  instead, because the intent was agents usable in every project. The global ones discover the
  repo's standards docs; specwright's shadow them by name with the real paths. This is the
  shadowing mechanism §5 describes, used deliberately.
- **A `researcher` was added** to the global set, which the plan listed but the Copilot source had
  no equivalent of.
- **The plan schema is documented, not enforced.** §7's interface bug (an orchestrator consuming
  `file assignments` the planner never promised) is fixed at the contract level: the planner's
  output format now requires per-step `files` and `dependsOn`, and the same shape is written to
  `~/.claude/schemas/plan.schema.json`. But the `Agent` tool takes no `schema` parameter — only
  `Workflow`'s `agent()` does. Until a plan runs through a Workflow, the shape is *described*, not
  *validated*. The schema file exists so that upgrade is a drop-in.

### Not done

- ~~**Global `permissions` cleanup** (§11 item 8)~~ — **done.** Removed six entries that could
  never match again (a disconnected `mcp__magic__*` server, four `darbs`-absolute one-offs, a dead
  `kill 76551`) and repaired `pkill -f "ms-playwright-mcp/mcp-chrome-<hash>"` to the hash-agnostic
  `pkill -f ms-playwright-mcp:*`. `Bash(npx playwright *)` was kept at the user's explicit request,
  and four more Playwright MCP tools were allowlisted so `browser-qa` never prompts. Net 26 → 23,
  with the junk gone and the coverage deliberate.
- **Porting the Copilot `Orchestrator`** — correctly has no destination. Subagents get no `Agent`
  tool, so an orchestrator subagent has nothing to delegate to; its routing content became
  `~/.claude/CLAUDE.md` instead. Two of its rules were dropped on purpose: "always call Planner
  first" (a full round-trip to fix a typo) and "prefer full-file rewrites over micro-edits" (an
  artifact of a less reliable edit tool — inverted).
- **No L5 loop.** Out of scope, and it only becomes meaningful now that L4 exists.
