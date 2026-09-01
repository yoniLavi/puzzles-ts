# Design — unify-cross-game-vocabulary

## D1. The test for what stays per-game

Not "would unifying this be disruptive" — that question has been retired
(`docs/framework-rdd/README.md`, "The order of work"). The test is:

> **Can we say what a game would legitimately want to do differently?**

If the answer names something a player could notice and a designer could
defend, it stays. If the answer is only "these files were written by different
sessions", it goes. Applied to the three findings:

| Concern | A game might legitimately want… | Verdict |
| --- | --- | --- |
| Where the cursor's position lives on `Ui` | nothing | unify |
| How the cursor *traverses* (half-grid, corner-skip, lock modes) | a genuinely different geometry | **keep** |
| What else happens as it moves (Tents paints, Boats fills) | its own mechanic | **keep** |
| The spelling of "the player has solved it" | nothing | unify |
| The flash *condition* | more than one outcome; a different duration | **keep** |
| Whether the first arrow press moves | nothing — and differing is a UX defect | unify |

The middle rows are why this is a vocabulary change and not a behaviour change:
everything a game does *around* the cursor survives untouched, because the
shared part is the noun and the per-game part is the verb.

## D2. The cursor shape, checked against the code before proposing it

```ts
export interface GridCursor { x: number; y: number; visible: boolean }
export function newCursor(x = 0, y = 0): GridCursor
/** Move and reveal in one press. True if anything changed. */
export function moveCursor(c: GridCursor, button: number, w: number, h: number,
                           wrap?: boolean): boolean
/** A pointer took over. True if anything changed. */
export function hideCursor(c: GridCursor): boolean
```

Verified against Slant (the plain case), Tents (paints while moving) and Boats
(fills a line while moving): all three reduce to `moveCursor` plus their own
before/after read of `c.x`/`c.y`. **Do not widen this to cover the paint** —
that is the per-game verb, and taking it is how an abstraction starts contorting
games (the scene-graph postmortem's failure mode in miniature).

**Open, decide with the code in front of you:** whether games hold
`ui.cursor: GridCursor` or the framework holds it beside the `Ui`. Holding it on
the `Ui` is the smaller step and keeps `newUi` honest; the framework-held version
is where the gesture table eventually goes. Prefer the smaller step — this change
is not the framework.

## D3. Why the completion vocabulary is the more valuable half

The cursor drift costs a reader; the completion drift costs a *deriver*. Check
& Save, the status bar, the win flash, the difficulty contract and the
conformance suite all want to ask "is this solved, and did they cheat" — and
today each game answers in its own words, so every one of those five is either
hand-wired per game or written to sniff structurally. `winFlash` reading the
flags "structurally" is that compromise already in the tree: it was built to
work *around* the drift, and the drift is the thing to fix.

**Name them `completed` and `cheated`**, which is both the majority spelling and
upstream's, so the diff is smallest and the C stays readable beside it.

## D4. The first-arrow-press question is the one player-visible part

Reveal-only costs a keypress; reveal-and-move does not, and a player who cannot
see the cursor has not lost anything by it having moved. Flip and Mosaic already
do this and `add-slide-keyboard-control` adopted it after checking them, so the
unification follows the majority rather than inventing.

It is nonetheless **the one thing here a player can feel**, so it is the one
thing needing acceptance. Land it as its own commit, separable from the renames,
so it can be reverted alone if the owner dislikes it.

## D5. What proves it

- **Shape, not just green.** This is a bulk mechanical edit across ~50 files:
  assert every changed line is a rename or a call-site swap, then read the
  exceptions (`scripts/check-rename-shape.mjs`, and the manual diff-shape grep
  that caught the reflowed conditionals in `ab4f5d0`).
- **The renames must be behaviour-preserving by construction**, so the existing
  per-game suites passing *is* the evidence for the cursor half — but only if
  they cover the cursor at all, which is not given. Check coverage first: a game
  whose tests never press an arrow key proves nothing by staying green.
- **A guard against re-drift**, extending `emittable-keys.test.ts`'s derived
  approach: a game declaring its own cursor-visibility field or its own spelling
  of `cheated` fails. Prove it fails.
- **Tier 2.5 for the first-arrow-press change**, on the games whose behaviour
  actually moves — the frame after one arrow press from a fresh board.
