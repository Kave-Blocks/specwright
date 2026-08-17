# Design route room scoping

_2026-08-17 — from [`context/plans/design-route-room-scoping.md`](../plans/design-route-room-scoping.md) (now deleted). Spans units 22 and 23, so it is dated rather than owned by either._

## What was reachable before

`POST /api/ai/design` took **both** `projectId` and `roomId` from the request body,
access-checked the first, and handed the second to the task unchecked:

```ts
const project = await getAccessibleProject(projectId, identity);   // checked projectId
await tasks.trigger<typeof designAgent>("design-agent", { prompt, roomId });   // used roomId
```

So a request carrying **a `projectId` the caller can access and a `roomId` they cannot** passed
the check and mutated somebody else's canvas. Three things made it matter:

1. **Room ids are not secret.** The room id *is* the project id and it sits in the URL bar at
   `/editor/{roomId}`, so anyone ever shown the project knows it permanently — a removed
   collaborator most of all, which is the realistic threat model rather than a guessed cuid.
2. **Nothing was backstopping the route.** `trigger/design-agent.ts` mutates through
   `mutateFlow({ client, roomId })` using the secret-key `@liveblocks/node` client
   (`lib/liveblocks.ts`), which no room-level ACL applies to. The handler's access check *was*
   the entire authorization boundary.
3. **The design agent is not filtered.** Unlike `canvas-sync`, it may emit `deleteNode`
   (`lib/design-agent/plan.ts`), and `applyDesignPlan` cascades every edge attached to a deleted
   node (`lib/design-agent/apply.ts`). The reachable action was therefore not "add unwanted nodes
   to a stranger's diagram" but "erase it", with a prompt as the instruction.

Two effects beyond nodes and edges, found while fixing rather than in the plan: the task writes AI
presence and status into the room *before* `mutateFlow` is reached
(`ensureAiStatusFeed`/`setAiPresence`/`announceAiStatus`), so even a run whose model call failed
left a trace in the victim's live session; and the `TaskRun` audit row was written with the body's
`projectId`, filing the cross-room write under the innocent project.

The same shape does **not** exist on the other AI routes, which is worth stating so the fix is not
over-applied: `/api/ai/spec` and `/api/ai/change` both resolve access *from* `roomId`
(`getAccessibleProject(roomId, identity)`), so neither has a second unchecked id. `/api/ai/canvas`
(unit 43) already derived the room from `project.id` — the contrast that made this visible.

## What changed

1. **`app/api/ai/design/route.ts`** — `roomId` is no longer read from the body. The task receives
   `roomId: project.id`, the `TaskRun` row records `projectId: project.id`, and the required-field
   check and its 400 message drop `roomId` with it (`"prompt and projectId are required"`). The
   handler comment states *why* the room is not accepted, so the next route mirroring this one
   inherits the rule instead of the hole.
2. **`hooks/use-design-submit.ts`** — stopped sending `roomId`. It was the only caller and was
   sending the project id in both fields, so this is a no-op for every real request.
3. **`trigger/design-agent.ts` — unchanged**, deliberately. Its payload is still `{ prompt, roomId }`;
   what changed is only who is trusted to supply the room. A task handed a room id it must not
   re-derive is the right boundary, and it keeps the payload symmetric with `canvas-sync`.

Backward compatibility was not a concern: a body that still carries `roomId` has it ignored, which
is the desired outcome for exactly the requests this closes.

## What was actually asserted

New `scripts/verify-design-room-scoping.ts` (`npm run verify:design-room -- all`), an **HTTP-layer**
verifier modelled on `verify-change-application-http.ts`. It seeds one project the caller owns and
one owned by a synthetic id they have no path to, then asserts on **the room the run received** —
read back from Trigger.dev with `runs.retrieve`, not inferred from the response code. Every run it
starts is cancelled once its payload has been read, so no model call is spent.

**16 checks pass** against the dev server (2026-08-17):

- `forged` — `projectId` = the accessible project, `roomId` = the other: answers **201** (it is
  supposed to succeed), the run carries the caller's own room and not the one the body named, and
  the other project has **0** `TaskRun` rows.
- `legitimate` — a body with no `roomId` at all answers 201 and targets the project's own room.
- `denied` — an unreachable `projectId` answers 404 and starts nothing.
- `invalid` — no `projectId` answers 400, the message no longer demands `roomId`, and a body
  carrying *only* `roomId` is still a 400.
- `signed-out` — 401, no run, no `TaskRun` row against either project.

**The verifier was proved to discriminate.** The route was temporarily reverted to the pre-fix
behaviour and the `forged` phase re-run: it failed on exactly the two room assertions, with the run
observed targeting the *other* project's room. That is a live demonstration of the vulnerability,
not an argument that it existed. The fix was then restored and all 16 checks re-run clean, with
`tsc --noEmit` and `eslint` clean.

Asserting on the room rather than the status code was the plan's instruction and it was the right
one: a test that only checked for a 4xx would have passed a "fix" that broke the legitimate path
too.

**Not proved here:** anything the task then does with the room (no plan is generated and no
Liveblocks room is touched), and anything in the browser.

## One harness change worth noting

The sibling HTTP verifiers can only *borrow* a Clerk session that a human already created by
signing in, which makes them unrunnable in a headless checkout — and a verification that needs a
person to log in first is one that quietly stops being run. This script borrows an active session
when one exists and otherwise **mints one through the Clerk Backend API** (`POST /sessions`),
revoking it in a `finally`. The existing scripts were left alone.
