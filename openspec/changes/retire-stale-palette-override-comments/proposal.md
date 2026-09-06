# retire-stale-palette-override-comments

## Why

Five doc comments across three games state, as fact, that the app applies
dark-mode `paletteOverrides` to those games at named indices. It does not.
`cc73af79`, the twelve-color palette consolidation, deleted them, and
**`src/puzzle/augmentation.ts` now contains exactly one `paletteOverrides`
entry in the whole file** — `pearl: { darkMode: { paletteOverrides: { 0: 1.15 } } }`.

The false ones, found while drawing dark-mode mockups for
`design-front-page-and-chrome`:

| File | Claims |
| --- | --- |
| `src/games/boats/render.ts:32` | "`augmentation.ts` darkens index 4 (the water) in dark mode via `paletteOverrides: { 4: 0.6 }`" |
| `src/games/boats/render.ts:109` | "(`paletteOverrides: { 4: 0.6 }` for the water), so only indices at or below 14…" |
| `src/games/inertia/render.ts:67` | "The app's dark-mode `paletteOverrides` for inertia touch only index 6" |
| `src/games/lightup/render.ts:12` | "the app's dark-mode `paletteOverrides` for lightup target indices 2 (black) and 3 (light)" |
| `src/games/lightup/render.ts:57` | "lightup's dark-mode `paletteOverrides` touch only indices 2/3, so these are safe" |

Pearl's two comments are accurate and stay. The ten comments that say a game
has **no** overrides are true, and stay.

**Nothing is broken today**, which is exactly why this needs doing rather than
ignoring. Each false comment is stated as *the reason it is safe to append a
palette index past the C enum*: "overrides touch only 2/3, so these are safe."
That conclusion is currently true by accident — no overrides at all makes any
append safe — so the comment reads as verified when its premise is fiction. The
next person to add an override to Boats, Inertia or Light Up will consult a
comment telling them which indices are already spoken for, and it will be
wrong. This is `AGENTS.md` § "Method": *don't repoint a dead recipe — retire
it*, and *a count written in prose is a census nobody re-runs*.

## What Changes

- **Correct the five comments** to state what is true now: these games have no
  dark-mode palette overrides, so an appended index cannot collide with one.
  Keep the *reason* the index-for-index correspondence with the upstream `COL_*`
  enum matters — that is still load-bearing — and drop the invented index/value
  pairs.
- **Guard the class, not the instances.** A comment naming a
  `paletteOverrides` index for a game is a claim about `augmentation.ts`, and it
  went stale silently. Add a test that parses the `paletteOverrides` entries
  actually declared in `augmentation.ts` and asserts that every
  `paletteOverrides`-with-an-index claim in `src/games/*/render.ts` matches one.
  Per `AGENTS.md`, key on the **shape** (a `paletteOverrides` mention followed
  by an index) rather than on a game roster, carry a vacuity guard (assert the
  number of comments scanned, which is non-zero), and prove it fails before
  trusting it by breaking Pearl's entry deliberately.

## Impact

- Affected specs: `ts-engine` gains a requirement that a comment naming a
  palette override index is checked against the declaration.
- Affected code: `src/games/{boats,inertia,lightup}/render.ts` (comments only),
  plus one new test.
- Risk: none to behavior — the five edits are comments. The new guard is the
  substantive part, and its own failure mode (matching nothing) is covered by
  the vacuity count.

## Out of scope

**Light Up's black-on-dark clue squares.** Drawing dark mockups measured them
at 1.79 : 1 against the board (15.9 : 1 in light). That is a **deliberate**
pin from `hand-author-dark-palette` — *"a piece that is black stays black in
dark mode"* — stated at the assignment in `lightup/render.ts`. It is recorded
with its number in `design-front-page-and-chrome`'s `design.md` as decision
input for the owner, and no change is proposed here.
