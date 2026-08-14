# ts-engine Specification Delta — disambiguate-hint-deixis

## MODIFIED Requirements

### Requirement: A hint step always names a technique — no un-narrated fallback

A displayed hint step SHALL always explain *why* its move is forced by a named
technique; a game's hint SHALL NOT emit a generic, unexplained "fallback" step
(e.g. "only one arrangement fits") for a deduction its technique set does not
cover. A game SHALL satisfy this by one of two strategies: **narrating every
deduction** its generator accepts (promoting any catch-all into an honest, if
non-local or tedious, technique — as Filling narrates its global
candidate-elimination), or **rejecting at generation** the boards whose solution
needs a deduction it cannot narrate (see the `ts-migration` narratable-deduction
generation policy). This is the Hint-System companion to that generation policy.

**A narration SHALL identify every element it refers to.** Where a displayed
step marks **more than one** element on the board, its narration SHALL NOT refer
to the acted-on element by a bare deictic alone ("this cell", "this square",
"here"): with two marks in view and no tie between them, such a phrase points at
neither, and the reader must infer the mark-role convention before the sentence
parses. The narration SHALL tie the acted-on element to the others by one of:

- a **relation the code guarantees** — "its ringed red *neighbour*", "the shaded
  brick *above*", "the end of the shaded run". A relation asserted in prose but
  not enforced in code is a false claim and is forbidden by the same rule that
  governs every other sentence a hint utters;
- a **value or other concrete identifier** the player can read off the board, in
  games that have one ("This 3 shares a line with the ringed white 3");
- a **role word tied to the mark's shape**, where the game's other marks already
  use distinct ones ("ringed" for an outline against "shaded" for a wash).

A narration SHALL NOT identify an element by its **colour**. Colour is never the
only cue available to a player: the palette is scheme-relative by construction,
so a hue named in prose is wrong under the other scheme, and the sentence is
unreadable to a colour-blind player. This holds even where the game's marks
differ only by hue — in that case the *marks* need fixing, not the sentence.

Where a step marks exactly one element, a bare deictic is correct and a
qualifier is noise.

This requirement governs deductive (logic) games. Movement/objective games whose
hint is heuristic or an `aux`-walk carry an intentionally empty or imperative
explanation and are exempt.

#### Scenario: A logic game's hint never shows an unexplained step

- **WHEN** a hint plan is computed for any board of a deductive game
- **THEN** every step names the technique that forces it (its explanation is not a
  generic "only one arrangement fits" placeholder)

#### Scenario: A step showing two marks says which one it is acting on

- **WHEN** a displayed hint step marks both the cell it acts on and a second
  element it reasons from
- **THEN** its narration ties the two together — by a relation the code
  guarantees, by a concrete value, or by distinct role words — rather than
  referring to the acted-on cell as "this cell" alone

#### Scenario: The tie is never a colour name

- **WHEN** a narration must distinguish the acted-on element from another mark
- **THEN** it does so without naming either element's colour, so the sentence
  stays true under both colour schemes and to a reader who cannot distinguish
  the hues

#### Scenario: A single-mark step keeps its bare deictic

- **WHEN** a displayed hint step marks only the cell it acts on
- **THEN** "this cell" is sufficient and no disambiguating phrase is required

#### Scenario: A movement game's hint is exempt

- **WHEN** a movement/objective game (no deductive "why") returns a hint
- **THEN** an empty or imperative explanation is permitted and is not a violation
