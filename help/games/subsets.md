# Subsets

You are given a grid and a list of sets. Place every set into the grid exactly once. Some sets are given.

1. A horseshoe symbol ⊃ points from a superset to a subset. In other words, the set on the open end must contain every letter in the set on the closed rounded end.
2. All possible horseshoe symbols are given. This means that each set must contain a letter that doesn't appear in the adjacent set, if there is no symbol between them.

This puzzle type was invented by Inaba Naoki under the name *サブセットリンク*, released as a [Java Applet](http://inabapuzzle.com/honkaku/subset.html) with a puzzle generator.

## Controls

Every letter has a fixed position in each set. Left-click a cell to add the letter in that position, or right-click a cell to rule out the letter in that position.

To play with a keyboard, use the arrow keys to move the cursor. Press Enter to place a letter, and press Space to rule out a letter.

### Where can this go?

The tally band beside the grid works in both directions. Click a set in the tally and every cell it could still legally go in is spotlighted; if it's already placed, the cell it lives in is shown in a different colour. Going the other way, the inspect badge above a cell — or simply moving the keyboard cursor onto it — highlights every set that cell could still hold.

The answers come from what's visible on the board: the cell's own marks, the horseshoes to its decided neighbours, and the rule that each set appears once. Nothing is read off the solution, so the aid can't do the deducing for you.

## Subsets parameters

Subsets has no adjustable parameters. Every puzzle is played on a 4×4 grid over a four-letter universe, which is the one size where the sixteen possible sets exactly fill the sixteen cells — the bijection the puzzle is built on.
