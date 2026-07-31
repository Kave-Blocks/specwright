Unit `38` shipped `partial`. Four behaviours it depends on were never exercised through the layer that actually serves them, and one of the four is proven at no layer at all. Separately, `38`'s badge fix left two palette problems visible that it deliberately did not decide. This unit closes both sets. It is verification-led: most of it writes no product code, and finding nothing is a valid outcome for items 1–4 — but the finding has to be *recorded*, not assumed. Do it before unit `39`, which adds `specId` lineage onto `ProjectBuildUnit` and would inherit every one of these gaps.

## Implementation

1. **Second Clerk account — the collaborator path.** The real gap: proven at no layer.
   - `38` verified every write with a single owner session. `withProjectMember` admits owners *and* collaborators, and `38`'s own check-when-done line — "a collaborator who is not the owner can add a unit and change its status" — has never been run.
   - A person creates the second account through the sign-up flow. **No agent may create it.**
   - Invite that account into a project through the share dialog, then from that session confirm it can reach `/editor/[roomId]/build`, add a unit, rename one, change a status and a verification level, and delete a unit.
   - Then the negative halves, which matter more: a signed-out caller and a signed-in non-member must both get no data and no confirmation the project exists.

2. **Cross-project unit-id isolation, through HTTP.**
   - `lib/build-units.ts` scopes every write to `{ id: unitId, projectId }` — `findFirst` before a PATCH, `deleteMany` for a DELETE — and a DB-layer script proved both return not-found for a foreign id. The route layer's *use* of that scoping was never exercised.
   - Take a unit id from project A and PATCH and DELETE it through project B's route, as a genuine member of B. Both must answer 404, and A's unit must be verified untouched afterwards — the row, not just the status code.
   - The UI offers no path to target another project's unit id, which is the point, so this needs a direct authenticated request rather than a browser interaction. See Decision 1 for the mechanism and its current blocked status.

3. **Parallel creation, through HTTP.**
   - The counter's concurrency guarantee is proven at the DB layer by an 8-way stress test — interleaved but distinct contiguous sequences, the `Project` row lock serializing.
   - Through the app, only sequential creation was exercised. Concurrent POSTs at one project's collection route must yield distinct sequence numbers, with no 500s and no unique-constraint leak reaching the client.
   - What this proves that the DB script cannot: that the transaction survives the route layer, connection pooling, and Next's concurrent handler behaviour — none of which a direct-Prisma script touches.

4. **Cascade delete, through the app.**
   - `onDelete: Cascade` is proven at schema level and by a DB-layer script; it was deliberately not exercised through the app to avoid destroying a pre-existing project in the shared account.
   - Create a throwaway project, add units to it, delete it through the normal delete dialog, and confirm the units are gone. **Never an existing project.**

5. **The diverged "Planned" badge** — `components/editor/home/project-home-view.tsx`.
   - Cross-reference Decision 3: the fix is card-scoped, not badge-only.

6. **`--text-faint`.**
   - Cross-reference Decision 2: the token becomes decoration-only, and the rule is recorded before any call site is edited.

## Decisions

Taken 2026-07-31, after planning. These close the open questions the plan raised.

**Decision 1 — items 2 and 3 need a mechanism that does not yet exist.** The original draft proposed driving the page's own `fetch` from an authenticated browser context. That is unavailable in this harness: it requires `mcp__playwright__browser_evaluate`, which is not in the `browser-qa` agent's tool allowlist, and the main session has no browser tools at all. The chosen alternative is a committed, reviewable `scripts/verify-build-units-http.ts` invoked via a `verify:build-units` npm script, mirroring the existing `scripts/simulate-cursor.ts` precedent: it would resolve a short-lived Clerk session token from the Backend API using `CLERK_SECRET_KEY` read from `.env.local` via `dotenv` (never an argument, never logged), against what is a `sk_test` instance. Tokens live ~60s, so it re-mints per phase. Rationale over the alternative of widening `browser-qa`'s allowlist: a committed script is rerunnable and reviewable where a browser transcript is one-shot, and one-shot evidence is exactly the fragility that left these gaps open in `38`; it is also the only mechanism that can do arbitrary concurrency and arbitrary path-shaping, which items 2 and 3 both require. **Status: BLOCKED.** The user approved this approach on 2026-07-31, but the automation classifier denied the agent dispatch, exactly as it denied unit `38`'s earlier attempt. Conversational approval does not clear a harness-level gate. This decision records the intended mechanism; it is not yet authorised to run, and the blocker is a permission rule, not a technical one. The standing scope limit against ad-hoc, unreviewable inline token minting is unaffected either way.

**Decision 2 — `--text-faint` becomes decoration-only (answer (a)).** Lightening the token is arithmetically self-defeating. `#505060` has relative luminance 0.0829 and measures 2.53:1 on `bg-base`, 2.39:1 on `bg-surface`, 2.24:1 on `bg-elevated`, and 2.10:1 on `bg-subtle`. Clearing 4.5:1 on `bg-subtle` requires luminance ≥ 0.235 — brighter than `--text-muted` at 0.2205 — which inverts the hierarchy the token exists to express. Option (b) is therefore not "lighten a bit", it is "delete the token in all but name". So `--text-faint` becomes a non-text tone: icons, chevrons, list markers, decoration; never text on any surface. This generalises a rule `context/ui-context.md` already states for badges rather than introducing a competing one, and it is greppable, which "faint is lighter now" is not. Accepted cost: the palette loses its quietest text rung, so several two-tone hierarchies flatten; where a step is genuinely needed it must now come from *above* — promote the louder line to `text-copy-secondary` — not from below. Five sites are out of scope and deferred to a measured follow-up because their contrast is not statically computable: `canvas-node.tsx:222` (label over a per-node `NODE_COLORS` fill), `canvas-edge.tsx:239` (`bg-surface/80` over an unbounded canvas backdrop), and `ai-architect-tab.tsx:270` (semi-transparent floating panel), plus — added at implementation, 2026-07-31 — the two `placeholder:` uses at `canvas-node.tsx:204` and `canvas-edge.tsx:226`, which are text and would otherwise migrate but sit in those same two components and share the same unmeasurable backdrop, so all five get measured together. `spec-markdown.tsx`'s `marker:` uses split: `ul` markers are decorative and keep the token, `ol` markers carry item numbering and move.

**Decision 3 — item 5 is card-scoped, not badge-only.** `opacity-50` on the container forms a compositing group, so foreground and background both pre-multiply against `bg-base` before the ratio is taken: badge text `text-copy-muted` → `#44444D`, badge fill `bg-subtle` → `#131316`, ratio **1.93:1** — worse than the 2.10:1 that `38`'s QA pass called "a barely-there smudge". The badge is not the card's only failure: composited, the description is 2.08:1, the icon tile 1.93:1 against a 3:1 requirement, and the title 4.81:1 (passes, barely). Fixing only the badge makes the card look *more* broken — a crisp pill on washed-out prose reads as a rendering error, where a uniform wash reads as intentional. Treatment: drop `opacity-50`, adopt `38`'s shipped badge string verbatim, and set title and description to `text-copy-muted`. The title is why this does not raise the card's weight — composited today it is luminance 0.2024 against `text-copy-muted`'s 0.2205, a 9% step that is perceptually identical, while the ratio goes 4.81 → 5.16:1. The description genuinely does get louder, 2.08 → 5.16:1; nothing exists between faint and muted, so that is unavoidable and is accepted rather than worked around. Subordination to the four active cards is then carried by three independent signals: a muted title against their `text-copy-primary`, no arrow, and no hover or focus state. Worth noting the compliance case here is arguable — WCAG 1.4.3 exempts inactive components and this card is genuinely inactive — so the real driver is consistency with the badge `38` modelled on it (conflict C1), not compliance. Implementer note: `opacity-100` on a descendant does not escape an ancestor's compositing group.

**Decision 4 — no `38a` progress file.** `_TEMPLATE.md` requires a progress file to take the same number and name as its spec, forbids renumbering, and routes later findings against a shipped unit into that unit's own file as `### Follow-up — YYYY-MM-DD`. There is no `NNa` precedent anywhere in `context/`. So this spec exists, but its findings do not get a matching progress file: items 1–5 go into `context/progress/38-build-units.md` as a `### Follow-up — 2026-07-31` section, where the next person reading "what was proven about build units" will actually find them; item 6 spans 16 `text-copy-faint` call sites across 10 components (measured 2026-07-31, not the nine this originally estimated) and is not spec-driven, so it gets its own dated cross-unit file `context/progress/2026-07-31-text-faint-palette.md`; and unit `38`'s existing row in `context/progress-tracker.md`'s Unit Index is updated in place, its `Verified` column moving `partial` → `browser` if all four gaps close.

## Dependencies

Already installed:

- `dotenv` and `tsx` — both present, and both are what the harness would use for the script in Decision 1.

To install:

- nothing.

No new environment variables; `CLERK_SECRET_KEY` already exists. No model calls anywhere in this unit, and nothing reaches Vercel Blob.

**Human prerequisite:** a second Clerk account, created by a person through the sign-up flow, with a known email address — `getAccessibleProject` matches collaborators by email, not user id, so the email is what gets invited. Item 1 cannot start without it.

## Scope Limits

- do not make any AI or model call anywhere in this unit
- do not mint, forge, or programmatically issue Clerk session tokens outside the reviewed script of Decision 1; a second *identity* is always created by a person regardless
- do not change `ProjectBuildUnit`'s schema, its enums, or the sequence counter
- do not weaken or re-place the row scoping in `lib/build-units.ts` to make a test easier — the scoping is the thing under test
- do not add a test framework; this repo has none, and choosing one is its own unit
- do not fix `text-copy-faint` usages one file at a time without first recording the rule
- do not raise the Planned card's visual weight to where it competes with the four real cards
- do not touch the three sites Decision 2 defers
- do not begin unit `39` until this unit's index row is no longer `specced`

## Notes

- `context/progress/38-build-units.md` is the source for what was and was not proven, and at which layer. Read its "Not verified" section before starting.
- `38`'s QA screenshots lived in the session scratchpad and are gone; the written findings are the durable record.
- A dev server is confirmed still running on port 3000 from `38`'s QA pass — reuse it, do not start another.
- `.playwright-mcp/` is gitignored; browser QA writes console and page artifacts into the repo root and they should stay untracked.
- Items 1–4 are verification, so a passing result is a *recorded* result. If something fails, that is a real defect in already-shipped code — fix it and record it as a follow-up against `38`, not as a new unit.
- Two operational constraints:
  - **Browser sessions are exclusive.** `browser-qa` uses a single shared Chrome on a fixed user-data-dir, so two signed-in profiles cannot be held at once. Signing in as the second account ends the first's session and invalidates any active session a harness would resolve — so run items 2 and 3 as the owner *before* the collaborator browser pass, and have a person sign back in afterwards if anything else needs it.
  - **Concurrent creates burn sequence numbers permanently**, because the counter never rolls back on delete. Use throwaway projects and keep N ≤ 8, matching the existing DB stress test and staying clear of `MAX_BUILD_UNITS = 200`.

## Check When Done

- A collaborator who is not the owner can open a project's Build page, add a unit, rename it, change its status and its verification, and delete it.
- A signed-out caller and a signed-in non-member both receive no unit data and no confirmation the project exists.
- A unit id from another project cannot be updated or deleted through a project the caller does belong to — both answer 404, and the foreign unit is confirmed unchanged afterwards.
- Concurrent creates issued through the collection route against one project receive different sequence numbers, with no 500 and no constraint error reaching the client.
- Deleting a throwaway project through the app removes its build units.
- Project Home's "Planned" card clears WCAG AA on every element and still reads as non-interactive rather than as a fifth active option.
- `context/ui-context.md` states what `--text-faint` is for, and no text under 14px uses a tone that fails AA against its own background, except the three sites Decision 2 names as deferred.
- `context/progress/38-build-units.md` carries a `### Follow-up — 2026-07-31` section recording each of items 1–4 as proven or failed, naming the layer it was proven at, with no item left implied.
- `npm run build` passes without type errors.
