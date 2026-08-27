# Plans

Work that is **decided but not started**, written so the person doing it does not have to
reconstruct the reasoning first.

This folder sits between the other three:

| Folder | Holds | Deleted when |
| --- | --- | --- |
| [`../feature-specs/`](../feature-specs/) | What to build, per numbered unit | Never — it is the record of intent |
| [`../progress/`](../progress/) | What actually happened | Never — it is the record of outcome |
| [`../qa/`](../qa/) | Checks blocked on a **human step** (a second account, a real payment) | When the check runs |
| **`plans/`** | Chores, gap-closures, and maintenance that no unit owns | When the work lands |

A plan is not a feature spec. If the work adds user-visible capability it belongs in
`feature-specs/` with a number; a plan is for the things a numbered unit would never contain —
harness changes, deferred measurements, accepted limits, verification passes against work that
already shipped.

## Convention

- One file per plan: `context/plans/<short-slug>.md`.
- Each states, in order: **what the gap is**, **why it matters**, **the exact steps**, and
  **what to do with the result**.
- Filing a plan does **not** change any unit's `Verified` level in
  [`../progress-tracker.md`](../progress-tracker.md). Only running the work does.
- When the work lands, record it in the owning unit's `context/progress/NN-name.md` as a
  `### Follow-up — YYYY-MM-DD` (or its own `YYYY-MM-DD-slug.md` if it spans units), then
  **delete the plan file** and its row below.

## Outstanding

Ordered by leverage — what unblocks the most for the least effort, first.

| Plan | Closes | Blocked on | Rough effort |
| --- | --- | --- | --- |
| [specs-cold-load-race.md](specs-cold-load-race.md) | A false "canvas is empty" error on every cold load of `/specs` — shipped, user-facing, and self-hiding | Nothing | ~30 min |
| [verify-canvas-http.md](verify-canvas-http.md) | Unit 43's HTTP layer — the route's two 409s, its 404 masking, its signed-out path | Nothing | ~40 min |
| [collaborator-account.md](collaborator-account.md) | Auth gap in units 38, 39, 40, 41 | A second Clerk account (a person) | ~15 min |
| [browser-verification-40-41.md](browser-verification-40-41.md) | Unit 40's failure UI (41's and 42's passes done 2026-08-16) | Nothing | ~20 min |
| [deferred-contrast-measurement.md](deferred-contrast-measurement.md) | Unit 38a item 6's five deferred sites | Nothing | ~30 min |
| [trigger-deploy-audit.md](trigger-deploy-audit.md) | Unknown production state of three tasks | Nothing | ~15 min |
| [accepted-limits.md](accepted-limits.md) | Nothing — it records what is **not** worth chasing | Nothing | Read once |

Two plans came out of building unit **43**, and **both have now landed.**
`design-route-room-scoping.md` landed **2026-08-17**
([`../progress/2026-08-17-design-route-room-scoping.md`](../progress/2026-08-17-design-route-room-scoping.md)):
`POST /api/ai/design` stopped accepting a `roomId` it never access-checked, closing a cross-project
canvas write and delete. It was ordered ahead of the live proof on purpose — a small change to
shipped code that closed something reachable today, against a longer piece of work that closes
something only *unproven*.

`canvas-write-back-live-proof.md` landed **2026-08-27**, and the loop was finally observed closing:
a change applied, pushed to the canvas, and a spec generated from that canvas containing *"The
Realtime Canvas interacts with a Sync Queue for managing real-time updates."* All five push-control
states and both drift-notice wordings were seen. `43` moved `structural` → **`partial`**, never
`browser` — the HTTP layer and the collaborator path were always out of a browser pass's reach,
which is why `verify-canvas-http.md` sits at the top of the table above.

**Three rows were filed by that one pass**, which is the folder's own thesis
arriving on schedule: the live proof closed 43's end-to-end gap and found the route's untested
refusals, an `updateNode` free to relabel a node the change never named, and — outside 43 entirely —
a cold-load race telling people their canvas is empty when it is not. Note which of the three is
most valuable: the one that had nothing to do with the unit being verified. A pass that only
confirms what it set out to confirm is a pass that was not looking.

The `updateNode` one **landed the same day**: the owner chose to constrain the target, and an
`updateNode` now survives only against a node the change's delta names — refused elsewhere,
reported to the person, and counted apart from the destructive drops. `verify:db` went from 253
assertions to **278**. The reasoning is in
[`../architecture-context.md`](../architecture-context.md)'s `## Canvas Write-Back`; the record is
`43`'s second follow-up of 2026-08-27.

Unit **42** ([`../progress/42-spec-drift.md`](../progress/42-spec-drift.md)) was the one gap from
that sweep that is genuinely new capability, so it was a numbered unit rather than a plan. It
**shipped 2026-08-16** and closed the read half of the change loop: after `41` applies a proposal,
the spec no longer describes the build list, and now something says so.

Building it turned up the thing this folder exists to prevent being lost — the drift was countable
but **not resolvable**, because a spec is generated from the canvas and an applied change never
reached it. That became unit **43**
([`../progress/43-canvas-write-back.md`](../progress/43-canvas-write-back.md)), which **shipped
2026-08-17** and closed the write half in structure.

Building *that* turned up two more, and the pattern is worth naming because it has now happened
twice: **the unit that closes a gap is the one that finds the next one.** 43's live proof is the
ordinary kind of follow-up — a shipped unit whose end-to-end check needs a browser. The
room-scoping fix was the other kind, and the more valuable: it was found by writing down *why*
43's new route deliberately does not mirror the design route it was told to copy. A deviation that
has to be justified in prose is a good place to look for a bug in what it deviated from. That one
paid out — the design route had been accepting an unverified room id since unit 22.

### On unit 43's recorded deviations

Three are listed in its progress file. **None of them is outstanding work, and the spec must not be
edited to match them** — `feature-specs/` is the record of intent and is never rewritten, which is
exactly why the deviation belongs in `progress/`. Two were improvements on the spec (deriving the
room server-side; extracting the refusal rule and the AI presence identity so neither is written
twice) and one was a distinction without a difference (the spec asked for the push control in two
places that turned out to be the same place). The one thing they *did* warrant was chasing the
general lesson — which became the room-scoping fix, shipped 2026-08-17, and the rule now recorded
in [`../architecture-context.md`](../architecture-context.md)'s `## Canvas Write-Back`: **a route
that access-checks one id and acts on another is the bug.**
