# 01 — design-system

Spec: [`context/feature-specs/01-design-system.md`](../feature-specs/01-design-system.md)

- `01-design-system.md` — shadcn/ui (Base UI flavor, Nova preset) installed and configured; components added: Button, Card, Dialog, Input, Tabs, Textarea, ScrollArea; lucide-react installed; `lib/utils.ts` cn() helper created by the CLI; `app/globals.css` rewritten so the dark palette from `ui-context.md` drives shadcn's semantic tokens; `dark` class added to `<html>` in `app/layout.tsx`. Verified with `next build` + a temporary preview route rendered in a real browser.
