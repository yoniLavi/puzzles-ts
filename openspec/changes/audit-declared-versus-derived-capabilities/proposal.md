# audit-declared-versus-derived-capabilities

**Readiness: investigation.** The question is open, the evidence is one-sided so
far but thin (four data points, all at the input/render end), and the deliverable
is a recorded decision plus doc amendments — not a code pivot. Task 0 is a
survey, and the survey has a named way to come out the other way.

Owner-requested 2026-09-06, after the same question came up while extracting the
note-taking cell: *"is there any sense perhaps in moving any such idioms into
explicit framework capabilities?"*

## The question

`docs/framework-rdd/` is written around **declaration**. Every section of
`game-definition.md` is "**You declare:** X. **You get:** Y", and
`guarantees.md`'s standing principle is *"Declaring a capability enrolls its
guards."*

Four pieces of shared machinery have since shipped, and **none of them works
that way.** Each is a module a game *calls*, with enrollment derived from what
the game already is:

| Shipped | How a game joins | How guards find it |
| --- | --- | --- |
| `pencil-prefs.ts` | calls the pref factories | the pref keyword it declares |
| `border-grid.ts` (input) | calls `interpretBorderGridInput` | its source calls it |
| `border-grid-render.ts` | calls `drawBorderTile` | its source calls it |
| `note-taking-cell.ts` | carries the `Ui` fields, calls the arm | the `Ui` `newUi` returns |

And the one attempt at the declarative model — `declare-the-gesture-table` —
was withdrawn when it failed its own falsifier
(`openspec/postmortems/2026-09-05-gesture-table-withdrawal.md`).

**So the working hypothesis this change exists to test is:** *the declaration
should be the implementation, not a description of it.* A game declares hints by
having a `hint()`; it declares the note-taking cell by carrying its fields and
calling its arm. A manifest saying `capabilities: ["hints", "noteTakingCell"]`
is a second statement of what the code already says, and second copies drift.

Note what this does **not** give up: `guarantees.md`'s whole benefit is
enrollment-free guards *the moment the capability exists*. Derived enrollment
keeps that exactly, and only changes what "exists" means — from *written in a
manifest* to *present in the code*.

## The finding that prompted it

`guarantees.md` says declarations will retire the hand-maintained enrollment
lists, and names one: *"retires the hand-lists (`testing/hint-games.ts`)"*.

**`hint-games.ts` was already retired — by `derive-hint-enrollment`, and not by a
declaration.** It filters the registry on `typeof game.hint === "function"`. The
document proposes a solution to a problem the repo has since solved the other
way, in the very file it names, and has not caught up.

That is one sentence, but it is the shape of the whole question, and it is why
this is worth an hour before the next declaration-shaped change starts.

## What must be investigated, not assumed

Three things could make declaration the right answer after all. **Each is a way
this change comes out against its own hypothesis**, and none should be waved
past:

1. **Intent that behavior cannot show.** Derivation reads what a game *does*;
   some guarantees are about what a game *means*. "This game deliberately has no
   keyboard" is the live example, and the repo already has an answer worth
   generalizing rather than inventing: `input-parity.test.ts` **derives the
   fact, declares the intent, and asserts the two agree** — `NO_KEYBOARD` is a
   reasoned list whose keys must equal the derived set. Belt and braces, and the
   declaration cannot rot because the derivation checks it. Survey how many
   guarantees are of this kind; if it is most of them, the hypothesis is wrong.
2. **The capability-manifest diff.** `migration.md` makes it the named guard
   against `re-express-the-collection`'s characteristic risk — silent capability
   loss across a 57-game sweep — and it reads as needing a manifest. It probably
   does not: a *derived* set can be snapshotted and diffed just as well, and
   cannot be forgotten. Confirm that, because the sweep depends on it.
3. **Discoverability.** A manifest is a menu; a set of helpers is not.
   `docs/games/engine-catalog.md` is the menu today, and it is prose. Ask
   honestly whether a new game's author finds `note-taking-cell.ts` without
   being told — and if not, whether the fix is a manifest or a better scaffolder.

## What it would change if the hypothesis holds

- **`game-definition.md`**: the "You declare / You get" frame is the wrong shape
  for the sections that have shipped, and it shipped as helpers three times.
  Rework the frame, marking what is now true, as the README's own rule requires.
- **`guarantees.md`**: "Declaring a capability enrolls its guards" becomes
  "*having* a capability enrolls its guards", with the `hint-games.ts` sentence
  corrected and the derive-the-fact/declare-the-intent pattern written down.
- **`ts-engine` spec**: a requirement stating how a shared mechanic is joined
  and how its guards enroll, so the next one does not re-decide it.
- **`adopt-the-game-definition-adapter`**: that change holds the criterion for
  whether a definition object is real (*did a declaration need to know about any
  other declaration?*). This change feeds it evidence rather than replacing it —
  three concerns have now stood alone, which is a partial answer to a question
  it was going to have to ask from a standing start.

## Impact

- Affected specs: `ts-engine`, `repo-layout` (the guards' shape).
- Affected code: probably none. If it ships code it is doc and spec amendments
  plus, at most, generalizing the derive-the-fact/declare-the-intent pattern.
- **Not player-visible.** No game behavior is in scope; this is about how the
  framework is joined and how its guards find their population.
- **Deliberately cheap.** If the survey says the RDD's frame is right after all,
  the output is one paragraph saying so and this change archives having changed
  nothing but a sentence — which is a good outcome, not a wasted one.
