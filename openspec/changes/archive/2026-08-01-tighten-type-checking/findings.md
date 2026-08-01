# tighten-type-checking — findings

## Headline: all 53 "dead branches" are live, and the analysis is what is wrong

The change was proposed on the strength of 53 conditions that type-aware lint
proved could never hold — 38 "the types have no overlap" and 15 "always falsy" —
on the reasoning that each is either a redundant guard or **a check that was
meant to fire and cannot**, the second being a bug.

Triaging all 53 found a third category the proposal did not anticipate, and
**every single finding is in it**: the code is correct and the *analysis* is
wrong. Not one line was deleted. Two distinct mechanisms, both structural.

### Mechanism 1 — narrowing is not invalidated by a mutating call

`singles/solver.ts`:

```ts
if (state.impossible) break;            // 818 — narrows state.impossible to false
if (solveAllblackbutone(state, ss) > 0) continue;
if (state.impossible) break;            // 821 — "always falsy"
```

`solveAllblackbutone` sets `s.impossible = true` (lines 548, 569). TypeScript
keeps the narrowing from line 818 across the call, so it believes line 821 cannot
fire. **Deleting it would stop the solver detecting contradictions**, and a
solver that reports "solved" for an impossible board corrupts generation, which
is gated on its verdict. Same shape in `tracks`, `pearl`, `sixteen`, `undead`,
`sokoban`, `crossing`, `mosaic`, `dominosa`.

This is inherent to a mutation-heavy solver written against a shared mutable
state object — which is the deliberate house style (`unruly/solver.ts`: *"the
solver is the one place we keep a mutable C-style grid"*).

### Mechanism 2 — index access is typed as total when it is not

The larger group, and it is a **direct consequence of the other flag this change
declined**:

```ts
const c = desc[pos];
if (c === undefined) return "too little data in clue-squares section";
```

Without `noUncheckedIndexedAccess`, `desc[pos]` is typed `string`, so
`c === undefined` "has no overlap" — while at runtime indexing past the end of a
string returns `undefined` and the check is exactly right. The sites are
`pattern`, `flood`, `rome`, `boats`, `keen`, `lightup`, `magnets`, `mathrax`,
`seismic`, `bridges`, `tracks`, `crossing`, plus `midend.ts` (config values),
`puzzle-screen.ts` (`puzzleDataMap[this.puzzleId]`) and `recording-drawing.ts`
(whose module doc *documents* the guarded behaviour: "an undefined index
surfaces as `colour#N`, not a throw").

**Almost all of them are description parsers** — the code that validates a game
ID a player pasted from anywhere. Deleting their bounds checks would remove
validation from the one place in this codebase that handles untrusted input.

## The two pieces of generic advice are in direct tension

The reviewed cleanup plan recommends both:

- enable `noUncheckedIndexedAccess` ("critical: C ports are index arithmetic");
- run `no-unnecessary-condition`, which "deletes every `if (!x) return -1;`
  inherited from null-pointer discipline. Usually hundreds of lines."

Taken together they are coherent. **Taken separately — which is how a phased plan
delivers them — the second is actively dangerous**, because with the flag off the
type system asserts that index access is total, and the lint then reports every
correct bounds check as dead code. A team that declined the flag on cost (9,028
errors, as measured here) and then ran the lint would delete precisely the
validation the flag existed to enforce.

Recorded because the shape generalises past this repo: **a static-analysis
finding is only as sound as the type information behind it, and declining to
tighten types does not make the analysis weaker — it makes it wrong in a specific,
confident direction.**

## Verdicts

| Item | Measured | Verdict |
|---|---|---|
| `noImplicitOverride` | 27 errors | **Adopted.** All were missing `override` on Lit lifecycle members. |
| `noPropertyAccessFromIndexSignature` | 52 errors | **Adopted.** All `TS4111`. Bracket access is the truthful form: `ConfigValues` keys genuinely vary per game, so `config["width"]` says "a key this game happens to define" where `config.width` implied a declared property. |
| `exactOptionalPropertyTypes` | 108 errors, 51 files | **Declined.** At nearly every site the honest fix widens `x?: T` to `x?: T \| undefined`, restoring exactly the semantics already in force — churn that buys documentation, not correctness. No site was found where absent-vs-present-undefined is load-bearing; the two persistence-adjacent cases round-trip identically. Revisit if a format ever distinguishes a missing key from an explicit null. |
| `noUncheckedIndexedAccess` | 9,028 errors | **Declined** (as proposed). See `tsconfig.json`, which now carries the reasoning. |
| 53 dead branches | 53 triaged | **Zero deleted.** All are analysis errors; see above. |
| 205 tidy findings | — | **Not applied.** 113 of them (`always truthy`, `unnecessary optional chain`) come from the same unsound rule. The remainder is `prefer-nullish-coalescing`/`prefer-optional-chain`/`no-unnecessary-type-assertion` — pure style across ~55 files, and "makes the codebase noticeably cleaner" is not met by a mechanical rewrite of working expressions. |
| Type-aware lint in CI | — | **Not adopted.** Its highest-value rule is unsound here for structural reasons that will not change. Re-run it from the metrics harness per round instead of gating on it. |

## One real inconsistency found, deliberately left alone

`prefer-nullish-coalescing` surfaced that **four games** (`crossing`, `mines`,
`spokes`, `subsets`) write `ds?.tilesize || PREFERRED_TILE_SIZE` where **49**
write `??`. These differ: drawstates initialise `tilesize: 0`, and `0 || x` is
`x` while `0 ?? x` is `0`. A tilesize of 0 reaching `fromCoord` would divide by
zero.

It is **not a shipped bug** — the midend sizes the drawing before any input can
arrive, so `interpretMove` never sees a zero tilesize. It is left as-is
deliberately: switching the four to `??` removes a harmless extra guard, and
switching the 49 to `||` is churn. Recorded so the next person who notices the
inconsistency does not have to re-derive that it is benign.
