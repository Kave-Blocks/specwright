# Collaborator Account — One Step, Four Units

**Closes:** the auth gap carried by units 38, 39, 40, and 41
**Blocked on:** a second Clerk account existing with a live session — a genuine human step
**Effort:** ~15 minutes, most of it the sign-up flow

## What the gap is

Every project route in units 38–41 is guarded by `withProjectMember`. With **one** Clerk account,
every caller in every test is the owner of every project it touches, so two halves of that guard
have never executed:

1. **A non-owner member can use the routes.** Nobody has confirmed a collaborator can list, add,
   patch, or delete build units, or apply a change, on a project they were invited to.
2. **A signed-in non-member is refused with 404, never 403.** Unit 38's `cross-project` phase
   proved *row* scoping (project B's unit id is unreachable through project A's path, with B's
   row byte-identical afterwards including `updatedAt`). What it could not prove is the
   *membership* half — with one account there is no stranger to be refused.

A 403 would confirm a project exists to somebody with no business knowing that. 404 is the
contract, and it is untested.

## Why it is worth doing first

This is the highest-leverage item on the whole list. The four units share **one** guard, so
proving it once proves it for all of them:

- Unit 38 moves `partial → browser`, and 38a item 1 — open across three units — closes outright.
- Units 39, 40, and 41 each drop their "collaborator path, inherited from 38" caveat.

The permission and env blockers that stalled this for two units are gone
(`.claude/settings.json` allows `Bash(npm run verify:build-units)`, `VERIFY_OWNER_EMAIL` is set).
What remains is genuinely an account-creation step, not a tooling problem. **No agent can do it** —
the harness can only *borrow* a Clerk session that already exists; it cannot create one.

## Steps

1. **Create the second account.** With `npm run dev` running, sign up at
   <http://localhost:3000/sign-up> with an email you control that is **not** the one in
   `VERIFY_OWNER_EMAIL`. A Clerk dev instance accepts any address that can receive the code.

2. **Sign in once and leave the session alive.** The harness mints a token against an existing
   *active* session. Signing out invalidates it — if a run reports "no active Clerk session",
   sign back in and re-run.

3. **Add the email to `.env.local`:**

   ```
   VERIFY_COLLABORATOR_EMAIL=<the second account's email>
   ```

4. **Allow the second harness** in `.claude/settings.json` if it is not already there — the
   change-application HTTP script is new since that file was last edited:

   ```jsonc
   "allow": [
     "Bash(npm run verify:build-units)",
     "Bash(npm run verify:apply-http)"
   ]
   ```

5. **Run unit 38's collaborator phase** (dev server up):

   ```bash
   npm run verify:build-units -- collaborator
   ```

   You do **not** need to share a project by hand — the harness creates its own throwaways and
   issues the invite through `POST /api/projects/{id}/collaborators` as the owner.

6. **Then run unit 41's suite as the collaborator.** This is the extension worth doing while the
   account is fresh, and it is the only step not already written up in
   [`../qa/collaborator-access.md`](../qa/collaborator-access.md):

   ```bash
   VERIFY_OWNER_EMAIL=<the second account's email> npm run verify:apply-http -- all
   ```

   The override makes the *collaborator* the acting caller. Six of its phases seed projects owned
   by that caller, so they prove a member can apply, clear supersession, and be refused
   cross-project — but note the honest limit below.

## What a pass looks like

**Step 5** — two sections, ten assertions, all `[PASS]`:

- **Shared project** — owner invites the collaborator; then as the collaborator: `GET` → 200,
  `POST` → 201, `PATCH` → 200 *and the change actually applies*, `DELETE` → 200.
- **A project they were never invited to** — all four verbs → **404**, never 403.

The summary must end with `left behind: nothing`. Throwaways are prefixed
`verify-build-units-`, so anything stranded is easy to spot in the sidebar.

**Step 6** — the same 36 checks that passed for the owner, now passing for the second account.

## The honest limit of step 6

Running unit 41's harness under a different `VERIFY_OWNER_EMAIL` proves *that account* can apply
a change to projects **it owns**. It does not prove a non-owner *collaborator* can apply one,
because the script seeds projects with `ownerId` set to the acting caller.

Proving the collaborator-applies path properly needs one more phase in
`scripts/verify-change-application-http.ts`: seed as the owner, invite the second account through
`POST /api/projects/{id}/collaborators`, then apply as the collaborator. That is a ~30-line
addition modelled directly on `verify-build-units-http.ts`'s `collaborator` phase.

**Decide deliberately:** if step 5 passes, the guard is proven for the routes it covers and unit
41's apply route uses the identical guard with no per-route logic — so extending the harness is
belt-and-braces rather than a real gap. Write the extra phase only if you want the stronger
claim; either way, say which you chose in the follow-up.

## If it fails

A failure here is more interesting than a pass. These routes borrow their shape from proven
precedent, so a red assertion most likely means the guard resolves membership differently than
Specs does, or the 404-not-403 contract leaks somewhere. Each assertion prints its own
`observed:` detail — send the failing line to a `debugger` agent rather than patching from the
summary.

Setup failures are usually benign: a 415 from Clerk means someone reintroduced the conditional
`Content-Type` in `clerkRequest` (unit 38's 2026-07-31 follow-up); "no active Clerk session"
means step 2 lapsed.

## What to do with the result

1. Add a `### Follow-up — YYYY-MM-DD` to `context/progress/38-build-units.md` with the **real
   assertion lines**, not a paraphrase.
2. If step 6 ran, add a `### Follow-up` to `context/progress/41-change-application.md` too, and
   state which of the two claims above you proved.
3. Update the index rows in `context/progress-tracker.md`: unit 38 `partial → browser`; units 39,
   40, 41 lose their collaborator caveat.
4. Delete [`../qa/collaborator-access.md`](../qa/collaborator-access.md) and its row in
   [`../qa/README.md`](../qa/README.md), and delete this plan and its row in
   [`README.md`](README.md).
