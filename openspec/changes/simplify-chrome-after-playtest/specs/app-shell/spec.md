# app-shell Specification Delta — simplify-chrome-after-playtest

## ADDED Requirements

### Requirement: The chrome offers the hint and never urges it

No control in the chrome SHALL be styled to recommend taking a hint. The hint
SHALL be as reachable as any other command — same surface, same label, the same
two beats of show-then-apply — and SHALL NOT be given an emphasis that sets it
above the commands beside it.

Explained hints are why this fork exists, and that is a fact about the fork
rather than an instruction to a player. Rendered as the one filled control on
the screen, it read as the second: a player opening a puzzle was met with the
loudest thing on the board telling them to ask for help. Whether to take a hint
is the player's call, and wanting to solve a puzzle unaided is the instinct the
chrome should leave room for.

The hint's own amber is unaffected, and the distinction is the point: the
explanation panel is the hint **speaking**, which it may do as loudly as it
likes once asked. The button is the chrome **offering**, which it does plainly.

#### Scenario: A player opens a puzzle they have not asked for help with

- **WHEN** the puzzle screen renders its command surface
- **THEN** no control is emphasized for being the hint

### Requirement: A preference exists only while something reads it

A setting SHALL NOT be offered to a player unless the state it controls changes
something the player can observe. Where the condition a setting reveals or hides
can no longer occur, the setting and every surface built on it SHALL be removed
together rather than left as an inert control.

This is not tidiness. "Show experimental puzzles" revealed games carrying the
catalog's `unfinished` flag — a flag **no puzzle has ever set**, as the field's
own doc comment recorded. Four surfaces were maintained over that empty set: the
preference, the home screen's `visibleIds` filter, the catalog card's
"Experimental" badge, and a once-a-day warning dialog with its own throttle and
its own persisted timestamp. A fifth, in the share dialog, had decayed further:
its exclusion could not fire, which made an escape hatch for Group unreachable
and the branch around it an unconditional return.

A control that cannot change what a player sees still costs them the attention
to read it and decide, which is the part that is not free.

#### Scenario: The condition a setting gates can no longer arise

- **WHEN** nothing in the shipped product can put a player in the state a
  preference exists to control
- **THEN** the preference is removed, together with the filters, badges and
  dialogs that read it

### Requirement: The home screen's navigation has no layer it does not need

The home screen's header SHALL present its destinations directly rather than
behind a menu, unless the number of destinations makes a menu the shorter path.
A page's own title SHALL NOT be a menu trigger.

The header carried an "Options" dropdown holding three items, one of which — a
"Show intro message" checkbox — controlled a single line of text, and at the
compact width the dropdown's trigger was the app's own name. Removing the
checkbox left two destinations behind a menu, which is a tap spent on nothing.

About needs no menu row: the footer already links to it in prose and names what
is inside it, which tells a player more than the word "About" does.

#### Scenario: A menu is left holding what a player could reach directly

- **WHEN** a navigation menu's contents shrink to what fits beside it
- **THEN** the menu is removed and its destinations are presented directly
