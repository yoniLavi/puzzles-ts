# Add an explained deductive hint to Light Up

## Why

Light Up shipped (add-lightup-ts-port, owner-accepted 2026-07-04) without a
hint. Its solver has genuinely *named* techniques — the forced-light rule, the
clue-satisfied / clue-saturated rules, and the overlapping-set discount — that
make a strong Palisade-bar explained hint: each firing has a recognisable
board pattern to lead with and a one-step "why" to narrate, and the player's
own impossible-mark is the natural on-board externalisation of the solver's
`F_IMPOSSIBLE` deductions (the §1B "marks carry the state" pattern, with no
new pencil machinery needed — the game already has the mark move).

There is also a policy debt this change must settle: the **Hard tier requires
recursion by construction** (the generator rejects Hard boards solvable at
Tricky, and the Hard solver guesses up to depth 5), which violates the
`ts-migration` narratable-deduction generation policy — only an
explicitly-named `Unreasonable` tier may require guessing.

## What Changes

- Thread a **recorder-gated** deduction recorder through the existing solver
  (`trySolveLight`, `trySolveNumber`, the discount-set path) — recorder off ⇒
  byte-identical solve path (the differential stays green); recorder on ⇒ an
  ordered plan of narrated firings from the player's current position.
- Implement `hint()` / `hintKeepTrack()` on the Light Up game: refusal on a
  solved or mistaken board (coupling to the existing `findMistakes` overlay +
  banner), one firing = one `HintStep` (multi-cell firings grouped, e.g. a
  saturated clue filling several bulbs at once), narrations that lead with the
  indication and conclude in the necessity voice.
- Hint steps that rule squares out emit the game's own **impossible-mark**
  move, so the accumulated marks externalise the solver's state exactly as
  pencil strikes do in the Latin family.
- Render per the element-type colour legend: target cell(s) blue `COL_HINT`
  (highlight only, no mark preview), the deduction's evidence area — a
  corridor of sight, a clue's free neighbours — shaded `COL_HINT_CELL`, cited
  decided premises ringed (colours appended past the C enum; lightup's
  dark-mode overrides touch only indices 2/3).
- **Resolve the Hard-tier guess-free violation**: measure the depth
  distribution of Hard boards (depth-1-only forcing is deduction per the
  policy; depth ≥ 2 is guessing), then apply the owner-chosen remedy — the
  default lean is renaming the tier **Unreasonable** (a label change; board
  generation and the byte-match differential untouched), with
  strengthen-or-re-grade as the measured alternative. The hint on
  Unreasonable boards may go non-deductive past the deductive prefix
  (sanctioned exception).

## Impact

- Affected specs: `lightup` (hint requirements added, tier naming),
  `ts-engine` (per-game legend row lands in the existing conventions —
  no engine change expected; `Midend` hint machinery is already generic).
- Affected code: `src/native/games/lightup/{solver,index,render}.ts`,
  `lightup-hint.test.ts` (new), preset/`describeParams`/augmentation label
  updates if the tier renames.
- No app-shell changes (Hint button, auto-hint, banner all exist).
