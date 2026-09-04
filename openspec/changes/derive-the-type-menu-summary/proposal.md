# derive-the-type-menu-summary

Realizes: `docs/framework-rdd/game-definition.md` § "Params and presets" — *"you
get … the type-menu summary"*, the one part of that promise still hand-written.

**Readiness: measured, not designed.** The defect and its extent are known
(below, and the numbers are reproducible); how the tier list reaches the
formatter is a real design decision, because it has to cross the worker
boundary. Task 0 is that decision.

**Player-visible, so it ends in owner acceptance**, not self-archiving.

## Why

**19 of the 21 games whose type header names a difficulty show the wrong
word.** Found 2026-09-05 by running the app during `declare-params-and-presets`:
Tents' Custom dialog offers **Easy / Normal**, and choosing Normal puts
**"12x9 Tricky"** in the header beside it.

```
  Custom dialog          Type header
  ─────────────          ───────────
  ( ) Easy               "12x9 Tricky"     ← the word the player
  (•) Normal                                 never saw and did not pick
```

Measured across the collection by comparing each `{difficulty:…}` template in
`src/puzzle/augmentation.ts` against `difficultyTiers(game)`:

| | |
| --- | --- |
| games with a `{difficulty:…}` template | 21 |
| of those, disagreeing with the game's real tiers | **19** |
| worst kind: wrong *number* of tiers | Bricks (3 words, 2 tiers) |

```
bricks    template [Easy|Normal|Tricky]              actual [Easy|Unreasonable]
dominosa  template [Trivial|Basic|Hard|Extreme|…]    actual [Easy|Normal|Tricky|Unreasonable|Ambiguous]
lightup   template [easy|tricky|unreasonable]        actual [Easy|Normal|Unreasonable]
tents     template [Easy|Tricky]                     actual [Easy|Normal]
towers    template [Easy|Hard|Extreme|Unreasonable]  actual [Easy|Normal|Tricky|Unreasonable]
unequal   template [Trivial|Easy|Tricky|Extreme|…]   actual [Easy|Normal|Tricky|Hard|Unreasonable]
…19 in total
```

**Scope, precisely**: the preset menu is *correct* — preset titles come from
each game's own `presets()`. The wrong word appears only after "Custom type…",
where `describeConfig` runs. So this is not "the difficulty is wrong
everywhere"; it is "the summary of a custom board names a tier the game does
not have".

## How it got here, because that is the actionable part

`adopt-conventional-tier-names` (archived 2026-09-04) replaced twelve
hand-chosen vocabularies with one scale and deleted 29 hand-written tier lists —
and did not reach the **25 copies of the tier words spelled out as literal
strings** in `augmentation.ts`, because a search for `DIFF_NAMES` cannot see a
copy that has typed the values out.

**AGENTS.md already names this exact trap** — *"a grep for a constant's name is
blind to a copy that spells out its value … which is how a menu came to say
'3x3 Intermediate' while the dialog beside it said 'Tricky', with the whole
suite green."* That sentence was written about the *preset titles* found during
that change. The same sweep existed one file over and was missed, so the rule
was recorded and the second instance of it shipped anyway. Worth stating
plainly in the write-up: the lesson survives only if the *query* is re-run, not
if the anecdote is filed.

## The decision this removes

AGENTS.md § "Convention over configuration": *would two games ever legitimately
answer this differently?* **No.** A game's tier names are already declared
exactly once, in its difficulty `paramConfig` item, and `difficultyTiers(game)`
reads them. A second, hand-typed spelling of the same list is not a decision a
game gets to make differently — it is a copy that can only ever be right by
coincidence, and today 19 of 21 are not.

## What to explore first

- **How does the tier list reach `describeConfig`?** `augmentation.ts` runs on
  the main thread and must not import the game registry (that would pull all 57
  games into the main bundle, and `module-layering.test.ts` guards the
  boundary). The worker already sends `describeParams`' `ConfigValues` with
  `difficulty` as a **numeric index**; the natural candidates are sending the
  resolved *name* instead of the index, or sending the tier list alongside the
  values. Pick one and say why.
- **What happens to the other spelled option lists?** `{grid-type:…}`,
  `{strip-clues:…}` and friends are *not* tier lists and have no second source,
  so they stay. Only the difficulty token has a declaration to derive from —
  resist widening this into "derive every token".
- **The guard is the point.** Whatever the mechanism, this change ships an
  assertion that no game's rendered difficulty word can differ from
  `difficultyTiers(game)` — the check that would have caught it, and that
  `adopt-conventional-tier-names` did not leave behind.

## Also found in this file, and not fixed here

`PuzzleAugmentations.describeConfig`'s doc comment instructs the reader to
*"Use British spelling to match the existing presets"*, and the interface's own
comment says this metadata *"isn't (currently) possible in the C code"*. Both
are inherited from puzzles-web and both are now wrong — there is no C, and
AGENTS.md § "Code conventions" makes American spelling the rule. Left for this
change to fix as it rewrites the surrounding code, rather than as a drive-by.

## Impact

- Affected specs: `ts-engine` (the tier list has one source), `app-shell` (the
  type-menu summary).
- Affected code: `src/puzzle/augmentation.ts`, the worker adapter's
  `ConfigValues` path, `augmentation.test.ts`.
- **Player-visible**: the header text changes for 19 games. That is the fix, not
  a side effect, but it is the owner's to accept.
