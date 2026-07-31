# Architecture Context

## Stack

| Layer            | Technology              | Role                                                           |
| ---------------- | ----------------------- | -------------------------------------------------------------- |
| Framework        | Next.js 16 + TypeScript | Full-stack app with server/client boundaries                   |
| UI               | Tailwind + shadcn/ui    | Component composition and styling                              |
| Auth             | Clerk                   | User identity and route protection                             |
| Database         | Prisma + PostgreSQL     | Relational metadata: projects, collaborators, specs, build units, task runs |
| Canvas           | Liveblocks + React Flow | Real-time collaborative canvas, presence, and cursors          |
| Background tasks | Trigger.dev             | Durable AI generation workflows                                |
| Artifact storage | Vercel Blob             | Canvas snapshots and generated Markdown specs                  |

## System Boundaries

- `app/api` — Authenticated request handlers: input validation, ownership checks, task triggering, and persistence.
- `trigger` — Long-running background jobs: AI design generation and spec generation.
- `lib` — Shared infrastructure: Prisma client, access control helpers, and utilities.
- `components` — UI composition: canvas surfaces, sidebars, dialogs, and interactive elements.
- `prisma` — Database schema and generated client output.
- `data` — Legacy local directory. Not used for new artifacts.

## Storage Model

- **Database**: metadata, ownership, relationships, and task run records.
- **Vercel Blob**: generated artifacts — canvas snapshots at `canvas/{projectId}.json` and specs at `specs/{projectId}/{specId}.md`.
- Project records, spec records, build unit records, and task run records belong in PostgreSQL.
- Canvas content and Markdown output are stored in and retrieved from Vercel Blob.
- The blob URL is stored in the database (`canvasJsonPath`, `filePath`) as the reference to the artifact.
- **Specs are versioned per project.** `ProjectSpec.version` is a small integer, unique within a project (`@@unique([projectId, version])`), and is how a spec is named everywhere a person sees it — "Version 3", never a spec id. It is assigned once and is never reused or renumbered, so a version keeps naming the thing people talked about. The number comes from the `Project.nextSpecVersion` counter, incremented and read in the same transaction as the insert (`saveProjectSpec`) — the same shape and the same reason as `nextBuildUnitSequence` below, so that two members pressing Generate Spec at the same moment get two versions rather than one collision. The unique constraint is the last line of defence behind that counter, not the mechanism. The Blob upload stays *outside* the transaction, so a failed upload burns no version.
- There is deliberately **no spec-to-spec supersession link**. While every spec is a full regeneration from the canvas, version N supersedes N−1 by definition, and a `supersedesId` would store nothing that the numbers do not already say. The general rule: *add a column that records a fact already true, not one that anticipates a relationship.*
- **A build unit records which spec produced it**, via `ProjectBuildUnit.specId` with **`onDelete: SetNull`** — never `Cascade`. A build unit is human-owned tracked work, so removing a spec must never remove a unit; losing the lineage is the acceptable loss, losing the unit is not. `source` stays alongside `specId` because it is what survives the null-out: a unit orphaned by a removed spec still knows it was not hand-typed.
- **A build unit also records the change that produced it and the change that replaced it**, via `changeId` and `supersededByChangeId`, both `onDelete: SetNull` for the identical reason. No route deletes a `ProjectChange` today (discarding sets a status and keeps the row), so this is a **database-level guarantee rather than a reachable path** — stated so a future delete route inherits the rule instead of rediscovering it.
- **Build units are the one project resource with no second layer.** `ProjectBuildUnit` rows are the whole of the storage: no Blob half, because a unit is a handful of short fields rather than a generated artifact, and no realtime channel, because a unit is edited deliberately by one person at a time and read back on load. A spec is produced once and dereferenced; canvas content is co-edited continuously; a build unit is neither.

## Auth and Collaboration Model

- Every project has a single owner (Clerk user ID).
- Projects can include additional collaborators.
- Only authenticated users can access protected routes.
- Only the owner or a collaborator can mutate project resources.
- Liveblocks room tokens are issued only after verifying project membership.

## Realtime Model

- One Liveblocks room per project; the room ID is the project ID.
- The editor opens a single room connection, shared by the canvas and the AI sidebar — there is no second realtime channel.
- Realtime state uses Liveblocks primitives only: Storage for canvas content, presence for cursors and AI activity, and feeds for message streams.
- Feeds are room-scoped and single-purpose. `ai-status-feed` carries AI progress; `ai-chat` carries collaborative chat. Producers and readers never mix the two.
- Feed payloads are untrusted input (they cross the network from other clients) and are validated before they are rendered.

## Starter System Designs

- Prebuilt templates are static canvas snapshots stored in the codebase.
- Templates are loaded into the active Liveblocks room when a user imports one.
- Import can occur on canvas creation or from within the editor at any time.
- Template data follows the same node/edge schema as user-created canvas content.
- Templates do not require a separate database record; they are resolved by template ID at import time.

## AI Generation Model

### Design Generation

- Input: user prompt, project context, and current canvas state.
- Execution: durable background task via Trigger.dev.
- Output: structured node and edge updates written into the shared Liveblocks room.

### Spec Generation

- Input: current canvas graph, the room's chat history, and the project's persisted Discovery brief (`Project.architectureBrief`).
- The brief is **read server-side by the task** from the already access-checked `projectId`, never accepted in the request body — the same rule `projectId` itself follows. It reaches the model as its own labeled prompt block, kept separate from the chat history, and grounds the spec's `## Tech Stack` section.
- Execution: durable background task via Trigger.dev.
- Progress is tracked on the run's own metadata, not on a room feed: a spec is written for the person who requested it, whereas design generation mutates the shared canvas and so broadcasts to everyone.
- Output: a Markdown technical spec returned as the task output.
- The task also persists the spec before it finishes: the Markdown is uploaded to Vercel Blob and a `ProjectSpec` row records the blob URL against the project. Persisting belongs to the task, not a request handler — it is the only place that runs once a spec exists without a client having to stay on the page.
- The run's metadata carries the resulting `specId` (never the blob URL), which is what a caller passes to the download route.

### Change Proposal Generation

- Input: the change request, the project's current spec Markdown, its `architectureBrief`, the canvas graph, and its build units as `key` + title + summary + status. All read **server-side** from the already access-checked `projectId` — never accepted from a request body.
- Execution: durable background task via Trigger.dev (`propose-change`).
- Output: a **validated object** (not prose) — a summary, an architecture delta expressed as added/modified/removed, the affected existing units, proposed new units, and open questions. Persisted from inside the task, as spec generation is.
- The delta is expressed *as a delta* rather than as a restated system: a proposal is a change against a known base, so restating the whole would bury the change and go stale the moment the base moved.

### Spec Retrieval

- Two routes, both behind project membership:
  - `GET /api/projects/{projectId}/specs` lists a project's specs, newest first — **metadata only** (`id`, `version`, `filename`, `createdAt`). Ordering stays by `createdAt`, not `version`: versions ascend with creation, so ordering by version would produce the same list by a less obvious route, and `@@index([projectId, createdAt])` already serves this one.
  - `GET /api/projects/{projectId}/specs/{specId}/download` returns one spec's Markdown.
- The download route proves project membership, then proves the spec belongs to that project, and only then dereferences the blob and streams it as a Markdown attachment.
- It is also the **only** way a client reads spec content — the preview fetches the same route and reads the body as text. `Content-Disposition: attachment` governs a browser navigation, not a `fetch`, so one route serves both without a second endpoint.
- Blob URLs are never returned to a client. `ProjectSpec.filePath` is never selected into a response; the listing derives its `filename` from the **version** instead (`spec-v3.md`), which is server-assigned and numeric and so is as safe in a `Content-Disposition` header as the id was. The store is private, so a URL is not fetchable without the SDK's credentials — but access is enforced at the route regardless, not by URL secrecy.
- Spec content is never held in long-lived frontend state: the preview fetches it on open and drops it on close.

### Run Ownership

- Triggering an AI task records a `TaskRun` (run id, project id, user id).
- A realtime run token is issued only to the user the `TaskRun` belongs to.
- Project access is resolved from the authenticated user and the room id. A client-supplied project id is never trusted.

## Build Units

A project keeps an ordered list of build units — the pieces of work it intends to implement, each with a status and a verification level. The vocabularies mirror the `Status` and `Verified` columns of `context/progress-tracker.md`'s `## Unit Index`; that table is the source of the values, so a new member belongs there first.

- Two routes, both behind project membership:
  - `/api/projects/{projectId}/build-units` — `GET` lists a project's units in build order, `POST` creates one.
  - `/api/projects/{projectId}/build-units/{unitId}` — `PATCH` changes a unit's title, summary, status, or verification; `DELETE` removes it.
- Both use `withProjectMember`, not `withProjectOwner`: a build unit is project *content*, like the canvas and the architecture brief, not project *lifecycle*. A collaborator who is not the owner can add a unit and change its status.
- Every read and write is scoped to the `project.id` the guard resolved, never the raw path param, and every single-unit write is scoped to `{ id: unitId, projectId }` — which is what stops a unit id from another project being reachable through a project the caller does belong to.
- `status`, `verified`, and `sequence` are **human-owned**. No automatic producer may write them — not the spec generator, not an importer, not a backfill. A producer may add a unit that does not exist yet and must otherwise leave the row alone, because those three columns are a team's own record of what they have actually built.
- **Supersession is a third axis, not a status.** `BuildUnitStatus` has no `SUPERSEDED` member and may never gain one. `supersededByChangeId` is orthogonal to both `status` and `verified`, exactly as those two are orthogonal to each other: a unit can read `shipped` / `browser` / superseded all at once and each is true — it was built, it was browser-verified, and a later change has since replaced it. Folding supersession into `status` would break the human-owned rule above *and* overwrite `shipped`, destroying the record of what was actually built. Applying a change is the only thing that writes the column; a person may **clear** it and may never set it, because setting it needs a change to point at.
- `key` is the natural match key an automatic producer matches against: derived from the title, unique per project (`@@unique([projectId, key])`), and server-side only — it is never selected into a response, the same discipline `ProjectSpec.filePath` follows and the reason lineage travels as the source spec's `specVersion` rather than its `specId`. Renaming a unit re-derives it, so a rename is how a person makes an existing unit match what a spec will call it.
- **Gaps in `sequence` are correct**, not damage to repair. A number is never reused after a delete, so a unit keeps the number people referred to it by. Nothing renumbers or compacts the column.
- The next number comes from the `Project.nextBuildUnitSequence` counter, incremented and read in the same transaction as the insert — not derived from `max(sequence) + 1`, which reuses a number once the highest unit is deleted and lets two members creating a unit at the same moment collide on it.

## Change Proposals

A member describes a change in plain English against a project that already has a spec, and Specwright returns a **proposal**: what shifts in the architecture, which existing build units the change makes stale, and what new work it implies. A proposal **applies nothing** — accepting one is a separate step.

- Same artifact/metadata split as specs: the proposal document is JSON in Vercel Blob at `changes/{projectId}/{changeId}.json`, and `ProjectChange.proposalPath` holds the private blob URL. The URL is never returned to a client; the document is only read behind an access check.
- `sequence` comes from `Project.nextChangeSequence`, the **third** counter on `Project` after `nextBuildUnitSequence` and `nextSpecVersion`, taken in the same transaction as the insert. Deliberately the same pattern a third time rather than a third pattern — `max(n) + 1` is wrong for all three for the identical reason.
- **`baseSpecId` is `onDelete: Restrict`**, and this is the deliberate opposite of `ProjectBuildUnit.specId`'s `SetNull`. It records which spec version the proposal was reasoned against, which is the whole basis of judging the proposal later: a delta whose base silently vanished cannot be interpreted. A build unit survives losing its lineage; a proposal does not survive losing its base, so removing a spec a change was reasoned against is refused outright.
- **Impact rows reference a unit by `buildUnitId`, never by `key`.** A unit's key is re-derived from its title on every rename, so a key is not stable — a row keyed by it would come to point at nothing, or at a different unit that later took the slug. The model speaks in keys, but those are resolved to ids at the system boundary and only ids are stored.
- Impacts cascade from **both** parents, so deleting a unit drops the impact rows pointing at it and leaves the change itself readable with that entry simply gone.
- **Model output is untrusted input.** Every unit key the model returns is resolved against the project's actual units, and one that does not resolve is **dropped, never stored** — a hallucinated unit reference must not reach a response. Drops are counted and logged, because a model that frequently invents keys is a prompt problem that is invisible unless counted.
- The proposal comes back through `generateObject`, not `generateText` — the one substantive departure from the spec path. A spec *is* prose; a proposal has to be acted on, so it must arrive as a validated object. It uses its own `CHANGE_MODEL`, never `SPEC_MODEL`: reasoning over an existing spec plus a live unit list is a harder task than writing prose, and the two must be raisable independently.
- Progress rides on the **run's own metadata**, not `ai-status-feed`. A proposal mutates nothing shared, so it follows the spec path rather than the design agent's broadcast path.
- Four routes: `POST /api/ai/change` triggers a proposal, `GET /api/projects/{projectId}/changes` lists them newest-first (metadata only, joining `baseSpec.version`), `/api/projects/{projectId}/changes/{changeId}` reads one with its document or `DELETE`s it to `DISCARDED`, and `POST /api/projects/{projectId}/changes/{changeId}/apply` applies it. All are `withProjectMember` — changes are project *content*, like the canvas, the brief, and build units, not project *lifecycle*, and applying one writes build units, which are content by the same reasoning.
- **A change against a project with no spec is refused before a model call is spent** — 409, not a wasted run. A change is a delta against something.
- Discarding sets `status` and **does not remove the row**: a proposal someone considered and rejected is a decision worth keeping. An **applied** change cannot be discarded — its effects stand, so recording it as rejected would be false. The refusal is a `status: { not: APPLIED }` scope on the write itself, not a read that could go stale.

## Applying A Change

Accepting a proposal creates the work it implies and marks the work it replaces — and **rewrites nothing**. An already-shipped unit still reads `shipped` after a change supersedes it, because it was shipped. Every comparable tool either overwrites a completed item or ignores it; recording "this was built, and then it was replaced" is the point.

- All of it is **one transaction** (`lib/changes/apply.ts`). A partial apply leaves a build list nobody asked for — half the new work present, half the supersession recorded, and no way to tell which half.
- **No model call, and no spec.** Applying consumes the document the proposal already stored; it does not produce one, does not write a `ProjectSpec`, and does not touch the canvas or the Liveblocks room. The project's spec version is the same before and after.
- **Only a `PROPOSED` change can be applied.** The guard that holds is the `status` requirement inside the `UPDATE`'s own `WHERE`: under read-committed isolation the update re-checks it after taking the row lock, so two concurrent applies resolve to one match and one rollback.
- **A stale change is refused.** If the change's base spec is no longer the project's highest spec version, the proposal was reasoned against an older picture of the system — the canvas is collaborative and *will* move under a pending proposal. The 409 names both versions and requires the caller to re-submit acknowledging the current one. That acknowledgement is a *confirmation of something the server said*, so it is re-validated against the real current version rather than trusted; nothing retries it automatically.
- **Sequence numbers are reserved once, in one increment of N**, not N times, and assigned from the reserved block. Numbers reserved for skipped units go unused, and the resulting gap is correct for the same reason every other gap is.
- **A proposed unit whose derived key collides with an existing unit is a no-op, not an error** — `38`'s producer contract is match on `key`, add what does not exist, never touch the rest. Skips are counted and returned so the caller can report what did not land, and they are the second guard against a double apply if the status check were ever bypassed.
- The per-project unit cap is enforced against what will *actually* be created, after collisions are removed, and a change that would exceed it is refused **whole** — nothing created, nothing superseded, the change still `PROPOSED`.
- `proposalPath` and `baseSpecId` are never selected into a response, the same discipline `ProjectSpec.filePath` follows. The affected units' **current titles** are resolved at read time from the stored ids, so a unit renamed since reads under its new name.

## Invariants

1. Request handlers do not run long-lived AI work — that belongs in background tasks.
2. Metadata and large generated artifacts are stored in separate layers.
3. Auth and ownership are enforced at every mutation boundary.
4. Client components are used only where browser interactivity or real-time state requires them.
5. The canvas schema must remain consistent between user-created content and imported templates.
