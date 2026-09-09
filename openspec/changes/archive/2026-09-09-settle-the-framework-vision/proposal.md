# settle-the-framework-vision

Realizes: nothing. This change is the *maintenance* the repo-layout spec already
requires of `docs/framework-rdd/` — "no file may claim unshipped behavior in the
present tense, and none may leave shipped behavior reading as future" — plus the
one structural correction that requirement does not cover.

**Readiness: ready.** Every finding below was read off the tree and the archive
on 2026-09-08; nothing here needs a design.

## Why

**The vision has run its course on the definition end, and the documents have not
caught up with their own scoreboard.**

- **The README's row 6 is stale in the present tense.** It reads *"survives,
  route changed — it never needed rows 1–5, and one owner question decides its
  shape"*, and closes with *"Whether that continuous route is what the owner
  asked for on 2026-08-07 … is the one open question in the whole definition
  end."* That question was answered on 2026-09-06 — *"Let's do a full sweep"* —
  and `re-express-the-collection` was scoped, executed in eight batches and
  **archived done the same day**, with its own `survey.md` re-running the
  instruments to prove it. A reader who opens the README today is told the last
  live question in the definition end is open. It is closed, and the definition
  end with it.
- **`migration.md`'s "Order of adoption" is now four dead steps.** Steps 1–3
  already carry a banner saying they assume a framework core that does not exist;
  step 4 was the survivor and it has finished. So the section's entire content is
  either withdrawn or complete, while it is still written as a plan.
- **The README argues against exactly the table it carries.** Its own "Where this
  stands" section says *"This directory is the argument, not the backlog… neither
  is a status column maintained by hand"*, citing the `openspec/project.md` that
  drifted into describing deleted directories — and then prints a six-row table
  with a **Readiness** column. Row 6 is what that column drifting looks like. The
  rows' *lessons* are the most valuable prose in the directory and must survive;
  the status column is the part that rots, and the README already says what
  replaces it (`openspec list`, and `grep -rl '^Realizes:'`).

**And one claim needs its state recorded before somebody builds it.**
`deduction.md`'s `find` / `apply` / `narrate` split is the last unbuilt piece of
the deduction end — its promise being that a technique without a narration *does
not compile*, so hint totality is a property of the type system. Two things
measured on 2026-09-08 bear on it and are not written anywhere:

- The benefit is **already delivered behaviorally**, by a derived guard:
  `hint-resume.test.ts` walks a game's hints to a solved board, so a technique
  that fires without narrating makes the walk fail. `refuse-honestly-at-every-
  tier` widens that walk from one preset to all 209.
- That is the precise shape of row 3's withdrawal — *the parity bar this row
  existed to make a resting state was already one, derived from behavior.* It
  does not settle the question, but it means the next person to propose the split
  owes an answer to **"what does it buy beyond the widened walk?"**, and that
  question should be waiting for them in the document rather than rediscovered.

This is not a rewrite of the vision. The argument in these files is the reason
three declarations were withdrawn cheaply instead of built expensively, and it
should be read for that. What it may not do is read as a live plan when the plan
has finished.

## What Changes

- **The README's row table loses its status column and keeps its lessons.** Each
  row's outcome is stated at the row's own lesson block (which is where the
  markers already are), and "what remains" points at `openspec list`, as the same
  page already prescribes.
- **Row 6 is marked done**, citing `2026-09-06-re-express-the-collection` and its
  `survey.md`.
- **`migration.md` § "Order of adoption" is marked complete-or-withdrawn** in
  place, with the invariants section — which is the part that survives and is
  still live — left standing and pointed to.
- **`guarantees.md`'s capability table records which rows now have guards**, with
  the change that shipped each: Params (`declare-params-and-presets` +
  `params-stability.test.ts`), Technique ladder's *tiers bind*
  (`assert-that-tiers-bind`), and the *N boards per preset* half of the same row
  (`refuse-honestly-at-every-tier`). Rows with no guard stay marked fiction.
- **`deduction.md` records the open question on the `find`/`apply`/`narrate`
  split** — what it buys beyond the widened hint walk — in place, at the claim.
- **`presentation.md` gets a pointer to `explore-the-tile-loop-inversion`**, so
  the one remaining unfalsified claim resolves to the change that will test it.

## What this change deliberately does not do

- **It does not delete the fiction.** A withdrawn row is struck through and kept
  with its argument, exactly as the gesture table and the board model are; that
  is what made those withdrawals reusable rather than merely recorded.
- **It does not write a progress summary anywhere.** `AGENTS.md` forbids a
  hand-maintained digest of a record the workflow already produces, and this
  change exists partly because one grew inside a document that argues against
  them.
- **It does not restate live rules in the vision.** Anything now true belongs in
  `docs/games/` or a spec; the vision links to it.

## Impact

- Affected specs: `repo-layout` (one added requirement — the existing one covers
  a doc that ships, not a doc whose *plan* completes, and says nothing about a
  vision doc carrying a hand-maintained status column while arguing against one).
- Affected code: none. `docs/framework-rdd/{README,migration,guarantees,
  deduction,presentation}.md`.
- Owner acceptance: not required — an internal doc contract, and the correction
  is to statements this session measured.
