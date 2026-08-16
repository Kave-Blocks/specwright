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
| [collaborator-account.md](collaborator-account.md) | Auth gap in units 38, 39, 40, 41 | A second Clerk account (a person) | ~15 min |
| [browser-verification-40-41.md](browser-verification-40-41.md) | Unit 41's UI, unit 40's failure UI | Nothing | ~45 min |
| [regression-harness.md](regression-harness.md) | No cross-unit regression safety | Nothing | ~30 min |
| [deferred-contrast-measurement.md](deferred-contrast-measurement.md) | Unit 38a item 6's five deferred sites | Nothing | ~30 min |
| [trigger-deploy-audit.md](trigger-deploy-audit.md) | Unknown production state of three tasks | Nothing | ~15 min |
| [accepted-limits.md](accepted-limits.md) | Nothing — it records what is **not** worth chasing | Nothing | Read once |

Unit **42** ([`../feature-specs/42-spec-drift.md`](../feature-specs/42-spec-drift.md)) is the one
gap from this sweep that is genuinely new capability, so it is a numbered unit rather than a plan.
It closes the read half of the change loop: after `41` applies a proposal, the spec no longer
describes the build list, and nothing currently says so.
