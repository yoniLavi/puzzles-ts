# derive-difficulty-from-the-technique-ladder

Realizes: `docs/framework-rdd/game-definition.md` § "Params and presets" —
*"if your techniques carry tiers … there is no hand-written
`DifficultyContract`; it is a projection of the technique ladder"*.

**Readiness: ready to implement.** Scoped, and the lever it needs already
exists.

## Why

**This was fiction in August and is buildable now, because of what shipped in
September.** `game-definition.md` says a game's difficulty contract should fall
out of its techniques rather than being written by hand. That was impossible
while a technique was an anonymous `() => number` whose difficulty was its array
index. `declare-deduction-techniques` gave every technique a declared `tier`, and
`re-derive-the-fixpoint-no-gos` put nine call sites on that runner. **The ladder
now knows its own tiers, and nothing reads them.**

Meanwhile 28 games hand-write a `DifficultyContract` — `tiers`, `tierOf`,
`withTier`, `solveAtCap` — and the two halves are held together only by
`difficulty-contract.test.ts` asserting they agree. A projection removes the
opportunity for them to disagree in the first place, which is the same move as
`derive-hint-enrollment`: stop asserting that two hand-maintained things match,
and derive one from the other.

**Start here rather than at the board model** (owner, 2026-09-04): the params
end has the strongest existing evidence, this is the one piece where work
already shipped creates the lever, and it *removes* per-game surface instead of
adding framework surface.

## What Changes

- **Derive `tiers` from the ladder** for games whose solver runs on the shared
  runner: the distinct `tier` values a game declares, in order, are its tiers.
- **Keep `tierOf` / `withTier` per-game.** They are about the game's *params
  record* — where the tier is stored and what it is called — and eight games do
  not hold a number there at all (`difficulty.ts` documents this). Nothing about
  the ladder tells you that, and pretending otherwise is the contortion the
  framework must not do.
- **Consider deriving `solveAtCap`.** It is `maxTier` plus the game's own
  verdict mapping; the mapping is per-game (`latinVerdict` and friends) but the
  capping is not. Decide with evidence, in the change, not now.
- **Both shapes must coexist.** Only some games are on the runner; the rest keep
  declaring by hand and must stay first-class. A contract that only works for
  runner games is not a framework contract — it is a second contract.
- **The existing guards stay and become the proof.** `difficulty-contract.test.ts`
  already asserts cap-monotonicity, tier round-tripping through the codec, and
  tiers matching `paramConfig` choices. A derived `tiers` that changes any of
  those answers is wrong, and those tests are how we would know.

## Impact

- Affected specs: `ts-engine` (the difficulty contract), possibly `ts-migration`.
- Affected code: `src/engine/difficulty.ts`, the shared runner (to expose a
  ladder's declared tiers), and the per-game contracts that can drop their
  `tiers` array.
- **Behavior must not change.** A tier list that comes out different from the
  hand-written one means either the derivation is wrong or the hand-written list
  was — and distinguishing those is required before the change proceeds, never
  resolved by adopting whichever is more convenient. The frozen differentials do
  not cover this directly (tiers are not in a desc), so
  `difficulty-contract.test.ts` is the net and its coverage should be checked
  before it is relied on.

## Open question this change must answer first

**How many games are actually in scope is not greppable, and two attempts to
count it disagreed** (2026-09-04). Runner membership resists a name-keyed scan
because several solvers *mention* `runDeductionFixpoint` only in doc comments
(Boats and Loopy both do, and neither uses it); contract declaration resists one
because `difficulty:` is not written as a uniform literal across games. So
establishing the overlap — tiered games whose ladder is on the shared runner — is
**task 1**, by reading, and the figure belongs in the change rather than in this
proposal. The precedent is `adopt-shared-deduction-fixpoint`, whose "~29
candidates" did not survive verification.
