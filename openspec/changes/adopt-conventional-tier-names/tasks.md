# adopt-conventional-tier-names — tasks

## 1. The convention

- [x] 1.1 `tierNames(count, { search? })` in `engine/difficulty.ts`. Scale
      `Easy · Normal · Tricky · Hard · Extreme`; `search` replaces the last name
      with `Unreasonable`. Refuses a count outside 2..5 (2..6 with `search`)
      rather than returning a short list.
- [x] 1.2 Unit-tested directly in `difficulty.test.ts` — the whole table, both
      flags, plus two invariants the table alone would not pin: that a name's
      position does not depend on the count, and that `Unreasonable` can never
      be reached without asking for it.

## 2. Adopt, per game

- [x] 2.1 All 29 games. `search: true` iff the game named a tier `Unreasonable`
      before this change — the classification is preserved, not re-derived.
- [x] 2.2 Dominosa keeps "Ambiguous" appended to `tierNames(4, { search: true })`.
- [x] 2.3 Verified by shape: every removed line is a name-list definition, and
      **no `DIFF_CHARS`, numeric `DIFF_*` constant, cap or solver constant was
      touched**. The one apparent exception is Loopy's new `LOOPY_DIFF_CHARS =
      "enth"`, which lifts the four characters verbatim out of the object
      literal that held them.

## 3. Guard it

- [x] 3.1 `difficulty-contract.test.ts` — "names its tiers from the collection's
      scale", 29 games, `nonUniqueTiers` indices exempt without a list.
- [x] 3.2 Broken deliberately: putting Tents back to `["Easy", "Tricky"]` fails
      with *"tents: tier names are not the conventional 2-tier list. Use
      tierNames(n) — or declare an override in the change that needs one."*
      Restored.
- [x] 3.3 No differential fixture moved — the fixtures assert descs, which no
      rename touches. **Three per-game tests did fail**, all for the same
      reason and none of them a board: Spokes, Seismic and Clusters each
      restated tier words inside a *preset-title* assertion. Fixed by reading
      the game's own `DIFF_NAMES` — see the findings.

## 4. Player-facing text

- [x] 4.1 `help/games/{subsets,clusters,salad}.md`. **Mathrax needed no edit**,
      contrary to the estimate that reached the owner: its tiers were already
      `Easy · Normal · Tricky · Unreasonable` and did not move, so its "only Easy
      and Tricky are offered at size 3" is still true. Re-swept rather than
      trusting the earlier count — see the findings.
- [x] 4.2 Re-swept `help/`: the only surviving tier names are `Unreasonable`
      (which the convention preserves, and which `features.md` explains) and one
      "Advanced" in `install.md` that is a Chrome menu item, not a tier.
- [x] 4.3 **Ran the app** and read the menus — Tents, then Solo, the game whose
      names moved furthest. That is what caught Solo's and Galaxies' hand-written
      preset titles, which the full gate had passed over twice.

## 5. Close out

- [x] 5.1 `docs/games/mechanics.md` § "Difficulty is a declared contract".
- [x] 5.2 Spec delta on `ts-engine`.
- [x] 5.3 Full gate, commit, archive.

## Findings

**The rung labels and the tier names have come apart, and that is the honest
state.** A game's `DIFF_*` identifiers are what its solver caps by; the tier
names are now positional. So Unruly's `DIFF_TRIVIAL` is the tier a player sees as
"Easy", and Towers' `DIFF_HARD` shows as "Normal". They were never reliably the
same — Solo declares eight constants and offers six tiers — but the convention
widens the gap, so it is stated in the spec, in `mechanics.md`, and at Unruly's
own constant block rather than left for a reader to trip over. Renaming the
constants was rejected: they are load-bearing in the solvers and the
differentials, and a rename that reached a solver would be a board change hiding
inside a cosmetic one.

**Lightup had two tier lists, in different cases.** A lowercase
`["easy", "tricky", "unreasonable"]` in `state.ts` titled its presets ("7x7
easy") while a capitalized copy in `index.ts` fed the Custom dialog — a
one-definition-per-game violation that survived `derive-difficulty-from-the-
technique-ladder` because that change only removed the copy on the *contract*.
Now one list; the preset titles gained a capital, since every other game titles
its presets in the menu's own words.

**Solo's killer-difficulty name table was dead.** `KDIFF_NAMES` / `kdiffName` had
no consumer anywhere in `src/` or `scripts/`. Removed, with a note saying why —
the `DIFF_K*` constants it sat beside are live, and only the display names were
dead. Found by surveying tier names, which is the one sweep that would look at
it.

**The suite was green and the menu was wrong — found by opening the app.**
Solo's preset menu still read `2x2 Trivial · 3x3 Intermediate · 3x3 Advanced`
while its Custom dialog offered `Easy · Normal · Tricky · Hard`, and Galaxies'
read `7x7 Normal` for a tier named Easy. Both games wrote their preset titles as
hand-typed strings beside the params — a copy of the tier list in a place no test
looked and no grep for `DIFF_NAMES` could reach. **Nothing failed**: the full
gate had passed twice. This is the acceptance bar earning itself again — a suite
asserting state transitions cannot see a rendered menu.

Both now derive their titles from `DIFF_NAMES`, and a cross-game guard stops the
next one: *a preset title may say nothing about difficulty, but if it uses one of
the collection's difficulty words, it must be its own.* Phrased as a prohibition
on purpose — "every title carries its tier" would be stronger and would need an
exemption roster, because Salad's presets name a symbol range and Solo's Killer
preset names its mode, and both are right. The guard's honest limit is written
beside it: it cannot catch a stale word from *outside* the scale ("3x3 Basic"),
which is what both of today's defects actually were. Deriving the titles is what
fixed those.

**The tier list had a fourth copy nobody had counted: preset-title assertions.**
`derive-difficulty-from-the-technique-ladder` removed the copy on the contract
and this change removed the per-game literals — but three tests (Spokes,
Seismic, Clusters) still spelled the words out while asserting a *preset title*,
so they failed the moment the names moved. They are now written against the
game's own `DIFF_NAMES`, which is both shorter and a better test: the property
worth pinning is "the preset title carries the tier it generates at" and "the
menu is every size crossed with every tier", not which six strings came out.
**The lesson generalizes past tier names** — an assertion that restates a
constant it could import is a copy of that constant, and it will be found by the
change that alters it rather than by anyone reading the test.

**An estimate that reached the owner was wrong, and re-measuring cost nothing.**
The pre-decision survey named four help pages needing edits; three did. Mathrax
was counted because it mentions "Tricky", without checking that Mathrax's tiers
do not move. The sweep that found it was the same grep run *after* the rename —
which is the cheap habit: re-run the measurement against the new state rather
than working the old list.
