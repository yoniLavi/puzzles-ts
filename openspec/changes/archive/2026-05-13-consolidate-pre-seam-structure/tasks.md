# Tasks

## 1. `src/native/` → per-module shape

- [x] 1.1 `git mv src/native/random.ts src/native/random/index.ts`.
- [x] 1.2 `git mv src/native/random-bridge.ts src/native/random/bridge.ts`.
- [x] 1.3 `git mv src/native/sha1.ts src/native/random/sha1.ts`.
- [x] 1.4 Updated imports inside moved files: `bridge.ts` —
  `from "./random.ts"` → `from "./index.ts"`; `random.test.ts` —
  `from "../random.ts"` → `from "./index.ts"` (the test sits inside
  `src/native/random/`, so the import is a sibling, not a parent —
  spotted while updating). `index.ts`'s `from "./sha1.ts"` is unchanged
  (still a sibling after the move).
- [x] 1.5 Updated the external import: `src/puzzle/worker.ts` —
  `../native/random-bridge.ts` → `../native/random/bridge.ts`.
- [x] 1.6 Sanity grep clean: the only remaining `native/random.ts`-style
  references were comments in `scripts/build-emcc.sh:30` and
  `puzzles/auxiliary/random-trace.c:7`, both updated to point at the
  new `src/native/random/index.ts` path. Archive entries left as-is.

## 2. Build-native script

- [x] 2.1 Wrote `scripts/build-native.sh` modelled on
  `scripts/build-icons.sh`: resolves `REPO_ROOT`, configures cmake with
  `-B build/native -S puzzles -DCMAKE_SYSTEM_NAME=Linux
  -DCMAKE_CROSSCOMPILING=FALSE`, then `make -j$JOBS "${TARGETS[@]}"`
  where `TARGETS` defaults to `random-trace`.
- [x] 2.2 `chmod +x scripts/build-native.sh`.
- [x] 2.3 Ran from clean state: `rm -rf build/native &&
  scripts/build-native.sh`. Exit 0. Binary lands at
  `build/native/auxiliary/random-trace` (37328 bytes).
- [x] 2.4 Regenerated the corpus and diffed: raw harness output differs
  from the committed file only in whitespace (the committed file has
  been run through `biome format`; the harness emits minimal JSON).
  Semantic equality confirmed via `jq -S` on both — every recorded
  value matches. The build-pipeline spec scenario was reworded to
  reflect "semantically identical" rather than "byte-identical".

## 3. Agent docs consolidation

- [x] 3.1 Wrote new `AGENTS.md` integrating PLAN.md's strategic content
  with CLAUDE.md's working-conventions content. Sections in order:
  Project at a glance, Goal, Lineage, Approach (incl. alternatives
  rejected), Test discipline, Seam order, Build commands, Code
  conventions, Constraints (DO/DO NOT), Repo layout (folding in
  PLAN.md's reference directories + build-output partition), Special
  files, Work management, What's been done, Known unresolved questions,
  License & attribution, Documentation, Git. The managed OPENSPEC
  block at the top points at `@/openspec/OPENSPEC_AGENTS.md` and notes
  the `openspec update` re-rename caveat.
- [x] 3.2 `git rm CLAUDE.md && ln -s AGENTS.md CLAUDE.md && git add
  CLAUDE.md`. `git status` shows `T` (type change) on `CLAUDE.md`;
  `readlink CLAUDE.md` returns `AGENTS.md`.
- [x] 3.3 `git mv openspec/AGENTS.md openspec/OPENSPEC_AGENTS.md`.
- [x] 3.4 Updated the three slash-command stubs
  (`.claude/commands/openspec/{apply,archive,proposal}.md`) — replaced
  `openspec/AGENTS.md` with `openspec/OPENSPEC_AGENTS.md` and clarified
  in the same line that the rename avoids collision with the
  project-root `AGENTS.md`.
- [x] 3.5 Updated `openspec/project.md`: four `PLAN.md` references
  (lines 7, 43, 80, 87) now point at `AGENTS.md` or describe the
  content inline.
- [x] 3.6 `git rm PLAN.md`.
- [x] 3.7 `git grep -n "PLAN\.md"` returns hits only under
  `openspec/changes/archive/` (historical, untouched), in
  `openspec/specs/repo-layout/spec.md` (current landed spec —
  refreshed at archive time by the MODIFIED delta in this change), and
  one intentional self-reference in `AGENTS.md` "What's been done"
  describing this change.

## 4. Spec sync

- [x] 4.1 `openspec validate consolidate-pre-seam-structure --strict`
  passes after every iteration of the deltas.

## 5. Verification

- [x] 5.1 `npm run check` — biome clean (one auto-fix on
  `random.test.ts` import order; kept).
- [x] 5.2 `npx tsc -b --noEmit` — exit 0; every import resolves.
- [x] 5.3 `npm run test:run` — 6/6 corpus fixtures pass.
- [x] 5.4 `scripts/build-native.sh` — exit 0; binary at
  `build/native/auxiliary/random-trace`; corpus round-trip
  semantically identical (see §2.4).
- [ ] 5.5 `npm run dev` — skipped. The only TS path change is the
  import in `src/puzzle/worker.ts`; tsc validates the path resolves and
  the renamed file exists at the resolved location, so there's no
  vite-side runtime risk this dev-server check would cover that
  vitest+tsc don't. Re-add if/when this change is bundled with a UI
  diff.
- [ ] 5.6 `git log --follow src/native/random/index.ts` — pending the
  commit; `--follow` operates against commit history, not the staged
  index, so this verifies after the first commit lands the rename.

## 6. Archive

- [ ] 6.1 After landing, `openspec archive consolidate-pre-seam-structure
  --yes` promotes the spec deltas into `openspec/specs/`.
- [ ] 6.2 Re-run `openspec validate --strict` to confirm the archived
  state still validates.
