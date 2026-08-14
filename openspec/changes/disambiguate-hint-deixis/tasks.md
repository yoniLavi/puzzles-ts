# Tasks

> **Read the sweep table in [`proposal.md`](./proposal.md) first** — it carries
> the per-game verdict and, for the three flagged games, why. Clusters is done
> and is the worked example to copy: the tie is **geometric**, never a colour
> name.

## 1. Clusters — **done, 2026-08-14** (the reported case)

- [x] 1.1 Four of six branches tied the target to the ringed tile by the
      relation the solver guarantees: `contradictionAround` reports the placed
      cell **or one of its four orthogonal neighbours**, so the ringed tile
      really is *this cell's neighbour* and the sentence says so.
- [x] 1.2 The chain branch cannot use that relation — its break is adjacent to
      the **last forced cell**, not the target — so it ties the other way, on
      the fact a reader needs anyway: the chain runs *from* this cell.
- [x] 1.3 The two single-mark branches left alone deliberately: with no second
      mark, "this cell" is unambiguous and a qualifier would be noise.
- [x] 1.4 Guard: *a second mark displayed ⇒ the explanation contains the tie*.
      **Proved to fail** by restoring the reported sentence and watching it go
      red, then reverted.

## 2. The three flagged games

Each needs its **own** geometric check before wording — the Clusters tie works
because adjacency is guaranteed by the solver, and a sentence that claims a
relation the code does not enforce is exactly the failure the hint bar exists to
stop ("every sentence a hint utters is a claim").

- [ ] 2.1 **Bricks.** Establish what the `COL_HINT_CELL` evidence ring actually
      marks per rule branch (the three-in-a-row run, the unsupported brick, the
      clue and its neighbours), then tie. `363` already does it — *"The shaded
      brick **above** rests only on this cell"* — and is the model. The
      `localBreak` pair (*"would break the board where it is ringed"*) needs the
      weakest fix: it names where the break is but not where the target is.
- [ ] 2.2 **Range.** Three marks, not two: target, the shaded run, and a
      `COL_HINT_BLACKREF` ring. Check whether the target is always the run's
      endpoint — if it is, *"the end of the shaded run"* ties all three at once.
- [ ] 2.3 **Lightup.** *"A bulb here would rule out every one of them"* — "here"
      and "them" in one clause with a ringed square in view. `325` is already
      correct and stays.
- [ ] 2.4 A guard per game, each **proved to fail** before it is trusted.

## 3. Do not reach for the colour

- [ ] 3.1 The rule goes in the `ts-engine` hint requirement: where a step
      displays more than one mark, its narration SHALL identify the acted-on one
      by a relation, a value or a role word — and SHALL NOT identify it by hue.
      Record *why* the obvious fix is refused, or it will be proposed again:
      colour is not the only cue a player has (scheme flip, colour-blindness),
      and this collection's own palette work already established that a hue's
      appearance is scheme-relative.

## 4. The check the grep cannot do

- [ ] 4.1 The sweep found sentences that *mention* a second mark. A sentence
      that is bare while a second mark is **displayed but unmentioned** is the
      same defect and invisible to a grep. The instrument is the render harness:
      drive each hinting game's steps, count the distinct hint-role colours in
      the frame, and flag a step with more than one and a bare deictic.
- [ ] 4.2 Carry a vacuity guard (`checked > 0`) and sweep **every tier**, not
      `firstLeaf(presets())` — `audit-guessing-tier-names` §3.2 found a planted
      violation staying green for exactly that reason.

## 5. Close out

- [ ] 5.1 `openspec validate disambiguate-hint-deixis --strict`.
- [ ] 5.2 Read each changed sentence **against the running app**, on a frame that
      actually shows both marks. This defect was found by looking, not by a test,
      and its fix should be confirmed the same way.
- [ ] 5.3 Owner acceptance, then archive.
