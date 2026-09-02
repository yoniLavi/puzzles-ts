# Design — adopt-american-spelling

## D1. Why American, given that British was intentional upstream

The owner's condition was: keep British only if it was deliberate in Simon
Tatham's repository. The evidence (proposal, "Why") says it was — the whole
backend/frontend/midend API is British, and `devel.but` documents it that way.
So the condition for keeping it is met on the letter, and the honest answer is
still to change, for three reasons that outweigh provenance:

1. **The thing it was intentional in is gone.** The C was deleted; what
   survives of it here is logic, re-expressed in idiomatic TypeScript with new
   names. Upstream's spelling is a fact about upstream, the way its
   `snake_case` and handle-passing were, and those were not preserved either
   (`AGENTS.md`, "TS port style: idiomatic throughout").
2. **British cannot be made consistent; American can.** The platform
   vocabulary is fixed: CSS `color`, `prefers-color-scheme`,
   `text-align: center`, `HTMLDialogElement`, `--wa-color-*`. A British tree
   would still contain `color` on every line that touches the DOM. An American
   tree contains `colour` nowhere but in quotations of upstream symbols and in
   the archive.
3. **Nothing here ever chose British.** The engine inherited it from the C,
   the shell inherited American from puzzles-web, and no document states a
   convention. A rule nobody wrote is not a rule; it is the absence of one, and
   the mixed tree is what that absence produces.

**Considered and declined: leave it mixed.** The seam is not at a boundary a
reader could learn. `engine/testing/oklch.ts` says `colourToOKLCH` and calls
itself a copy of `utils/color.ts`; `spokes/render.ts` has `ds.colors[i] === colour`.
A convention that can only be stated as "British in these 495 files, American
in those 200" is not a convention.

**Considered and declined: British everywhere this project can reach.** It
would respell `utils/color.ts`, `color-scheme.ts` and `colorScheme` — the last
of which is a persisted preference key, so it is a compatibility break for
nothing — and still leave `color` on every CSS line. It moves the seam; it
does not remove it.

## D2. Scope: what is swept and what is a record

Three kinds of text, three treatments, following the line
`retire-native-directory` drew for paths (its D1: "sweep the live claims, leave
the history"):

- **Live text this project owns** — identifiers, paths, comments, `docs/`,
  `AGENTS.md`, root markdown, `scripts/`, `templates/`, `openspec/specs/`, and
  pending changes under `openspec/changes/`. Swept.
- **The record** — `openspec/changes/archive/` and `openspec/postmortems/`.
  Untouched. A change archived on 2026-08-01 as `consolidate-colour-palette`
  stays so named; its text described the tree as it was.
- **Someone else's words and recorded bytes** — the two MIT notices' contents
  (the files are renamed, their bytes are not; the task hashes them before and
  after), and the payload of every C-recorded fixture. The flood fixture's
  `"colours"` key is *our* recording schema, not C output, so it is renamed
  with its reader; the numbers under it are not touched.

**Quotations of upstream symbols keep their spelling.** A comment that says
"implementing `misc.c`'s `game_mkhighlight`" or "upstream's `game_colours`"
names a C function; respelling it makes the pointer false. The rule the sweep
applies: a snake_case token containing an underscore that names an upstream C
symbol is a quotation. Every TypeScript identifier is ours, including the ones
that were ported name-for-name (`ncolours`, `fillcolour`, `outlinecolour`), and
is respelled. Where a ported name and a quotation share a line, the line is
read, not regexed.

## D3. The sweep is table-driven, and the table is the spec

A `-ise → -ize` regex would rewrite `precise`, `promise`, `otherwise`,
`exercise`, `compromise`, `advertise`, `noise`, `raise`, `arise`, `comprise`,
`premise`, `devise`, `revise`, `supervise`, `expertise`, `enterprise`,
`franchise`, `merchandise`, `disguise`, `improvise` — all correct American
English. So the sweep is an **explicit table of stems**, applied
case-preservingly to identifiers and prose alike, and the guard in D6 reads
the same table. The table lives in the guard's source so there is one copy.

| British stem | American | Notes |
|---|---|---|
| colour | color | includes `Colour`, `colours`, `coloured`, `colouring`, `recolour`, `ncolours`, `bgcolour` |
| centre | center | includes `incentre` → `incenter` (`gridFindIncentre`); `centred` → `centered` |
| grey | gray | |
| neighbour | neighbor | |
| behaviour | behavior | |
| favour | favor | includes `favourite` |
| flavour, honour, humour, labour, harbour, armour, rumour, vigour, endeavour, savour | flavor … | prose only if present |
| initialise | initialize | and `initialiser` |
| serialise / deserialise | serialize | |
| normalise | normalize | |
| optimise | optimize | |
| recognise | recognize | |
| minimise / maximise | minimize / maximize | |
| organise | organize | |
| realise, summarise, memoise, randomise, stabilise, prioritise, customise, generalise, specialise, visualise, capitalise, synchronise, categorise, emphasise, utilise, finalise, sanitise, tokenise, characterise, formalise, penalise, equalise, itemise, symbolise, factorise, quantise, linearise, discretise, parametrise, authorise, standardise, localise, materialise, neutralise, rationalise, revitalise, scrutinise, apologise, criticise, harmonise, popularise, mobilise, monopolise, patronise, publicise, subsidise, theorise, vaporise, vocalise, energise | -ize | any that occur |
| analyse / paralyse | analyze / paralyze | |
| catalogue / dialogue / analogue | catalog / dialog / analog | the identifier is already `catalog`; `dialogue` prose meets the HTML `dialog` |
| licence (noun) | license | the *files* are renamed; their contents are not |
| defence / offence / pretence | defense / offense / pretense | |
| practise (verb) | practice | |
| cancelled / cancelling, modelled / modelling, labelled / labelling, travelled / travelling, signalled / signalling, totalled, levelled, marshalled, initialled, channelled, fuelled | single `l` | |
| artefact | artifact | |
| judgement | judgment | |
| acknowledgement | acknowledgment | |
| programme | program | |
| whilst / amongst | while / among | |
| sceptical | skeptical | |
| ageing | aging | |
| enrol / enrolment | enroll / enrollment | |
| fulfil / fulfilment | fulfill / fulfillment | |
| instalment | installment | |
| skilful / wilful | skillful / willful | |
| learnt / spelt / burnt / dreamt / smelt / leapt | learned / spelled / burned / dreamed / smelled / leaped | |
| manoeuvre | maneuver | |
| mould | mold | |
| orientated | oriented | |
| tyre, kerb, storey, cheque, plough, aluminium, aeroplane, encyclopaedia, anaemic, paediatric, oestrogen | tire, curb, story, check, plow, aluminum, airplane, encyclopedia, anemic, pediatric, estrogen | unlikely; listed so the table is a table and not a sample |

Not in the table, on purpose: `towards`, `maths`, `got/gotten`, `-wards`
forms, and `dialog` in the sense of the HTML element — either accepted in
American English or already American here. **The task list includes a
residue pass**: after the table runs, a scan for `our\b`, `ise[sd]?\b`,
`isation`, `yse`, `re\b` stems that the table did not name, read by a person,
and anything British among them is added to the table rather than fixed by
hand — so the guard learns it too.

## D4. Snapshots: rename the key, re-baseline, prove the diff is one substitution

`recording-drawing.ts` records every primitive with a `colour: <index>` and
`rgb:` pair; 65 `__snapshots__/*.snap` files carry 19,550 of them. After the
key becomes `color`, `vitest -u` regenerates them — and a `-u` is exactly the
step that can erase a guarantee, which is why `AGENTS.md` pairs every snapshot
with targeted assertions. The shape proof is stronger than the assertions
here: every changed snapshot line must be identical to its old line under the
one substitution, and the number of files changed must be 65.

```sh
git diff -U0 -- '**/__snapshots__/*.snap' \
  | grep '^[-+]' | grep -v '^[-+][-+]' \
  | sed 's/^-//; s/^+//' | sed 's/"colour"/"color"/; s/colour:/color:/' \
  | sort | uniq -u        # must print nothing
git diff --stat -- '**/__snapshots__/*.snap' | tail -1   # must say 65 files
```

If a snapshot changes in any other way, something in the tree rendered
differently between the baseline and the sweep, and that is a finding to
investigate — not to re-baseline over.

## D5. Player-visible prose is the owner's call, and the recommendation is American

The `AGENTS.md` acceptance rule is explicit: anything a player sees is accepted
by the owner, not decided mid-refactor. So the help pages, catalog objectives,
preset labels, config labels and validation messages are **phase 2**, listed in
`tasks.md` and gated on a decision.

The recommendation is to do it, in the same phase-2 commit, for the reason in
D1 (2): the app already speaks American to the player wherever puzzles-web or
`puzzles-unreleased` wrote the words (`help/install.md` "favorite",
`help/features.md` "behavior", all thirteen `puzzles-unreleased` game pages,
the Web Awesome UI), so today a player reads both on adjacent screens. Making
the help pages British instead is the D1 "British everywhere" option with the
same objection.

**The three config `kw`s are separate.** `Game.configure()` items carry a `kw`
that `src/engine/game.ts` documents as "the stable config key the app form
uses" and, for presets, "the stable keyword the app persists per puzzle".
Flood and Guess use `kw: "colours"`, Samegame `kw: "no-of-colours"`, and
`src/puzzle/augmentation.ts` interpolates them by name (`{colours} colours`).
Phase 2 must first establish, in code, whether any `kw` reaches IndexedDB or a
URL — `src/store/db.ts` persists `EncodedParams` (the `12x12c6m5` form), which
suggests not — and if one does, the old key is kept or migrated; the label
text changes either way. That is the one place this change could touch data a
player already has, and it is the reason phase 2 is not folded into phase 1.

## D6. The guard: a stem scan that reads the table, counts its inputs, and has been seen to fail

`src/spelling.test.ts` — at `src/` root beside `module-layering.test.ts`,
`help-coverage.test.ts` and `asset-integrity.test.ts`, because the gate's
vitest include is `src/**/*.test.ts` and `scripts/checks/` is the advisory
`npm run diff` config that the gate never runs — scans the swept areas for any
stem in the D3 table, case-insensitively, as a substring — the widest key, per
`AGENTS.md` "A scan that keys on a name finds only the games that were named
that way" — and:

- **excludes** `openspec/changes/archive/`, `openspec/postmortems/`, the two
  notice files' contents, `node_modules/`, `dist/`, and the recorded bytes of
  fixtures (`__fixtures__/*.json` payloads — the keys are checked, the values
  are not);
- **allows** an explicit list of upstream-symbol quotations (`game_colours`,
  `midend_colours`, `frontend_default_colour`, `print_*_colour`, and the like),
  each with the file it is expected in, so an allowance cannot silently cover
  a new occurrence elsewhere;
- **asserts the count of files it scanned** is above a floor (the vacuity
  guard: an unmatched glob yields `{}` and reports health);
- **is proved to fail** before it is trusted: plant `colour` in a comment in
  `src/engine/midend.ts`, run it, watch it go red, revert. That step is a task,
  not a suggestion.

The guard is what makes the convention a rule rather than a sweep that decays:
the next port written from the C will spell `colour` on its first line, and
without this the tree is mixed again by the following week.

## D7. Specs: deltas for the requirements that name a thing, a sweep for the words

Following `retire-native-directory` D1 exactly. A requirement whose normative
sentence names a renamed identifier, path or file gets a delta, because its
substance (the pointer) changes:

- `ts-engine`: "The engine provides a shared colour-mkhighlight helper"
  (**renamed**, and modified — its heading and its path), "The engine provides
  a full mkhighlight palette helper" (path), "The engine owns its type
  vocabulary…" (names `Colour` and `colours()`).
- `grid`: "Face incentre for label placement" (**renamed**, and modified —
  `gridFindIncentre`).
- `pegs`: "Pegs derives its palette via the shared mkhighlight helper" (path).
- `licensing`: "Layered top-level LICENSE.md" (the `licences/` files by name).
- `ts-migration`: "The C engine is fully retired once every game is ported"
  (`licences/` as the notices' home).
- `repo-layout`: **added** — the convention and its guard.

Everything else in `openspec/specs/` — 853 lines across 64 files, the word
"colour" in a Map or Guess or Flood scenario, "neighbour" in a solver
requirement, "behaviour" throughout — is swept mechanically, and the sweep is
proved by shape:

```sh
git diff openspec/specs | grep '^[-+]' | grep -v '^[-+][-+]' \
  | sed 's/^-//; s/^+//' | node scripts/checks/spelling-fold.mjs \
  | sort | uniq -u       # must print nothing
```

where `spelling-fold.mjs` applies the D3 table to stdin, so the check is "every
removed line equals its added line once both are folded to American". The
table has **one copy**, read by both the guard and the fold; the task list
settles where it lives so that a `src/` test and a `scripts/` node script can
both import it without crossing the layering rule. Passing
mentions of a renamed path in a list (`repo-layout`'s root-directory list
naming `licences/`, its `metrics/` sentence naming `colour-inventory.md`, the
BECAUSE narrating `palette-source.test.ts` moving into `engine/colour/`) are
path claims and are swept with the words, as the precedent swept `src/native/`.

**Ordering with the archive.** `openspec archive` applies RENAMED, then
REMOVED, then MODIFIED (against the *new* header), then ADDED. The sweep runs
during implementation, before the archive, and it respells the delta'd blocks
too — including the two headings the RENAMED deltas name; the CLI treats a
RENAMED whose source is gone and whose target exists as already synced and
moves on (`specs-apply.js`, "early-sync pattern"), and the MODIFIED then lands
on the new header.

**Scenario headings are compared verbatim.** `validate --strict` reports a
MODIFIED block that omits a scenario the *current* live spec has, and it
matches scenarios by heading, so a delta cannot respell a scenario heading
before the sweep has respelled the live one — and a RENAMED requirement is
checked against its old name's scenarios just the same. So the four scenario
headings that carry a British word (the pegs delta's "Pegs colours on a
near-white host", the grid delta's three "incentre" scenarios) are written
British today for exactly that reason, and the tasks respell them in the
deltas immediately after the sweep, when the live spec agrees. Requirement
*bodies* are free to be American now: the validator compares scenario headings,
not text.

## D8. Concurrency: the sweep lands alone, from a clean tree

Another session is editing `src/engine/colour/`, three game directories,
`src/puzzle/augmentation.ts` and `docs/games/rendering.md` — the files with
the most hits. A rename sweep is the worst possible thing to merge against
in-flight edits: every conflict is in a file that matters, and a conflict
resolved by hand is a line the shape check never saw. So the sweep is not
started until that work is committed, runs from a clean `git status`, and is
one commit. `scripts/check-rename-shape.mjs --kind any` runs before that
commit, with `--moved` fragments for each renamed path, and its out-of-scope
report must be empty.

## D9. What this does not license

- Not a naming-convention pass. `ncolours` becomes `ncolors`, not `colorCount`;
  `bgcolour` becomes `bgcolor`. A better name is a separate, semantic change;
  mixing one into a sweep is what makes the shape check unable to say the sweep
  was pure.
- Not a British→American *idiom* pass. "Whilst" is in the table because it is
  a spelling; sentence structure, "got" versus "gotten", and date formats are
  not touched.
- Not a reason to rename `COL_*` constants, the `-c6` param letters, or
  anything else that merely contains a `c`. The table is the scope.
