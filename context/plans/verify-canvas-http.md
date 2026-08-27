# `verify:canvas-http` — the layer no browser pass can reach

**Closes:** the **HTTP layer** bullet in [`../progress/43-canvas-write-back.md`](../progress/43-canvas-write-back.md)'s
`## Not Verified` — `POST /api/ai/canvas`'s two 409s, its 404 masking, and its signed-out path.
This is the plan the live proof of 2026-08-27 was required to file in its own place: running that
pass is what made this the next thing `43` needs.

**Does not close:** the **non-member** path, which needs a second Clerk account
([`collaborator-account.md`](collaborator-account.md)) — the same inherited gap
`verify-change-application-http.ts` records and works around with one account.

**Blocked on:** nothing.
**Effort:** ~40 minutes. It is a close sibling of an existing script, not a new idea.

## What the gap is

The 2026-08-27 live proof observed all five push-control states, both drift-notice wordings, and
the end-to-end check the unit exists for. It could not observe a single one of the route's refusals
in isolation, because a browser only ever reaches them through the UI that is designed to prevent
them. [`../../app/api/ai/canvas/route.ts`](../../app/api/ai/canvas/route.ts) answers 401, 400, two
distinct 409s, 404, and 201, and **only the 201 has ever been exercised**.

The two 409s are the interesting ones, and they are the guard this unit's safety argument rests on:

- **"Only an applied change."** A change still `PROPOSED` must not reach the canvas.
- **"Already on the canvas."** A change with `canvasPushedAt` set must not be pushed twice.

The live proof saw the *UI* offer no control in both situations. That is not the same claim. The UI
not offering a button proves nothing about what happens when the request is made anyway, which is
the only version of the claim that matters for a route.

## Why it matters

`verify:apply-http` exists for exactly this reason and its header says why: *"a 404 paired with a
successful write is the bug worth catching, and only re-reading proves its absence."* The canvas
route has the same shape and none of the coverage. It masks a missing project as 404 so a
non-member learns nothing — untested. It refuses a double push — untested. And unlike the apply
route, a successful call here **spends a model call and mutates a shared Liveblocks room**, so a
refusal that silently doesn't refuse is more expensive than a wrong status code.

## The steps

Write `scripts/verify-canvas-write-back-http.ts` as a sibling of
[`../../scripts/verify-change-application-http.ts`](../../scripts/verify-change-application-http.ts).
Read that file first and follow it rather than inventing a second convention — in particular its
Clerk session-token minting against the pinned BAPI version, its Prisma seeding, and its rule that
`CLERK_SECRET_KEY` is never printed, logged, or interpolated into an error.

Cases, each named so a failure says which one broke:

1. **`proposed`** — pushing a change that is still `PROPOSED` answers **409**, and
   `canvasPushedAt` is still null afterwards. Re-read; do not trust the status code alone.
2. **`twice`** — apply, push once, then push again. The second answers **409** and does not
   overwrite `canvasPushedAt`.
3. **`cross-project`** — a change id belonging to another project, requested through a project the
   caller genuinely belongs to, answers **404** — and that project's canvas room is untouched
   afterwards. This is the exact shape of the bug the design route carried since unit 22
   (`../progress/2026-08-17-design-route-room-scoping.md`), so it is the case worth writing first.
4. **`signed-out`** — an unauthenticated push answers **401**, starts no run, and confirms nothing
   about whether the project exists.
5. **`bad-body`** — a malformed body answers **400** and starts no run.

**Spend no model call.** Cases 1, 3, 4 and 5 all refuse before the task is triggered, so they cost
nothing. Case 2 needs one real push to set `canvasPushedAt`; set it directly with Prisma instead
and assert the second request's 409, exactly as the seeding argument in the sibling script does.

Add `verify:canvas-http` to `package.json` and to the `verify:http` chain so it runs in the one
gate with the others.

## What to do with the result

1. Record it as a `### Follow-up — YYYY-MM-DD` in
   [`../progress/43-canvas-write-back.md`](../progress/43-canvas-write-back.md) and move the HTTP
   layer bullet out of its `## Not Verified`.
2. Update unit 43's row in [`../progress-tracker.md`](../progress-tracker.md). It stays **`partial`**
   even so: the collaborator path and `trigger deploy` remain, and `partial` is defined as "some
   checks browser-verified, the file says which".
3. Delete this plan and its row in [`README.md`](README.md).
