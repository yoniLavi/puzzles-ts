# design-front-page-and-chrome

## Why

`claim-project-authorship` put this project's name, words, logo and privacy
notes on every surface a player reads. What it did not touch is the *shape* of
those surfaces: the front page's header-and-card-grid, the puzzle screen's app
bar, toolbar, keypad and dialogs, and the Web Awesome token palette they are
built on are all still `puzzles-web`'s design, inherited with the shell. A
player who knows puzzles-web recognizes it at a glance, and the owner wants
more distance than words alone give (2026-09-03): *"a more general redesign of
the front page and chrome to further distance ourselves from puzzles-web."*

The owner's lean on feel is **calm and ergonomic**, and they are not yet sure.
That is exactly the state a design pass is for, and exactly the state in which
writing CSS first would be a mistake: a visual direction is the owner's call to
make on sight, and this project's acceptance bar puts player-facing look and
feel with the owner, not with a green suite.

## What Changes

**This change produces a design direction, not code.** It ends with a chosen
direction recorded in this change's `design.md`, and with the implementation
scaffolded as its own change. Splitting them keeps the decision separate from
the work that depends on it, and lets the implementation carry its own tasks,
acceptance and archive.

- **Inventory the chrome.** What a redesign would touch, by file: the home
  screen (`src/screens/home-screen.ts`, `src/css/home*.css`, the static header
  in `templates/index.html.hbs`), the catalog card
  (`src/components/catalog-card.ts`), the puzzle screen and its components
  (`src/screens/puzzle-screen.ts`, `src/puzzle/components/`), the dialogs
  (`src/dialogs/`), the shared CSS and token overrides (`src/css/common.css`,
  `wa-tweaks.css`, `native.css`), the help pages' CSS, and the manifest's
  `theme_color`/`background_color` in `vite.config.ts`. Note which parts are
  layout (need design) and which are tokens (retheme in one place).
- **Draft directions on a Claude Design canvas** (the `design` skill): two or
  three distinct directions, each shown for the front page and the puzzle
  screen, at a phone width and a desktop width, light scheme (dark follows the
  tokens). One direction takes the owner's lean literally — calm, ergonomic,
  generous spacing, restrained color, the lit-cell mark as the only accent —
  and at least one is deliberately different, so the choice is a real one.
- **The owner picks**, on the canvas, adjusting by hand where they like.
- **Record the direction in `design.md`**: palette tokens, type scale, spacing,
  radius, the header and catalog layout, the puzzle app bar and toolbar
  layout, what the keypad and dialogs inherit, and what is explicitly kept.
- **Scaffold the implementation change** (`implement-front-page-and-chrome`)
  with tasks derived from the recorded direction, then archive this one.

Explicitly **not** in this change:

- **Any code.** No CSS, no component change, no token edit lands here.
- **The board.** Game rendering, the twelve-color board palette and the
  per-game colors are this project's own already and are out of scope.
- **Help page content.** The help pages' words were rewritten by
  `claim-project-authorship`; only their CSS is in the inventory.

## Open decisions (owner)

1. **Feel.** Leaning calm and ergonomic; not decided. The canvas exists to
   decide it.
2. **The catalog.** Card grid (today), a denser list, or something else. The
   canvas shows at least two.
3. **Dark scheme.** Whether the chosen direction is drawn for dark as well or
   left to the tokens; the current dark scheme is token-derived.

## Impact

- Affected specs: `app-shell` gains a requirement that the chrome follows a
  recorded design direction of this project's own.
- Affected code: none in this change. The implementation change lists its own.
- Risk: none technical. The cost of a wrong direction is the implementation
  change's work, which is why the direction is chosen on a canvas first.

## Depends on

- **`claim-project-authorship`** — archived. Name, tagline, logo and words are
  settled; the redesign draws around them.
- Nothing else. `deploy-the-web-app` is independent, though acceptance of the
  implementation on a phone will want it.
