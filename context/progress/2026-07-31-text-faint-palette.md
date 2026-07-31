# Text-faint palette — decoration-only decision

_2026-07-31 — cross-unit palette and UI correction, not spec-driven._

## Decision and Rationale

`--text-faint` (`#505060`) is now a **decoration-only token** — icons, chevrons, list markers, non-text decoration only; never text on any surface. The rule lives in `context/ui-context.md` (a sub-bullet under the badge rule, generalizing the pre-existing `**No badge takes text-copy-faint**` line, which remains intact as the special case) and `app/globals.css` carries a doc comment on the token ending "Do not lighten it; use `--text-muted` instead."

### Why the alternative was rejected

`--text-faint` has relative luminance 0.0829, measuring as follows on different backgrounds:

- `bg-base`: 2.53:1
- `bg-surface`: 2.39:1
- `bg-elevated`: 2.24:1
- `bg-subtle`: 2.10:1

To clear WCAG AA's 4.5:1 threshold on `bg-subtle` (the worst case), faint's luminance would need to be ≥ 0.2347. `--text-muted` (`#808090`) sits at 0.2204 — lower than the threshold, and also lower than faint itself. Lightening faint high enough to clear 4.5:1 would make it *brighter than muted*, which inverts the hierarchy the token exists to express. Lightening the token was therefore not "lighten it a bit," it was "delete the token in all but name."

### Accepted cost

The palette loses its quietest text rung, so some two-tone hierarchies flatten. Where a step is still genuinely needed it now comes from *above* — promote the louder line to `text-copy-secondary` — never from below, and never by inventing a tone between faint and muted.

## Scope and Migration

Measured 2026-07-31: 16 `text-copy-faint` class usages across 10 components. After the sweep, 8 remain: 3 licensed as decoration, 5 deferred pending contrast measurement on dynamic backgrounds.

### Migrated faint → muted, with before → after ratios

Each ratio is measured against the actual background each sits on:

- `project-home-view.tsx:134` status line, `bg-base`/`hover:bg-elevated`: 2.53 → 5.16 / 2.24 → 4.56
- `build-view.tsx:194` "(optional)", `bg-surface`: 2.39 → 4.85
- `auth-layout.tsx:62` copyright, `bg-surface`: 2.39 → 4.85
- `canvas-surface.tsx:44` remediation line, `bg-base`: 2.53 → 5.16
- `canvas-surface.tsx:42` headline **promoted** to `text-copy-secondary` (not muted) to preserve the step: 5.16 → 11.11
- `ai-architect-tab.tsx:225` panel on `bg-surface/95`: 2.39 → 4.87
- `share-dialog.tsx:209` `placeholder:` input, `bg-surface`: 2.39 → 4.85 (empty/filled step survives — filled content uses `text-copy-primary` at 16.58:1)
- `spec-markdown.tsx:72` `ol` `marker:`, `bg-base`: 2.53 → 5.16
- `build-unit-row.tsx:252` sequence number, `bg-surface`/`hover:bg-elevated`: 2.39 → 4.85 / 2.24 → 4.56

### Kept as licensed decoration (unchanged)

Three sites continue using `text-copy-faint` because they are decorative, not text:

- `project-home-view.tsx:126` ArrowRight icon
- `build-unit-row.tsx:280` chevron
- `spec-markdown.tsx:66` `ul` marker (note: `ol` marker is content and was migrated)

The `ul`/`ol` marker split is deliberate: `ul` markers are decorative, `ol` markers carry item numbering and are content.

### Five sites deferred

Contrast is not statically computable; measurement depends on live background:

- `canvas-node.tsx:204` and `:222`
- `canvas-edge.tsx:226` and `:239`
- `ai-architect-tab.tsx:270`

**Honest caveat surfaced during implementation:** `ai-architect-tab.tsx:270` is probably measurable and is being deferred by association rather than necessity. It shares the `bg-surface/95` panel with `:225`, which was migrated and clears 4.87:1. The 95% opacity bounds the composite tightly (worst case, a pure-white backdrop, still yields 4.34:1) unlike `canvas-edge`'s genuinely unbounded 80%. Whoever measures the five should expect `:270` to pass.

## Verification

`npx tsc --noEmit` exit 0, `npm run lint` exit 0. Browser pass at 1280×800 on `/editor/testing-ai-design-nvcikx/build` (4 units, mixed statuses) checked the one change that arithmetic could not settle — the sequence number's weight:

- **Verdict: works, borderline.** The eye still lands on titles then summaries; the number does not arrest the scan, because the `w-7` gutter's spatial isolation proved a stronger cue than shared tone.
- **Confirmed reading as index:** monospace, zero-padded numbers still read as identity, not position. Project's genuine sequence gaps (02→03→05→07) confirmed the numbers read as identity.
- **Confirmed weakness:** on neutral-status rows with no summary, the number and both badges sit at one flat `#808090` tone, leaving only the title as a break. Colored-status rows keep three tiers. This is mild, not broken — the badge's pill silhouette still differentiates by shape where color cannot.

**Option recorded, deliberately not implemented:** if this proves annoying, the fix is a background well on the gutter — reinforcing "index" by container rather than tone, which is what helps the neutral case. Explicitly not promoting the title (already 11.11:1 vs the number's 4.85:1, so the top rung is unambiguous) and explicitly not inventing an intermediate tone, which the new rule forbids.

**Canvas surfaces reasoned but not observed:** `canvas-surface.tsx`'s two-line error state (size and tone both step down: `text-sm`/secondary → `text-xs`/muted) was reasoned as headline-then-instruction from composed classes. Reaching it requires forcing a Liveblocks connection failure, which was correctly declined. Record this as inference, not observation.

**No console errors, no failed network requests.** Only the expected Clerk dev-key warning.

## Not Verified

- **Contrast measurement on five dynamic backgrounds** (`canvas-node`, `canvas-edge`, `ai-architect-tab:270`). Deferred because the backgrounds are not statically known until rendering.
- **Canvas error-state visual rendering.** The two-line error is reasoned from composed classes, not observed live.
