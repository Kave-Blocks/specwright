# Progress Tracker

Update this file whenever the current phase, active feature, or implementation state changes.

## Current Phase

- Not started (next unit not yet picked up)

## Current Goal

- Pick up `03-auth.md`.

## Completed

- `01-design-system.md` — shadcn/ui (Base UI flavor, Nova preset) installed and configured; components added: Button, Card, Dialog, Input, Tabs, Textarea, ScrollArea; lucide-react installed; `lib/utils.ts` cn() helper created by the CLI; `app/globals.css` rewritten so the dark palette from `ui-context.md` drives shadcn's semantic tokens; `dark` class added to `<html>` in `app/layout.tsx`. Verified with `next build` + a temporary preview route rendered in a real browser.
- `02-editor-chrome.md` — `components/editor/editor-navbar.tsx` (fixed-height top navbar, left/center/right sections, sidebar toggle button swapping `PanelLeftOpen`/`PanelLeftClose` based on `isSidebarOpen`, dark `bg-surface` background with `border-b border-surface-border`) and `components/editor/project-sidebar.tsx` (fixed-position floating panel — does not push page content — that slides in/out via a `translate-x` transition, `Projects` header with close button, shadcn `Tabs` for "My Projects" / "Shared" each with an empty placeholder state, full-width `New Project` button with `Plus` icon). Both are controlled components (`isOpen`/`isSidebarOpen` + callback props); the parent that wires shared state together is deferred to `08-editor-workspace-shell.md`. The dialog pattern requirement (title/description/footer, token-driven styling, no real dialogs yet) is already satisfied by the existing `components/ui/dialog.tsx` from `01-design-system.md` — its `DialogTitle`/`DialogDescription`/`DialogFooter` already resolve through the semantic tokens mapped in `globals.css`, so no new code was needed there. Verified with `next build`, lint, and a temporary preview route (open/closed states, tab switching) rendered in a real browser, then removed.

## In Progress

- None.

## Next Up

- 03-auth.md

## Open Questions

- None.

## Architecture Decisions

- shadcn CLI (v4.13.0) defaults to Base UI (`@base-ui/react`) rather than Radix UI as the primitive layer, and to a "Nova" preset (Lucide icons + Geist fonts) — matches this project's existing icon/font choices, so kept the default instead of forcing `--base radix`.
- The dark palette from `ui-context.md` is defined as raw CSS custom properties (`--bg-base`, `--text-primary`, etc.) in `app/globals.css`, then mapped onto shadcn's semantic variables (`--background`, `--card`, `--primary`, ...) so generated `components/ui/*` files stay untouched and still render on-theme.
- `--color-base` was deliberately NOT registered as a `@theme inline` color token: Tailwind's built-in `--text-base` font-size scale key collides with any color named "base", which silently turned every `text-base` (font-size) utility into a text-color rule and made card titles nearly invisible. Fixed by declaring `bg-base` as a standalone `@utility` instead. Keep this in mind before adding more single-word token names — check for collisions with Tailwind's reserved scale keys (`base`, `sm`, `lg`, `xl`, etc.) first.
- `EditorNavbar` and `ProjectSidebar` are controlled components (open/close state lives in a future parent), not self-managing — this keeps them reusable once `08-editor-workspace-shell.md` composes the full editor shell and adds more sidebar/navbar consumers.

## Session Notes

- Next.js App Router treats any `app/` folder prefixed with `_` as a private folder excluded from routing entirely — a temporary preview route must NOT be underscore-prefixed or it 404s silently. Use a plain folder name (e.g. `app/preview-x/`) and delete it after verifying in the browser.
- The Playwright MCP browser is a single shared Chrome instance keyed by a fixed user-data-dir; if a prior session left it open (idle on `about:blank`), new `browser_navigate` calls fail with "Browser is already in use" until that stray process is killed.
