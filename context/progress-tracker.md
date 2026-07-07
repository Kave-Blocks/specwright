# Progress Tracker

Update this file whenever the current phase, active feature, or implementation state changes.

## Current Phase

- Not started (next unit not yet picked up)

## Current Goal

- Pick up `02-editor-chrome.md`.

## Completed

- `01-design-system.md` — shadcn/ui (Base UI flavor, Nova preset) installed and configured; components added: Button, Card, Dialog, Input, Tabs, Textarea, ScrollArea; lucide-react installed; `lib/utils.ts` cn() helper created by the CLI; `app/globals.css` rewritten so the dark palette from `ui-context.md` drives shadcn's semantic tokens; `dark` class added to `<html>` in `app/layout.tsx`. Verified with `next build` + a temporary preview route rendered in a real browser.

## In Progress

- None.

## Next Up

- 02-editor-chrome.md

## Open Questions

- None.

## Architecture Decisions

- shadcn CLI (v4.13.0) defaults to Base UI (`@base-ui/react`) rather than Radix UI as the primitive layer, and to a "Nova" preset (Lucide icons + Geist fonts) — matches this project's existing icon/font choices, so kept the default instead of forcing `--base radix`.
- The dark palette from `ui-context.md` is defined as raw CSS custom properties (`--bg-base`, `--text-primary`, etc.) in `app/globals.css`, then mapped onto shadcn's semantic variables (`--background`, `--card`, `--primary`, ...) so generated `components/ui/*` files stay untouched and still render on-theme.
- `--color-base` was deliberately NOT registered as a `@theme inline` color token: Tailwind's built-in `--text-base` font-size scale key collides with any color named "base", which silently turned every `text-base` (font-size) utility into a text-color rule and made card titles nearly invisible. Fixed by declaring `bg-base` as a standalone `@utility` instead. Keep this in mind before adding more single-word token names — check for collisions with Tailwind's reserved scale keys (`base`, `sm`, `lg`, `xl`, etc.) first.

## Session Notes

- Add context needed to resume work in the next session.
