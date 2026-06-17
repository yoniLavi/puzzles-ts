# Design — Improve port tooling

## CI must run the full gate (no cheap no-WASM tier)

The instinct is a fast `tsc + lint + test` PR job that skips the ~5-min Emscripten
build. It doesn't work here: `src/puzzle/catalog.ts` imports `catalog.json`,
`src/puzzle/types.ts` and `worker.ts` import `emcc-runtime` — all generated into
`src/assets/puzzles/` by `build:wasm`. So `tsc -b`, `vitest`, AND `vite build` all
fail without the generated assets. CI therefore mirrors the *full* local gate:
`build:wasm` (emsdk + apt halibut/jq/cmake) then `npm run gate`.

Pin emsdk to the Brewfile's emscripten (5.0.7) so CI and local agree — a large
emscripten jump can shift wasm output (the Brewfile already warns this). The job
can only be truly validated by a real PR run (Ubuntu apt package names, emsdk
version availability, halibut behaviour) — shipped as best-effort, flagged for a
first-PR shakedown. This is the honest state: a workflow file is the deliverable;
green-on-GitHub is a follow-up the owner confirms.

## The differential helper is deliberately narrow

The tidy-3 survey found two differential *shapes*: byte-for-byte desc match
(samegame/unruly/flood/guess/flip-crosses) and solver-agreement (galaxies,
unruly's 2nd assertion). Only the first is genuinely identical across games — the
second threads each game's own decode + solver + difficulty-encoding, so a shared
helper would need so many callbacks it'd be the leaky abstraction the survey warned
against. So `describeDescDifferential` models *only* the byte-match shape; the
solver-agreement tests stay inline. `flip` keeps its hand-rolled form too (its
crosses/random branch doesn't fit a pure byte-match helper). A helper that fits 4
of 6 cleanly beats one that fits all 6 awkwardly.

## Advisory diff scripts are dev-time-only — the vestigial three are deleted

The realisation that closes a loop from tidy-3: an advisory `scripts/diff-<game>.test.ts`
earns its keep ONLY by shelling the live C trace binary (a true C-vs-TS compare).
But that binary is built from `puzzles/<game>.c` + `puzzles/auxiliary/<game>-trace.c`,
both of which are **deleted at port acceptance** (per the per-game C-deletion
doctrine). So once a game ships, its advisory diff script can never run live again —
it can only skip (no binary) or be rewired to re-read the frozen fixture the gated
test already reads (no signal). The three committed scripts (flip/galaxies/unruly)
are exactly this vestige and are deleted. The *infrastructure* (one
`diff.vitest.config.mts` + `npm run diff --passWithNoTests`) stays for the next
in-flight port, whose advisory script lives only as long as its `.c` does. The
playbook now states this lifecycle so future ports delete the script with the C
instead of leaving it to rot.

## Scaffolder test stubs

The scaffolder already stamps source stubs; emitting a starter `<game>.test.ts`
(serialise round-trip + `renderScenario` smoke) and a commented
`<game>-differential.test.ts` stub means a port starts with the three-tier test
shape in place. The differential stub is commented so a fresh scaffold still
type-checks before any fixture exists.
