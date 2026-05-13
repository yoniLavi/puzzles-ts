## Context

Second seam in the C → TS port (`AGENTS.md` "Seam order"). The first seam (`random.c`) established the workflow and most of the scaffolding; this seam exists in part to confirm that scaffolding is paying off, and in part to chip another module off the leaf-library list before we tackle `dsf.c` and `tree234.c`.

`combi.c` is the easiest possible second pass: 73 LOC, four functions, integer-only API, pure state machine, no nested pointers, no string handling, no random behaviour, no allocator coupling beyond `snew`/`sfree`. The decisions here should be boring — and the design.md exists mostly to call out a couple of choices where "boring" still requires saying out loud.

## Goals / Non-Goals

**Goals**
- Land a byte-for-byte TS port of `combi.c` plus a characterization corpus and a Vitest replay.
- Port `puzzles/auxiliary/combi-test.c` so the upstream test becomes our spec, per `AGENTS.md` test-discipline layer 2.
- Generate a sizing data point: with the scaffolding amortised, how long does the seam-specific work alone take?

**Non-Goals**
- Bridge the TS impl into the WASM build. Deferred to `wire-combi-to-wasm`, mirroring the random precedent.
- Delete `puzzles/combi.c`. Removal happens after the bridge has been green long enough to trust.
- Refactor `lightup.c`. The sole C consumer stays on C until the bridge lands.

## Decisions

### Decision: Split the bridge into a follow-up change, same as random

Mirror `port-random-to-typescript` → `wire-random-to-wasm`. This change ends at "TS impl is provably correct against the corpus." A follow-up `wire-combi-to-wasm` carries the bridge.

**Why**: the two halves are different *kinds* of work. The TS-impl half is a self-contained source-code exercise verified by Vitest. The bridge half changes the WASM build, links a new `--js-library`, and needs end-to-end browser verification under flag-on/flag-off. Splitting keeps each PR small and reviewable, and keeps the iteration loops separate (Vitest is fast; WASM rebuild + browser is slower even after the host-native migration).

**Alternatives considered**:
- *One combined change.* Tempting because combi is so small. Rejected for consistency with the random precedent and because the bridge still has its own surprises (Module-installed handle table, malloc'd return values for any string outputs — though combi has none — and a flag-name bikeshed).
- *Skip the bridge entirely; port `lightup.c` next and delete `combi.c` directly.* This avoids ever building a one-caller bridge. Considered seriously, but rejected: porting `lightup.c` is much bigger than porting `combi.c` (it's a whole puzzle back-end, not a leaf library), and the seam order in `AGENTS.md` puts per-puzzle back-ends *after* the leaf libraries for good reason — leaf-library ports retire shared engine code, per-puzzle ports retire only that puzzle. We follow the plan.

### Decision: TS API surface — idiomatic class, internals mirror C

Per the project-wide "idiomatic surface, faithful internals" dictum in `AGENTS.md`, the public surface is a `Combi` class whose shape reads naturally to a TypeScript caller:

- Constructor `new Combi(r, n)`.
- `next(): boolean` — returns `true` while a fresh `r`-tuple is available, `false` once exhausted. (Not `Combi | null` mirroring C's return value: the only thing a TS caller does with the C return is null-test it, and `boolean` is what TS-native consumers actually want.)
- `reset(): void`.
- Readable properties `r`, `n`, `total`, `nleft`, and `a: readonly number[]`.
- `[Symbol.iterator]()` yielding the `r`-tuple on each step, so callers can `for (const tuple of new Combi(3, 5))`.
- No `free()`. GC handles it; the bridge follow-up makes memory lifetime explicit via the handle table.

The corpus replay drives the explicit `next()` + `a` API rather than the iterator, so the regression test pins the exact contract every C-call site cares about. The iterator is sugar layered on top — exercised by the spec-port test (§3) for ergonomics coverage, but not load-bearing for fidelity.

**Internals**: state is a `number[]` for `a` (not `Int32Array` — JS numbers are fine and `readonly number[]` is the public type), plus `r`/`n`/`nleft`/`total`. The increment loop reproduces `next_combi` step-for-step (the `while (a[i] == n - r + i) i--;` walk, then `a[i] += 1`, then the `for (j = i+1 ...)` fixup) so byte-identical fidelity falls out of structural similarity to the C source.

**`boolean` vs `Combi | null` for `next()` — note for the regression bar**: the corpus replay walks the iterator while `next()` is truthy and asserts `a` matches `enumeration[i]`. `boolean` and `Combi | null` are observationally identical for the replay (both falsy-on-exhaustion), so the idiomatic shape wins without weakening the test.

### Decision: Corpus shape — flat `(r, n)` → enumeration of integer tuples

Each fixture is `{ name, r, n, enumeration: number[][] }` where `enumeration` is the full sequence of `r`-element subsets `combi` produces from `(0..n-1)` in lex order. The replay calls `next()` repeatedly and asserts the `r`-tuple matches `enumeration[i]`; once `next()` returns null, asserts the enumeration is exhausted.

This is simpler than random's corpus (which had `op`-tagged calls because random has multiple entry points). Combi has effectively one entry point — "give me the next combination" — so the call list collapses to a flat 2D array.

**Curated `(r, n)` grid**:
- `(0, 1)` — degenerate empty selection. `total = 1`, single empty tuple. Exercises the `r == 0` branch in `reset_combi`'s loop.
- `(1, 1)` — single element.
- `(2, 5)` — small canonical case, 10 tuples.
- `(3, 5)` — 10 tuples, different shape from (2,5).
- `(5, 5)` — `r == n`, single tuple `[0,1,2,3,4]`.
- `(2, 10)` — 45 tuples, exercises the `i--` walk further.
- `(4, 8)` — 70 tuples, mid-sized.

Total: ~140 tuples across 7 fixtures. Small enough to inspect; large enough to catch off-by-ones.

**Why no `(r, n)` with `r > n`**: that's an assertion failure in C (`assert(r <= n)`). The TS impl matches the contract; testing the assertion itself is a separate concern.

### Decision: Where to put the harness — `puzzles/auxiliary/combi-trace.c`, not extend `combi-test.c`

`puzzles/auxiliary/combi-test.c` already exists; it's the upstream's own per-module test, taking `R N` argv and printing to stdout. We do **not** modify it (subtree fidelity per `AGENTS.md`). Instead, add a sibling `combi-trace.c` that emits JSON corpus — same role `random-trace.c` plays.

**Why both**:
- `combi-test.c` is upstream's spec; we port it to TS as `combi.test.ts` to satisfy test-discipline layer 2.
- `combi-trace.c` is *our* characterization-harness pattern; it emits the corpus that drives the replay test (layer 1).

The Vitest port of `combi-test.c` and the corpus replay are different tests with different jobs. Both live in `src/native/combi/combi.test.ts` (or split if it gets unwieldy).

## Risks / Trade-offs

- **The seam may be too small to be informative.** If this change takes 30 minutes including all the openspec ceremony, the sizing data point is "scaffolding amortised, seam-specific work is trivial" — which is good but doesn't tell us much about how `dsf.c` or `tree234.c` will go. Mitigation: that's fine; this change's job is to *land*, not to be representative.
- **Generator semantics in TS differ from C.** The C iterator is destructive — calling `next_combi` on an exhausted iterator returns NULL forever after. The TS `[Symbol.iterator]` should mirror that (return `{done: true}` once exhausted) but the explicit `next()` method needs to match the C return-value contract (returns `this` while enumerating, returns `null` when done). Mitigation: corpus covers the post-exhaustion call (`next()` returning null after the last tuple).
- **`reset_combi` semantics.** Reset rewinds `a[]` and `nleft` so a fresh enumeration can run. Not covered by the C unit test or by `lightup.c`'s use, but exposed in the public header. Decision: implement it (it's three lines) and add one corpus fixture that uses it (enumerate, reset, enumerate again, assert sequences match).

## Migration Plan

Additive. `puzzles/combi.c` is untouched and remains the live implementation until `wire-combi-to-wasm` lands. Rollback is `git revert`; nothing else to undo.

## Open Questions

- Whether the bridge follow-up should adopt a single `USE_TS_LEAVES` umbrella flag instead of one flag per module (`USE_TS_RANDOM`, `USE_TS_COMBI`, …). Defer the bikeshed to the bridge change; per-module flags are easier to reason about during development, and the umbrella can be added later.
- Whether `lightup.c`'s use of `next_combi`'s return value (it discards it; only reads `combi->a`) constrains anything. Confirmed by inspection: `lightup.c:1247` reads it only in a `while (next_combi(combi))` truthy test, so the `boolean` return-type choice is safe for the eventual bridge half.
