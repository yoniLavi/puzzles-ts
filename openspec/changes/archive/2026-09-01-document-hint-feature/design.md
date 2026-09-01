# document-hint-feature — design

Only what is not obvious from the proposal. The writing itself is ordinary work;
these are the calls that need making before it starts.

## D1: What makes this checkable — a control the app ships with no help section

The gap survived because **nothing could notice it**. `help-coverage.test.ts`
already holds the *per-game* pages and the catalog to each other in both
directions, and the reason that invariant exists is that its absence hid
`separate` having no help page at all. The site-level pages have no equivalent,
and the same class of miss followed.

The honest checkable form is **not** "features.md mentions the word hint" — a
grep for a spelling is a check aimed at a neighbour of the thing it claims to
check, which this repo has now hit six times (`grid.test.ts`'s
`d.edges.length === d.order`, `touch-input.test.ts`'s catalog-vs-registry count,
the silently-empty `import.meta.glob`, and both halves of
`retire-the-upstream-help-tree`'s dead-link grep).

Three candidates were weighed. **Anchors alone** ("the page has a `{#hints}`
section") are cheap and catch deletion, but they can only ever compare the help
against a list that lives in the help's own test — the *omission* case, a fifth
feature shipping undocumented, is exactly what they cannot see. **The command
map** in `puzzle-screen.ts` is closest to the player's truth and the most
brittle to parse. **The game hooks** sit between, and are already enumerable.

**Decision: the hooks, made fail-closed, plus two smaller derivations.**

**(a) Every optional `Game` member is classified.** `contract-surface.test.ts`
already reads them off the TypeScript AST of `game.ts` — 28 of them — for a
different audit. The same extraction drives a classification table with three
buckets: `features.md § <anchor>` (a fork feature, whose anchor must exist in
the page), `upstream-common` (a feature the page's opening link already covers —
Solve, copy-as-text, per-game preferences, the Custom type dialog), and
`internal` (no player-visible surface of its own — `refreshHintStep`,
`serialiseMove`, `animLength`). A member absent from the table fails the test,
so a **new capability cannot land unclassified**. That is the property anchors
alone cannot give, and it costs one hand-maintained table that fails *closed*.

The bucket boundary is not "did upstream have it" but **can a player discover it
without us telling them**: upstream's fill-all-pencil-marks is the `M` key, and
a touch player has no `M` key, so the toolbar button we added is ours to
document.

**(b) The populations the prose asserts are derived.** §Right mouse names seven
games whose gestures are switched off. That list *is* `ignoresSecondaryButton`,
so it is checked against the flag rather than trusted — the same move that turns
a rot risk into a fact, and the only reason the enumeration is allowed to stand
at all (see D3). Likewise, a game whose `difficulty.tiers` names `Unreasonable`
requires the `{#difficulty}` anchor, so the thirteenth game to ship one cannot
outrun the section that explains the word.

**(c) Every `::icon::` the help names resolves.** `::hint::` renders
`<span class="icon icon-hint">` and the glyph comes from a `--icon` rule in
`help.css`, which today defines exactly the nineteen classes in use. A twentieth
renders **blank, silently** — the plugin carries the TODO admitting it
(`// TODO: search for iconClass in help.css; error if not found`). The new prose
names five new glyphs, so this change would be the first to trip it. Closing the
TODO here is not scope creep; it is the guard for the thing being written.

Whatever is built, **prove the guard fails** before trusting it, by breaking
each derivation locally. A guard never shown to fail is not known to work; that
is the finding `add-game-difficulty-contract` recorded when its first sampling
guard silently did nothing. And each carries a **vacuity guard** ("the glob found
the pages", "the member list is not empty"), which `help-coverage.test.ts`
already models three times.

## D2: The "checkpoint" collision — decide, do not paper over

Three names ship for the one-slot quick-save: the toolbar button reads
**Check and save** where the game can find mistakes and **Quick-save** where it
cannot (an adaptive label, deliberate — `add-quick-save-check-save`), its
success toast reads **"Checkpoint saved"**, and the secondary action is
**Quick-load**. Meanwhile `features.md` §Checkpoints documents an entirely
different feature: the *multi*-checkpoint history panel, with its own
save/rewind/delete affordances.

Two ways out, and this is a genuine trade-off:

- **Rename the toast** to "Quick-save saved" / "Saved" and leave §Checkpoints
  owning the word. Cheapest, and it makes the three shipped names two. Costs: a
  user-visible string change, and "Checkpoint saved" is the friendlier sentence.
- **Keep the word and disambiguate in the help**, e.g. §Checkpoints gains a line
  distinguishing the history panel's checkpoints from the one-slot quick
  checkpoint. Costs: the help now has to carry a distinction the UI does not
  make, which is the weaker place to fix it.

**Settled by the owner, 2026-08-12: rename.** "Checkpoint" then means one thing
everywhere — the multi-checkpoint history panel — and the one-slot feature keeps
the two names it already has on its button and menu entry (**Check and save** /
**Quick-save**), which is one fewer than it ships today.

**The rename is four strings, not one.** `quick-save-actions.ts` says
"checkpoint" in the success toast's label, in the mistake alert's body ("Fix
them before saving a checkpoint"), and in the quick-load toast's message ("Back
to your saved checkpoint"). Renaming the label alone leaves the collision
standing in the two places a player meets it *while being told off*, which is
where wording matters most. `puzzle-screen.test.ts` asserts the success path, so
the rename has a test to follow it.

**One line beyond the decision, flagged for acceptance.** The success toast on a
mistake-checking game currently confirms only the save, never the check — so a
player who pressed *Check and save* is not told the check passed, which is the
information they asked for. It becomes adaptive on the same predicate the button
already uses (`canFindMistakes`): "No mistakes — quick-saved" against a plain
"Quick-saved". That is a small product improvement riding along with a
terminology fix, so it is called out rather than buried.

## D3: Say what governs a missing button, without listing games

Thirty games have a hint; forty declare `findMistakes`; ten fill in pencil
marks; 57 ship. So these controls are often absent, and a features page that
describes a button the player cannot find is worse than one that never mentioned
it.

**Do not enumerate the games.** A list of thirty game names in a help page is
stale the day a hint lands, and this repo has already deleted one help page for
carrying implementation state (`audit-author-known-issues`, and the `repo-layout`
rule it wrote). State the *rule* instead — a hint exists where the puzzle is
solvable by deduction and the game can explain its reasoning; mistake checking
exists where a wrong entry can be proved wrong — and let the control's presence
be the answer for any given game.

**The exception, and why it is one.** §Right mouse already names seven games,
and it predates this change. The rule it would otherwise break is not "never
name a game" but "never hand-maintain a population that will move": that list is
`ignoresSecondaryButton`, a flag `input-parity.test.ts` already holds to a
biconditional, so D1(b) checks the prose against it. A named population that a
test derives cannot rot; one that a human maintains will. Where the derivation
is available, the enumeration may stand — and where it is not, the rule holds.

This also keeps the page on the right side of the existing requirement: it
introduces the *feature*, not the state of its rollout.

## D4: The legend is a legend of shape, and the vocabulary moved

The proposal as first written said "blue is the hint acting, the wash is the
evidence". That was true in August and is now half the story, because
`mark-hints-beside-the-content` and `walk-tactic-hint-chains` landed in between:

- The **shape** is the cross-game invariant and the colour rides on it. The
  acted-on thing is **ringed, beside the content, never filled over it** — no
  exceptions, in any game (owner, 2026-08-22), because a fill scores 1.91:1
  against a pencil mark and a joint search over both hint roles, every hue and
  both schemes returns nothing feasible.
- The **evidence** is a teal outline, or a quiet wash in the three games whose
  evidence cells carry nothing to read (Unruly, Pattern, Light Up).
- A chain's links carry **small ordinals** — seven games draw them — saying the
  order the links fall in, and deliberately **not** arrows: "each forces the
  next" measured 34% false for Clusters.
- Green and purple are the filled/empty **reference premises** (Range, Light Up).

The player-facing prose therefore teaches *ring versus outline versus number*
first, and names colours only as a secondary cue — which is also what the
`ts-engine` legend convention demands of the games themselves ("colour SHALL NOT
be the sole carrier").

**And "guessing" is retired vocabulary.** The live classification is Check /
Tactic / Search / Strategy (`audit-guessing-tier-names` D9), and the tier rule
is that a tier whose boards can require **Search** is named `Unreasonable` and
no other tier name may be. The help must not reintroduce a word the specs
dropped; it can say "try something and be ready to take it back", which is what
Search means to a player, and it can now also explain the *numbered chain* a
Tactic draws — which did not exist when this change was written.

## D5: Scope — what this change is not

Not a rewrite of `features.md`: the seven existing sections stay as they are,
apart from the §Checkpoints cross-link and the §Right mouse list becoming
derived rather than trusted. Not per-game help edits (a game whose hint
introduces vocabulary fixes its own page in its own change — that rule already
exists and `add-sticks-hint` followed it). Not a change to any hint, overlay or
save behaviour, beyond the D2 strings.

**Not a sweep of the refusal wording, either** — and that is a real finding to
hand on rather than absorb. Games phrase "I can't deduce further" nine different
ways ("No further move can be deduced from this position.", "I can't find a
deduction from here.", "No helpful hint found", …). The help can describe the
behaviour without quoting a string, so this change does not need the sweep; but
the sweep is worth doing, and `unify-cross-game-vocabulary` is the shape it
would take.
