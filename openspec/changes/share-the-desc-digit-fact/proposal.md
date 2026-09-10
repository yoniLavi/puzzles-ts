# share-the-desc-digit-fact

**Readiness: scaffolded, not started.** Split out of `share-the-digit-key-fact`
(task 1.5, 2026-09-10), which shared the *input* half of the digit question and
measured this half beside it. Re-measure before adopting: the figures below are
a grep taken on 2026-09-10, and the sibling change's own grep had missed five
games until the sites were read.

## Why

*Which character writes which small number in a game description* is one
codec fact, and `engine/desc-alphabet.ts` already states it — `n2c`/`c2n`
over `0`–`9`, `a`–`z`, `A`–`Z`, frozen because every shared game ID depends on
it. But most games that read or write a digit in a desc do it by hand, with
`48` and `0x30` spelled at the site, in four shapes:

| Shape | Sites (2026-09-10 grep) |
| --- | --- |
| **a decimal accumulator** — `n = n * 10 + (s.charCodeAt(i) - 48)` | Bridges, Dominosa, Mines (seven times), Pearl, Signpost, Tents |
| **one digit after a range check** — `if (c >= "0" && c <= "9") v = c.charCodeAt(0) - 48` | Cube, Flip, Flood, Loopy, Mathrax, Mines, Salad, Spokes, Tracks, Unequal; and the run-length games reading `tok.value.charCodeAt(0) - 48` (Filling, Map, Mosaic, Palisade, Slant) |
| **writing a digit** — `String.fromCharCode(48 + n)` | Abcd, Bridges, Keen, Loopy, Samegame, Slant, Tracks, Unequal |
| **a per-cell digit string** — `num.charCodeAt(k) - 48` on a listed number | Crossing (eleven sites across solver, hint-solver, render and state) |

Roughly sixty sites in twenty-five files. Two of the shapes already have a
shared answer nobody reached for: the single-digit reads are `c2n` with a
narrower alphabet, and the writes are `n2c`. The accumulator has no shared form
yet, and it is the one repeated most.

## What changes

Not decided here — that is the change's first task. The candidates:

- **Adopt `desc-alphabet.ts` site by site** where the desc's alphabet *is* the
  shared one, and leave a site alone where a letter means something else in
  that desc (a run-length blank, Tracks' `A`–`Z` above nine, Unequal's shifted
  digits). The sibling change's proposal warned that this is a per-site
  reading, not a sweep, and the table above is why.
- **A decimal scanner** beside `run-length.ts` — read a non-negative integer
  from `desc` at `pos`, returning the value and the new position — which is
  what six games' accumulators are, and what Mines writes seven times.
- **A digit-writer** for the `fromCharCode(48 + n)` shape, if `n2c`'s range
  check is not already the right one.

## Why it is not folded into the input change

Different fact, different consumers, different net. The input half is guarded by
input tests and a code-keyed scan of `interpretMove`; this half is guarded by
the **frozen differentials**, because a desc codec that changes changes which
boards exist. Putting both in one diff would put a desc byte-match at risk
inside a change whose verification was "every input test passes unedited".

## Constraints

- **Every frozen differential passes unedited.** These are desc codecs; a
  fixture that moves means the codec moved, and that is the finding, not a
  re-baseline.
- **Read before sweeping.** A desc's alphabet is that game's; `c2n` accepts
  letters that a run-length desc gives another meaning.
- **Finish what the input guard could not.** Once no desc site spells a digit
  code, `emittable-keys.test.ts` § 3's scan can widen from "against the
  button" to "anywhere in a game source", and the blind spot its design
  records (a helper receiving the button under another name) closes for the
  digits by construction. Say so in the change that gets there.
