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

### Markdown

Generated specs render with `react-markdown` + `remark-gfm` (tables and task lists are GitHub extensions, not CommonMark). `@tailwindcss/typography` is deliberately **not** installed — a prose plugin's light-mode defaults would fight this palette — so every element is styled explicitly against the tokens above in `components/editor/ai/spec-markdown.tsx`. Raw HTML is not rendered (no `rehype-raw`): spec content is LLM-authored, so any markup in it is escaped to visible text.

## Layout Patterns

- Editor workspace: full-viewport layout — floating sidebar overlay on the left, center canvas, slide-over AI sidebar on the right.
- Sidebars: floating overlay with dark semi-transparent background and subtle border.
- Modals and dialogs: centered overlay, `rounded-3xl`, dark background with backdrop blur.
- Navbar: top bar with dark background and bottom border.

### Layout Tokens

Shared chrome dimensions live as CSS custom properties in `globals.css` so dependent layout math stays in one place.

| Role                | CSS Variable             | Value    |
| ------------------- | ------------------------ | -------- |
| Editor navbar height | `--editor-navbar-height` | `3.5rem` |

Anything positioned relative to the navbar (the floating sidebar's top offset and height) derives from `--editor-navbar-height` rather than hardcoding the resulting number.

## Icons

Lucide React. Stroke-based icons only — no filled variants. Icon sizes: `h-4 w-4` for inline, `h-5 w-5` for buttons, `h-8 w-8` for feature icons in empty states.
