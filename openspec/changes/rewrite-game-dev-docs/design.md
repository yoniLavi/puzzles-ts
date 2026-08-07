# Design

## Context

`docs/porting/game-port-playbook.md` (2,658 lines) and
`docs/porting/hint-authoring.md` (2,235 lines) are the live wiki for game work.
Both are excellent and both are organised around a finished job (porting from
C). ~330 inline citations across ~50 live source files reference their
positional section numbers (~60 distinct keys; `playbook §3.2` alone is cited
79×), one of which (`playbook §2.5`) is already stale — the number scheme
shifts on insertion, which is exactly the failure mode a heavily-cited living
document must not have.

## Goals / Non-Goals

- Goals: reorganise by concern for the ongoing job (implement + maintain games,
  AI-driven); preserve every hard-won lesson; grep-stable named anchors;
  repoint every live citation mechanically; author the framework RDD vision as
  clearly-labelled fiction.
- Non-Goals: changing any behaviour; changing normative spec content beyond
  path repointing + the design-fiction requirement; implementing any part of
  the RDD vision; touching archived changes (their citations are historical
  records and stay).

## Decisions

### D1 — File set and content partition

`docs/games/`, eight files. Source-section assignments (playbook = P,
hint-authoring = H):

| File | Scope | Sources |
| --- | --- | --- |
| `README.md` | The map; game lifecycle (openspec change → scaffold → implement → verify → two-stage acceptance gate → close out); definition of done; file anatomy; where the C went | P front banner, P "Definition of done", P §1, §1.0, §1.1, §2 intro, §6, §7 |
| `mechanics.md` | Params/presets/custom-params/prefs; desc + state (immutability, codecs); moves (`interpretMove`/`executeMove` purity, `UI_UPDATE`); status; capability flags; `supersededDesc`; timed games + `encodeUi`; `changedState`; difficulty contract declaration; affordance inventory (pencil marks, mark-all, reference aid, mistake surface — with pointers into the other docs); non-square geometry + coordinate maps; multi-mode movement tables | P §3.4, §3.7 (UX contract half), §3.9, §3.10, §3.11, §3.13 (geometry half), §3.14, §3.1 (state-shape half), `game.ts` contract |
| `input.md` | Pointer/keyboard/touch; the four frontend traps; drag models incl. accreting drag; press-picks-transformation; fractional pointer coords; keypad (`requestKeys`); shared input helpers usage | P §3.8, §3.8a–e, §3.12a, §2.3 |
| `rendering.md` | The redraw contract + doctrine (engine paints nothing; `canvasCleared`); tile cache + diff key + `OverlaySidecar`; palette (three layers, meaning-first); animation/flash; blitters and when not to; drag previews + `moves.ts` split; preview-vs-committed looks; clue-ring erase trap; negative-space grids; narrow-type display bugs | P §3.2, §3.3, §3.12, §3.13 (render half), P §5.1 (render-op vocabulary — shared with testing.md by link) |
| `solver-and-generator.md` | One deduction engine, two projections (narratable-deduction doctrine); `runDeductionFixpoint` + its known no-gos; difficulty grading + tiers-mean-something bar; guess-free generation policy; generator patterns (retry-to-target, retry limits, quirk preservation as load-bearing); `solve()`/aux; `findMistakes` computation; the Latin family (`latin.ts`) | P §2.2, §3.5, §3.6, §4.4 (live lessons), H §1A |
| `hints.md` | The whole hint discipline: quality bar; narration rules; engine mechanics (plans, `hintKeepTrack`, `refreshHintStep`, `uiUpdateClearsHint`); refusal ↔ mistakes; hint rendering incl. colour legend; candidate-elimination family; heuristic/non-deductive family; cross-game guards; in-process verification; method lessons | H everything except §1A |
| `testing.md` | Tiers 1–3 + 2.5; render scenarios + snapshots; the differentials today (frozen fixtures, two lifecycles, what a red one means post-C); generation/property tests for new games; seed-determinism, never clock-gated; render-op vocabulary; heavy-test budgeting; metrics; probe pointer | P §4 (live status + §4.1, §4.8; history condensed), §5, §5.1, §5.2, §8; `docs/test-strength.md` linked, not duplicated |
| `engine-catalog.md` | The shared-helper reference, by category, one entry each: what it is, when to reach for it, exemplar consumer, byte-match sensitivity where relevant; the promotion rule (second consumer → promote) | P §2.1, engine tree inventory; module headers stay authoritative |

`docs/test-strength.md` stays as-is.

### D2 — Named anchors, and the citation format

Cited headings are short, distinctive, grep-stable. Citation form in code
comments, specs and guides: `docs/games/<file>.md § "Heading"`. Positional
numbers are banned as citation targets (repo-layout delta). Every distinct
legacy key (the ~60 `playbook §x.y` / `hint-authoring §x.y` keys) maps to one
new `(file, heading)` pair; the map is an appendix of this file once drafting
lands, and the repoint is a per-key mechanical substitution verified by shape
(every changed line contains a legacy citation; zero legacy keys survive
outside `openspec/changes/archive/` and git history).

### D3 — Conservation, not summarisation

The old guides are a floor: every lesson, tell, and exemplar pointer lands in a
new home, or is dropped deliberately with a recorded reason (only where the
content is *purely* about the retired C toolchain and cannot instruct any
present-day action; a lesson that generalises is kept, retold in present-day
terms with its history compressed to a line + git pointer). Each drafted file
carries its part of the coverage map; the merged map is checked adversarially
before the old files are deleted.

### D4 — AI-native style rules (apply to every file)

- Front-load the rule: sections open with the imperative rule in bold, then the
  why, then the war story compressed.
- Every pattern names an exemplar file path; no pasted code that can rot
  (repo-layout requirement).
- "Tell:" lines — the greppable symptom that signals a trap — are kept and
  added where the source implies one.
- Decision tables over prose where a choice has enumerable arms.
- Normative rules are stated briefly + linked to the owning spec requirement;
  the guide never carries the authoritative wording.
- Present tense describes the current architecture only; the C era appears
  only as compressed history with a `git` pointer.

### D5 — The RDD vision is fiction, quarantined

`docs/framework-rdd/` with a status banner in every file (repo-layout ADDED
requirement). Written *as if* the framework exists, because that is what
readme-driven development is for — but the banner plus the requirement keep it
from ever being mistaken for the present. It must honour, and explicitly cite,
the constraints the repo has already paid for: the scene-graph withdrawal
postmortem (no framework-scale render pivot without real downstream pressure),
"an exemplar hint never loses a word to an abstraction", the guess-free
generation policy, and `deduction-fixpoint.ts`'s recorded no-gos (the ladder
shape is near-universal; the bookkeeping is per-game and often decides which
puzzles exist).

## Risks / Trade-offs

- Losing a lesson in redistribution → D3's coverage map + adversarial pass
  before deletion.
- Garbling a comment in the ~330-site repoint → per-key scripted substitution +
  verify-by-shape + the full gate.
- The vision docs read as current truth → D5 banner + spec requirement.
- Heading drift re-stranding citations later → repo-layout delta makes cited
  headings rename-with-repoint-in-same-change.

## Migration Plan

Draft new files → adversarial coverage check → repoint citations (code,
scripts, AGENTS.md, active changes' tasks) → delete `docs/porting/` → specs
deltas validated → gate → owner acceptance → archive.

## Implementation notes (recorded during execution)

- **The adversarial coverage pass found eight gaps** in the first drafts (the
  divergence four-rules block, three generator-bounding lessons, the Unequal
  double-shuffle trap, the Slide abort-at-the-edges lesson, the
  pencil-indicator placement rules, the flat-namespace/lint notes, the
  `textFormat` widen-not-hook meta-lesson); all were patched before
  `docs/porting/` was deleted. One suspected gap was a false alarm (the
  RNG-rejection rule was already in `testing.md`).
- **Two ride-along code fixes**, both latent defects this change's sweep
  surfaced, both restoring already-specified behaviour: (a)
  `scripts/new-game-port.sh` emitted imports from the pre-
  `retire-native-directory` tree (`../../../puzzle/types.ts`,
  `../../random/index.ts`) — a fresh scaffold would not have type-checked,
  violating the scaffolding requirement; now `../../engine/…`. (b)
  `engine/game.ts`'s `wantsStylusModifier` doc said Pattern was the only
  opt-in; Loopy also opts in.
- **One legacy citation was already stale before this change** (`playbook
  §2.5`, a section that never existed — it meant *tier* 2.5); resolved from
  the citing site's intent to `testing.md § "Render scenarios"`. The
  fragility this change removes had already fired.
- The repoint was verified by shape: every changed line in the ~330-site
  sweep contains a legacy citation on its `-` side and `docs/games/` on its
  `+` side; `npm run probe -- --verify` confirms no quoted probe anchor
  moved.

## Appendix: legacy-key → new-anchor map

The repoint executes exactly this table. Context-dependent keys (marked ⚖)
are resolved per citing site, not blindly.

| Legacy key | New citation target |
| --- | --- |
| playbook §1 | `README.md § "Before you start"` |
| playbook §2.1 | `engine-catalog.md § "Reach for these, don't re-roll"` |
| playbook §2.2 | `solver-and-generator.md § "The Latin family"` |
| playbook §2.3 | `input.md § "Round fractional pointer coordinates"` |
| playbook §2.5 | stale in the source (no such section existed) — resolve from the citing site's intent |
| playbook §3.1 | `mechanics.md § "Idiomatic state, not a C transliteration"` |
| playbook §3.2 | ⚖ `rendering.md § "The tile cache and the diff key"`; overlay-repaint citations → `rendering.md § "Overlay sidecars"` |
| playbook §3.3 | `rendering.md § "The palette: three layers, meaning first"` |
| playbook §3.4 | ⚖ `mechanics.md § "Params"` (float/`describeParams`/custom-dialog/prefs sub-anchors by context) |
| playbook §3.5 | `solver-and-generator.md § "The solvable-game contract"` |
| playbook §3.6 | `solver-and-generator.md § "Solve and the generator's aux"` |
| playbook §3.7 | `mechanics.md § "Pencil marks: the full note-taking UX"` |
| playbook §3.8 | `input.md § "The on-screen keypad"` |
| playbook §3.8a | `input.md § "The numeric keypad never arrives"` |
| playbook §3.8b | `input.md § "Touch is stripped for you"` |
| playbook §3.8c | `input.md § "A touch hold arrives as the right button"` |
| playbook §3.8d | `input.md § "The board keeps the keyboard after a control"` |
| playbook §3.8e | `input.md § "The accreting-paint drag"` |
| playbook §3.9 | `mechanics.md § "The reference aid"` |
| playbook §3.10 | `mechanics.md § "A board decided at first click"` |
| playbook §3.11 | ⚖ `mechanics.md § "Timed games"`; encodeUi citations → `§ "Ui that must survive a save"` |
| playbook §3.12 | `rendering.md § "A press preview must not look like a commit"` |
| playbook §3.12a | `input.md § "A line-fill drag picks a transformation"` |
| playbook §3.13 | ⚖ geometry → `mechanics.md § "Padded rectangles and sheared draws"`; render half → `rendering.md § "Bespoke board geometry, draw side"` |
| playbook §3.14 | `mechanics.md § "Grid modes are a movement table"` |
| playbook §4 | ⚖ `testing.md § "The frozen differentials"`; divergence-policy citations → `solver-and-generator.md` |
| playbook §4.1 | `testing.md § "Fixture lifecycle"` |
| playbook §4.2 | `testing.md § "Fixture lifecycle"` |
| playbook §4.3 | `testing.md § "Byte-match: fidelity where there is a right answer"` |
| playbook §4.4 | `solver-and-generator.md § "Solver-gated generation"` |
| playbook §4.5 | `testing.md § "Byte-match: fidelity where there is a right answer"` |
| playbook §4.6 | `testing.md § "Quirks are load-bearing — capped, not cleaned"` |
| playbook §4.7 | `testing.md § "When a fixture goes red"` |
| playbook §4.8 | `testing.md § "Order-independent verdicts"` |
| playbook §5 | `testing.md § "The test tiers"` |
| playbook §5.1 | `testing.md § "Render-op vocabulary"` |
| playbook §5.2 | `testing.md § "Seed-deterministic, never clock-gated"` |
| playbook §6 | `README.md § "The acceptance gate"` |
| playbook §7 | `README.md § "Close out"` |
| playbook §8 | `testing.md § "Metrics and instruments"` |
| hint-authoring §1 | `hints.md § "The quality bar"` |
| hint-authoring §1A | `solver-and-generator.md § "Guess-free generation"` |
| hint-authoring §1B | `hints.md § "Cognitive load: one step per hint"` |
| hint-authoring §2 | `hints.md § "Writing the narration"` |
| hint-authoring §2.1 | `hints.md § "Necessity for deductions, imperative for moves"` |
| hint-authoring §2.2 | `hints.md § "Lead with the indication"` |
| hint-authoring §2.3 | `hints.md § "Name a square by its value"` |
| hint-authoring §2.4 | `hints.md § "The premise must single out the conclusion"` |
| hint-authoring §2.5 | `hints.md § "Keep the narration terse"` |
| hint-authoring §2.6 | `hints.md § "Conclude with the action the move makes"` |
| hint-authoring §2.7 | `hints.md § "Sanity-read at the degenerate extremes"` |
| hint-authoring §2.8 | `hints.md § "Name elements by what the player can see"` |
| hint-authoring §2.9 | `hints.md § "Rules belong in the help"` |
| hint-authoring §2.10 | `hints.md § "Hint the move that advances the goal"` |
| hint-authoring §3 | `hints.md § "Engine mechanics"` |
| hint-authoring §4 | `hints.md § "Refusal couples to the mistake overlay"` |
| hint-authoring §5.1 | `hints.md § "Highlight, never perform"` |
| hint-authoring §5.1a | `hints.md § "Echo the move's shape in the hint colour"` |
| hint-authoring §5.2 | `hints.md § "Show the evidence as an area"` |
| hint-authoring §5.2a | `hints.md § "Off-board evidence"` |
| hint-authoring §5.2b | `hints.md § "Suppression must dismiss on UI_UPDATE"` |
| hint-authoring §5.3 | `hints.md § "The element-type colour legend"` |
| hint-authoring §5.4 | `hints.md § "Shade vs ring"` |
| hint-authoring §5.5 | `hints.md § "Group one firing into one step"` |
| hint-authoring §5.5a | `hints.md § "A journey completes leg by leg"` |
| hint-authoring §5.5b | `hints.md § "A move must not reach past the squares the step claimed"` |
| hint-authoring §5.6 | `hints.md § "Honest non-local evidence"` |
| hint-authoring §5.6a | `hints.md § "Re-derive the named technique"` |
| hint-authoring §5.6a′ | `hints.md § "Read the reason off the validator"` |
| hint-authoring §5.6b | `hints.md § "The honest chain tier"` |
| hint-authoring §5.6b′ | `hints.md § "Show the what-if walk statically"` |
| hint-authoring §5.6c | `hints.md § "Rule-outs as board marks"` |
| hint-authoring §5.7 | `hints.md § "Placement animation as hint motion"` |
| hint-authoring §5.8 | `hints.md § "Marks on tiles vs marks on cells"` |
| hint-authoring §6 | `hints.md § "Non-deductive (heuristic) hints"` |
| hint-authoring §6.3 | `hints.md § "Recompute-stable plans"` |
| hint-authoring §6.5 | `hints.md § "Sliding-permutation games"` |
| hint-authoring §6.6 | `hints.md § "Recover the answer from the board"` |
| hint-authoring §7.1 | `hints.md § "A hint must resume from any position"` |
| hint-authoring §7.2 | `hints.md § "The step budget"` |
| hint-authoring §7.3 | `hints.md § "Stale plans and refreshHintStep"` |
| hint-authoring §8 | `hints.md § "Verifying a hint in-process"` |
| hint-authoring §9 | `hints.md § "Candidate-elimination games"` |
| hint-authoring §9.1 | `hints.md § "The recorder and the soundness boundary"` |
| hint-authoring §9.2 | `hints.md § "Persist, populate, and the moves"` |
| hint-authoring §9.3 | `hints.md § "Solve the way a human does"` |
| hint-authoring §9.3a | `hints.md § "Re-derive a placement's why"` |
| hint-authoring §9.4 | `hints.md § "A non-Latin candidate game (Undead)"` |
| hint-authoring §9.4a | `hints.md § "Narrate by what survives (Subsets)"` |
| hint-authoring §9.5 | `hints.md § "Thread the recorder (Solo)"` |
| hint-authoring §9.6 | `hints.md § "Placement-first letter games (Group)"` |
| hint-authoring §9.7 | `hints.md § "Non-uniform value sets (Salad)"` |
| hint-authoring §10 | `hints.md § "Probe before trusting a diagnosis"` |
