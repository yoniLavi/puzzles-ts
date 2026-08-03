# Tasks — refile-misplaced-artefacts

Independent of the other two reorg changes; can land before, between or after —
with one ordering note in 1.2 if `retire-native-directory` has not landed yet.

## 1. Delete `docs/tilings/`

- [x] 1.1 **Before deleting, confirm the link that replaces it.** All three
      carry one already, and no edit was needed: `hat.ts` and `penrose.ts` link
      `chiark.greenend.org.uk/~sgtatham/quasiblog/aperiodic-tilings/`, `hat.ts`
      telling the reader to read it *first*; `spectre.ts` links the companion
      `…/aperiodic-spectre/`.
- [x] 1.2 Skim the two HTML pages against the TS. **Expected to be empty; it was
      not.** Fetching the linked write-up and checking it point by point, it
      covers the four metatiles and their expansions, the deliberate overlap,
      the kite numbering and both lookup tables by name — but *not* `hats.html`'s
      definition of the four move directions between adjacent kites. In the code
      those are four blocks of vertex arithmetic (`kiteLeft` … `kiteForwardRight`)
      under a one-line comment reading only "the four moves between adjacent
      kites". So the deletion as written would have dropped the only statement
      anywhere of what `KiteStep.ForwardLeft` *means*. It is now a doc comment on
      {@link KiteStep} — pointy end/blunt end, the rotation each move is, and the
      5 → 4/6/2/1 check to run when unsure.
- [x] 1.2a **Adjacent find, same directory.** `hat-tables.ts` opened "GENERATED
      FILE, DO NOT EDIT BY HAND … Regenerate with: `node scripts/gen-hat-tables.mjs`"
      — a script `retire-c-engine` deleted, referenced nowhere else in the tree.
      This is the exact defect `retire-c-era-leftovers` fixed in the sibling
      `spectre-tables.ts` one commit earlier; it fixed one of the pair. Rewritten
      to the same shape (originally generated, now committed source, edit by hand
      carefully), after asking that change's own follow-up question — *what did
      the generator assert about its output?* Answer: the extraction counts, and
      `hat.test.ts` asserts every one of them directly (entry counts, kitemap
      sentinels, metamap sentinels), so nothing was lost with the script.
- [x] 1.3 `git rm -r docs/tilings`. Recoverable from git history and from
      upstream's repository if ever wanted.
- [x] 1.4 Remove the `docs/tilings/` bullet from `AGENTS.md` — **and the
      `!**/docs/tilings` exclusion from `biome.json`**, which the task list had
      not anticipated. It is the same shape as the `.gitignore` entry §4 was
      written to remove: an exclusion for a path that does not exist reads as
      evidence the path does. Now a `repo-layout` scenario.

## 2. Relocate the finished round's metrics snapshots

- [x] 2.1 Moved, each under the change whose commit created it — attributed from
      `git log --diff-filter=A` rather than from the directory names, which is
      what settled the ambiguous one: `-after` was committed by
      `adopt-shared-deduction-fixpoint` (77321f5), not by the change that named
      it as a baseline afterwards. Baseline → `establish-refactor-baseline`;
      `-config-helpers` → `adopt-declarative-config-helpers`. Each `summary.md`
      keeps its own raw output.
- [x] 2.2 A README beside each. Each **cites something checkable** rather than
      asserting irreproducibility: every path in its own `summary.md` reads
      `src/native/…`, a tree deleted the next day by `retire-native-directory`.
      Each also lists the round's three snapshots in order with relative paths,
      so splitting them across three archives does not cost the round-over-round
      diff that is their whole value.
- [x] 2.3 Repointed in `docs/porting/game-port-playbook.md` §8, and the rule
      added at the place it is actually needed — the top of `scripts/metrics.sh`,
      which is what a person reads when the harness has just written a snapshot.
- [x] 2.4 **The task's premise was wrong and the spec inherited it.** `metrics/`
      now holds *two* live instruments, not one: `mutation/report.json` (read by
      `docs/test-strength.md`, confirmed resolving) and `colour-inventory.md`,
      which `group-crowded-source-directories` put there four days earlier
      precisely to escape the expiring-change-directory trap. The
      `build-pipeline` delta is corrected to name both.

## 3. `scripts/checks/`

- [x] 3.1 `git mv scripts/colour-{inventory,collide,dark-check}.test.ts` and
      `scripts/diff.vitest.config.mts` into `scripts/checks/`.
- [x] 3.2 Config `include` globs, the `diff` script in `package.json`, the usage
      comments at the top of all four files, and — not in the task list — the two
      **generated-header literals** (`colour-inventory.test.ts`,
      `colour-collide.test.ts` write their own "Regenerate with:" line into their
      output), plus live pointers from `src/engine/colour/colours.test.ts`,
      `src/games/crossing/render.ts`, `AGENTS.md` and the playbook. Verified by
      shape: every changed line in the sweep is a path repoint or one of three
      deliberate prose edits.
- [x] 3.3 **Ran `npm run diff`, and it failed** — the third finding of the
      depth-keyed-path class that the last two changes both recorded as
      structurally invisible to a bulk rewriter. The move put the files one level
      deeper, so `../src/…` had to become `../../src/…`; a prefix sweep over
      `scripts/…` string literals cannot see it, because the string it depends on
      is the file's own position. `join("src/games", id)` and the `OUT` paths are
      cwd-relative or absolute and correctly did *not* move. Green after the fix.
      The regenerated `metrics/colour-inventory.md` differs **only** in its header
      path — all 689 colour entries byte-identical, which independently shows the
      move did not change what the check measures.
- [x] 3.4 Confirmed by construction *and* by measurement: `vitest.config.ts`'s
      include is `src/**/*.test.ts`, and `npx vitest list` collects **zero** files
      under `scripts/`. Recorded in the config's own header so the next reader
      knows the directory choice is what keeps them out of the gate.

## 4. Stryker's sandbox — **tried, measured, rejected; fixed another way**

- [x] 4.1 **Attempted and reverted.** `tempDirName: join(tmpdir(), "puzzles-ts-stryker")`
      works in the narrow sense — the sandbox lands in `/var/folders/…` — but the
      dry run then finds **no tests at all** and Stryker exits after ~13 s with
      "No tests were executed". A/B'd against an in-tree sandbox with everything
      else identical, which starts the dry run normally, so the location is the
      cause: the vitest runner resolves `vitest.related` against the mutated
      files, and from a sandbox outside the project root nothing matches.
      The warning offers `vitest.related: false` as the escape and it is a bad
      trade — with `related` off, each of 2,168 mutant runs globs and *loads*
      all 252 test files, filtering only by test-name regex afterwards, instead
      of the handful importing the mutated module. On a ~400-minute run that
      risks a multiple, not a margin. Reverted, with the whole experiment written
      into the config header so the next reader does not repeat it.
- [x] 4.2 Deleted the five stale sandboxes (192 MB). The `/.gitignore` entry
      **stays** — the sandbox is still written in-tree, so the rule is live, not
      dead. Instead `npm run mutation` now begins `rm -rf .stryker-tmp`, so an
      interrupted run leaves at most one copy until the next run rather than
      accumulating. That addresses the actual cause: `cleanTempDir: true` was
      already set and only fires when a run *finishes*, and a 400-minute run is
      interrupted more often than not.
- [x] 4.3 Ran `npm run mutation` to the start of the dry run, both ways, then
      stopped it. **Deleting the stale copies turned out not to be only about
      disk**: Stryker's project reader walks whatever is in the tree, and it
      reported "Found 7 of **15233** file(s) to be mutated" with the five copies
      present against "7 of **2563**" without them. A stale sandbox is a cost
      paid again on every subsequent run.

## 5. Specs and close-out

- [x] 5.1 `repo-layout` — MODIFIED "Developer guides live under docs/ and link to
      specs": `docs/` holds this project's guides, and a third-party reference is
      carried as a link to its maintained source rather than a copy.
- [x] 5.2 `build-pipeline` — MODIFIED "Refactoring metrics are measured on demand
      and ratcheted in the gate": a round's snapshot is committed under the
      change that produced it; `metrics/` holds only live instruments (**both**
      of them — see 2.4). It also now states why that does not contradict
      `repo-layout`'s "a tool SHALL NOT write into a change directory": the
      *harness* writes to the stable `metrics/<date>/`, and the *author* commits
      the finished snapshot under the change. Two rules, two failure modes — an
      output path that expires, and a one-off measurement left reading as current.
- [x] 5.3 **The premise was inverted.** `metrics/` was never *in* the root
      entry-point list, so there was nothing to remove — and since it stays (live
      instruments), the honest fix is to **add** it, bounded to live instruments
      only. A directory that exists is not noticed to be absent from a list; this
      one had held three snapshots for two days. `retire-native-directory` is
      archived, so the delta is written here as the sequencing note directed.
- [x] 5.4 Swept. One hit outside this change: `refine-slide-appearance`
      tasks.md §3.2 named `scripts/colour-dark-check.test.ts`; repointed to
      `scripts/checks/` (and given the `npm run diff` invocation, since it is now
      one command rather than a file you find). Nothing pending referenced
      `docs/tilings/`, a dated `metrics/` snapshot or `.stryker-tmp`.
- [x] 5.5 `openspec validate --all --strict`, and the full gate.
- [x] 5.6 Archive.
