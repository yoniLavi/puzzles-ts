# Design — colour-tokens-per-scheme

> **Read first, in this order:** the archived `2026-07-31-audit-game-colour-palette`
> (what a role is, why the guard is value-based, the `inventory.md` of all 687 entries)
> and `2026-07-31-hand-author-dark-palette` (why the formula was wrong, what
> `PIECE_BLACK` is for, and the measurements). This change is their conclusion, and
> repeats none of their reasoning.

## Context

### Where the collection actually is

| | count |
| --- | --- |
| Palette entries across 57 games | 687 |
| …from a shared role or the `mkhighlight` trio | 407 (59%) |
| …declared game-local (still literals) | 302 entries, **189 distinct values** |
| Games holding at least one literal | 56 |
| Games holding ≤3 | 25 |
| Largest holders | signpost 70, guess 12, crossing 12, mines 9, flood 9, unruly 8 |

Signpost's 70 dominate the count and are the least work: 8 hex constants plus
deterministic interpolation and averaging (`render.ts` `buildPalette`). Eight tokens
and a function, not seventy tokens.

### The question that had to be settled first, and is

*Does any game compute a colour from game semantics?* **No, and it cannot.**
`Game.colours(defaultBackground: Colour): Colour[]` takes only the frontend background —
no params, no state. Whatever a game returns is a pure function of one colour. Games
select *which palette index* to draw with from state (Signpost picks a ramp entry per
region length, Mines a digit colour per count); that is index selection, not colour
computation, and it is unaffected by this change.

So the owner's bar is fully reachable: every colour can be a token or a function of
tokens, with no "except this game" carve-out.

## Decisions

### D1 — A token is a name, a meaning, and one value per scheme

```
GUESS_PEG_CORAL: { light: [1, 0.5, 0.5], dark: [...] }
```

Named for **what it means to the player**, not for its appearance
(`FLOOD_TILE_3`, not `FLOOD_ORANGE`) — an appearance name is a lie the moment a second
scheme gives it a different appearance, which is the entire point of the exercise.

Game-specific tokens keep their game's prefix. They are global constants in one table,
but they are not pretending to be shared roles: `audit-game-colour-palette` D3's
distinction (a shared role needs two or more games meaning the same thing) still
decides which name a colour gets, and its F7 test — *convergence across ports is
evidence for a role, divergence is evidence against* — still applies. A token table is
not a licence to unify Guess's pegs with Flood's tiles.

### D2 — A derived colour stays derived, over tokens

The end state is "no colour value in a game", not "no arithmetic anywhere". Three
things legitimately compute:

- **the `mkhighlight` trio** — a bevel is *a function of the surface it is on*, and
  authoring highlight/lowlight per game per scheme would be busywork with a worse result;
- **Signpost's ramps** — interpolation between 8 tokens;
- **the background-derived roles** (`pencilColour`, `highlightWash`, `errorWash`, …) —
  which exist precisely because they must track the board.

Each is a **function whose inputs are tokens**. The spec states this rather than leaving
it to be discovered, because the alternative reading ("every colour is a literal token")
would force ~200 authored values that are today one correct line of arithmetic.

### D3 — Author light first, then dark; the formula becomes the fallback

Tokens land with their light value (a pure move — the value is already in the game) and
optionally a dark one. A token with no dark value falls through to
`utils/color.ts`'s calculation, which `hand-author-dark-palette` made correct.

This is what lets a 300-value migration land incrementally: **moving a colour into the
table is behaviour-preserving by construction**, so the mechanical half can be done and
reviewed without anyone making a design decision, and the authoring of dark values is a
separate, opinion-bearing pass that can go game by game.

Do not merge those two passes. A commit that both relocates a value and changes it is a
commit where the diff cannot tell you which happened.

### D4 — The guard inverts: from "declare it" to "you may not have one"

`palette.test.ts` today resolves every game's palette and permits any value listed in
`GAME_LOCAL`. As tokens absorb those values, `GAME_LOCAL` shrinks; when it is empty, the
guard's rule becomes **a game's palette contains no value that is not a token or a
function of tokens**, and `GAME_LOCAL` is deleted rather than left as a permanently-empty
escape hatch.

Note the limitation carried over from the audit (its F6): the guard compares *resolved
values*, so it cannot see provenance — a game writing a literal that happens to equal a
token still passes. Closing that means a source-level rule, which the audit's D7
rejected as brittle. **Prefer a lint rule scoped to `src/native/games/**/render.ts`
forbidding numeric array literals in `colours()`** over widening the value-based guard;
it is the check that actually matches the requirement. Decide it in implementation.

### D5 — Light mode is the regression surface

Unchanged from `hand-author-dark-palette` D5, and load-bearing here because the diff is
large: every committed render snapshot is a light-mode frame, so **a moved snapshot is a
defect in this change until proven otherwise**. Never re-baseline one to make the suite
pass. Combined with D3's "relocation is behaviour-preserving", this means the mechanical
pass should produce *zero* snapshot movement, and any movement is a mistake to find, not
a diff to accept.

### D6 — Order the work by leverage, not by game name

1. **Signpost** — 70 of the 302 entries, and it is 8 tokens plus arithmetic. One game,
   a quarter of the problem.
2. **The enumerated sets** — flood, guess, samegame, map, mines. These are also the
   games with a *known* dark-mode weakness: `hand-author-dark-palette` F2 measured their
   worst pairwise separation at 0.070 in dark against 0.134 in light, and no
   background-relative formula can fix it, because "tell these apart from each other" is
   a property of the set. These are the tokens whose dark values most want authoring,
   so tokenise and author them together.
3. **The 25 games with ≤3 literals** — bulk, trivial, mechanical.
4. **The remainder.**

### D7 — What "done" means

Not "the table exists". **Changing a scheme's whole appearance is an edit to one file,
and adding a third scheme requires touching no game.** Demonstrate it the way
`audit-game-colour-palette` F9 did — make an actual change, observe the blast radius,
revert — rather than asserting it.

## Risks

- **A 300-value diff hides a real change.** The strongest mitigation is D3's split:
  relocation commits should move zero snapshots, so anything that moves is a bug.
  Regenerate the audit's `inventory.md` (it diffs *resolved palettes* across commits) as
  the reviewable artefact — it is what made the last 400-site change auditable.
- **Naming 189 colours badly.** A bad token name outlives the change. D1's rule
  (meaning, not appearance) is the guard; where a colour has no meaning beyond "the
  fourth one", `<GAME>_TILE_4` is honest and fine.
- **Scope creep into a theme.** This change builds the vocabulary and authors the two
  schemes that exist. A theme *picker*, persisted preferences, or a third palette are
  not in it.
- **The enumerated-set problem is not solved by tokenising alone.** Tokens make the
  values addressable; someone still has to choose ten dark colours that are mutually
  distinguishable. D6 puts that work where the measurement says it is needed rather
  than pretending the table fixes it.
