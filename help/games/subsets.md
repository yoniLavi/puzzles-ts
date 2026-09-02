# Subsets

You are given a grid and a list of sets. Place every set into the grid exactly once. Some sets are given.

1. A horseshoe symbol ⊃ points from a superset to a subset. In other words, the set on the open end must contain every letter in the set on the closed rounded end.
2. All possible horseshoe symbols are given. This means that each set must contain a letter that doesn't appear in the adjacent set, if there is no symbol between them.

This puzzle type was invented by Inaba Naoki under the name *サブセットリンク*, released as a [Java Applet](http://inabapuzzle.com/honkaku/subset.html) with a puzzle generator.

## Controls

Every letter has a fixed position in each set. Left-click a cell to add the letter in that position, or right-click a cell to rule out the letter in that position.

To play with a keyboard, use the arrow keys to move the cursor. Press Enter to place a letter, and press Space to rule out a letter.

### Where can this go?

The tally band beside the grid works in both directions. Click a set in the tally and every cell it could still legally go in is spotlighted; if it's already placed, the cell it lives in is shown in a different color. Going the other way, the inspect badge above a cell — or simply moving the keyboard cursor onto it — highlights every set that cell could still hold.

The answers come from what's visible on the board: the cell's own marks, the horseshoes to its decided neighbors, and the rule that each set appears once. Nothing is read off the solution, so the aid can't do the deducing for you.

## Subsets parameters

Every puzzle is played on a 4×4 grid over a four-letter universe. That is the one size where the sixteen possible sets exactly fill the sixteen cells — the bijection the puzzle is built on — so the board never changes size. The one thing you can choose is how hard the deductions have to work.

### Difficulty

*Easy* puzzles can be solved by reading the horseshoes forwards: a set placed on the closed end of a horseshoe tells you letters the open end must contain, and a letter ruled out of the open end is ruled out of the closed end too.

*Tricky* puzzles also need the argument run backwards. Because a horseshoe forces the closed end to be a **strictly smaller** set than the open end — two cells can never hold the same set, since each set is placed exactly once — a candidate for the closed end is only viable if some candidate for the open end still contains it. Rule out the last set that could sit on the open end above it, and the closed end loses that option, even though nothing about it changed directly.
