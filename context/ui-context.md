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
| Faint text       | `--text-faint`         | `#505060`                 |
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

- Editor room: a project-wide shell (`EditorRoomShell`) owns the navbar, the floating project sidebar overlay, and the create/rename/delete + share dialogs — shared by every route under `/editor/[roomId]`. Route content renders below the navbar, full-bleed by default. Canvas stays literally full-bleed (only its floating chrome clears the sidebar, via `--canvas-inset-left`/`-right`); Project Home, Architecture Interview, and Specs instead shift their own root content over with `pl-(--canvas-inset-left,0px)` (`transition-[padding-left] duration-200 ease-out` to match the sidebar's own open/close animation), since their controls sit in document flow rather than floating and would otherwise render underneath the sidebar when it's open.
- **Project Home** (`/editor/[roomId]`) — a centered column of mode cards ("Where do you want to work?"), not the canvas. Cards are `rounded-2xl` links with an icon, title, description, and a real status line where one exists (Canvas: "Canvas saved" / "Empty canvas"; Specs: a real generated-spec count). The fourth card, a placeholder for a future mode, is non-interactive: reduced opacity, no hover state, a muted "Planned" badge instead of a chevron.
- **Architecture Interview** (`/editor/[roomId]/discovery`) — a full-page version of the guided interview (a stepped form, not a dialog): heading + help text, a step indicator with a segment bar, question content in a `ScrollArea`, and a Back/Skip/Next(/Generate on Review) footer. A link back to Project Home sits above it.
- **Canvas** (`/editor/[roomId]/canvas`) — the collaborative canvas surface, with its own secondary control bar (save status, starter templates, AI chat toggle — `h-[var(--canvas-toolbar-height)]`, directly under the shared navbar) and a slide-over AI chat panel on the right.
- **Specs** (`/editor/[roomId]/specs`) — a two-pane layout: a spec list on the left (generate action + `ScrollArea`), an inline Markdown preview of the selected spec on the right (reusing `spec-markdown.tsx`'s rendering, not dialog chrome).
- Floating overlays (project sidebar, AI chat panel): dark semi-transparent background and subtle border, fixed relative to the viewport.
- Modals and dialogs (create/rename/delete project, share): centered overlay, `rounded-3xl`, dark background with backdrop blur.
- Navbar: top bar with dark background and bottom border, holding a mode-switcher (Home / Architecture Interview / Canvas / Specs) center-aligned — reuses the AI chat's tab treatment (`text-copy-muted`, active `bg-accent-dim text-brand`).

### Layout Tokens

Shared chrome dimensions live as CSS custom properties in `globals.css` so dependent layout math stays in one place.

| Role                  | CSS Variable              | Value    |
| --------------------- | -------------------------- | -------- |
| Editor navbar height  | `--editor-navbar-height`   | `3.5rem` |
| Canvas toolbar height | `--canvas-toolbar-height`  | `3rem`   |

Anything positioned relative to the navbar or the Canvas route's own secondary toolbar (the AI chat panel's top offset and height, the floating sidebar's top offset) derives from these tokens rather than hardcoding the resulting number. `--canvas-inset-left`/`--canvas-inset-right` are inline custom properties (not tokens in `globals.css`) set by the project sidebar's and AI chat panel's open state respectively, and cascade down to whatever needs to clear them: the floating canvas chrome (zoom controls, presence avatars) on the Canvas route, and the root content padding on Project Home, Architecture Interview, and Specs.

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
