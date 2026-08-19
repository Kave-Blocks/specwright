/**
 * The house badge treatment — the shape, fill, and border every badge in this
 * app wears. `context/ui-context.md` records it as a house style rather than a
 * Build-only one, precisely "so the two surfaces cannot drift apart the way
 * they did once"; it was nevertheless copied verbatim into three files before
 * this constant existed, and Workspace Home's "Shared" badge would have been a
 * fourth.
 *
 * `rounded-full` is deliberate and is *not* the chip radius: a badge reports a
 * value, a chip sets one, so they are shaped apart on purpose.
 *
 * The fill is where it departs from the chips, and the reason is contrast. A
 * badge carries 10px uppercase text, which is under every large-text
 * allowance, so each tone owes WCAG AA 4.5:1 — and on the `bg-subtle` fill the
 * quiet end of the table did not pay it (`text-copy-faint` 2.10:1,
 * `text-copy-muted` 4.27:1). Recessing the pill to `bg-base`, the darkest
 * registered surface, buys the whole table headroom (`text-copy-muted` reaches
 * 5.16:1, and no tone now sits under 5:1). Being opaque and darker than both
 * the card and a row's `hover:bg-elevated`, it also holds that ratio steady
 * while the row is hovered, which an unfilled badge would not.
 *
 * The border is what keeps the pill a visible shape once it is darker than the
 * card rather than lighter, matching the `border border-surface-border bg-base`
 * wells in `spec-markdown.tsx` and `starter-templates-modal.tsx`.
 *
 * **Only the shell is shared — the tone class stays per-site.** Build passes
 * the value's own `toneClass` from `types/build-units.ts`, which is the single
 * source of how a value is worded and colored wherever it is shown; Changes
 * passes its status tone or `text-copy-muted`; Project Home and Workspace Home
 * pass `text-copy-muted`. No badge takes `text-copy-faint`, on any surface.
 */
export const HOUSE_BADGE =
  "rounded-full border border-surface-border bg-base px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase"
