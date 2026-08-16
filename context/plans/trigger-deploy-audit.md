# Trigger.dev Deploy Audit — Do The Three Tasks Exist In Production?

**Closes:** an unknown, not a known gap
**Blocked on:** nothing
**Effort:** ~15 minutes

## What the gap is

The project has three durable tasks:

| Task | Added by | Powers |
| --- | --- | --- |
| `trigger/design-agent.ts` | unit 23 | AI canvas generation |
| `trigger/generate-spec.ts` | unit 27 | Spec generation |
| `trigger/propose-change.ts` | unit 40 | Change proposals |

Every one of them has been exercised under `npm run trigger:dev`, which runs a **local** worker.
**Nothing in `context/progress/` records a `npm run trigger:deploy` for any of them.**

That does not mean they are undeployed — it means nobody wrote it down, so nobody knows. This
plan resolves an unknown rather than fixing a confirmed fault, which is why it is cheap and worth
doing before it becomes a production surprise.

## Why it matters

A task that exists in the repo but not on Trigger.dev fails at **trigger time**, not at build
time. `npm run build` passes, the route returns a run id, the UI enters its busy state, and the
run never starts. Unit 40's `propose-change` is the newest and so the most likely to be missing —
and the change flow is the one units 40 and 41 just built the whole product surface for.

Unit 41's apply path is unaffected: it makes **no** model call and runs entirely in the request
handler, so applying a change works whether or not any task is deployed. Only *proposing* one
needs the worker.

## Steps

1. **Check what is actually deployed.** From the repo root:

   ```bash
   npx trigger whoami
   npx trigger deploy --dry-run
   ```

   `whoami` confirms which project ref and environment the CLI is pointed at — worth reading, as
   a deploy against the wrong project is the failure mode that looks like success.

2. **Read the task list in the Trigger.dev dashboard** for the production environment and compare
   against the three files above. The MCP tooling can also answer this (`list_deploys`,
   `get_current_worker`) if you would rather not leave the terminal.

3. **If any task is missing, deploy all three together:**

   ```bash
   npm run trigger:deploy
   ```

   Deploy is per-worker, not per-task, so this ships all three from the current tree. That is
   correct — they are all committed and all passing their gates.

4. **Confirm the versions agree.** `context/code-standards.md` requires `@trigger.dev/sdk`,
   `@trigger.dev/build`, and the `trigger.dev` CLI to sit on the **same exact version**; a CLI on
   a different major breaks both `dev` and `deploy`.

   ```bash
   node -e "const p=require('./package.json');console.log({sdk:p.dependencies['@trigger.dev/sdk'],build:p.devDependencies['@trigger.dev/build'],cli:p.devDependencies['trigger.dev']})"
   ```

   All three must match exactly, with no caret. If they drift, upgrade all three in one commit
   using the pinned form in `context/code-standards.md` — do not bump one.

5. **Smoke-test the newest task against the deployed worker.** With `trigger:dev` **stopped** so
   the local worker cannot serve the run, submit a change request from
   `/editor/{projectId}/changes` on a project that has a spec. The run should start and complete.
   If it hangs in "Proposing…", the task is not deployed.

## What to do with the result

1. Record the finding — including "all three were already deployed", if that is the answer, since
   the whole point is to remove the unknown — in
   `context/progress/YYYY-MM-DD-trigger-deploy-audit.md`.
2. Add a row to `### Other work` in `context/progress-tracker.md`.
3. If the deploy step was genuinely needed, add a line to `context/ai-workflow-rules.md` under
   `## Before Moving To The Next Unit` so it stops being an unknown for the next task:

   ```markdown
   6. If the unit added or changed a file under `trigger/`, `npm run trigger:deploy` has run and
      the progress file says so.
   ```

4. Delete this plan and its row in [`README.md`](README.md).
