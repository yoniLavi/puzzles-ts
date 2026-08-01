# unify-border-grid-games — design

## D1: Extract the mechanic, not the text

The 466 duplicated lines are **not** all the same decision. jscpd matches tokens;
it cannot tell a shared mechanic from a coincidence of shape. Two blocks are
worth extracting for different reasons and one is worth leaving alone:

- **The mechanic** — `interpretMove`'s edge hit test, the tri-state cycle, the
  paired two-cell edit, the half-cell cursor scheme. This is one design, written
  once and copied. **Extract.**
- **The vocabulary** — `BORDER(d)`, `DISABLED(m)`, `FLIP(d)`, `DX`/`DY`. Shared
  because it is upstream's encoding of "which of my four edges", and any change
  to it must be simultaneous in both games. **Extract.**
- **The coincidence** — a `for` loop over `w*h` that reads a flag and draws a
  line will look identical in any two grid games in the collection, and does. It
  is not a shared decision, and unifying it couples two renderers that have no
  reason to move together. **Leave.**

The test for which is which: *would a change to this code have to happen in both
games at once to keep them correct?* If yes, it is one thing in two places. If
no, it is two things that resemble each other.

This is the guardrail from the standing directive — "game-specific logic is never
contorted to fit a contract" — applied at the level of deciding what the contract
covers in the first place.

## D2: Where it lives, and what it is called

**Decision:** a new module under `src/native/engine/`, alongside `dsf.ts`,
`pointer.ts`, `grid.ts` and the rest of the shared substrate. Not a
`games/shared/` directory, which does not exist and should not be invented for
one module.

It is a **grid-edge input and encoding** module, not a "Palisade base class". The
distinction matters: `extract-shared-helpers` established that this collection
shares *helpers* (a dsf, a colour derivation, a sorted multiset), and the
`Game` interface is the only inheritance-shaped thing in the design. A shared
module that both games call is consistent with that; a base game class that both
games extend is a different architecture and has no second justification.

## D3: Why this extraction has an oracle, and most do not

Both games ship frozen-fixture differentials. Board generation depends on the
solver's verdict at every step, so any change to generation moves the fixture.
**Input handling is downstream of generation and touches none of it** — so a
correct extraction here is provably a no-op:

- every differential fixture passes **unmodified**;
- every render snapshot passes **without `vitest -u`**.

That is a stronger guarantee than most refactors in this repo can obtain, and it
is why this change is sequenced before `adopt-shared-deduction-fixpoint`, whose
targets sit *inside* the solvers and therefore have no such property.

**Corollary that must not be lost:** if a snapshot does need updating, the
extraction is wrong. The temptation to re-baseline is the exact failure mode
`AGENTS.md` warns about — "pair every snapshot with a few targeted assertions so
a careless `-u` can't erase the guarantee". Here the whole change is the
assertion.

## D4: Two consumers is enough, and three would not make it a framework

The obvious objection is that two consumers is a thin basis for an abstraction.
Three answers:

1. The standing directive (2026-07-14) explicitly retired the "wait for a defect
   history" bar, and cites `unify-hint-framework` as the model — where
   `lazyPopulate` and `HintSidecar` were extracted on exactly this basis.
2. Two is the *complete* population, not a sample. No other game in the
   collection marks edges between cells with a tri-state; Loopy marks edges but
   with different semantics, on eighteen tilings, through `grid.ts`. There is no
   third consumer coming, which makes the shape stable by construction rather
   than by hope.
3. The failure mode of over-abstracting is well documented here (the scene-graph
   withdrawal). The distinguishing feature is scope: that was a contract every
   game had to implement, this is a module two games import. A module with two
   callers that turns out wrong is deleted in an afternoon.

## D5: Sequencing

After `establish-refactor-baseline` (so the clone-line reduction is measurable
against a committed snapshot) and ideally after `tighten-type-checking` (so the
extracted code is written once under the final compiler flags rather than
migrated twice). Independent of `adopt-shared-deduction-fixpoint` and
`break-module-cycles` — though note both Palisade and Separate appear nowhere in
the 16 `index↔render` cycles, so there is no interaction to sequence around.
