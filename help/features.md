# Web common features

This web adaptation of the portable puzzle collection has several features 
to help it work better in a web browser and on a variety of different
screen sizes and input devices.

In addition to the features listed below, many (though not all) of the
[common features][sgt-common] of Simon Tatham's original desktop collection
are available here too. That manual describes his desktop builds rather than
this app, so where the two disagree, this help is the one that describes what
you are using.

## On-screen keyboard {#virtual-keyboard}

For puzzles where you need to enter numbers or use other keys to solve the
puzzle (like Solo and Keen), this app will show an on-screen "virtual keyboard" 
allowing use on touch screens.

If you have a physical keyboard and want to save screen space, you can turn
off the virtual keyboard in the
<command-link command="settings:appearance">preferences</command-link>.

## Right mouse button on touch devices {#right-mouse}

Many puzzles need both the left and right mouse buttons. If you're using a touch
screen, you have a few options when a puzzle's help says to "right-click":

* **Tap multiple times.** In many puzzles, this will cycle through the left-click
  state on first tap, the right-click state on second tap, and back to the 
  "neutral" state (for puzzles that have that) on the third tap.

* **Long press** (hold) is treated as a right-click. To right-drag, continue 
  to hold your finger down and move it in the desired direction.

* **Two-finger tap** is also treated as a right-click. The two fingers don't 
  have to hit at exactly the same time. You might find it easier to put the 
  first finger down where you want to right-click, then very quickly tap and
  release another finger, anywhere convenient. (If you're a piano player, this 
  is a little like a grace note. Or really, a mordent but holding the main note 
  while striking the other key.)

  To right-drag, keep the first finger down and move it after lifting the other 
  finger. 

* **::mouse-left-button|left-click::/::mouse-right-button|right-click:: toggle.**
  This is a button that lets you control whether tapping on the puzzle means 
  left-click or right-click. The mouse button toggle isn't normally shown; 
  you can turn it on in the 
  <command-link command="settings:mouse">preferences</command-link>.

  When set to right-click on tap, the long press and two-finger tap gestures 
  are inverted to mean *left*-click. (The mouse button toggle swaps the primary 
  and secondary buttons or gestures for *any* input device, so it can be used 
  with a regular mouse or trackpad too.)

Tapping multiple times is always available (for puzzles that support it). 
The other options can be configured in the 
<command-link command="settings:mouse">preferences</command-link>,
where you can also adjust the detection time and audio feedback.

**In puzzles that have no use for a right-click, these gestures are switched
off** — Cube, Fifteen, Filling, Flip, Flood, Pegs and Sokoban. There, holding
your finger still simply presses; you can rest a finger on a peg while you decide
where to jump it, and the drag still works when you move.

## Right drag with a mouse {#right-drag}

If you are using a mouse, puzzles will ignore attempts to click and drag
with the right mouse button. (This is a browser limitation. Right-click still 
works, just not right-drag.)

When a puzzle's help says to "right-drag" you can instead hold down <kbd>Ctrl</kbd> 
and then click and drag with the left mouse button.

## Hints {#hints}

Many puzzles here have a ::hint:: **Hint** button, on the toolbar and in the
game menu. It doesn't simply reveal a move. It shows you the next move *and
explains why that move is forced*, so that what you take away is a technique you
can use again by yourself rather than one square you didn't work out.

Hint works in two beats:

* **Press once to see it.** The board marks what the hint is talking about and
  the explanation appears in the status line. Nothing has been played — the move
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
  the answer from ::show-solution:: *Solve* in the game menu.

The hint says which of the two has happened. It never guesses on your behalf and
then presents the guess as a deduction: a guess that happens to come off is not
a technique, and teaching you one would be the point.

Not every puzzle has a Hint button. A puzzle has one where it's solved by
reasoning *and* the game can put that reasoning into words. Where the challenge
is dexterity, search or luck instead, there's no technique to teach and no
button to press.

## Checking your work {#checking}

Where a puzzle has a single provable answer, this app can tell you whether what
you've entered so far contradicts it.

::check-and-save:: **Check & save** — on the toolbar, in the game menu, and on
<kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>S</kbd> — checks the board and then saves
your position if it's sound. If it isn't, it tells you how many squares are
wrong, highlights them, and **doesn't save**; the position you saved earlier is
left exactly as it was, so a check you fail can never cost you the one you
passed. Return to that saved position at any time with *Quick-load*.

In a puzzle that can't check itself, the same button reads **Quick-save** and
simply saves.

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
  *Quick-load* to get back to it.
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

On a keyboard this is also the <kbd>M</kbd> key. The button is the only way to
reach it on a touchscreen, which is why it's on the toolbar.

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

This app allows you to save multiple "checkpoints" within a game and return 
to them later. Checkpoints can be helpful on an [Unreasonable](#difficulty)
board, where you may have to try a line out and take it back. They're
essentially a shortcut for repeatedly pressing Undo.

Checkpoints live in your move history and you can hold several at once. If you
want just one position to come back to, and to have the board checked before it
is saved, that's the separate [saved position](#checking) instead.

To create a checkpoint at the current move, open the ::history:: history 
panel (near the undo/redo buttons) and choose *Save checkpoint.* You can then
continue trying to solve the puzzle. If you later find you've gone down the 
wrong path, rewind to your checkpoint by selecting it in the history panel.

After going back to a checkpoint, you can use ::undo:: undo and ::redo:: redo 
to explore around it. Once you make a new move, though, all history past that 
point is erased—including any later checkpoints. If you change your mind about
going back to a checkpoint (*before* making a new move), choose *Last move* 
in the history panel to redo all the way back to the end.

If you decide you no longer want a checkpoint, use the 
::checkpoint-remove:: delete button next to it.

::experimental:: Checkpoints are an experimental feature, currently unique to
this adaptation. They are likely to change somewhat in future updates.

## Autosave {#autosave}

This app automatically saves the current game in progress for each puzzle
and resumes it when you return to that puzzle later. This can be helpful if you
accidentally navigate your browser away from the puzzle page while playing.
(Or if the puzzle app crashes due to a bug.)

The autosave for a puzzle is reset whenever you start a new game or select 
a different variation or difficulty level in the ::puzzle-type:: type menu.

On the home screen, a puzzle's icon will show a ::game-in-progress:: triangle
when there is an autosaved game for that puzzle.

To clear all autosaved games for all puzzles, open the 
<command-link command="settings:data">preferences</command-link> and choose
*Clear data… Delete games in progress.*

## Sharing games {#sharing}

You can <command-link command="share:link">share</command-link> the puzzle 
you're playing with others. Choose *::share:: Share…* from the game menu, then:

* **This specific game** links to the exact game you're playing. 
  (At the start of the game, not any progress you've made toward solving it. 
  To capture the current state [export a save file](#saved-games)
  or copy as text instead.)

* **This puzzle type** links to the current ::puzzle-type:: puzzle type—the
  size and difficulty level and any other options. Opening the link will 
  start a new, random game of that type. This can be handy for sharing
  custom puzzle types.
  
* **Copy as text** provides an ASCII rendering of the current puzzle state,
  which you can paste into a forum or email for discussion. (You'll want 
  to use a fixed width font, e.g., "format as code.")

  Not all puzzles support copying as text, and those that do may call for 
  a bit of creative interpretation.

* **Game ID** and **random seed** can be used with other portable puzzle
  collection apps. See 
  [*Specifying games with the game ID*][sgt-gameid] in Simon Tatham's manual.

  If you have a specific game ID or random seed from another app, load it 
  using <command-link command="enter-gameid">*Enter ID/seed*</command-link> 
  on the game menu.

For puzzles available on Simon Tatham's official Portable Puzzle Collection
website, the share dialog also includes game ID and random seed links to that.
(These are mainly useful for comparing buggy behavior observed in this app.)

## Saving, loading, exporting and importing games {#saved-games}

You can save the entire state of a game—including the undo history and any
saved [checkpoints](#checkpoints)—by choosing *::save-game:: Save…* in the game 
menu. Then choose *::load-game:: Load…* to restore it later.
Saved games are kept on your device, in your web browser's storage. 

To create a file you can use with a different portable puzzle collection app
(or include in a bug report), click the *Export…* button in the save dialog. 
There’s a corresponding *Import…* button in the load dialog for bringing in
external files. (Exported files do not currently include checkpoints.)

To delete all saved games for all puzzles, open the
<command-link command="settings:data">preferences</command-link> and choose
*Clear data… Delete saved games.*

[sgt-common]: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/doc/common.html#common
[sgt-gameid]: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/doc/common.html#common-id
