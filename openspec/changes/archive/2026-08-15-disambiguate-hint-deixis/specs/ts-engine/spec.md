# ts-engine Specification Delta — disambiguate-hint-deixis

> ⚠️ **This MODIFIED delta was stale, and archiving it deleted 134 lines of the
> live requirement** — the whole Check / Tactic / Search taxonomy, the
> tier-naming rules and four scenarios, added by `audit-guessing-tier-names`
> after this delta was scaffolded. `openspec archive` replaces a requirement
> with whatever the delta holds, and `validate --strict` passes a partial copy
> because it has a SHALL and a scenario. The live spec was repaired by hand at
> archive time (the three new scenarios and the narration paragraphs were merged
> into the current requirement instead), so **`openspec/specs/ts-engine/spec.md`
> is authoritative and this file is not**. Do not replay it.
>
> `src/openspec-delta-integrity.test.ts` now fails the commit on a MODIFIED
> delta that drops a scenario the live requirement has. It found two more the
> first time it ran.

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

## ADDED Requirements

### Requirement: The hint emphases stay distinguishable in both schemes

Hint-role colours SHALL stay distinguishable in **each** scheme, not only in
light. Every pair among the acted-on colour, the fill behind text it is about,
the evidence, and the two premise references SHALL stay more than 0.12 apart in
OKLCH in each scheme, and the acted-on colour SHALL carry more than twice the
chroma of either wash in each scheme.

This is what the narration rule above rests on. A narration may tie two marks
together in words only where the marks are themselves distinguishable by
something other than hue; a solid acted-on colour against a wash qualifies
because it differs in **weight**, which is the cue left to a reader who cannot
compare hues. An exemption resting on a number is worth exactly as much as the
assertion that keeps the number true.

Measuring the light column alone does NOT state this requirement. The two
schemes are authored separately by construction, so their separations differ:
the closest pair of the six is the fill-versus-evidence pair in **dark**, at
0.124, against 0.147 for the same pair in light. A guard that reads only the
light value stays green through a dark-scheme collapse.

#### Scenario: A scheme's hint colours converge

- **WHEN** a colour edit brings two hint roles within 0.12 in either scheme
- **THEN** the palette guard fails, naming the pair and the scheme

#### Scenario: The acted-on colour loses its weight

- **WHEN** the acted-on hint colour's chroma falls to twice a wash's or below,
  in either scheme
- **THEN** the palette guard fails, because the narration rule's exemption for
  solid-against-wash marks no longer holds
