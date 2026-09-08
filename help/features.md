# Features every puzzle shares

The puzzles differ; the app around them is the same. This page covers what
every puzzle gets from it: hints that explain, checking your work, saving and
checkpoints, and playing by touch, mouse or keyboard on any size of screen.

Simon Tatham’s manual for the original collection describes his desktop
builds, and much of its [common features][sgt-common] chapter applies here
too. Where the two disagree, this page describes the app you are using.

## On-screen keyboard {#virtual-keyboard}

Puzzles you solve by typing, such as Solo and Keen, show an on-screen keypad
so they can be played by touch.

If you have a real keyboard and would rather have the screen space, turn the
keypad off in the
<command-link command="settings:appearance">preferences</command-link>.

## Right-clicking on a touch screen {#right-mouse}

Many puzzles use both mouse buttons. When a puzzle’s help says “right-click”
and you are playing by touch, you have four ways to do it:

* **Tap again.** In many puzzles, tapping cycles a square: the first tap does
  what a left-click does, the second what a right-click does, and a third (in
  puzzles that have a neutral state) clears it.

* **Long press.** Holding a finger down counts as a right-click. To right-drag,
  keep holding and move.

* **Two-finger tap.** A second finger, anywhere on the screen, turns a touch
  into a right-click. The fingers need not land together: put the first where
  you want to click, then tap and release the second. To right-drag, lift the
  second finger and move the first.

* **The ::mouse-left-button|left-click::/::mouse-right-button|right-click::
  toggle.** A button that decides what a plain tap means. It is hidden by
  default; turn it on in the
  <command-link command="settings:mouse">preferences</command-link>. Set to
  right-click, it also inverts the long press and the two-finger tap to mean
  *left*-click, and it swaps the buttons of a mouse or trackpad the same way.

Tapping again is always available where a puzzle supports it. The others can be
tuned or turned off in the
<command-link command="settings:mouse">preferences</command-link>, along with
the hold time and the audio feedback.

**In puzzles that have no use for a right-click, these gestures are switched
off** — Cube, Fifteen, Filling, Flip, Flood, Pegs and Sokoban. There, holding
your finger still simply presses; you can rest a finger on a peg while you decide
where to jump it, and the drag still works when you move.

## Right-dragging with a mouse {#right-drag}

Browsers don’t let a page see a drag made with the right mouse button, so where
a puzzle’s help says “right-drag”, hold <kbd>Ctrl</kbd> and drag with the left
button instead. A plain right-click works as usual.

## Hints {#hints}

Many puzzles here have a ::hint:: **Next hint** button, high in the panel
beside the board (or in the bar along the bottom, on a phone). It doesn't simply reveal a move. It shows you the next move *and
explains why that move is forced*, so that what you take away is a technique you
can use again by yourself rather than one square you didn't work out.

Hint works in two beats:

* **Press once to see it.** The board marks what the hint is talking about and
  the explanation appears directly under the button. Nothing has been played — the move
  is still yours to make, and you're free to make a different one.

* **Press again to play it.** A second press, with nothing done in between,
  plays that one step in slow motion and stops there. Ask again for the next.

Anything you do in between — a move of your own, undo, redo — puts the hint back
to the first beat, so a second press always *shows* before it plays.

::play:: **Auto Hint**, beside the Hint button, does this continuously at about
a second a step, waiting for each move's animation in the puzzles that have one.
::pause:: pauses it, and it stops by itself when the puzzle is solved or when
the hint runs out of things to say.

### What the marks mean {#hint-marks}

A hint marks the board, and the marks mean the same things in every puzzle, so
they're worth learning once.

* **A ring, drawn around the contents of a square, is what the hint is acting
  on** — the square, edge or line that the deduction forces. It is drawn *around*
  what's there rather than over it, so anything you've already written stays
  readable underneath.

* **An outline around a row, region or area is the evidence** — what the hint is
  reasoning *from*, as opposed to what it concludes. Where a puzzle's evidence is
  squares that are empty by nature, this is a soft shade rather than an outline,
  since there's nothing there to read through it.

* **Small numbers in the corners of squares give the order** the steps fall in,
  when a hint walks a chain of consequences. They're numbers rather than arrows
  on purpose: they tell you which order to read the chain in, and stop short of
  claiming that each square is the one that forces the next.

Some puzzles need to point at two kinds of evidence at once — a filled square
and an empty one, say — and mark them differently from each other. The
explanation always names what it's pointing at, so you never have to go by
color alone.

### When there's no hint to give {#hint-refusals}

Two quite different things stop a hint, and they call for opposite responses, so
it's worth knowing which one you're looking at.

* **There's a mistake on the board.** A hint won't reason from a position that
  already contradicts the clues, because everything it deduced from there would
  be wrong too. It refuses, and highlights the squares that clash — the same
  highlighting [Checking your work](#checking) uses. Fix those, then ask again.

* **Deduction has run out.** Nothing further *follows* from what's on the board.
  The puzzle is still solvable; there just isn't a next step that can be
  explained, which is what an [Unreasonable](#difficulty) puzzle is for. Save
  your position, try something, and come back if it doesn't work out — or take
  the answer from ::show-solution:: *Show solution…*, at the foot of the
  *Help me play* group.

The hint says which of the two has happened. It never guesses on your behalf and
then presents the guess as a deduction: a guess that happens to come off is not
a technique, and teaching you one would be the point.

Not every puzzle has a *Next hint* button. A puzzle has one where it's solved by
reasoning *and* the game can put that reasoning into words. Where the challenge
is dexterity, search or luck instead, there's no technique to teach and no
button to press.

## Checking your work {#checking}

Where a puzzle has a single provable answer, this app can tell you whether what
you've entered so far contradicts it.

::check-and-save:: **Check & save** — beside the board, in the bottom bar on a
phone, and on <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>S</kbd> — checks the board and
then saves your position if it's sound. If it isn't, it tells you how many squares are
wrong, highlights them, and **doesn't save**; the position you saved earlier is
left exactly as it was, so a check you fail can never cost you the one you
passed. Return to that saved position at any time with
::back-to-last-save:: **Back to last save**, directly beneath it.

In a puzzle that can't check itself the button reads the same and simply saves —
one name for the save in every puzzle.

There is also a quieter ::check-only:: **Check without saving**, low in the
*Help me play* group. It highlights and counts the mistakes exactly as above but
writes nothing, which is what you want when you already saved a position you
mean to keep: the save slot holds one position per puzzle, so checking-and-saving
would replace it.

Two things worth knowing about what the highlighting claims:

* It marks what is **wrong**, never what is **missing**. An unfinished board is
  not a mistaken one, and squares you haven't filled in yet are never
  highlighted.
* The marks are a snapshot, not a running check. They last until your next move,
  which clears them — so they always describe the board you asked about.

There is one saved position per puzzle. It's separate from the numbered
[checkpoints](#checkpoints) in the history panel, which are a different feature:
those live in your move history and you can hold several at once.

## Difficulty {#difficulty}

Many puzzles offer a range of difficulty levels in the ::puzzle-type:: type
menu. Nearly all of those levels promise the same thing, and one of them
promises something different.

On every level *except* one named **Unreasonable**, the puzzle can be finished
by reasoning alone. You may not spot the next step, and it may be a hard step to
spot, but there is always one there to be found, and you never need to try
something out to see whether it works.

**Unreasonable** withdraws exactly that promise. Such a board may reach a
position where no further step follows from what you can see, and the only way
on is to pick one of the possibilities, play it out, and be ready to take it
back. That's not a flaw in the board; it's what the name is telling you in
advance. It's also the only name that's allowed to mean it — if a level is
called something else, it doesn't require this of you.

Three things make trying-and-taking-back cheap:

* ::undo:: **Undo**, for stepping back a move at a time.
* **[Save your position](#checking)** before you commit to a line, and
  *Back to last save* to get back to it.
* **[Checkpoints](#checkpoints)**, when you want to hold more than one position
  at once, or to mark the spot and keep playing.

The [hint](#hints) knows about all this. On an Unreasonable board it will tell
you when deduction has run out rather than making a choice for you and calling
it a deduction.

## Filling in all the pencil marks {#mark-all}

In puzzles where you write small pencil marks into a square to keep track of
what could go there, the ::mark-all:: button writes them for you: every square
that has no marks yet gets everything that could still go in it. That gives you
a full set to eliminate down from instead of a blank grid to fill in by hand.

**It never undoes your own thinking.** A square you have already narrowed by
hand is left alone — the button only fills in squares that are empty of marks.
And pressing it a second time doesn't start over: in most of these puzzles it
crosses out the candidates that the board has since ruled out, so repeated
presses narrow rather than reset.

On a keyboard this is also the <kbd>M</kbd> key. The ::mark-all:: **Fill all
pencil marks** button is the only way to reach it on a touchscreen.

It's a move like any other, so ::undo:: undoes it.

## The reference panel {#reference}

Some puzzles are about placing a known set of pieces, where the question you
keep asking is *which ones haven't I placed yet*. Those get a ::reference::
reference panel: a checklist of the whole set, marking off each piece you've
placed and flagging any you've placed more than once.

Picking an item in the panel highlights where on the board it could still go.
Closing the panel deliberately **keeps** that highlight, because on a small
screen the natural order is to pick your piece, close the panel to see the board
properly, and then place it. Press <kbd>Esc</kbd>, or pick the same item again,
to clear it.

## Checkpoints {#checkpoints}

A checkpoint marks a position in your move history so you can come back to it:
a shortcut for a long run of Undo. They earn their keep on an
[Unreasonable](#difficulty) board, where you may have to try a line and take it
back.

You can hold several checkpoints at once. If you want a single position to
return to, and the board checked before it is kept, that is the separate
[saved position](#checking).

To set one, open the ::history:: history panel (beside undo and redo) and
choose *Save checkpoint*, then carry on. If the line doesn’t work out, pick the
checkpoint in the panel to rewind to it.

Back at a checkpoint, ::undo:: undo and ::redo:: redo still walk the history
around it. Your first new move, though, discards everything after that point,
later checkpoints included; if you change your mind before making one, *Last
move* in the panel redoes all the way to the end. A checkpoint you no longer
want goes with its ::checkpoint-remove:: delete button.

::experimental:: Checkpoints are experimental and may change shape.

## Autosave {#autosave}

Each puzzle keeps your game in progress and resumes it when you come back,
whether you closed the tab, wandered off, or hit a bug. Starting a new game, or
choosing another variation or difficulty in the ::puzzle-type:: type menu,
replaces it.

On the home screen, a puzzle with a game in progress wears a
::game-in-progress:: triangle on its icon.

To discard every game in progress, open the
<command-link command="settings:data">preferences</command-link> and choose
*Clear data… Delete games in progress.*

## Sharing a game {#sharing}

*::share:: Share* in *More…* (or
<command-link command="share:link">here</command-link>) offers:

* **This specific game**: a link to the game you are playing, as it was dealt.
  It doesn’t carry your progress; for that,
  [export a save file](#saved-games) or copy as text.

* **This puzzle type**: a link to the current ::puzzle-type:: type, meaning the
  size, difficulty and any other options. Opening it deals a new random game
  of that type, which makes it the way to pass on a custom type.

* **Copy as text**: the board as plain characters, for pasting into a forum
  post or a message. Use a fixed-width font (“format as code”). Not every
  puzzle can do this, and some of the renderings take a little imagination.

* **Game ID** and **random seed**: for use with other apps that play the same
  collection. Simon Tatham’s manual explains the format under
  [*Specifying games with the game ID*][sgt-gameid]. To open an ID or seed you
  were given, use <command-link command="enter-gameid">*Enter game ID*</command-link>
  in *More…*.

For puzzles that exist on Simon Tatham’s website, the share dialog also links
the same game there, which is handy for comparing behavior when something
looks wrong.

## Saving, loading, exporting and importing {#saved-games}

*::save-game:: Save game* in *More…* keeps the whole game, undo history and
[checkpoints](#checkpoints) included, and *::load-game:: Load game* brings it
back.
Saved games stay on your device, in your browser’s storage.

*Export…* in the save dialog writes a file you can move to another app that
plays the collection, or attach to a bug report; *Import…* in the load dialog
reads one in. (Exported files leave checkpoints behind for now.)

To delete every saved game, open the
<command-link command="settings:data">preferences</command-link> and choose
*Clear data… Delete saved games.*

Your games and settings stay in your own browser, on your device. The
<command-link command="about:privacy">privacy note</command-link> sets out what
the app does and does not keep.

[sgt-common]: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/doc/common.html#common
[sgt-gameid]: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/doc/common.html#common-id
