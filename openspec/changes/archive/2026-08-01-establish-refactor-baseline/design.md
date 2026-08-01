# establish-refactor-baseline — design

## Context

This change came out of reviewing a generic "C→TypeScript port cleanup"
plan against this repo on 2026-08-01. The plan was competent and its advice
was mostly inapplicable here, for one reason worth stating plainly:

> **A port that was idiomatic per game as it landed does not have a
> transliteration cleanup phase waiting for it at the end.**

The generic plan assumes the opposite — that mechanical correctness came first
and idiom comes later, in one sweep. That is a reasonable default for a port,
and it is not what happened here (`AGENTS.md`, "TS port style: idiomatic
throughout"; every port owner-accepted individually). The measurements below are
what distinguishes the two situations, and they are recorded so that the next
proposal of the same plan can be answered with numbers in ten minutes rather
than re-derived.

## D1: Measure first, and keep the measurements

**Decision:** commit the raw tool output to `metrics/`, one directory per round,
rather than only reporting numbers in a proposal.

**Why:** the reviewed plan's best single piece of advice is "re-baseline between
phases, not just at the end — each phase changes what the next phase's tools
report." That is correct and cheap. Deleting dead code changes duplication %;
extracting a shared module changes the complexity distribution. Without the
intermediate snapshots you cannot attribute an improvement to an intervention.

## D2: Ratchet thresholds, never aspirations

**Decision:** every threshold this change introduces is set to the value the
tree currently achieves (or marginally worse), and lowered only by a change that
does the work to earn it.

**Why:** an aspirational threshold is a broken gate, and a broken gate gets
disabled. This is the same discipline `add-loopy-ts-port` applied to
byte-parity: the check exists to stop regression, not to encode a wish.

## D3: Biome for complexity, not a second lint toolchain

**Decision:** obtain cognitive complexity from
`complexity/noExcessiveCognitiveComplexity`, already shipped in the installed
Biome, rather than adding ESLint + `typescript-eslint` + `eslint-plugin-sonarjs`.

**Why:** they implement the same published Sonar algorithm. The
`build-pipeline` spec's gate requirement is explicitly wall-clock-conscious and
forbids buying speed by weakening checks — the converse also applies: don't
spend gate wall-clock on a second toolchain computing a number the first one
already computes. Type-*aware* ESLint rules are a genuinely different capability
and are handled separately, as a one-shot audit, in `tighten-type-checking`.

**Threshold caveat to verify during implementation:** the measured run reported
"complexity of 255" for six unrelated files (`loopy/solver.ts`,
`pearl/solver.ts`, `rect/solver.ts`, `slant/solver.ts`, `solo/solver.ts`,
`tents/solver.ts`). Six independent functions landing on exactly 255 is almost
certainly an unsigned-8-bit saturation in Biome's counter, not a real tie. The
ratchet threshold must therefore be set from the *distribution* (p95 ≈ 108), and
the saturating cases treated as "≥255, unknown" — do not record 255 as a
measured maximum in the baseline without confirming it against Biome's source.
An instrument that silently saturates will report success when the worst
function gets worse.

## D4: Rejected recommendations, with the measurement that rejected them

Recorded so they are not re-proposed blind. Each was run against the tree.

| Recommendation | Measurement | Verdict |
|---|---|---|
| `noUncheckedIndexedAccess` | **9,028 errors**, concentrated in solvers (`dominosa` 195, `loopy` 194, `grid-geometry` 150, `rect` 133) | **Reject.** See D5. |
| `type-coverage` + a coverage ratchet | `any` occurs 22× in non-test source, nearly all the English word; one deliberate `AnyGame` test helper | **Reject** — measures a problem that does not exist |
| Knip as a deletion *phase* ("10–25% of files typically unreferenced") | 1 unused file, 1 unused devDep, 5 unused vite-plugin exports ≈ 30 lines | **Reject as a phase**, adopt as a one-off deletion (in this change) |
| `eslint-plugin-sonarjs` for complexity | Biome ships the same algorithm | **Reject** — see D3 |
| `dependency-cruiser` for layering rules | madge already reports the 20 cycles; a layering rule is worth having but belongs with the change that breaks them | **Defer** to `break-module-cycles`, which decides it on the evidence |
| `ts-morph` per-function CSV artefact | The two questions it was to answer (which functions are worst, which files cluster) are answered directly by Biome's JSON diagnostics | **Reject** — build it only if a later round needs fan-in, which nothing yet does |
| Codemods (`ast-grep`/`jscodeshift`) across a category | The measured categories are 466 lines in two games and ~29 solver call sites — both far below codemod break-even, and both need per-site judgement | **Reject at this scale** |

## D5: Why `noUncheckedIndexedAccess` is refused specifically

The reviewed plan flags this as *critical*, reasoning that "C ports are index
arithmetic". The premise is right; the conclusion inverts.

Confirmed by probe: TypeScript applies the flag to `Int32Array` and friends, not
just to plain arrays and records. This repo allocates typed arrays at **908**
sites — they are the deliberate house pattern for game state and render cache
keys (`AGENTS.md`: "the next port's `render.ts` should use the packed-bits-in
-`Int32Array` pattern").

So in a solver whose indices are derived from the `w`/`h` loop bounds
immediately above them, the flag reports an impossibility, and the only
available fix is `!` (or a redundant local) on every access. Thousands of
assertions that add no runtime safety, obscure the arithmetic they decorate, and
would themselves need suppressing from `no-unnecessary-type-assertion`.

**The general shape, worth remembering: a soundness flag pays where the index
provenance is unknown, and costs where it is structurally obvious.** This
codebase is overwhelmingly the latter. The three flags that *do* pay are adopted
in `tighten-type-checking`, where the same measurement found only 187 errors
between them.

Should a future change want the guarantee where it is genuinely earned — parsing
a game ID, decoding a save, reading a user-supplied desc — the right instrument
is a checked accessor at that boundary, not a tree-wide compiler flag.

## D6: What is deliberately not measured

**LOC is reported, never targeted.** The reviewed plan says this and it is
right; it is restated here because this repo has a standing directive that
"noticeably cleaner" justifies a refactor, which is a judgement, not a line
count. A change that halves a file into dense conditional types has made things
worse and the LOC delta will applaud it.

**Test-suite size is not a target either, and the plan's advice to prune it is
rejected outright.** It proposes triaging out "structural tests... consider
deleting the ones whose behaviour is already covered at the API level". In this
repo the 48 per-game differentials import **frozen JSON fixtures** and are named
in `AGENTS.md` as the net for precisely this refactoring round: *"a refactor that
changes a solver's verdict changes which boards exist — which is exactly what
they catch."* The C build is gone, so a deleted or re-recorded fixture cannot be
restored. The 44 snapshot directories are the equivalent net for rendering. That
advice is written for a suite that still has an oracle behind it; this one is the
oracle. Test duplication was measured anyway for completeness and is
unremarkable.
