# Differences in this version

This web adaptation of Simon Tatham’s Portable Puzzle Collection includes
some features and UI changes that are not included in the original.

::experimental|Experimental:: Items with this symbol are considered experimental.
Although functional, they're likely to change significantly in future updates.
(There's also a slight possibility they might be removed entirely.)

## Changes affecting all puzzles

* **[Hints explain themselves](features#hints).** Where the original's hint
  reveals a move, this version's tells you *why* that move is forced, so you can
  use the technique yourself next time. It can also play a puzzle out a step at
  a time, and it refuses to guess for you.

* **[Mistake checking](features#checking).** Many puzzles can tell you whether
  what you've entered so far contradicts the answer, and will hold a saved
  position for you once it's checked out.

* ::experimental|Experimental:: This version allows you to save and return 
  to arbitrary [checkpoints](features#checkpoints) within the undo history.

* The original desktop collection's command line options are not available on
  the web. However, you can provide game parameters or an ID or random seed in the
  URL to particular puzzle: add *?type=params* or *?id=id-or-seed*. (From within 
  a game, look in the <command-link command="share:link">share dialog</command-link>
  for copyable links.) 

## Changes to specific puzzles

* **Light Up**: the difficulty the original calls *Hard* is named
  *Unreasonable* here, because those boards require trial and error by
  construction. That naming is a promise the whole collection keeps — see
  [Difficulty](features#difficulty).

(Other changes to individual puzzles have been accepted back into the original 
collection.)
