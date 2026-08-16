# Deferred Contrast Measurement — The Five Remaining `text-copy-faint` Sites

**Closes:** the last open item of unit 38a item 6
**Blocked on:** nothing
**Effort:** ~30 minutes, mostly a browser pass

## What the gap is

Unit 38a item 6 made `--text-faint` **decoration-only, never text** — a palette-level rule, with
the arithmetic written into `context/ui-context.md` so nobody re-opens it by "just lightening the
token a little". Sixteen usages were swept: eight migrated to `text-copy-muted`, three licensed as
genuine decoration (icons, chevrons, list markers).

**Five were deferred**, and they are still deferred. All five sit on backgrounds that are not
statically computable from the palette tokens, so the sweep could not measure them and guessing
was judged worse than waiting:

| Site | Why it could not be measured |
| --- | --- |
| `components/editor/canvas/canvas-node.tsx:222` | Label over a per-node `NODE_COLORS` fill — the background is user-chosen |
| `components/editor/canvas/canvas-node.tsx:204` | `placeholder:` on the same node fill |
| `components/editor/canvas/canvas-edge.tsx:239` | `bg-surface/80` over an **unbounded** canvas backdrop |
| `components/editor/canvas/canvas-edge.tsx:226` | `placeholder:` on the same |
| `components/editor/ai/ai-architect-tab.tsx:270` | Chat timestamp on the `bg-surface/95` floating panel |

## The one thing to know before starting

`context/progress/2026-07-31-text-faint-palette.md` records an honest caveat that saves you time:

> `ai-architect-tab.tsx:270` is probably measurable and is being deferred by association rather
> than necessity. It shares the `bg-surface/95` panel with `:225`, which was migrated and clears
> 4.87:1. The 95% opacity bounds the composite tightly (worst case, a pure-white backdrop, still
> yields 4.34:1) unlike `canvas-edge`'s genuinely unbounded 80%. Whoever measures the five should
> expect `:270` to pass.

So expect **four** real questions, not five. And note 4.34:1 is *below* 4.5:1 — worst case it
fails marginally, which is itself the answer.

## Why it matters, and why it is low priority

It matters because five sites currently sit outside a rule the project has already decided, and an
undecided exception erodes the rule. It is low priority because none is on a primary reading path:
two are placeholders, one is a timestamp, two are labels on user-coloured surfaces.

Do this **after** the collaborator account and the browser passes. It is genuinely the least
urgent item on the list, and it is on the list only so it does not quietly become permanent.

## Steps

1. **Measure, do not eyeball.** For each site, get the *composited* background — the actual
   rendered pixel behind the text, not the token. In a browser pass, screenshot each site and
   sample the pixel; `canvas-node` needs sampling on the **lightest and darkest** entries of
   `NODE_COLORS`, since the label sits on whichever the user picked.

2. **Compute the ratio at the real font size.** Note which sites are under `text-xs` (12px) and
   which are smaller — the AA threshold is 4.5:1 for both, but 3:1 applies only to large text and
   none of these qualify.

3. **Decide each site by what the measurement says**, using the rule already in
   `ui-context.md`:
   - **Clears 4.5:1 on every reachable background** → it is licensed decoration or acceptable
     text; record the number and leave it.
   - **Fails on any reachable background** → migrate to `text-copy-muted`. If that flattens a
     needed hierarchy step, take the step from **above** — promote the louder line to
     `text-copy-secondary` — never from below. `canvas-surface.tsx`'s error state is the worked
     example.
   - **Unbounded background** (`canvas-edge.tsx:239`, `:226`) → this cannot clear a threshold for
     *all* backgrounds, so it cannot stay as text. Either migrate it, or give the element an
     opaque fill so the composite becomes computable. The second is a design change and belongs
     to `designer`, not to a patch made in the moment.

4. **Record the numbers in `ui-context.md`**, replacing the "five sites deferred pending
   measurement" bullet with what was actually found. A rule with measured exceptions is durable;
   a rule with a permanent "deferred" list is not.

5. **Re-run the gates:** `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## What to do with the result

1. Add a `### Follow-up — YYYY-MM-DD` to
   `context/progress/2026-07-31-text-faint-palette.md` — it is that file's own open item.
2. Update the deferred-sites bullet in `context/ui-context.md` with the measured ratios.
3. If any site changed, note it on unit 38a's record in `context/progress/38-build-units.md`.
4. Delete this plan and its row in [`README.md`](README.md).
