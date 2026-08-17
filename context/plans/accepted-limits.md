# Accepted Limits — What Is Deliberately Not Being Chased

**Closes:** nothing. This file exists so these stop being re-opened.
**Blocked on:** conditions outside the project's control
**Effort:** read once

Four items across units 37, 40, 41, and 43 are unproven or deliberately unfixed, and will stay
that way. Each is recorded honestly in its own progress file, which means each looks like an
outstanding task to anyone skimming. They are not. This file states the decision so the next
sweep does not spend an hour rediscovering why they are open.

**None of these blocks a unit from shipping.** They are recorded in `## Not Verified` sections
precisely so the `Verified` column stays honest — that is the system working, not failing.

---

## 1. A hallucinated unit key dropped in a real run

**Unit:** 40 · **Recorded in:** `context/progress/40-change-proposals.md`

`lib/change-agent/validate.ts` resolves every `affectedUnits[].key` the model returns against the
project's actual units and **drops** one that does not resolve, counting the drop so a
prompt problem is visible rather than silent.

**Why it stays unproven:** you cannot make a model invent a key on demand. Prompting it to
hallucinate produces a *compliant* response, not a hallucination — the two are different failure
modes, and the second cannot be summoned.

**What is proven instead:** `verify:changes -- validate` exercises the drop path with hand-written
input — a real key, an invented key, and a duplicate — and asserts nothing invented reaches the
document and the drops are counted. That is the logic proven; only the *trigger* is unproven.

**If you ever want it closed:** the honest route is production telemetry, not a test. The drop
counter is already logged; a non-zero count in a real run is the observation. Watch for it rather
than trying to force it.

---

## 2. The spent-quota path

**Units:** 37, inherited by 40 · **Recorded in:** `context/progress/37-quota-error-surfacing.md`,
`context/progress/40-change-proposals.md`

Unit 37 made an exhausted OpenAI quota fail fast with an honest message rather than a generic
"please try again" — the classification in `lib/ai-errors.ts`, reused unchanged by
`generate-spec` and `propose-change`.

**Why it stays unproven:** it needs a genuinely exhausted quota. Nothing else produces the error
shape the classifier keys on.

**What is proven instead:** the classification is exercised at the unit level, and the *display*
path was proven by unit 37's own regression fix — `settle()` prefers the run's published message
over the local constant.

**If you ever want it closed:** put a hard, low spend cap on a throwaway OpenAI key, exhaust it
deliberately with a handful of runs, and watch one proposal fail. Roughly a dollar and twenty
minutes. Worth doing **once**, some day when a key is being rotated anyway — not worth engineering
around.

**Do not** simulate it by mocking the error. A mocked error proves the classifier matches the
shape you assumed, which is the thing in doubt.

---

## 3. A genuine mid-transaction crash

**Unit:** 41 · **Recorded in:** `context/progress/41-change-application.md`

`41`'s "a failure partway through leaves the build list and the change status exactly as they
were" is proven at **two** rollback points — the cap sentinel (`BuildUnitCapReached`) and the
status sentinel (`ChangeNoLongerProposed`) — both inside the same `$transaction`, one before the
inserts and one after the reserved sequence block.

**Why it stays unproven in full:** an arbitrary crash at an arbitrary statement needs fault
injection into Prisma's transaction, which would mean either a mock (proving nothing about the
real driver) or killing the process mid-flight and racing the assertion.

**What is proven instead:** the `cap` phase asserts, after a refusal, that no unit was created,
nothing was marked superseded, the change is still `PROPOSED`, **and the reserved sequence block
rolled back**. That last assertion is the strong one — it proves the rollback reaches the
`Project` counter, not just the rows.

**If you ever want it closed:** it is a Postgres guarantee, not an application one. The honest
statement is that the code is inside one transaction — which is inspectable — rather than that
every crash point was tested.

---

---

## 4. Two simultaneous pushes of the same change

**Unit:** 43 · **Recorded in:** `context/progress/43-canvas-write-back.md`

`ProjectChange.canvasPushedAt` is written **only after the room mutation succeeds**. Two members
pressing "Add to canvas" on the same change at the same instant can therefore both pass
`loadPushableChange` and both draw the delta, producing duplicate nodes.

**Why it stays open:** the ordering is not an oversight, it is the requirement. `null` doubles as
the retry state, so a push that fails partway leaves the change pushable again. Claiming the push
*before* mutating would close the race by trading a rare duplicate for a routine unrecoverable
one — a crash after the claim would mark a change drawn that was never drawn, and nothing could
ever push it again. A CRDT write and a Postgres write cannot be made atomic with each other, so
one of the two failure modes has to be chosen.

**What is proven instead:** `verify:canvas -- guard` asserts the sequential case — a second push
is refused, and marking twice does not move the recorded time. The route's pre-check and the
task's re-check narrow the window to roughly the length of one model call.

**If you ever want it closed:** the honest route is not a lock but a **reconciliation** — make the
push idempotent by deriving each node's id deterministically from the change id and the component
name, so drawing the same delta twice overwrites rather than duplicates. That is a real design
change to `lib/canvas-sync/plan.ts`'s id handling, and worth it only if duplicates are ever
actually seen. Do not reach for a claim-then-draw ordering; it is the worse trade.

## Related but genuinely open

Do not fold these into this file — they are closeable and have plans of their own:

- **The collaborator path** → [`collaborator-account.md`](collaborator-account.md). Needs a
  person, but is entirely achievable.
- **Concurrent applies at the HTTP layer** (unit 41). Proven sequentially and by construction, but
  two simultaneous requests were never fired. Closeable with a ~20-line phase modelled on
  `verify-build-units-http.ts`'s `concurrent`. Worth doing if the apply path ever misbehaves; not
  worth doing pre-emptively, since the guard is a single `UPDATE … WHERE status = 'PROPOSED'` and
  the database serialises it.

## What to do with this file

Nothing, unless one of the three changes state. If you close one, record it in the owning unit's
progress file and delete that section here. If the list grows past about five entries, that is a
signal worth heeding: it would mean the project is accumulating unfalsifiable claims rather than
verified ones.
