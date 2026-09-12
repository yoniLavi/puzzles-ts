# 373 exports nothing imports

## Why

`guard-the-debt-the-tidy-pass-cleared` set out to wire knip into the gate on the
premise that it "reports zero unused exports, which is the good state the pass
just produced by hand". knip's zero turned out to be a scan of nothing — it does
not follow this tree's `.ts` import specifiers — and the check written to replace
it reports **373**.

They are real. Five spot-checks, each with zero references anywhere outside its
declaring file:

- `src/games/solo/state.ts` — `SYMM_ROT4`, a private copy shadowing the engine's
  live one in `symmetric-blacks.ts`. Two constants with one name and one meaning,
  and only one of them consumed.
- `src/engine/hint-mark.ts` — `MARK_TOP`, `MARK_LEFT`, `MARK_RIGHT`,
  `MARK_BOTTOM`.
- `src/games/undead/state.ts` — the whole `CELL_*` and `DIRECTION_*` vocabulary.
- `src/games/tents/state.ts` — `DIFF_NAMES`, which nine games still export and
  which `adopt-conventional-tier-names` made derivable.
- `src/utils/timing.ts` — `debounce`, named only in comments.

The shape of the backlog is itself the finding. `DIFF_NAMES` (9),
`DIFF_CHARS` (9), `DIFFCOUNT` (5) and `HINT_PLAN_MAX` (4) alone are 27 of the
373, which says a convention landed and the per-game copies it replaced were left
behind — the same pattern the tier-name work found and the same one
`AGENTS.md` § "N games sharing a defect means the layer below them is wrong"
describes.

## What changes

- The 373 are triaged and deleted, or kept with a reason in the check's
  `KEPT_UNUSED` ledger.
- The categories are taken as categories rather than one line at a time: a
  constant nine games export and nobody imports is one decision, not nine.
- `scripts/checks/unused-exports.mjs` moves from `npm run dead-exports` into the
  gate's fast prefix — one line in `scripts/gate.sh` — which is the act that
  closes this.

## "Unused export" is not the same instruction as "delete this"

`hint-mark.ts` exports `MARK_TOP`, `MARK_LEFT`, `MARK_BOTTOM`, `MARK_RIGHT`, and
nothing outside the file imports any of them — but the file composes `MARK_ALL`
and `drawBandedCell` out of them, so they are live *inside* it. The export is
what is dead, and **un-exporting is the fix, not deleting**.

That distinction is load-bearing here rather than pedantic:
`characterize-the-hint-assessment-corpus`'s audit picks **Tracks** as the next
hint and predicts it will band an individual edge by marking both cells that
share it — `MARK_TOP | MARK_LEFT`, from outside the module. So these four are
the vocabulary the next hint is expected to reach for. Deleting them would be
correct today and wrong next week; un-exporting them is correct in both
directions, because re-exporting is a one-word change and the check will then
say so.

**So read each finding as "who is meant to import this?", not "is this used?"**
Three answers, and they are different work: nobody ever (delete), only this file
(un-export), or a consumer the archive predicts (keep, and ledger it with the
change that predicts it).

## What the 373 turned out to be

Recorded after the sweep, because two of the readings above are wrong and the
largest category is one this proposal did not name at all. Measured 2026-09-12;
the report stood at **376** by then.

**The biggest group is types, and it is 163 of the 376.** `DeductionFixpointOptions`
is what `runDeductionFixpoint` takes: nothing imports the name, and a caller
writing that object literal is reaching the type through the function all the
same. Un-exporting it makes the type unnameable by the very caller who has to
satisfy it, and a 163-entry ledger is the skip list this check exists not to be.
So the check learned a **fourth way this tree reaches a symbol** — being named
in the signature of another export that is itself reached — resolved to a
fixpoint after the dead set is known, so a dead exported function cannot keep
its own options type alive. That is a rule rather than a list, and it took the
report from 376 to 204 without excusing anything.

**"Who is meant to import this?" has a clear majority answer, and it is not the
one the spot-checks suggested.** 199 of the remaining 204 are read by their own
declaring file, so the fix is the keyword and nothing else. Both of the examples
above are in that group rather than the delete group: `debounce` is *called* by
`debounced` eleven lines below it, and every `DIFF_NAMES` is read by its own
`state.ts` in `presets()` and `paramConfig`. So the four large name-groups are
**not** per-game copies a convention left behind — each is a local binding of
`tierNames(n)` that the game genuinely needs and exported out of habit.

**Five were dead outright**, and one thing the report called dead was not:
`hint-games.ts`'s `markRoles` is imported by `scripts/checks/hint-deixis.test.ts`,
which the check was not reading. Widening its file list to `scripts/**/*.ts`
fixed a blind spot rather than adding a ledger entry — the check has to be
trusted about exactly this.

**The ledger is empty, and `KEPT_UNUSED` still asserts something**: an entry
that stops earning its place fails as loudly as a new dead export, so an empty
ledger is a claim that nothing in this tree needs one. The Lit component classes
this proposal predicted would need one do not: a class registered by
`@customElement` in its own file and named in that file's
`HTMLElementTagNameMap` needs no export at all.

## What to check before deleting

The check counts an export as used only if another file imports it by name, the
file is an entry, or a non-`?raw` glob reaches it. Deleting a *type* that exists
to document a module's surface is a judgment call, not a mechanical one. And
`src/dialogs/*` exports Lit component classes reached from templates by tag
rather than by import — five of the 373 — so the ledger is the right answer
there, not deletion.
