# Generate Spec fails on a cold load of `/specs`

**Found by:** the live proof of 2026-08-27
([`../progress/43-canvas-write-back.md`](../progress/43-canvas-write-back.md)'s follow-up). It is
**not** a `43` defect — it belongs to the spec-generation surface (`27`–`29`, `36`) — but it blocked
that pass until it was routed around, so it is recorded here rather than lost.

**Blocked on:** nothing.
**Effort:** ~30 minutes, most of it deciding what the button should do while Storage is resolving.

## What the gap is

On a **fresh page load** of `/editor/{projectId}/specs`, pressing **Generate Spec** fails
immediately with the inline error:

> Add some nodes to the canvas before generating a spec

The canvas held **eight saved nodes** at the time. **No request is sent** — the network log shows no
POST at all, so the check is running client-side against a Liveblocks Storage subscription that has
not resolved yet. Reproduced three times: a full reload with a 5-second wait, with a 10-second wait,
and in a completely fresh single-tab session with an 8-second wait.

Reached the other way — client-side navigation from the canvas tab to the specs tab, keeping the
room connection warm — the identical action **succeeds immediately**.

## Why it matters

The error is not merely mistimed, it is **false and actionable in the wrong direction**. It tells
the person the canvas is empty and instructs them to go draw nodes that already exist. Someone who
believes it will either draw duplicates or conclude their canvas did not save. For a product whose
entire claim is that a record of what was built survives, a spec surface that reports an empty
canvas is close to the worst available lie.

It also hides itself well. Anyone moving through the app by clicking never sees it, because the room
is already warm; it appears on a reload, a deep link, or a bookmark — which is exactly how someone
returning to a project arrives. And it defeated a deliberate verification pass, which is the
strongest evidence available that it defeats users.

## The steps

1. **Confirm the mechanism before changing anything.** Find where the specs view reads node count.
   The claim to verify is that it reads from a Liveblocks Storage hook that returns empty (not
   `null`, not loading) before hydration, and that the button's enabled state is not gated on the
   same signal. Do not fix past this step until the reading is confirmed — a race fixed by guessing
   usually moves.
2. **Distinguish "not loaded yet" from "loaded and empty."** These are different states presenting
   identically, which is the whole bug. The room's connection or Storage status is the signal that
   separates them.
3. **Make the control honest in the third state.** While Storage is resolving, Generate Spec should
   not be pressable-and-wrong. Disabled with a connecting affordance, or pressable but deferring the
   check until Storage resolves — either is defensible; silently failing with a false reason is not.
   Follow [`../ui-context.md`](../ui-context.md) for the disabled and loading treatments rather than
   inventing one.
4. **Check the sibling surfaces.** Anything else gated on node count read the same way has the same
   bug on a cold load. The Changes tab's push control and the drift notice are the obvious
   candidates, since both are computed from canvas state. If they are affected, fix them in the same
   pass — this is one mistake, not three.

## What to do with the result

Record it against the spec-generation unit it turns out to belong to — `36` if the read lives in the
stack-aware specs view, otherwise `27`–`29` — as a `### Follow-up — YYYY-MM-DD`, and update that
unit's row in [`../progress-tracker.md`](../progress-tracker.md). Then delete this plan and its row
in [`README.md`](README.md).

If step 4 finds the sibling surfaces affected, say so in the follow-up explicitly. A cold-load race
that reached three controls is a pattern worth naming in
[`../architecture-context.md`](../architecture-context.md), the way the room-scoping bug became the
rule *a route that access-checks one id and acts on another is the bug*.
