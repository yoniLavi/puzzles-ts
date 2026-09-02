# Tasks — design-front-page-and-chrome

## 1. Inventory

- [ ] 1.1 List what a redesign touches, by file, split into *layout* (needs a
      design) and *tokens* (retheme in one place): home screen + static header,
      catalog card, puzzle screen + components (app bar, toolbar, keypad, type
      menu, history panel, end notification), dialogs, `common.css` /
      `wa-tweaks.css` / `native.css`, help CSS, manifest colors.
- [ ] 1.2 Screenshot the current front page and puzzle screen at phone and
      desktop widths (Chrome via `playwright-cli`) as the "before" the canvas
      is judged against.

## 2. Directions

- [ ] 2.1 Open a Claude Design canvas (the `design` skill) with two or three
      directions, each drawn for the front page and the puzzle screen at a
      phone width and a desktop width, light scheme.
- [ ] 2.2 One direction is the owner's lean taken literally: calm and
      ergonomic — generous spacing, restrained color, the lit-cell mark as the
      only accent, controls sized and placed for a thumb.
- [ ] 2.3 At least one direction is deliberately different in feel, so the
      choice is a real one.
- [ ] 2.4 Each direction shows both catalog shapes under consideration (card
      grid vs a denser list), or states which it commits to and why.

## 3. Decide (owner)

- [ ] 3.1 The owner picks a direction on the canvas, adjusting by hand where
      they like.
- [ ] 3.2 Dark scheme: drawn, or left to the tokens.

## 4. Record

- [ ] 4.1 `design.md`: the chosen direction as a spec for implementation —
      palette tokens, type scale, spacing, radius, header and catalog layout,
      puzzle app bar and toolbar layout, what the keypad and dialogs inherit,
      and what is explicitly kept from today.
- [ ] 4.2 Scaffold `implement-front-page-and-chrome` with tasks derived from
      `design.md`, and with acceptance on a real device where the deploy allows.

## 5. Close

- [ ] 5.1 `openspec validate design-front-page-and-chrome --strict`; archive.
      No code lands in this change.
