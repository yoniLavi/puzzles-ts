# Design: refactor-pre-port-tidy

## Context

Survey before the next game port found three classes of debt: code
duplication across ports (mkhighlight palette, parseLeadingInt), phantom
engine API (PointerAction), and openspec drift (misplaced archives, never-
applied deltas, game-specific requirements in the engine spec). All are
cheapest to fix now, before the next port copies an existing game as its
template.

## Decisions

### D1: `mkhighlight(bg)` returns a named palette object, not an array

Upstream `game_mkhighlight` writes three palette slots (bg, hi, lo) by
pointer. The idiomatic TS shape is
`mkhighlight(bg: Colour): { background, highlight, lowlight }` — call sites
destructure and place the colours wherever their palette index order wants
them (Pegs uses `[bg, hi, lo, ...]`, Sixteen `[bg, text, hi, lo, hint]`).
`mkhighlightBackground` remains exported for games that only need the
background shift (Galaxies). The duplicated `colourDistance`/`colourMix`
lambdas hoist to module scope, shared by both functions.

Alternative considered: leave hi/lo derivation per-game since "every game's
palette differs". Rejected — the *derivation* is identical (it was byte-
identical in Pegs and Sixteen); only the palette placement differs, and that
stays per-game.

The consolidation surfaced a real defect in the duplicated code, which is
the argument for the helper in miniature. Upstream `misc.c`
`game_mkhighlight_specific` saturates the highlight to **pure white** when
the background is within K of white (and the lowlight to pure black near
black). The inline copies instead used `mix(white, black, K/√3)` in that
branch — the formula for the *background* extrapolation, misapplied — which
evaluates to the adjusted background itself, so the highlight bevel
disappeared into the background on light hosts. The shared helper follows
upstream. Two consequences: (a) Pegs/Sixteen highlights on light themes
become pure white (visible change, owner spot-check requested); (b) the
saturation branch also absorbs the floating-point case where
`mkhighlightBackground`'s shift leaves the background a hair *inside* K,
which is precisely what triggered the buggy branch in practice.

### D2: Remove PointerAction now rather than keep waiting for a consumer

`extract-shared-helpers` spec'd `PointerAction`/`parsePointerAction` as the
typed-input direction. Two drag-heavy games (Galaxies before it, Sixteen
after) shipped on raw button-constant comparisons; the helper has zero
consumers. Keeping unproven API "for later" is exactly the phantom-surface
the Galaxies design D1 second-consumer rule exists to prevent — and the
removal is trivially reversible from git history if a future port actually
wants this shape. The button constants are kept: all four games import them.

### D3: Recovered requirements go in per-game capabilities, not ts-engine

Flip and Galaxies each have their own capability spec; Pegs and Sixteen's
requirements were lost (pegs) or pointed at ts-engine (sixteen, including two
that later hint/drag changes did apply to ts-engine). Backfilling into
per-game `pegs`/`sixteen` capabilities, and migrating the two applied
Sixteen requirements out of ts-engine, restores the one-capability-per-game
convention so the next port has a single unambiguous precedent. The ts-engine
spec keeps only genuinely cross-game requirements (the Hint System engine
requirement stays).

### D4: Archive-location repair is a direct fix, not a spec delta

Moving `openspec/archive/*` to `openspec/changes/archive/YYYY-MM-DD-*`
restores the documented convention in OPENSPEC_AGENTS.md — bug-fix class,
no proposal needed, but recorded here so the change is self-describing.

## Risks / Trade-offs

- **Palette regression risk**: mkhighlight consolidation touches rendering
  colours, the exact class of "cosmetic" bug this project refuses to ship.
  Mitigation: the new `colour-mkhighlight.test.ts` asserts value-identity
  with the previous inline derivation on mid-range backgrounds (where the
  old code matched upstream) and upstream's white/black saturation on
  near-extreme backgrounds (where it didn't), plus brightness-ordering and
  in-gamut properties across all of them; the pegs/sixteen behavioural
  suites stay green. The deliberate fallback fix is additionally flagged
  for owner visual spot-check on a light theme.
- **Spec-migration fidelity**: REMOVED + ADDED across capabilities can drop
  text. Mitigation: requirements are moved verbatim (copy, not rewrite).

## Open Questions

None.
