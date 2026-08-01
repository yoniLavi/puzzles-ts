# The audit table

Every author-stated known issue in the tree, and what the port did about it.
Archived with this change because the sources — `puzzles/unreleased/docs/<game>.md`
and the `TODO` blocks at the head of each `.c` — live inside `puzzles/`, which
`retire-c-engine` removes.

**Verdicts.** *Fixed before* — resolved by an earlier change, cited.
*Fixed here* — resolved by this change. *Declined* — deliberately not done, with
the reason. *Promoted* — filed as its own change.

Three sources were swept, and they do not say the same things:

1. the `## Status` section of each `puzzles/unreleased/docs/<game>.md` — candid
   and player-facing;
2. the `TODO` / `FIXME` blocks in each `.c`, recovered from git history for the
   games whose C is already deleted (`git log --diff-filter=D`);
3. upstream Tatham's own notes for the games this fork *finished* rather than
   ported — `puzzles/unfinished/README` and each file's header comment.

`puzzles.but` and the per-game HTML overviews were also skimmed (tasks 1.4): they
carry **no** admitted per-game defects. Upstream's prose states design facts
("Mines may require a guess"), not faults, so nothing there needed reconciling.

---

## 1. `docs/<game>.md` — `## Status`

| Game | The author's point | Verdict |
|---|---|---|
| **abcd** | "This puzzle is fully implemented and playable." | — nothing stated |
| **ascent** | "This puzzle is fully implemented and playable." | — nothing stated |
| **boats** | "The solver cannot currently handle some of the harder Battleship puzzles out there." | **Declined.** A solver weaker than the genre's hardest is the difficulty curve upstream shipped, not a defect (playbook §4 rule 3); strengthening it changes every generated board and forfeits the byte-match oracle. `boats/design.md` records the deliberate `STATUS_INVALID` abort that only ever makes the solver weaker, never wrong. |
| **bricks** | "Selecting Tricky difficulty may generate a puzzle at Normal difficulty instead." | **Declined — intended behaviour.** The min-difficulty gate rejects only puzzles the *Easy* solver completes; it never guarantees the board strictly requires the selected tier. Recorded in `bricks/solver.ts` and `add-bricks-ts-port` D3. |
| **clusters** | "There are currently no difficulty settings." | **Declined.** Adding tiers means new solver rungs, changes every board, and forfeits the differential — for a small game nobody has asked for tiers in. |
| **crossing** | "This puzzle has severe problems" — (a) the number list cannot be made to fit, (b) entry is one cell at a time, (c) the per-digit colours are vestigial and "should probably be removed entirely". | **Fixed before**, all three: `add-crossing-ts-port` F8 (panel layout, corrected twice), F10 (cursor auto-advance with a crossword direction model), F11 (per-digit colours gone), and F14 went further — the clue list became the drag-and-drop input surface the author had scrapped. Specs: `crossing` "advances the selection along the number being filled", "places whole clue numbers from the list". |
| **mathrax** | "I haven't properly tested the Recursive difficulty level. It's possible that it works exactly the same as Hard mode." | **Fixed before, and the real fault was worse.** `add-mathrax-ts-port` found upstream's `Recursive` boards are *ambiguous* — 30 of 30 sampled had more than one solution — because both strip loops test `mathrax_solve` for bare truthiness and its "ambiguous" verdict is truthy. The port strips only while the board stays **uniquely** solvable. Below Recursive no recursion runs and the two tests coincide, so Easy/Normal/Tricky stay byte-identical; the divergence is confined to the tier that was ill-posed. Recorded in `mathrax/generator.ts`; asserted by `mathrax-differential.test.ts` ("records upstream's Recursive tier as ambiguous"). |
| **rome** | "This puzzle is fully implemented and playable." | — nothing stated |
| **salad** | (a) the pseudo-Latin machinery "is currently fairly messy, and doesn't allow for more complex solver techniques"; (b) "The Number Ball generator currently doesn't create puzzles that make good use of the concept, in my opinion." | **Declined**, both, recorded in `add-salad-ts-port` design §"the author's own notes". (a) is a `latin.ts` framework project (a repeats-aware cube), not a port; it would change every Salad board and throw away the byte-match oracle. The messiness is confined to the hole↔candidate translation, documented at the head of `salad/solver.ts`. (b) is the same trade for a taste judgement its own author hedges. |
| **seismic** | "playable on lower sizes, but has a near-zero chance of generating sizes higher than 7x7. The generator step that creates randomly filled regions needs to be completely replaced with a different approach." | **Half fixed before, half promoted.** `replace-seismic-region-generator` took 7×7 from 24.9 s to 108 ms with the 28-fixture byte-match intact, and raised the bound. 10×10 — the size the `.c` names as standard for Hakyuu — is still unreachable in both modes (`MAX_CELLS = 64`), for a structural reason measured across nine region-size distributions. Remainder → **`reach-ten-by-ten-seismic`**. |
| **spokes** | "It would be interesting if the game had more varied layouts similar to Puzzle Picnic, where the grids aren't fully filled with hubs." | **Declined.** An explicit wish rather than a fault ("it would be interesting"); it is a new generator and a new grid model for a game that plays correctly. |
| **sticks** | "There are currently no difficulty settings." | **Declined** — as clusters. |
| **subsets** | "There are currently no difficulty options or alternate grid sizes." | **Declined.** 4×4 over four letters is the *only* configuration where the sixteen possible sets exactly fill the sixteen cells — the bijection the puzzle is built on — so "alternate grid sizes" is a different puzzle. Upstream's `configure` slot is `false` for the same reason (`add-subsets-ts-port` D8). Now stated in the help page instead of read as an omission. |

## 2. `TODO` / `FIXME` in the C

| Game | The author's point | Verdict |
|---|---|---|
| **abcd** | "Get large puzzles to have a lower fail ratio. I haven't currently been able to produce a valid 10x10n4 puzzle, and a 9x9n4 puzzle can take *tens of thousands* of attempts." | **Promoted → `bound-abcd-generable-sizes`.** Measured here (30,000 attempts per configuration, ~0.065 ms each): 8×8 n4 accepts 1 in 526, 9×9 n4 1 in 15,000, and 10×10 n4 / 9×9 n5 / 12×12 n4 never. The live defect is not the rate but that `ABCD_MAX_ATTEMPTS = 5_000_000` turns a Custom-dialog mistake into ~5.4 minutes of frozen worker before an unhandled throw. |
| **abcd** | "Solver techniques for diagonal mode?" | **Declined** — a stronger solver changes every board (rule 3). |
| **abcd** | "TODO Prevent operations which do nothing" | **Fixed here.** Re-typing the letter already in a cell, or clearing an already-empty note-less cell, no longer costs an undo step. Suppressed *locally* in `interpretMove`, never by comparing serialised state. Test: `abcd.test.ts` "costs no undo step for an entry that would change nothing". |
| **abcd** | error letters are coloured red where "this could be changed to the exclamation mark symbol which appears in Map and Tents" | **Declined.** A style preference the author hedges, and this fork surfaces wrong entries through the shared Check & Save overlay, which is a stronger signal than either. |
| **boats** | solver: "Watch for smaller runs that cannot fit any boat, and fill them with water"; "Recursion?" | **Declined** — both strengthen the solver; rule 3. |
| **boats** | ui: "Certain custom fleets don't fit in the UI" | **Fixed here**, and it was worse than the wording suggests. The fleet display broke rows only *between* whole batches, so a fleet holding more boats of one size than fit on a row drew past the right edge — where the canvas clips it, so **the boats simply were not there**. `/boats?type=4x8f1dn,7` (which `validateParams` accepts and the generator builds) showed **five** of its seven boats before this change and shows all seven, on two rows, after. `fleetLayout` now also breaks *within* an over-wide batch, and is shared by the measurer and the drawer so they cannot disagree about the row count. Tests in `boats.test.ts` assert containment, that every shipped preset is unchanged, and that the layout still matches upstream's wherever upstream fitted; verified in Chrome. |
| **crossing** | "Some puzzles have isolated squares (1x1 areas)" | **Fixed before** — `add-crossing-ts-port` F13. |
| **crossing** | "Find a way to fit the number list on the screen…" | **Fixed before** — F8. |
| **crossing** | "Redesign the graphics. Numbers are drawn on an outdented tile, and each number has a different color." | **Fixed before** — F11, F17 (colour by *dimension*, two hues of provably equal strength). |
| **crossing** | "More difficulty levels" | **Declined** — new solver tiers; rule 3. |
| **crossing** | "Puzzles should be printable" | **Declined.** `printing.c` was deleted at fork and there is no TS replacement; the playbook's standing rule is not to promise a print path. |
| **crossing** | "Optimize drawing routines" | **Declined — already satisfied.** The port renders through a per-tile `Int32Array` cache; there is no measured drawing cost to optimise. |
| **crossing** | `free_puzzle` is `return; // TODO FIX!` — a disabled refcount free | **Fixed before, by construction.** The port has no refcounting; the structure is garbage-collected. |
| **crossing** | "TODO actually scan area for longest row" (`maxrow` hard-coded to 9) | **Fixed before** — recorded and handled in `crossing/state.ts`. |
| **rome** | "TODO loose pixels for corners" | **Fixed before, by construction.** The port paints the whole board `COL_BORDER` and insets each cell's own background, so region borders are the *gaps* rather than drawn segments and there are no corner seams to leave stray pixels in (`rome/render.ts` head comment). |
| **salad** | "TODO: Add difficulty levels" | **Fixed before, upstream.** Salad ships a Difficulty parameter; the TODO predates it. |
| **seismic** | "This is a dumb way of generating a region layout" | **Half fixed before / promoted** — same item as the Status entry above. |
| **seismic** | `int FIXME;` in the draw state | Not an issue — an unused placeholder field, absent from the port. |
| **subsets** | "TODO: When other sizes are supported, read n instead of returning a constant" | **Declined** — same as the Status entry; other sizes are a different puzzle. |
| **subsets** | "// TODO repair this" — a commented-out mirror-image elimination in the solver | **Declined, and recorded in code.** The block is not compiled in the C, so the shipped solver has never had it; `subsets/solver.ts` says so at the site rather than silently omitting it. Adding it strengthens the solver and changes every board. |

## 3. Upstream Tatham — games this fork finished

`puzzles/unfinished/README` explains only *why* the directory exists ("half-written,
fundamentally flawed, or in other ways unready"); the per-game statements are in
each file's header.

| Game | The author's point | Verdict |
|---|---|---|
| **group** | "…too esoteric (not to mention *hard*) for me to be comfortable presenting it to the general public"; TODO: more solver techniques (inverses, hard-mode associativity) | **Declined.** The esotericism is a shipping judgement this fork made differently — Group ships, with a hint (`add-group-hint`). The extra solver techniques strengthen the solver and change every board; rule 3. |
| **slide** | TODO: improve the generator; and three graphics complaints (wishy-washy colours, "the cattle grid effect is still disgusting", an excessive next-piece highlight) | Generator: **declined** — `add-slide-ts-port` found it "mostly sensible already" as the author himself notes, and the move-limit slowness is inherent. Graphics: the target green was **decided by the owner** on 2026-07-30 (keep it); the other two → **`refine-slide-appearance`**. |
| **sokoban** | "Random generation is too simplistic to be credible, but the rest of the gameplay works well enough to use it with hand-written level descriptions." | **Promoted → `add-sokoban-level-packs`.** `add-sokoban-ts-port` weighed this explicitly, shipped the faithful generator as option (A), and recorded curated levels as "a compelling, separate, owner-greenlit follow-up" — which was never filed. Licensing is the gating constraint. |

## 4. What the sweep is worth knowing for

- **The two sources disagree about what matters, in both directions.** Crossing's
  `## Status` carried the request that most improved the game (cursor
  auto-advance) and the `.c` did not; Boats is the mirror image — its Status
  states a difficulty-curve preference that was rightly declined, while its `.c`
  quietly recorded the only live defect either source had (`Certain custom fleets
  don't fit in the UI`). Reading the more candid source alone is not enough.
- **"Declined" was the right answer far more often than "outstanding".** Of the
  ~30 points swept, two were live defects, three were promoted, and the rest were
  either already resolved by a port or are requests to make a solver stronger —
  which playbook §4 rule 3 refuses on principle, because a weaker solver *is* the
  difficulty curve upstream shipped.
- **A faithful port can fix an author's complaint without trying to.** Rome's
  loose corner pixels and Crossing's disabled `free_puzzle` both vanished because
  the idiomatic TS shape had no such failure mode. Neither was noticed at the
  time; both are worth recording, because the alternative reading — "the port
  reproduced it silently" — is the failure mode this audit exists to catch.
