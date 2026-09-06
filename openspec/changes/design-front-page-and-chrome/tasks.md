# Tasks — design-front-page-and-chrome

## 1. Inventory

- [x] 1.1 List what a redesign touches, by file, split into *layout* (needs a
      design) and *tokens* (retheme in one place): home screen + static header,
      catalog card, puzzle screen + components (app bar, toolbar, keypad, type
      menu, history panel, end notification), dialogs, `common.css` /
      `wa-tweaks.css` / `native.css`, help CSS, manifest colors.
- [x] 1.2 Screenshot the current front page and puzzle screen at phone and
      desktop widths (Chrome via `playwright-cli`) as the "before" the canvas
      is judged against.

## 2. Directions

- [x] 2.1 Open a Claude Design canvas (the `design` skill) with two or three
      directions, each drawn for the front page and the puzzle screen at a
      phone width and a desktop width, light scheme.
      Three directions, 15 artboards (a "today" row too, from real
      screenshots): <https://claude.ai/code/artifact/8c5b60eb-4b17-4b15-b408-3d8cacab280d>
- [x] 2.2 One direction is the owner's lean taken literally: calm and
      ergonomic — generous spacing, restrained color, the lit-cell mark as the
      only accent, controls sized and placed for a thumb. (A · Quiet Paper.)
- [x] 2.3 At least one direction is deliberately different in feel, so the
      choice is a real one. (B · Index is utilitarian and structurally
      different — a left rail, no top bar; C · Lit is brand-forward, navy and
      amber used boldly.)
- [x] 2.4 Each direction shows both catalog shapes under consideration (card
      grid vs a denser list), or states which it commits to and why.
      Each commits to a different one — A cards, B a dense list, C icon tiles
      — with its tradeoff stated on the canvas beside it, so the pick decides
      the catalog shape too.

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
