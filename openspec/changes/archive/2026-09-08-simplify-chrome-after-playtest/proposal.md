# simplify-chrome-after-playtest

## Why

The first real playtest — the owner, on a phone, against the deployed app —
produced four findings. Three are simplifications the deployment made visible,
and one is a value judgment about what the chrome should *urge*.

They are bundled because they share one cause: **the chrome was designed before
anything shipped, and shipping settled questions that were open when it was
drawn.** The intro was long when a toggle for hiding it made sense; a game could
be half-finished when a filter for hiding those made sense; the color scheme was
new when "(experimental)" was honest. None of those is true now.

This change amends the recorded design direction (`app-shell`, "The chrome
follows a recorded design direction of this project's own") rather than
implementing it, which that requirement's scenario explicitly allows. Each
amendment is the owner's, made on sight, from play.

## What Changes

**1. The hint button stops being the one filled control.** Owner: *"we shouldn't
ever directly recommend that the player take a hint — it's their choice, and in
general, they should strive to solve the games on their own."*

The accent was deliberate and is recorded as such — the rail's comment says "The
hint is the one accent in the chrome", and the phone bar's says "it is what this
fork is for". That reasoning was about the *fork's* identity, and it leaked into
the *player's* screen as an instruction. Explained hints remain the reason this
fork exists; a filled button telling a player to use one is a different claim,
and not one we want to make. The hint stays exactly as reachable — same place,
same label, same two beats — and stops being urged.

**2. "Show intro message" goes, and the Options menu with it.** The intro is one
line now, so a control for hiding it costs more than it saves. That leaves
Options holding Preferences and About, and **the footer already links to the
about box in prose** — "Credits, privacy info, copyright notices and licenses are
in the *about box*" — so About has a home without a menu.

So the dropdown is removed rather than kept at two items: Preferences becomes a
button beside Help, and the compact header's title stops being a menu trigger
and goes back to being a title. Both destinations become one tap instead of two,
and one layer of navigation disappears.

**3. Color scheme moves from Advanced to Appearance, and loses
"(experimental)".** It is a straightforward appearance preference sitting in the
wrong drawer behind a word that no longer describes it.

**4. "Show experimental puzzles" is retired, with the whole mechanism behind
it.** Owner: all 57 puzzles are implemented, and new games will be implemented
in one go.

**Checked before agreeing, because the setting's name is not the flag's**: the
catalog declares `unfinished?: boolean`, and **no puzzle sets it**. The only
other occurrence of the word in the catalog is prose in Group's objective. So
the preference, the `visibleIds` filter, the catalog card's badge and the
puzzle screen's "this is an experimental, unfinished puzzle" warning all gate an
empty set today. This is complexity preserving a promise nothing consumes.

## Impact

- **Affected specs**: `app-shell` — the recorded design direction is amended on
  two points (the hint accent, the home header's navigation), and the retired
  preference is recorded so it is not reintroduced.
- **Affected code**: `src/screens/home-screen.ts`, `src/screens/puzzle-screen.ts`,
  `src/puzzle/components/rail.ts`, `src/dialogs/settings-dialog.ts`,
  `src/store/settings.ts`, `src/store/db.ts`, `src/puzzle/catalog-data.ts`,
  `src/components/catalog-card.ts`, `src/icons.ts`.
- **Player-visible**: all four, by construction. Each is owner-requested, which
  is what settles them.
- **Player data**: two preference keys stop being read — `showIntro` and
  `showUnfinishedPuzzles`. Rows already stored keep their values harmlessly;
  nothing reads them, and a player who had hidden the intro will see it again.
  That is the intended outcome rather than a regression, since the control is
  gone.
