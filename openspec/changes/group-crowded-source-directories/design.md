# Design — group-crowded-source-directories

## D1. Only two families, and the reason is that they are not arguable

A 104-file directory invites a full taxonomy — `solvers/`, `hints/`, `render/`,
`core/`. **Declined.** Most of the engine is genuinely a flat namespace of
independent helpers (`shuffle`, `obfuscate`, `retry-limit`, `step-budget`,
`n-times-root-k`), and for those a directory adds a path segment and answers no
question. The moment a grouping is arguable, it becomes a thing every future
contributor re-litigates at the point of adding a file — and files then land
wherever the last argument ended.

The two families chosen have a property the rest do not: **their members are
meaningless apart from each other**. `grid-tilings-dodec.ts` has no readership
outside grid; `palette.ts` is defined as references into `colours.ts` and is
*checked by identity* against it. `latin.ts`, by contrast, is a solver library
that eleven games import directly — grouping it under `solvers/` would say
something about it that isn't true of how it is used.

The test to apply when a third family is proposed: *would a reader looking for
this file know to look in that directory without being told?* If yes, group. If
the answer needs the grouping rationale explained, leave it flat.

## D2. The probe's derivation must survive nesting — and must fail loudly if it doesn't

This is the risk that justifies the change being separate.

`scripts/feedback-probe.mjs` derives two things by `readdirSync(ENGINE)` —
**flat, one level**: the set of barrel files that might re-export a module, and
the set of test files that import it (a module's "own tests"). Both are
`repo-layout` requirements: *own tests SHALL be derived rather than assumed*, and
the barrel rule exists because `grid.ts`'s doc comment tells callers to import
from it rather than from the parts.

Move the grid family into `engine/grid/` without touching the probe and the
derivation quietly shrinks. That is worse than it sounds, because of *which*
direction it fails in:

- The **anchor check** (`--verify`, in the commit gate) validates that each
  case's quoted source line still exists and is unique. It says nothing about
  whether the right *tests* were found. A move that keeps the source lines intact
  — which a pure move does — passes it.
- `ownTests` returning a smaller set means fewer tests run against each planted
  defect, so cases report **SURVIVED** and the rate drops. Visible, but it reads
  as "the tests got worse", which is a plausible-looking wrong conclusion and
  precisely the class of error `check-the-instrument` exists for.

**Decision:** make the walk recursive, and add an assertion that the *count* of
discovered engine test files is not less than a committed floor. A floor rather
than an exact number so that adding a test file is not a chore; a floor at all
because "the instrument found fewer things and reported a worse score" is
indistinguishable from a real regression without one.

The corpus anchors themselves are quoted source *lines*, so a pure move leaves
them valid. `npm run probe -- --verify` passing after the repoint is therefore
evidence the move was pure — the same role it plays in
`retire-native-directory` D7.

## D3. Filenames lose the `puzzle-` prefix; element tags do not

`src/puzzle/components/puzzle-view.ts` would stutter. The nine files become
`view.ts`, `view-interactive.ts`, `keys.ts`, `history.ts`, `type-menu.ts`,
`config.ts`, `context.ts`, `other-puzzles-menu.ts`, `end-notification.ts`.

The **custom element names stay exactly as they are** — `<puzzle-view>`,
`<puzzle-keys>`, `<puzzle-history>`. They are the app's DOM vocabulary: they
appear in `templates/*.html.hbs`, in every component's `html` template, and in
the Playwright checks; a custom element name must contain a hyphen and is
effectively a public identifier. Renaming a file is a refactor; renaming a custom
element is a change to the app's markup contract for no benefit.

This does mean file `view.ts` defines element `puzzle-view`, which is a small
indirection. It is the same one `src/dialogs/about-dialog.ts` → `<about-dialog>`
already has in reverse, and the directory name supplies the missing word.

## D4. `grid.ts` becomes `grid/index.ts`, not `grid/grid.ts`

The barrel keeps working as `import … from "…/engine/grid.ts"` → `"…/engine/grid/index.ts"`,
and every importer's specifier changes by one segment either way, so the choice
is about what reads right afterwards.

`index.ts` is the established convention for exactly this in the tree already
(`engine/index.ts`, `games/index.ts`, `random/index.ts`), and `grid/grid.ts`
would be the only doubled name. The cost is the familiar one — a tab bar full of
`index.ts` — which this repo already accepts three times over.

## D5. What "no behaviour changes" is checked against

As in `retire-native-directory` D8, there is no golden output for a move, so the
check is that the existing evidence is bit-identical:

- Every `__snapshots__/*.snap` unchanged, and the 48 per-game differentials green.
- `scripts/colour-*.test.ts` (`npm run diff`) unchanged in output — the colour
  inventory walks `src/games/<id>/` and imports the palette modules by path, so
  it is the check most likely to notice a colour-family move that lost a file.
- `npm run probe -- --verify` green, **and** a full `npm run probe` rate equal to
  the pre-move rate. The rate is the only thing that would notice D2's silent
  failure, so this run is not optional for this change even though a full probe
  is ~15 minutes.

---

## Findings from implementation

Recorded here rather than folded into D1–D5, so the design reads as it was
decided and the surprises read as surprises.

### F1. The probe's recursion is a correctness fix, not only a move-proofing one

D2 framed the recursive walk as *surviving* the move. It does more than that:
`random/`, `combi/`, `tilings/` and `testing/` were **already** nested, so the
flat walk had been excluding their test files all along. Measured before and
after, recursion adds exactly two edges, and both are right —
`tilings/spectre.test.ts` is a local test of `grid` and `grid-core`, and
`testing/render-scenario.test.ts` one of `border-grid`. The rate could not fall
as a result (adding tests only adds catches), and it did not: **90/90 both
sides**, all fourteen modules at 100%.

The floor is 50 against 55 found, and it is checked in `--verify` rather than
only in the full run — so it is in the commit gate, which is where a refactor
that nests a module will actually be standing. Proved to fire before being
trusted: forcing the walk flat gives `discovered only 46 engine test files,
floor is 50`, exit 1.

### F2. Matching import *position* is necessary and not sufficient

`retire-native-directory`'s lesson was that a rewriter must match specifiers in
import position, not "any quoted dotted string". Correct, and not enough — a
file names its siblings in three ways that are not import statements, and they
fail in three different directions:

| construct | failure | what caught it |
| --- | --- | --- |
| `import.meta.glob("../games/**/*.ts")` | **silent** — an unmatched glob is `{}`, so assertions pass over nothing | the file's own `expect(sources.length).toBeGreaterThan(100)` |
| `new URL("../assets/…", import.meta.url)` | loud | `asset-integrity.test.ts` |
| depth-keyed arithmetic — `path.replace("../games/", "")` | silent, and *plausible* — leaves `../abcd/render.ts`, so the game id becomes `".."` | 28 downstream assertion failures, only after the glob was fixed |

The third is the one to remember, because no string sweep can see it: the string
it depends on is a *prefix length*, not a path. The fix is not to update the
prefix but to remove the assumption — cut the key at `/games/` and **throw** when
the match fails, which is right at any depth.

### F3. Resolve-and-re-derive needs a "did this actually move?" guard

The rewriter here maps each specifier to a repo path, through the move table, and
back to a relative path. That is exact where prefix arithmetic is guesswork: it
expresses `grid.ts` → `grid/index.ts`, and it correctly leaves `tilings/`'s
`"../grid-core.ts"` untouched because importer and target moved together.

But it also *normalises* specifiers that nothing invalidated — and normalising is
a rewrite the prefix approach would never have attempted. It did so twice:

- **Re-deriving a path** turned `import "../test-setup/icons.ts";` into
  `"./icons.ts"` inside that file's own doc comment, where the line is
  deliberately written from a **consumer's** perspective. Verify-by-shape caught
  this one, because a doc-comment line is not an import line.
- **Adding an extension.** The resolver tries `spec`, `spec.ts`, `spec/index.ts`,
  so the seven files this repo had left extensionless (`"./store/settings"`,
  `"./command-link"`, `"./icons"`, `"./types"`) came back with `.ts` appended.
  Shape-checking cannot see this: they *are* import lines. What found them was
  asking a different question of the finished diff — **which modified files do
  not mention a moved path at all?** Seven, and all seven were reverted.

One line fixes both (touch a specifier only when the target moved or the importer
did). The second check is the reusable half: verify-by-shape proves *what kind of
line* changed, and only a scope check proves *which files had any business
changing*.

### F4. Taking the baseline is what found the broken instrument

D5 nominates `npm run diff` as the check most likely to notice a lost colour
module. Running it *before* moving anything showed it had been failing `ENOENT`
since **2026-08-01**: `colour-inventory.test.ts` wrote into
`openspec/changes/consolidate-colour-palette/`, and `openspec archive` renames
that directory. An advisory run reports rather than gates, so nothing said so.

Output now lands in `metrics/colour-inventory.md`. The regenerated file is
byte-identical to the archived copy, which is simultaneously the pre-move
baseline and evidence the colour tree had not drifted in between.

Generalised into `repo-layout`: **a tool must not write into a change directory**
— `openspec archive` gives that path an expiry date built into the workflow.

### F5. Small corrections to the scaffold's counts and lists

- There is no `colour-token.test.ts`; the colour family has **four** test files,
  not five.
- `stryker.config.mjs` holds **one** grid path and `feedback-probe-cases.mjs`
  two, not the 7 and 14 the proposal estimated.
- `tilings/` needed no repointing at all — it moved *with* the family.
- `contexts.ts` stays at `src/puzzle/` root: four files outside `components/`
  consume the context token, so it is runtime vocabulary, not a component.
- `border-grid.ts` stays flat. It is a different mechanic (the tri-state edges
  Palisade and Separate share), and grouping it under `grid/` would say something
  about it that is not true of how it is used — D1's own test, applied.
