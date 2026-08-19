# UI Context

## Theme

Dark only. No light mode. The visual language is a dark technical workspace — near-black backgrounds, layered surfaces, and vivid accent colors for interactive elements.

All colors are defined as CSS custom properties in `globals.css` and mapped to Tailwind tokens via `@theme inline`. Components must use these tokens — no hardcoded hex values or raw Tailwind color classes like `zinc-*`.

| Role             | CSS Variable           | Hex / Value               |
| ---------------- | ---------------------- | ------------------------- |
| Page background  | `--bg-base`            | `#080809`                 |
| Surface          | `--bg-surface`         | `#111114`                 |
| Elevated surface | `--bg-elevated`        | `#18181c`                 |
| Subtle surface   | `--bg-subtle`          | `#1e1e23`                 |
| Default border   | `--border-default`     | `#2a2a30`                 |
| Subtle border    | `--border-subtle`      | `#3a3a42`                 |
| Primary text     | `--text-primary`       | `#f0f0f4`                 |
| Secondary text   | `--text-secondary`     | `#c0c0cc`                 |
| Muted text       | `--text-muted`         | `#808090`                 |
| Faint decoration | `--text-faint`         | `#505060` (never on text) |
| Brand accent     | `--accent-primary`     | `#00c8d4` (cyan)          |
| Brand dim        | `--accent-primary-dim` | `rgba(0, 200, 212, 0.12)` |
| AI accent        | `--accent-ai`          | `#6457f9` (indigo-purple) |
| AI text          | `--accent-ai-text`     | `#8b82ff`                 |
| Chat accent      | `--accent-green`       | `#62C073` (green)         |
| Error            | `--state-error`        | `#ff4d4f`                 |
| Success          | `--state-success`      | `#34d399`                 |
| Warning          | `--state-warning`      | `#fbbf24`                 |

Tailwind utility names map to these variables. Use `bg-base`, `bg-surface`, `text-copy-primary`, `text-copy-muted`, `border-surface-border`, `text-brand`, `bg-accent-dim`, `bg-accent-green`, etc.

The chat accent (`--accent-green`) is the AI chat's own accent: it fills the user's chat bubbles, the send button, and the AI status strip in the AI sidebar. It is the same green already in the canvas node palette below, promoted to a token so it can be used as a surface — text on it must be `var(--bg-base)` for contrast, never light text.

## Typography

| Role      | Font       | CSS Variable        |
| --------- | ---------- | ------------------- |
| UI text   | Geist Sans | `--font-geist-sans` |
| Code/mono | Geist Mono | `--font-geist-mono` |

Both fonts are loaded via `next/font/google` and applied as CSS variables on the `<html>` element. The base `body` uses Geist Sans with `antialiased`.

## Border Radius

Radius increases with surface depth — smaller for inner elements, larger for outer containers.

| Context           | Class         |
| ----------------- | ------------- |
| Inline / small UI | `rounded-xl`  |
| Cards / panels    | `rounded-2xl` |
| Modal / overlay   | `rounded-3xl` |

## Canvas

### Node Color Palette

8 defined color pairs. Each pair specifies a dark node fill and a vivid contrasting text color tuned for readability on the dark canvas. Defined in `types/canvas.ts` as `NODE_COLORS`.

| Node fill | Text color | Character              |
| --------- | ---------- | ---------------------- |
| `#1F1F1F` | `#EDEDED`  | Neutral dark (default) |
| `#10233D` | `#52A8FF`  | Blue                   |
| `#2E1938` | `#BF7AF0`  | Purple                 |
| `#331B00` | `#FF990A`  | Orange                 |
| `#3C1618` | `#FF6166`  | Red                    |
| `#3A1726` | `#F75F8F`  | Pink                   |
| `#0F2E18` | `#62C073`  | Green                  |
| `#062822` | `#0AC7B4`  | Teal                   |

Default node color: `#1F1F1F` with `#EDEDED` text.

### Edge Style

Smooth-step path with an arrow marker. Default edge color: `#f8fafc`. Stroke width is thin — edges are visually secondary to nodes.

### Node Shapes

6 supported shapes, defined in `types/canvas.ts` as `NODE_SHAPES`. Complex shapes (diamond, hexagon, cylinder) are rendered as inline SVGs rather than CSS borders.

- `rectangle` — default general-purpose node
- `diamond` — decision / gateway
- `circle` — event / endpoint
- `pill` — service / process
- `cylinder` — database / storage
- `hexagon` — external system / boundary

### Tool Modes

The canvas has one active tool at all times (default `select`); it owns the cursor and decides what a click means. Two floating pill bars sit at the bottom of the canvas:

- **Left (`CanvasControls`)** — zoom out, fit, zoom in, divider, undo, redo. These do *not* own the cursor, which is why they are their own group and sit outside the tool system.
- **Center (`ToolPanel`)** — the eight tools, all of which own the cursor: select, hand, divider, then the six shapes.

The active tool is filled with the brand accent (`bg-accent-dim text-brand`), distinct from both rest (`text-copy-muted`) and hover (`bg-elevated`). Shape buttons do double duty: clicking one activates that shape tool (the next canvas click places the shape, then the tool returns to `select`), while dragging one still drops a node without changing the active tool.

**Hold-space** makes `hand` the active tool for as long as the key is down, from any tool, and releasing it returns to the tool underneath — including a shape tool. It is a real change of the active tool, not a panning special case, so the toolbar shows `hand` as active and the cursor changes with it. Space is ignored while a text field has focus, and ignored mid-gesture (mid-marquee, mid-move, mid-connector), which completes as it would have.

Cursors are driven by `data-canvas-tool` on the canvas wrapper, with rules in `globals.css`: arrow for `select`, open/closed hand for `hand`, crosshair for any shape tool. They target the React Flow *pane*, so a node handle keeps its connector crosshair — except under `hand`, which gives up connectors entirely, leaving the handle non-interactive and the open hand showing through.

### Selection

Selection belongs to the `select` tool: click a shape to select it, shift-click to add or remove one, drag a shape to move it, drag a handle to resize, Delete/Backspace to remove. Under any other tool these all go quiet — the selection itself survives the switch, it just stops responding, and a selected node's resize handles are withheld rather than shown dead.

Selected shapes keep their existing treatment: the shape border brightens to `--accent-primary`, and a `NodeResizer` in the same color adds corner/edge handles.

**Marquee.** Dragging from empty canvas draws a selection rectangle; every shape it *touches* (not merely contains) highlights as it grows and is selected on release. Holding shift adds the result to the existing selection. A drag under 4px stays a click and clears the selection instead; `Esc` mid-drag cancels and leaves the prior selection intact.

The rectangle is a translucent brand fill (`bg-accent-dim`) with a 1px border in the selection outline color (`border-brand`) — so it reads as "this is what will be selected". It draws above the shapes and below the toolbars.

Panning moved out of the empty-canvas drag to make room for the marquee: scroll and trackpad pan the canvas (pinch and Cmd/Ctrl + scroll still zoom), while drag-to-pan belongs to the `hand` tool — reachable from anywhere by holding space.

**Hand.** Every drag pans, wherever it lands: on empty canvas, on a shape, on an edge. Nothing is selected, moved, resized, deleted, or edited while it is active, and a shape's edge no longer starts a connector — that is the one gesture the hand tool takes away that the shape tools keep. The existing selection stays selected and stays outlined throughout; it simply stops responding.

### Connection Handles

Small white circular handles, hidden by default, revealed on node hover. Appear at all four sides of a node.

### Canvas Background

React Flow `<Background>` component. Canvas sits on the base background color.

## Component Library

shadcn/ui on top of Tailwind. No custom design system. Components live in `components/ui/`. Use the `shadcn` CLI to add new components rather than writing them from scratch.

### AI Chat Panel (Canvas)

The Canvas route's AI chat panel (`components/editor/ai/ai-chat-panel.tsx`) renders the AI Architect chat directly — no tab chrome. It is one of two entries into the same generation path (`useDesignSubmit`), never two paths:

- the **freeform prompt** (auto-resizing textarea, green send button), on Canvas, and
- the **Architecture Interview**, its own full-page route (`/editor/[roomId]/discovery`) rather than a dialog launched from the chat — see Layout Patterns above. A small text link from the chat panel ("Prefer a guided flow? Discovery →") points to it.

The interview's step shell: one question per step, help text under each heading, a step indicator (`Step n of m` plus a segment bar) visible throughout, and `Back` / `Skip` / `Next` in a footer. Every question is skippable; the final step is an editable Review of the composed Markdown brief, and that exact text is what gets submitted.

**Option chips** (single- and multi-select) use the same three states as the canvas tool panel: selected `bg-accent-dim text-brand`, rest `bg-subtle text-copy-muted`, hover `bg-elevated`. Defaults render as already-selected, so skipping a question and choosing its default look the same — which is what they are. Every default that survives is disclosed in the brief's `## Assumptions` section rather than applied silently.

`Generate` reuses the send action's accent: `bg-accent-green` with `text-(--bg-base)` (never light text on green, per the chat accent note above).

### Markdown

Generated specs render with `react-markdown` + `remark-gfm` (tables and task lists are GitHub extensions, not CommonMark). `@tailwindcss/typography` is deliberately **not** installed — a prose plugin's light-mode defaults would fight this palette — so every element is styled explicitly against the tokens above in `components/editor/ai/spec-markdown.tsx`. Raw HTML is not rendered (no `rehype-raw`): spec content is LLM-authored, so any markup in it is escaped to visible text.

## Layout Patterns

- Editor room: a project-wide shell (`EditorRoomShell`) owns the navbar, the floating project sidebar overlay, and the create/rename/delete + share dialogs — shared by every route under `/editor/[roomId]`. Route content renders below the navbar, full-bleed by default. Canvas stays literally full-bleed (only its floating chrome clears the sidebar, via `--canvas-inset-left`/`-right`); Project Home, Architecture Interview, Specs, and Build instead shift their own root content over with `pl-(--canvas-inset-left,0px)` (`transition-[padding-left] duration-200 ease-out` to match the sidebar's own open/close animation), since their controls sit in document flow rather than floating and would otherwise render underneath the sidebar when it's open. **`EditorShell` — the `/editor` shell, outside any room — publishes the same property**, since Workspace Home's project grid sits in document flow and the sidebar is `fixed` over it. One centred block got away with sitting partly under the sidebar; a grid does not.
- **Workspace Home** (`/editor`) — the app's landing screen, and the one surface outside a project. It **branches on the user's real state** rather than asserting one: a recency-ordered `sm:grid-cols-2` grid of the user's projects under "Jump back in", then a "Start something new" section; with shared projects but none owned, the grid is the shared ones under copy that acknowledges they belong to someone else and names creating your own as the start path — **never "you have no projects"**, which the sidebar visibly contradicts; with nothing at all, no grid, the start cards promoted, and one sentence saying what a Specwright project is. The grid is capped and the sidebar holds the remainder, so **the copy must never imply the grid is complete**; there is no "all projects" route, because the sidebar already is one.
  - A project card carries the name, a "Shared" house badge at `text-copy-muted` on collaborator projects only, and one status line. **Owned projects get no counterpart badge** — absence is the signal, the same rule the source-spec badge and the drift notice follow. There is no description on it: `Project.description` is never written by anything in this app, and rendering it would invent state, which is the failure this screen exists to fix.
  - **The status line composes from three signals, in order, and omits the zeros** — `Canvas saved` / `Empty canvas` (always present, wording verbatim from Project Home's Canvas card), then `{n} spec(s)` **omitted at zero**, then `{shipped} of {total} shipped` **omitted when total is zero** (wording verbatim from Project Home's Build card, including its deliberate lack of a singular/plural branch). Fragments join with `" · "`. So: `Empty canvas`, or `Canvas saved · 2 specs · 3 of 8 shipped`. The canvas fragment is unconditional, so the line is never empty and needs no zero case.
  - **That it omits zeros where Project Home states them ("No specs yet") is a rule, not drift.** A mode card is the door to *one* mode, so naming what is behind it is the content; a project card compresses a whole project, so absence is the signal. The line carries **no open-change count** — arguably the most action-worthy signal here, but a four-fragment line gets long. Decided out; it is one `_count` and one fragment if that changes.
  - Long project names take `truncate` **with `min-w-0` on the text element itself**, not only on its flex wrapper — the same real 768px overlap the mode-switcher's project name records, for the same reason.
  - **One card language, shared with Project Home.** `mode-card.tsx` exports the card container and icon-tile class strings, and the three shapes on these two screens — a mode `<Link>`, a project `<Link>`, a start-work `<button>` — wear the identical shell rather than one component being bent to serve three. No card takes container opacity, for the reason recorded on the Planned card below.
  - No illustration, no seeded sample project, no onboarding checklist: the house style has none, a seeded project creates a row someone has to delete, and nothing tracks per-user onboarding state.
- **Project Home** (`/editor/[roomId]`) — a centered column of mode cards ("Where do you want to work?"), not the canvas. Cards are `rounded-2xl` links with an icon, title, description, and a real status line where one exists (Canvas: "Canvas saved" / "Empty canvas"; Specs: a real generated-spec count; Build: "No units yet" or "{shipped} of {total} shipped"). The fifth card, a placeholder for a future mode, is non-interactive and says so through three signals that cost it no legibility: a `text-copy-muted` title where the four real cards take `text-copy-primary`, no arrow, and no hover or focus state. It keeps the same border, padding, and icon tile, and carries the house "Planned" badge (below) where the others carry a chevron. It deliberately has **no container opacity** — opacity forms a compositing group, so the whole subtree flattens against `--bg-base` and every child's contrast has to be measured on the composited value, which is what once put that badge at 1.93:1 and the description at 2.08:1. `opacity-100` on a child does not escape an ancestor's group, so the only fix is not to open one; card-wide muting is what carries "planned" instead.
- **Architecture Interview** (`/editor/[roomId]/discovery`) — a full-page version of the guided interview (a stepped form, not a dialog): heading + help text, a step indicator with a segment bar, question content in a `ScrollArea`, and a Back/Skip/Next(/Generate on Review) footer. A link back to Project Home sits above it.
- **Canvas** (`/editor/[roomId]/canvas`) — the collaborative canvas surface, with its own secondary control bar (save status, starter templates, AI chat toggle — `h-[var(--canvas-toolbar-height)]`, directly under the shared navbar) and a slide-over AI chat panel on the right.
- **Specs** (`/editor/[roomId]/specs`) — a two-pane layout: a spec list on the left (generate action + `ScrollArea`), an inline Markdown preview of the selected spec on the right (reusing `spec-markdown.tsx`'s rendering, not dialog chrome).
  - **When the spec is behind the build list, a drift notice sits directly under the Generate Spec control** — "2 changes applied since Version 3", then a second line that **depends on whether those changes have reached the canvas, and the two states must never be collapsed into one message**. While any of them is unpushed it names the step that comes first: they have not reached the canvas, specs are written from the canvas, add them from the Changes tab or a new spec will miss them too. Once all of them are on the canvas it says the thing `42`'s spec originally wanted it to — that generating a new spec now will describe them — because `43`'s write-back has made that true. **In the first state the notice must not promise that regenerating fixes the drift**, because it would not: a spec is written from the canvas graph, the conversation, and the brief — never from the build list — so a spec generated then would miss the applied work exactly as the current one does, *while the count reset to zero*. That is the one reading that leaves somebody worse off than no notice at all, and it is the whole failure `42` recorded. It takes `role="status"` and the neutral well (`rounded-xl border border-surface-border bg-base`, `text-copy-primary` count line over `text-copy-muted` body) that the apply outcome on Changes already uses. **Never `role="alert"`, `text-error`, or a warning colour**: nothing has gone wrong — a spec going out of date is the expected consequence of applying a change, and `--warning` already reads as a verification level on Build. This is the opposite call from the stale-change notice below, and the reason differs: there the request genuinely was refused, here nothing failed. **At zero it renders nothing** — absence is the signal, the same rule the source-spec badge follows, so there is no "spec is current" banner to read past on every visit. It adds **no second generate button**; it exists to explain why the one above it is worth pressing.
  - **A spec is labelled by its version — "Version 3" — and never by an id or an id-derived filename.** The version takes the list card's existing primary-text slot (it *replaces* the filename string rather than sitting beside it), and the preview pane header carries the same label; the created-at line stays as the secondary detail on both. No spec id is user-visible anywhere: it survives only inside the download URL and as a React key. The downloaded file is `spec-v3.md`, so what a person saves matches what they clicked.
- **Build** (`/editor/[roomId]/build`) — a centered column: an always-visible add form at the top (title, optional summary), then the project's units as `rounded-2xl` rows in build order, one expanded at a time. A collapsed row carries its two-digit number, title, summary, and its status and verification as badges — plus, when the unit came from a spec, a third "from v2" badge naming that spec's version. **A hand-typed unit shows no source badge at all**: absence is the signal, so there is no "added by hand" counterpart to read past on every other row. The lineage badge wears the same house badge treatment as its neighbours at `text-copy-muted`, the quietest tone a badge may take, so provenance stays the quietest thing on the row. expanding it reveals the status and verification chip rows plus rename and delete. The add form sits above every list branch, so a list that failed to load still lets someone add a unit.
  - **The supersession marker sits alongside the status and verification badges, never in place of them.** A unit a later change replaced carries a fourth badge, "replaced by change {n}", in the same house treatment at `text-copy-muted` — the same tone as the source-spec badge next to it, because both are provenance rather than a state of the work. A row therefore reads **status → verification → source spec → supersession**, and a shipped, browser-verified unit that has been superseded shows all of it at once: the three are independent axes and each is true. There is deliberately **no strikethrough, no dimming, no reordering, no collapsing, and no filter that hides superseded units by default** — the build list is the record of what a team built, and a unit that was replaced is part of that record. Expanding a superseded row adds one control, "Not superseded", which clears the marker and changes nothing else about the unit; there is no counterpart control that *sets* it, because setting it needs a change to point at, which a person cannot invent.
  - **The Build tab can derive its units from the project's current spec, and the control sits above every list branch** — beside the add form, in the same slot and for the same reason: a list that failed to load can still be derived into, and a control inside the empty block would unmount the instant the refreshed list arrived, taking its own report with it. **One control, two treatments.** While the list is empty it takes the primary treatment (`bg-brand text-white hover:bg-brand/90`) — matching Generate Spec on the Specs tab, which is the same shape of action, and an empty build list beside a generated spec is the exact situation deriving exists for. Once the list has units it drops to `secondary`, the treatment `43` established for a follow-on action that must not compete with the primary one on its panel: the add form stays the primary way to type a unit. The "No units yet" block offers deriving in its copy alongside its existing "add one above" line.
  - **A destructive-sounding action that is not destructive says so, before it runs.** The line under the control states that deriving only adds units and never edits, renames, reorders, or removes one you already have — `38`'s producer contract, stated where somebody is right to be nervous about it. While the control is disabled that line carries the **reason** instead, and the button points at it with `aria-describedby`. **A control with no spec to derive from is disabled with the reason on it, never hidden**: a hidden control teaches nothing, and "generate a spec first" is the actionable half of the message. While the spec list is still loading it says *that* — it must never flash the no-spec wording before the answer arrives — and a spec list that failed to load leaves the control available rather than claiming a fact the client does not have. The route's 409 is the real guard either way; this is an affordance, not a check.
  - **The derivation outcome reports three counts, and skipped and dropped must read differently.** It reuses the neutral `rounded-xl border border-surface-border bg-base` well with `role="status"` — never `alert` — that the apply outcome, the drift notice, and the canvas-push outcome all share. A skip means the build list already had a unit with that title; a **drop** means the model returned an entry with no usable title. The producer counts them apart on purpose and collapsing them here would waste that. **A derivation that creates nothing is the expected result of running it a second time**, not a failure, and it says so plainly. The skipped titles follow the shape the apply outcome's list already has — a line of explanation, then the titles as items, the bullet as `text-copy-faint` decoration — and no second list treatment is invented. While a run is in flight the control is disabled, reads "Deriving…", and carries a `role="status"` `aria-live="polite"` line with the run's published text; a failure renders `role="alert"` with `text-error`, shows the message the **run** published rather than a generic retry line, and leaves the control available, because nothing was written.
  - **A badge reports a value, a chip sets one**, so the two are shaped apart on purpose. `rounded-full border border-surface-border bg-base px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase` is the **house badge**, not a Build-only one: it is what Project Home's "Planned" badge wears (at `text-copy-muted`) and what any later status pill should wear, so the two surfaces cannot drift apart the way they did once. Only the text tone varies — for build units it is the value's own tone class (`text-success`, `text-warning`, `text-error`, `text-brand`, `text-copy-muted`) from `types/build-units.ts`, which is the single source of how a value is worded and colored wherever it is shown. Chips are `rounded-xl` and take the established three states — selected `bg-accent-dim text-brand`, rest `bg-subtle text-copy-muted`, hover `bg-elevated` — with no per-value color, because a chip row is one control rather than five kinds of thing.
  - The badge fill is `bg-base` rather than the chips' `bg-subtle` for a contrast reason, and every surface that wears the house badge inherits it. Badge text is 10px (`text-[0.625rem]`), under every large-text allowance, so each tone owes WCAG AA 4.5:1 — which `text-copy-faint` cannot pay on any surface in this palette (2.53:1 at its best, on `bg-base`) and `text-copy-muted` cannot pay on `bg-subtle` (4.27:1). Recessing the pill to the darkest registered surface clears the whole table (`text-copy-muted` 5.16:1, `text-error` 6.13:1, `text-brand` 9.74:1, `text-success` 10.41:1, `text-warning` 11.99:1), and holds it steady under the row's `hover:bg-elevated`; the border is what keeps the pill a visible shape once it is darker than the card, matching the `bg-base` wells in `spec-markdown.tsx` and `starter-templates-modal.tsx`. **No badge takes `text-copy-faint`**, on any surface. Because that leaves `text-copy-muted` as the quietest tone a badge can wear, the two neutral statuses (`specced`/`deferred`, `none`/`structural`) share it rather than being separated by brightness: promoting one of them to `text-copy-secondary` would make a project's *default* status the loudest badge on the row, and losing a grey step costs less than that inversion.
  - **`--text-faint` is decoration-only, everywhere — never text.** The badge rule above is the special case of a general one, decided 2026-07-31 (unit `38a`, Decision 2), and the badge line stands as written. `text-copy-faint` is permitted for icons, chevrons, list markers, and other non-text decoration; it is not permitted for text on any surface, at any size, including fine print, placeholders, and `marker:` on an `ol` (where the marker *is* the item's number, i.e. content). The reason is arithmetic, and it is here so nobody re-opens it by "just lightening the token a little": `#505060` has relative luminance 0.0829 and measures **2.53:1 on `bg-base`, 2.39:1 on `bg-surface`, 2.24:1 on `bg-elevated`, 2.10:1 on `bg-subtle`** — no surface in the palette clears 3:1, let alone 4.5:1. Clearing 4.5:1 on `bg-subtle` needs luminance ≥ **0.2347**, which is *brighter* than `--text-muted` (0.2204), so any compliant `--text-faint` would invert the very hierarchy it exists to express. Lightening is therefore not "lighten a bit", it is "delete the token in all but name" — and a rule stated as a class name is greppable where "faint is lighter now" is not.
    - **Accepted cost:** the palette loses its quietest text rung, so some two-tone hierarchies flatten. Where a step is genuinely still needed, take it from *above* — promote the louder line to `text-copy-secondary` — never from below. `canvas-surface.tsx`'s error state is the worked example: its remediation line moved faint → muted, so the headline above it moved muted → `text-copy-secondary` to keep the two lines apart.
    - **Deferred pending measurement, not oversights.** Five sites still carry `text-copy-faint` on text because their background is not statically computable and guessing is worse than waiting: `canvas-node.tsx:222` (label over a per-node `NODE_COLORS` fill), `canvas-node.tsx:204` (`placeholder:`, same node fill), `canvas-edge.tsx:239` (`bg-surface/80` over an unbounded canvas backdrop), `canvas-edge.tsx:226` (`placeholder:`, same), and `ai-architect-tab.tsx:270` (chat timestamp on the `bg-surface/95` floating panel). All five get measured together in a follow-up; none is a licensed exception to the rule.
- **Changes** (`/editor/[roomId]/changes`) — a centered single column (not Specs' two-pane split): a request box at the top, then the project's changes newest-first, one expandable at a time. An expanded change shows its proposal — summary, the architecture delta **grouped by kind**, the affected units by title, the proposed new units, and any open questions.
  - **Delta kinds are not color-coded.** The obvious encoding is a green/red diff palette and this palette has no such pair: `text-success` exists but no "destructive but not an error" red does, and `text-error` means *something went wrong*, which a deliberate removal did not. Introducing a diff palette is a design decision with no mandate, so kinds wear the house badge at `text-copy-muted` and are separated by their words and their grouping instead.
  - A change carries a status badge from the shared status vocabulary and an "against v{n}" badge naming the spec version it was reasoned against. Status chips (the filter row) take the established three states — selected `bg-accent-dim text-brand`, rest `bg-subtle text-copy-muted`, hover `bg-elevated`.
  - **An expanded `proposed` change offers Apply and Discard; an `applied` or `discarded` one offers neither and states its outcome instead.** Apply takes the primary control treatment (`bg-brand text-white`); Discard stays the quiet ghost it already was. Applied is not reversible from this surface, and the endpoint refuses it too — the units it created exist and the ones it superseded are marked, so recording it as rejected afterwards would be false.
  - **A stale change surfaces the mismatch inside the proposal body, and requires a second explicit confirmation.** The notice names both versions — the one the proposal was reasoned against and the one the project is on now — and its confirm button reads "Apply anyway against v{n}". While it is on screen it *replaces* the Apply button, so there is exactly one way forward. Nothing retries the refused request automatically: a refusal a machine can resolve on its own was never a refusal.
  - The stale notice reuses the **error/alert treatment** (`role="alert"`, `text-error`) rather than introducing a warning colour. `--warning` is registered but already reads as a verification level (`partial`) in this app, and inventing a third "caution" tone for one surface is a design decision with no mandate here; the request genuinely *was* refused, so the alert treatment is honest.
  - **After applying, the panel reports what actually landed** — units created, units marked superseded, and any proposed units skipped because the build list already had one with that title, listed by name. `role="status"`, not `alert`: nothing went wrong. The skipped list is the reason this is reported rather than implied — a skip is a no-op, so without it the panel would say "applied" while quietly having created fewer units than the proposal listed.
  - **The outcome closes with the drift it just created** — that the spec no longer describes this build list, and that specs are written from the canvas, which the apply did not change. It points at the **canvas, not the Generate Spec control**, for the reason given under Specs above. Unconditional, and it matches what the Specs view counts: drift follows from the change having been applied, not from how many units it happened to create, so a proposal that created nothing still leaves the spec describing a build list that has moved on. This is the moment the drift is created, so it is the moment a person is most able to act on it.
  - **An applied change offers "Add to canvas" in the settled block directly beneath that line, and it takes the `secondary` treatment, never the primary one.** Apply is the primary action on this panel and stays so; pushing is the follow-on step, not a competing one. The control lives in the settled block rather than beside Apply so that one implementation serves both moments the spec asks for — the instant an apply creates the drift, and a change applied before the write-back existed, which would otherwise be stranded with no way to reach the canvas. While the run is in flight the button is disabled and says "Adding to canvas…" beside a `role="status"` line; the canvas is mutating live under the person's eyes, which is the design agent's existing behaviour and needs no new affordance. A **failed push leaves the control available** — `canvasPushedAt` stays null, so this is a retriable state, and the run's own refusal text is shown rather than a generic "please try again", which for "already on the canvas" cannot work.
  - **A pushed change says so and offers nothing further.** There is no re-push: the delta has been drawn, and drawing it twice duplicates nodes. The endpoint refuses it too; this is not the only guard.
  - **The push outcome reuses the same neutral `role="status"` well as the apply outcome, and it must list the removals that were not drawn.** `removed` deltas are reported and never drawn — there is no honest "retired" tone in this palette, and deleting the node is the visual form of the rewrite `41` exists to prevent — so a person who is not told would assume the canvas is now complete. The list follows the shape of the skipped-titles list above it: one line of explanation, then the component names as items, with the bullet as `text-copy-faint` decoration. **No second list treatment is invented for it**, and nothing here is an `alert`: a skipped removal is the designed behaviour, not a failure.
  - `rounded-2xl` for change cards, `rounded-xl` for the request box and inline controls.
  - A mutation failure (notably the "generate a spec first" refusal) renders beside the request box, never in the list's own error slot — that split is what lets the refusal appear while the list it was refused against stays on screen.
- **The mode-switcher owns its own overflow.** Six entries with "Architecture Interview" among them is more label than a 3.5rem navbar can promise to fit beside a project name and Share at every width, so the switcher **scrolls on its own axis** rather than wrapping, collapsing into a menu, or abbreviating labels. Wrapping is out on sight: the navbar's height is a layout token (`--editor-navbar-height`) that the floating sidebar, the Canvas toolbar, and the AI chat panel all offset against. An overflow menu would hide destinations behind a disclosure and have to special-case the active route. Scrolling keeps all six present, in one order, at one size, with tab order untouched; the active entry is scrolled back into view after each navigation.
  - The squeeze is aimed deliberately: the project-name track gives up space first, and the Share button's track has a `min-content` floor so it is never squeezed or overlapped. **The project name needs `min-w-0` on the text element itself, not only on its flex wrapper** — a flex item's default `min-width: auto` floors it at its own content width, so `truncate` has no box narrower than the text to clip against and the name spills out of its track into the switcher. That was a real overlap bug at 768px, not a theoretical one.
- Floating overlays (project sidebar, AI chat panel): dark semi-transparent background and subtle border, fixed relative to the viewport.
- Modals and dialogs (create/rename/delete project, share): centered overlay, `rounded-3xl`, dark background with backdrop blur.
- Navbar: top bar with dark background and bottom border, holding a mode-switcher (Home / Architecture Interview / Canvas / Specs / Build) center-aligned — reuses the AI chat's tab treatment (`text-copy-muted`, active `bg-accent-dim text-brand`).

### Layout Tokens

Shared chrome dimensions live as CSS custom properties in `globals.css` so dependent layout math stays in one place.

| Role                  | CSS Variable              | Value    |
| --------------------- | -------------------------- | -------- |
| Editor navbar height  | `--editor-navbar-height`   | `3.5rem` |
| Canvas toolbar height | `--canvas-toolbar-height`  | `3rem`   |
| Project sidebar width | `--project-sidebar-width`  | `20rem`  |

Anything positioned relative to the navbar or the Canvas route's own secondary toolbar (the AI chat panel's top offset and height, the floating sidebar's top offset) derives from these tokens rather than hardcoding the resulting number. `--project-sidebar-width` is the floating sidebar's own width, consumed by `ProjectSidebar` itself and published as `--canvas-inset-left` by both editor shells. It is deliberately **not** shared with `--canvas-inset-right`, which is the AI chat panel's width — a different component that merely happens to be the same number, and collapsing the two because the numbers match is how a token stops meaning anything. `--canvas-inset-left`/`--canvas-inset-right` are inline custom properties (not tokens in `globals.css`) set by the project sidebar's and AI chat panel's open state respectively, and cascade down to whatever needs to clear them: the floating canvas chrome (zoom controls, presence avatars) on the Canvas route, and the root content padding on Workspace Home, Project Home, Architecture Interview, Specs, and Build.

## Brand

The Specwright mark is an **"S" traced as a smooth-step canvas edge**, terminating in two connection-node rings. It is drawn in the canvas's own visual grammar — the same orthogonal smooth-step routing as `CanvasEdgeRenderer`, and rings that read as the connection handles in the section above — on Lucide's 24px grid at stroke-width 2, so it sits beside the icon set as a peer rather than a foreign object.

`components/ui/logo.tsx` exports two components:

| Component  | Renders                    | Use                                              |
| ---------- | -------------------------- | ------------------------------------------------ |
| `LogoMark` | Mark only, `currentColor`  | Tight chrome — workspace navbar, favicons, badges |
| `Logo`     | Mark + "Specwright" wordmark | Anywhere the product needs naming                |

Rules:

- **The mark carries no fill.** Its path stops at each ring's edge so the stroke flows into it, rather than punching the ring out with a background color. It therefore inherits `currentColor` and is safe on any surface — do not add a background-colored fill to "clean up" the rings, which silently breaks it on every surface but the one it was tuned for.
- **Color it with a text utility on the parent** (`text-brand` is the default in `Logo`), never a hardcoded hex.
- **`Logo` scales from a single text utility.** The wordmark inherits its size from the root, so `className="text-lg"` scales the lockup; `markClassName` sizes the mark independently.
- **Do not wrap the mark in a filled brand tile.** It is a stroke mark and reads as cyan-on-dark, consistent with the feature icons in `auth-layout.tsx`.

Static assets live in `public/` for contexts that cannot render a React component: `logo-mark.svg` (`currentColor`), `logo.svg` (lockup), and `logo-gradient.svg` (brand cyan → AI indigo, for hero/marketing placements only — below ~48px the gradient reads as undifferentiated blue). `app/icon.svg` is the favicon via Next's file convention, so no `metadata.icons` entry is needed.

`logo.svg`'s wordmark is live `<text>`, not outlined paths — it resolves Geist Sans where available and falls back to `system-ui`. For pixel-identical output in a foreign renderer (OG images, decks), convert the text to paths.

## Icons

Lucide React. Stroke-based icons only — no filled variants. Icon sizes: `h-4 w-4` for inline, `h-5 w-5` for buttons, `h-8 w-8` for feature icons in empty states.
