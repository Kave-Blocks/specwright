# Collaborator Access — Build Units

**Owning unit:** 38 (`context/progress/38-build-units.md`), spec item 1 of
`context/feature-specs/38a-build-unit-gap-closure.md`
**Blocked on:** a second Clerk account existing with a live session
**Estimated time:** ~5 minutes, most of it the sign-up flow

## What is unproven

Two things, both auth-level:

1. **A non-owner project member can use the build-units routes.** `withProjectMember` is shared
   with already-shipped routes, but unit 38's use of it has never been exercised by a second
   account. Nobody has confirmed a collaborator can GET, POST, PATCH, and DELETE units on a
   project they were invited to.
2. **A signed-in non-member is refused.** The `cross-project` phase already proved *row*
   scoping — a unit id from project B is unreachable through project A's path, returning 404
   with B's row byte-identical afterwards including `updatedAt`. What it could not prove is the
   *membership* half, because with one account every caller is a member of both projects.

Everything else in unit 38 is verified. This is the last open item.

**Units 40 and 41 inherit the same gap**, and for the same reason: their routes use the same
`withProjectMember` guard, and a single account is a member of every project it creates. If you
are already running this check, `npm run verify:apply-http -- all` (unit 41) is worth a second
pass as the collaborator account — it exercises apply, the clear-supersession PATCH, and the
cross-project 404 — but the second account is the only thing missing, so proving it once for
unit 38 proves the guard for all three.

## Why a person is needed

Creating a Clerk account means completing a real sign-up flow, and the harness can only *borrow*
a session that already exists — it cannot create one. That is a deliberate limit, not a gap to
work around. No agent should try.

Note that this has nothing to do with the permission blocks recorded in earlier follow-ups;
those are resolved. `Bash(npm run verify:build-units)` is allowed in `.claude/settings.json`,
`VERIFY_OWNER_EMAIL` is set, and the harness has run clean twice.

## Steps

1. **Create the second account.** Sign up at http://localhost:3000/sign-up with an email you
   control that is **not** the one in `VERIFY_OWNER_EMAIL`. A Clerk dev instance accepts any
   address that can receive the verification code.

2. **Sign in once and leave the session alive.** The harness mints a token against an existing
   active session; without one it fails at setup with a clear message naming the email. Signing
   out afterwards invalidates it — if the run says no active session, sign back in and re-run.

3. **Add the email to `.env.local`:**

   ```
   VERIFY_COLLABORATOR_EMAIL=<the second account's email>
   ```

   Or skip the env var and pass `--collaborator-email=...` on the command line instead.

4. **With the dev server up, run:**

   ```
   npm run verify:build-units -- collaborator
   ```

   You do **not** need to share a project by hand. The harness creates its own throwaways and
   issues the invite through `POST /api/projects/{id}/collaborators` as the owner.

## What a pass looks like

Two sections, ten assertions, all `[PASS]`:

- **Shared project** — owner invites the collaborator, then as the collaborator: `GET` → 200,
  `POST` → 201, `PATCH` → 200 *and the change actually applies*, `DELETE` → 200.
- **A project they were never invited to** — all four verbs → **404**, never 403. A 403 would
  confirm the project exists to someone with no business knowing that; 404 is the contract.

The summary must end with `left behind: nothing`. The teardown path is proven — it deleted all
three throwaways cleanly on the first supervised run — but check the line anyway. Throwaways are
prefixed `verify-build-units-`, so anything stranded is easy to spot in the sidebar and delete.

## If it fails

A failure here is more interesting than a pass. The routes borrow their shape from proven
precedent, so a red assertion most likely means either the guard resolves membership differently
than Specs does, or the 404-not-403 contract leaks somewhere. Send the failing assertion line —
each one prints its own `observed:` detail — to a `debugger` agent rather than patching from the
summary alone.

Setup failures are usually benign: a 415 from Clerk means someone reintroduced the conditional
`Content-Type` in `clerkRequest` (see unit 38's 2026-07-31 follow-up); "no active Clerk session"
means step 2 lapsed.

## What to do with the result

1. Add a `### Follow-up — YYYY-MM-DD` section to `context/progress/38-build-units.md` recording
   the real output — the assertion lines, not a paraphrase.
2. If everything passed, unit 38's `Verified` in `context/progress-tracker.md` can move from
   `partial` to `browser`, and 38a is fully closed. That is the **only** thing still holding it
   at `partial`.
3. Delete this file and its row in [`README.md`](README.md).
