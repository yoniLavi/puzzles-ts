# add-salad-hint

## Why

**Salad shipped its TS port (`add-salad-ts-port`, accepted 2026-07-29) without an
explained hint**, as every port does. It now earns one, and it is an unusually
good candidate:

- Both its difficulties are **pure deduction** — upstream passes
  `diff_recursive = DIFF_IMPOSSIBLE`, so the solver never guesses at Normal or
  Extreme. Every generated board is solvable by the very rungs a hint would
  narrate, so the §1A guess-free precondition holds *by construction*: there is
  no tier needing a "just because" fallback and no board to reject at
  generation.
- Its three signature techniques are **genuinely teachable** and unlike anything
  the collection already narrates: the hole/symbol synchronisation ("no letter
  can go here any more, so this square must be empty"), the per-line
  hole/circle **count** ("this row already has its two empty squares, so every
  other square in it holds a letter"), and the ABC End View **border clue**
  ("the clue sees C first, so until the first square that isn't known-empty
  nothing but C can appear — and C can be at most two squares in, so past that
  it is ruled out").
- It is a **candidate-elimination (pencil-note) game** — the pattern with the
  most shared machinery in the repo (`engine/candidate-hint.ts`,
  `engine/latin-hint.ts`, `engine/latin.ts`'s recorder), so most of the change
  is wiring rather than invention.

**The second, equal purpose of this change is to push the shared
candidate-hint surface** (owner directive: reuse and abstract as much
cross-game functionality as we can). Salad is the first candidate game whose
value set contains a member that behaves differently from the rest — the
**hole** — and the first whose hint emits **four** move shapes where the shared
`CandidateMove` has three. Both are pressure on real abstractions rather than
speculative generalisation, and both come with a stated stop condition (see
`design.md` D3, D6 and the Undead no-go precedent).

## What Changes

- **A recording pass over Salad's existing solver.** Thread a
  `DeductionRecorder` through `salad/solver.ts`'s three deductions (sync,
  count, border) so each candidate cleared / cell placed is recorded with its
  reason, exactly as the Latin family does. Gated on `solver.recorder`, so the
  generator path stays byte-for-byte identical — **verified by the existing
  28-fixture byte-match differential staying green, unedited**.
- **`salad/hint.ts`** — the plan walk: populate notes lazily, bulk-clean the
  obvious candidates once, then teach the next border/count/sync elimination or
  the next forced placement, grouping one firing into one multi-square journey.
- **Narration** for Salad's own reasons, plus the shared generic-Latin arms.
- **Rendering**: a hint `OverlaySidecar` and the `COL_HINT` / `COL_HINT_CELL`
  legend, with a border-clue deduction shading its clue *and* the line of sight
  it reasons along (§5.2).
- **Reuse, itemised** (design D1): `candidateHint` for the `hint()` entry;
  `keepCandidateHintTrack` / `refreshCandidateHintStep` through a
  `CandidateMoveAdapter<SaladMove>`; `nakedSingle` / `nextStrike` / `nextPlace` /
  `lazyPopulate` / `emitObviousCleanStep` / `regionDuplicateMarks`;
  `rowColRegions` + `classifyPlacementInRegions` + `hiddenSingleLine`;
  `narrateLatinReason` for the six generic arms; `stepBudget`; and enrolment in
  `testing/hint-games.ts`, which buys the three cross-game guards
  (`hint-resume`, `hint-overlay`, `hint-quality`) in one line.
- **Two candidate extractions to the shared engine**, each evaluated with a
  recorded verdict rather than assumed:
  1. **A note encoding (`CandidateVocabulary`)** — the projection between the
     solver's value space and the player's note space (design D3). Salad's
     `order − nums` interchangeable hole symbols all collapse onto a single "X"
     note bit, and its symbol bits are `1 << (n−1)` where the Latin games use
     `1 << n`. The bit-offset half already exists as the adapter's `bit(n)`;
     the many-to-one half is new.
  2. **A narration vocabulary for `narrateLatinReason`** (design D5) — three
     games (Towers, Solo, Group) keep private copies of the six generic arms
     *solely* because their value vocabulary differs ("height 5", letters,
     "row, column **and** block"). Salad is a fourth. Attempt an optional
     `vocab` parameter and adopt it only where the arms come out **verbatim**;
     record the non-migrations.
- **`docs/porting/hint-authoring.md`** gains Salad as the worked example of a
  candidate game with a non-uniform value set, plus whatever the two
  extractions conclude.

Explicitly **not** in this change:

- **No change to the solver's deductive power.** The recorder is additive and
  gated; the byte-match differential is the proof.
- **No new difficulty tier**, and no guessing rung.
- **No Rome work** — Rome's own port is the separate `add-rome-ts-port`.

## Impact

- Affected specs: `salad` (one ADDED requirement); `ts-engine` only if D3/D5
  land a shared-surface change.
- Affected code: `src/native/games/salad/{solver,hint,index,render}.ts`;
  `src/native/engine/{candidate-hint,latin-hint}.ts` if the extractions land;
  `src/native/engine/testing/hint-games.ts` (one line).
- No generator, codec or save-format change, so no fixture regeneration and no
  compatibility risk.
