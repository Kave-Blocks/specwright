# Manual QA Checks

Checks that need a person — a second account, a real payment, a device Specwright's tooling
cannot drive — and so cannot be closed by an agent or a script alone.

This folder is deliberately **not** `context/progress/`. Progress files record what *has* been
verified; these files record what is *waiting on a human step*, with enough detail that the
person doing it does not have to reconstruct the setup first.

## Convention

- One file per check: `context/qa/<short-slug>.md`.
- Each file states, in order: **what is unproven**, **why a person is needed**, **the exact
  steps**, and **what to do with the result**.
- The unit's row in [`../progress-tracker.md`](../progress-tracker.md) stays at its honest
  `Verified` level until the check runs. Filing it here does not upgrade it.
- When a check is done, record the outcome in the owning unit's `context/progress/NN-name.md`
  as a `### Follow-up — YYYY-MM-DD` section, update the index row, then **delete the file
  here**. This folder holds only outstanding work.

## Outstanding

| Check | Owning unit | Blocked on |
| --- | --- | --- |
| [collaborator-access.md](collaborator-access.md) | 38 / 38a item 1 | A second Clerk account |
| [workspace-home-empty-branches.md](workspace-home-empty-branches.md) | 45 | A fresh Clerk account (and a second one for the shared branch) |
