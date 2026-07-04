# Add an explained deductive hint to Slant

## Why

Slant shipped (add-slant-ts-port, owner-accepted 2026-07-04) without a hint.
Its graded solver (`slant.c` `slant_solve`, ported faithfully) has genuinely
*named* techniques that make a strong explained hint — and both shipped tiers
(Easy, Hard) are already pure deduction (the generator only keeps a board its
non-recursive solver uniquely cracks), so no guess-free-generation policy debt
to settle first, unlike Light Up.

The move-producing techniques and their measured firing share on Hard boards
(40 seeded boards per preset):

| technique | 5×5 | 8×8 | 12×10 | glance-able? |
| --- | --- | --- | --- | --- |
| clue-counting (fill/empty) | 91% | 83% | 81% | yes — the canonical Slant deduction |
| loop avoidance | 5% | 9% | 11% | yes |
| dead-end avoidance | 2% | 5% | 5% | yes (second-order loop) |
| equivalence-to-filled | 2% | 4% | 4% | no (locked-slant coupling, §1B) |

Dead-end/equivalence fire on **34/40 (8×8)** and **40/40 (12×10)** Hard boards,
so a plan that must reach the solution from the player's position **cannot drop
the advanced techniques** — every one must be narrated (the "no un-narrated
fallback" bar, `ts-engine`). Clue-counting dominates (~80–90%), so the common
hint is a clean, glance-able, Palisade-bar teaching moment.

## What Changes

- Thread a **recorder-gated** deduction recorder plus an optional
  **`seedFrom`** starting position through the existing `slantSolve` (recorder
  off + no seed ⇒ byte-identical solve path, the differential stays green;
  recorder on + seeded from the player's marks ⇒ an ordered plan of narrated
  firings from the current board).
- Implement `hint()` / `hintKeepTrack()` / `refreshHintStep()` on the Slant
  game: refusal on a solved or mistaken board (coupling to the existing
  `findMistakes` overlay + banner), one deduction firing = one journey (a
  clue firing that forces several squares is emitted as one multi-leg journey,
  `continuesPrevious`), narrations leading with the indication and concluding
  in the necessity voice.
- Narrate the four techniques at **two quality tiers** (D3): clue-counting,
  loop and dead-end as first-class glance-able hints; equivalence-to-filled as
  the honest **locked-slant** treatment (§5.6 non-local) — it names the
  technique (the clues lock these squares to one slant) and cites an anchor
  filled square, without spelling out the full v-shape/pairing derivation
  (which is not one glance-able step and which Slant has no pencil vocabulary
  to externalise).
- Render per the element-type colour legend: target square(s) blue `COL_HINT`
  (highlight only, no slash preview — §5.1), the deduction's evidence shaded
  `COL_HINT_CELL` (the clue's neighbourhood / the loop chain / the trapped
  components / the locked class), the driving clue's digit recoloured
  `COL_HINT`, a cited filled anchor ringed teal `COL_HINT_REF`. Hint colours
  appended past the C enum (slant's dark-mode overrides touch indices 1/8);
  hint bits fold into the existing per-tile `Int32Array` cache (no sidecar
  needed — bits 21+ are free).

## Impact

- Affected specs: `slant` (hint requirements added).
- Affected code: `src/native/games/slant/{solver,index,render}.ts`,
  `slant-hint.test.ts` (new), `hint-resume.test.ts` (slant entry).
- No app-shell changes (Hint button, auto-hint, banner, stepper all exist).
- No engine change (the `Midend` hint machinery is generic).
