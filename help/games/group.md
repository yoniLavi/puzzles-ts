# Group

Fill in the grid with the letters shown to the top and left of it, so
that the full grid is a valid
[Cayley table](http://en.wikipedia.org/wiki/Cayley_table)
for a
[group](http://en.wikipedia.org/wiki/Group_(mathematics)).

If you don't already know what a group is, I don't really recommend
trying to play this game. But if you want to try anyway, the above is
equivalent to saying that the following conditions must be satisfied:

- **Latin square**. Every row and column must contain
  exactly one of each letter.
- **Identity**. There must be some letter *e* such
  that, for all *a*, the letter in row *e* column *a* and
  the one in row *a* column *e* are both *a*. In the
  default mode, this letter is always *e* and its row and column
  are filled in for you; by reconfiguring the game using the Type menu,
  you can select a mode in which you have to work out which letter is
  the identity.
- **Inverses**. For every letter *a*, there must be
  some letter *b* (which may sometimes be the same letter
  as *a*) such that the letters in row *a* column *b* and
  in row *b* column *a* are both the identity letter (as
  defined above).
- **Associativity**. For every combination of
  letters *a*, *b*, and *c*, denote the letter in
  row *a* column *b* by *d*, and the one in row *b*
  column *c* by *e*. Then the letters in row *d*
  column *c* and in row *a* column *e* must be the same.

To place a letter, click in a square to select it, then type the
letter on the keyboard. To erase a letter, click to select a square
and then press Backspace.

Right-click in a square and then type a letter to add or remove the
number as a pencil mark, indicating letters that you think
*might* go in that square.

You can rearrange the order of elements in the rows and columns by
dragging the column or row headings back and forth. (The rows and
columns will stay in sync with each other.) Also,
left-clicking *between* two row or column headings will add or
remove a thick line between those two rows and the corresponding pair
of columns (which is useful if you're considering a subgroup and its
cosets).
