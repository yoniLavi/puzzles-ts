# unify-the-note-taking-vocabulary — tasks

Scaffolded 2026-09-06 by `audit-declared-versus-derived-capabilities`, which
measured the population but did not do the rename. Implemented the same day.

## 0. Decide whether to do it at all

- [x] 0.1 Counter-argument read and weighed. Owner said go ahead. The honest
      framing is unchanged: this is a **cleanliness** refactor plus a concrete
      payoff (the last per-game roster in the guards), not a defect fix, and it
      does not unblock the entry-block extraction that it superficially looks
      like it would.
- [x] 0.2 Worth stated in the proposal and in the guide, at its real size.

## 1. Re-derive the population — and the proposal's table was wrong

- [x] 1.1 **Derived from shape, and the prediction held.** The proposal's table
      said eleven games and three spellings. The real population is **thirteen**:
      `pencil` ×7 (Abcd, Group, Keen, **Map**, Solo, Towers, Unequal), `marks`
      ×5 (Crossing, Mathrax, **Rome**, Salad, Seismic), `pencils` ×1 (Undead).

      **Map and Rome were missed, and the reason is worth keeping.** The
      proposal's eleven came from the *note-taking-cell enrolled set* — a `Ui`
      shape derivation, which is a good instrument for the question it answers
      and the wrong one for this. "Has candidate marks" is a broader concept
      than "runs the highlight-and-type flow": Map colors regions and Rome sets
      directions, so neither joins that flow, and neither offers Mark-all
      either. So this is `unify-cross-game-vocabulary`'s lesson recurring with a
      twist — the under-measurement came not from counting spellings but from
      **borrowing a neighboring population**.

      My first shape scan then under-measured too, missing Seismic because its
      field is declared on `SeismicBoard` and inherited by `SeismicState`. Fixed
      by widening to every interface, which is what found Map and Rome.
- [x] 1.2 Classified, not just counted. `pearl.marks` (no-line marks on a cell's
      four edges) and `subsets.mask`/`known` (the board itself, three-valued per
      letter, with no separate note layer) are **not** candidate notes and were
      excluded with reasons.

## 2. The rename

- [x] 2.1 One noun: **`pencil`**, and it was not a coin flip — the engine had
      already committed to the word everywhere else (`Ui.pencilMode`,
      `pencilSticky`, `pencilKeepHighlight`, `pencil-prefs.ts`,
      `pencil-indicator.ts`, `pencilAll`/`pencilStrike`). Element type and slot
      arity stayed per-game; ABCD's candidate cube was not flattened.
- [x] 2.2 **Driven by the type checker's own coordinates, not a text sweep.** A
      sweep was unsafe: `move.marks`, `leg.marks`, `ctx.marks` and
      `{ type: "pencilStrike", marks }` are the *shared* candidate-hint
      vocabulary. So each declaration was renamed by hand and a script fixed
      only the exact `file:line:col` positions tsc reported — which by
      construction are the State-field accesses and nothing else. 250 sites, 35
      files, four passes to convergence.
- [x] 2.3 **Verified by shape.** Every changed line pair in the whole diff
      differs from its original by nothing but the identifier (244 pairs checked,
      with a vacuity guard on the count). Separately confirmed **no comment line
      was touched at all** — the prose-rewriting trap the coordinate approach
      avoids by construction, and the one a whole-word sweep would have walked
      straight into ("the player's pencil marks" → "the player's pencil pencil").
- [x] 2.4 `mark-all.test.ts`'s ten rows collapsed to a derived roster; the
      tautological roster-vs-flag check deleted; the slot-arity ledger kept with
      an honesty check. Test count unchanged at 22, so nothing was swallowed.

      **This is where the rename paid for itself twice.** That file's rows read
      the notes through `(s: any) => s.pencils`, which tsc *cannot* check — so
      the rename would have left a silently-`undefined` accessor behind if the
      row had survived. A green suite would not have caught it; reading the
      residue did.

## 3. Record it

- [x] 3.1 `ts-engine`: two requirements — the vocabulary (with both things that
      are outside it, and why the guard keys on a declaration rather than a
      name), and the Mark-all roster being derived.
- [x] 3.2 `docs/games/mechanics.md` § "Pencil marks: the full note-taking UX".
- [x] 3.3 **A guard, or the rename rots.** `note-vocabulary.test.ts`, following
      `completion-vocabulary` and `cursor-vocabulary`. It forbids the retired
      spellings *as a typed-array field declaration*, because the population is
      not derivable (no runtime signal says "this array holds candidates") while
      the violation is. Mutation-proved: reintroducing Seismic's `marks` fails
      it, and the pattern itself is asserted against lines that must and must not
      match, so an edit that breaks the regex cannot report a clean tree.

      It caught three files the rename had not touched — Ascent's, Crossing's
      and Mathrax's **solvers**. Excluded by a stated path rule rather than
      three ledger entries, because a solver's candidate scratch is genuinely a
      different thing, and a rule covers a new game's solver the day it lands.
