# Design — size-seismic-keypad-to-its-boards

## D1. The measurement, and why it is stronger than a measurement

The proposal reported four inert keys from twelve seeds of one preset. Task 1.2
asked for that to be confirmed properly before acting on it, because
`SEISMIC_REGION_SIZES` describes the size *drawn*, not the size *realised* —
the generator's own comment says a region that runs out of frontier ends short,
so realised sizes skew smaller than drawn ones. Confirming a bound needs the
other direction: can anything come out *larger*?

**Measured, across all 16 preset/mode combinations × 25 seeds each: the largest
region generated is 5, everywhere.** Both modes, every board size, every
difficulty.

**And it is not an empirical bound, it is a structural one** — which is the part
worth having, because a sweep can only ever say "not in these 400 boards".
`growRegions` sets `target = Math.min(drawRegionSize(mode, rng), remaining)` and
grows only `while (size < target)`. `drawRegionSize` returns an element of
`SEISMIC_REGION_SIZES = [2,3,3,4,4,5]` in Seismic mode and the literal `5` in
Tectonic. So **no region above 5 is constructible**. The "stranded pocket" case
that might have been an exception is not one: a pocket is simply the next
iteration of the same loop, drawing its own target.

So the panel's `6`, `7`, `8` and `9` are dead on every board the app can
produce, for ever, and not by accident of seeding.

## D2. Size it to the generator — and note that nothing becomes unreachable

**Decision: yes.** The argument that settles it is not "four keys are ugly", it
is that **removing them removes no capability at all.** Those keys already do
nothing: `interpretMove` rejects `n > dsf.size(i)` and no cell has a region
bigger than 5. A physical keyboard can still send `6`–`9` and will get exactly
the rejection it gets today. What is removed is a control that lies about being
a control — and on touch, where the panel is the *only* digit-entry route, that
lie is the whole of the player's model of what the game accepts.

The cost is the imported-desc case: a hand-written or future-generated desc
carrying a size-6 region would have cells a touch player could not fill,
because `requestKeys(params)` cannot see the board. It is worth stating and
worth accepting:

- no build produces such a desc, so it is hypothetical rather than a
  regression;
- the keyboard route still works, so it is degraded rather than blocked;
- and it is already guarded — `input-parity.test.ts` fails if a panel key is
  unreachable, and the `ts-engine` requirement written by the input audit says
  widening the generator widens the panel.

The third option the proposal priced — making `requestKeys` board-aware — is
still the wrong trade. It changes a `Game` contract that deliberately takes
params only ("the keypad does not vary with play and the panel reloads only on
param change") for one game's hypothetical case. Revisit if a second game ever
wants it.

## D3. Derive the bound; do not write `5`

**This is the part that matters more than the number**, because the number is
not really the bug.

There are two adjacent, genuinely different facts here, and the code contains
three copies of them:

| Fact | Value | Where it lives |
|---|---|---|
| What the **format** admits | 5 / 9 | `maxRegionSize(mode)` — **and it has no production consumer at all**; its own doc says it exists for the structural tests |
| What the **generator makes** | 5 / 5 | the ceiling of `SEISMIC_REGION_SIZES` — unexported, implicit |
| What the **panel offers** | 5 / 9 | `requestKeys`, as the inline literal `p.mode === MODE_TECTONIC ? 5 : 9` |

The panel's line is an **inline copy of the first fact, where the second fact
was wanted**. That is this repository's most-repeated defect in its exact
canonical form — a fact restated somewhere nothing can keep it true — and it is
how the defect arose: `replace-seismic-region-generator` changed what the
generator makes, and a hand-written literal three files away had no way to hear
about it.

So `digitKeys(5)` would fix today's symptom and leave the mechanism intact,
ready to be wrong again the next time the distribution moves.

**Do instead:**

1. Export `maxGeneratedRegionSize(mode)` from `generator.ts`, computed as
   `Math.max(...)` over the actual distribution rather than written as `5`, so
   the export cannot disagree with the array beside it.
2. `requestKeys` calls it. The inline `MODE_TECTONIC ? 5 : 9` goes.
3. Assert `maxGeneratedRegionSize(mode) <= maxRegionSize(mode)` — the generator
   may not exceed what the format admits — alongside the existing structural
   property that no generated board exceeds the generated bound.

Widen `SEISMIC_REGION_SIZES` after that and the keypad widens by itself, with
no second place to remember.

## D4. A note for whoever touches `maxRegionSize`

It currently has **no production consumer** — every reference outside its own
declaration is a test. That is not a defect (its doc states the intent
plainly, and a cross-game guard is a legitimate reader — the same standing
`difficulty` has in `contract-surface.test.ts`), and D3 gives it a second
reader in the assertion above, which is the right one: the format bound's job is
to bound the generator bound.

Worth recording only so the next reader does not delete it as dead, or —
worse — reach for it as the panel's source of truth a second time.
