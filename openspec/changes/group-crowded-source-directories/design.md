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
