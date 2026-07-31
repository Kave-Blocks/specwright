# Specwright

## Overview

Specwright is a real-time collaborative system design workspace. Users describe a system in plain English, an AI agent maps that system onto a shared canvas, collaborators refine the architecture, and the app generates a technical specification from the resulting graph.

## Goals

1. Let authenticated users create and manage architecture projects.
2. Provide a collaborative real-time canvas for system design.
3. Let users import prebuilt starter system designs into the canvas.
4. Let AI generate an initial architecture from a natural language prompt.
5. Let collaborators refine the generated architecture.
6. Convert the final graph into a persistent Markdown technical spec.

## Core User Flow

1. User signs in.
2. User creates or selects a project.
3. User enters the project workspace, landing on **Project Home** — a mode-selection view, not the canvas. Home shows five real mode cards (Architecture Interview, Canvas, Specs, Build, Changes), each reflecting an actual signal (canvas saved / spec count / units shipped / changes awaiting review) where one exists, plus a non-interactive "Planned" card for a future mode. No mode is locked behind another.
4. From Home, the mode-switcher, or any mode card, the user reaches one of five equally-weighted, independently-addressable routes:
   - **Architecture Interview** (`/discovery`) — a guided, fully skippable interview that composes a structured project brief and submits it in place of a one-line prompt.
   - **Canvas** (`/canvas`) — the collaborative real-time system-design surface, plus a freeform AI chat panel.
   - **Specs** (`/specs`) — a two-pane list + inline Markdown preview of generated specs.
   - **Build** (`/build`) — the project's ordered list of build units, each with a status and a verification level the team sets by hand.
   - **Changes** (`/changes`) — plain-English change requests against the project's current spec, each returning a structured proposal to review.
5. User optionally imports a starter system design template into the canvas.
6. User prompts the AI to generate or extend the system design — from Canvas's freeform chat, or from the Architecture Interview's composed brief. Both submit through the same design path and land the result on Canvas.
7. AI generates nodes and edges in the shared canvas.
8. Collaborators edit and refine the design.
9. User triggers spec generation from the Specs route.
10. App persists the generated Markdown spec.
11. User reviews or downloads the spec inline, without leaving the Specs route.
12. On the Build route, the team records the units of work the project intends to ship and keeps each one's status and verification level current as the work happens.
13. On the Changes route, a member describes a change in plain English against the current spec and gets back a proposal — the architecture delta, which existing units the change makes stale, and what new work it implies — to review and either keep or discard. A proposal applies nothing on its own.

## Features

### Authentication and Projects

- User sign-in and route protection.
- Project creation, ownership, and collaborator access.
- Project list and workspace navigation.

### Collaborative Canvas

- Shared real-time canvas using Liveblocks and React Flow.
- Live cursors, presence indicators, and node/edge editing.
- Canvas snapshots persisted to the filesystem.

### Starter System Designs

- A curated library of prebuilt system design templates.
- Users can import a starter template into the canvas at any point during editing.
- Templates are static canvas snapshots loaded directly into the active room.
- Covers common patterns: monolith, microservices, event-driven, serverless, and more.

### AI Architecture Generation

- AI generates a system design from a user-supplied prompt.
- Output is structured as canvas nodes and edges written into the shared room.
- Generation runs as a durable background task.

### Spec Generation

- The current canvas graph is converted into a Markdown technical specification.
- Specs are persisted as files and linked to the project in the database.
- Users can view and download generated specs.

### Change Proposals

- A member describes a change in plain English against a project that already has a spec.
- Specwright returns a structured proposal: the architecture delta (what is added, modified, removed), which existing build units the change affects and why, what new work it implies, and any open questions.
- A proposal **applies nothing** — it is a document to review. It can be kept or discarded, and a discarded proposal is retained rather than deleted, because a rejected idea is a decision worth keeping.
- A change is refused before any AI work when the project has no spec, since a change is a delta against something.

### Build Units

- A project keeps an ordered list of build units — the pieces of work a team intends to implement.
- Each unit carries a title, an optional summary, a status, and a verification level, all set by a person.
- Any project member can add a unit, rename it, change its status or verification, and delete it; a unit keeps its number for the life of the project.

## Scope

### In Scope

- Authentication and route protection
- Project creation and ownership
- Collaborator access by project
- Starter system design template library and import
- Real-time shared canvas with nodes, edges, and presence
- AI-powered architecture generation from prompts
- AI-powered Markdown spec generation from the canvas graph
- Persistent storage for project metadata and generated artifacts
- Spec download

### Out Of Scope

- Billing and subscription systems
- Enterprise permission tiers beyond owner and collaborator
- Versioned spec history and review workflows
- Production object storage migration
- Mobile-native applications

## Success Criteria

1. A signed-in user can create and open a project.
2. Multiple users can collaborate in the same canvas simultaneously.
3. A user can import a prebuilt starter design into the canvas.
4. AI can generate an architecture into the shared room from a prompt.
5. The graph can be converted into a persisted Markdown spec.
6. Project metadata and generated artifacts are stored in the correct layers.
