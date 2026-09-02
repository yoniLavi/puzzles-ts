# Crossing

You're given a grid with several black squares, and a list of numbers. Your objective is to fill every empty square with a digit, so each number appears once in the grid when reading from left-to-right or from top-to-bottom.

This is an implementation of *Nansuke*, which was invented by Nikoli. It's sometimes known as *Number Skeleton*.

More information: https://www.nikoli.co.jp/en/puzzles/nansuke/

## Controls

Crossing uses the same control scheme as Solo.

Left-click to select a cell, then type a number on your keyboard to enter it. Press Backspace or Space to clear a cell.

Right-click a cell, then type a number to add a pencil mark. Pencil marks can be used for any purpose. A preference makes right-click switch on a *sticky* pencil mode instead, which stays on until you right-click again.

You can also use the arrow keys to move the selected cell around. Press Enter to toggle between entering numbers and entering pencil marks.

### Typing a whole number

After you enter a digit, the selection moves on to the next square of the run you're filling, so a complete number can be typed without selecting each square in turn. The selection stops at the end of the run.

The direction is set by the arrow key you last used, and by the square you select: a square that belongs to only one run snaps to it, and clicking an already-selected square that lies on both an across and a down run swaps between them. Clearing a square or adding a pencil mark doesn't move the selection.

### Placing numbers from the list

The number list is an input surface, not just a reference. Click a number to pick it up and every run that can still take it is previewed; click one of those runs to write the whole number in at once. If a square is already selected, clicking a number that fits one of its runs places it straight away.

Across and down runs are drawn in two different colors, and each number in the list is written in the color of the run a click would send it to — so the list always tells you where the number is going. Numbers already written into the grid stay distinguishable from ones that simply don't fit the square you have selected.

Both the auto-advance and the two clue-list aids — highlighting the runs through the selected cell, and coloring the list by where each number could go — can be switched off in the game's preferences.

## Crossing parameters

These parameters are available from the ‘Custom…’ option on the ‘Type’ menu.

<dl>
	<dt>Width, Height</dt>
	<dd>Size of the grid in squares. Very large boards are refused, because a puzzle whose runs all read as distinct numbers becomes impossible to generate as the grid grows.</dd>
	<dt>Symmetric walls</dt>
	<dd>When enabled, all walls form a rotationally symmetric pattern.</dd>
</dl>
