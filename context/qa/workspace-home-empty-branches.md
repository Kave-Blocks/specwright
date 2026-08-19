# Workspace Home's two empty branches

## What is unproven

`/editor` has three branches. The browser pass on 2026-08-19 exercised one of them — the
"Jump back in" grid — because that is the only branch reachable from an account that owns
projects. The other two have never been rendered:

1. **Zero owned, has shared** — the grid is the *shared* projects, under the "Shared with you"
   heading and copy that says they belong to someone else and names creating your own as the start
   path. The specific thing to check is that **the screen never says the user has no projects**,
   because the sidebar is on screen listing the ones in the grid and would visibly contradict it.
2. **True zero** — no grid at all, the three start-work cards promoted under "Start your first
   project", and one sentence defining what a Specwright project is.

Both branches are proved by nothing today except that they type-check.

## Why a person is needed

Neither is an account state the existing test account can be put into.

- Branch 1 needs an account that **owns nothing** but has been added as a collaborator on someone
  else's project — which needs a *second* Clerk account to own that project and invite the first.
  It is the same blocker as [`collaborator-access.md`](collaborator-access.md), and the two can be
  done in one sitting.
- Branch 2 needs an account that owns nothing and is shared nothing. Deleting the test account's
  projects to reach it destroys real data; a fresh Clerk sign-up is the honest way, and signing up
  is a human step.

## The steps

**Branch 2 is the cheaper one and needs no coordination.** Sign up a brand-new Clerk account,
sign in, and land on `/editor`. Check:

- The heading reads "Start your first project" and the sentence beneath it describes what a
  Specwright project is.
- There is **no grid** — no project cards at all.
- The three start-work cards are present: "New project", "Start with a guided interview",
  "Browse starter designs".
- The sidebar's two tabs both read empty ("No projects yet" / "No shared projects yet") and do not
  contradict the screen.

**Branch 1, from that same new account.** Have the original account share one of its projects with
the new account's email (Share dialog inside any project). Reload `/editor` on the new account
*before* creating anything on it. Check:

- The heading reads "Shared with you", and the copy acknowledges the projects belong to someone
  else and points at creating your own.
- **No sentence anywhere claims the user has no projects.**
- The grid holds the shared project, and it carries the "Shared" badge.
- The start-work section is present below it.

Then create a project on the new account and reload: the screen must switch to the "Jump back in"
branch, with the shared project still in the grid but now after the owned one.

## What to do with the result

Record it in [`../progress/45-workspace-home.md`](../progress/45-workspace-home.md) as a
`### Follow-up — YYYY-MM-DD` section, update unit `45`'s row in
[`../progress-tracker.md`](../progress-tracker.md) (`partial` → `browser` if nothing else is
outstanding), then **delete this file**.
