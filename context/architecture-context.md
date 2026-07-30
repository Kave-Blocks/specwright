# Architecture Context

## Stack

| Layer            | Technology              | Role                                                           |
| ---------------- | ----------------------- | -------------------------------------------------------------- |
| Framework        | Next.js 16 + TypeScript | Full-stack app with server/client boundaries                   |
| UI               | Tailwind + shadcn/ui    | Component composition and styling                              |
| Auth             | Clerk                   | User identity and route protection                             |
| Database         | Prisma + PostgreSQL     | Relational metadata: projects, collaborators, specs, task runs |
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
- Project records, spec records, and task run records belong in PostgreSQL.
- Canvas content and Markdown output are stored in and retrieved from Vercel Blob.
- The blob URL is stored in the database (`canvasJsonPath`, `filePath`) as the reference to the artifact.

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

### Spec Retrieval

- Two routes, both behind project membership:
  - `GET /api/projects/{projectId}/specs` lists a project's specs, newest first — **metadata only** (`id`, `filename`, `createdAt`).
  - `GET /api/projects/{projectId}/specs/{specId}/download` returns one spec's Markdown.
- The download route proves project membership, then proves the spec belongs to that project, and only then dereferences the blob and streams it as a Markdown attachment.
- It is also the **only** way a client reads spec content — the preview fetches the same route and reads the body as text. `Content-Disposition: attachment` governs a browser navigation, not a `fetch`, so one route serves both without a second endpoint.
- Blob URLs are never returned to a client. `ProjectSpec.filePath` is never selected into a response; the listing derives its `filename` from the spec id instead. The store is private, so a URL is not fetchable without the SDK's credentials — but access is enforced at the route regardless, not by URL secrecy.
- Spec content is never held in long-lived frontend state: the preview fetches it on open and drops it on close.

### Run Ownership

- Triggering an AI task records a `TaskRun` (run id, project id, user id).
- A realtime run token is issued only to the user the `TaskRun` belongs to.
- Project access is resolved from the authenticated user and the room id. A client-supplied project id is never trusted.

## Invariants

1. Request handlers do not run long-lived AI work — that belongs in background tasks.
2. Metadata and large generated artifacts are stored in separate layers.
3. Auth and ownership are enforced at every mutation boundary.
4. Client components are used only where browser interactivity or real-time state requires them.
5. The canvas schema must remain consistent between user-created content and imported templates.
