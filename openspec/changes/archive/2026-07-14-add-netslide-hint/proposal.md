# Add an explained hint to Netslide (and extract the shared slide planner)

## Why

Netslide shipped without a hint (`add-netslide-ts-port` scoped it out
deliberately, as Sixteen's port did). It is the third sliding-permutation game in
the collection — after Fifteen and Sixteen — and the first one whose *move* has a
consequence worth explaining, so it is both the natural next hint and the moment
the sliding-hint machinery has earned an abstraction.

Two things make this more than "port Sixteen's hint again":

**Netslide has something it can actually prove.** The Inertia precedent (the
non-deductive exemplar) is: find the one thing the game can *prove* and lead with
it. Netslide's is structural and is the whole insight of the game — **the centre
tile can never move at all**, because both the row and the column through it are
frozen, so the network has to be built *around* it. It follows that a tile in the
centre row can only be moved by sliding its column, and one in the centre column
only by sliding its row: those tiles have a single degree of freedom, they are the
hardest to place, and a hint that says so is teaching the technique rather than
reading out a move. Nothing like this exists in Fifteen or Sixteen, where every
tile can be pushed any which way.

**The planner is now a three-game asset stuck inside one game.** Sixteen's
`hint()` carries the hard-won part — a bucket-queue A* over full-slide moves, the
*no-progress gate* (engage the expensive exact search only at a strict local
minimum; without it, mid-game boards burned ~3s on a depth-capped search that
could never succeed before returning the forward partial plan anyway), and an
exact bidirectional BFS fallback for the swapped-pair endgames the heuristic
cannot see past. All of it lives inline in `sixteen/index.ts` and is written
against an `Int32Array` of tile values and toroidal slides — i.e. it is *already*
game-agnostic in everything but its home. That is exactly the second-consumer
promotion the playbook asks for.

## What Changes

- **Extract `src/native/engine/slide-planner.ts`**: the toroidal
  slide-puzzle planner, parameterised by the things that actually differ between
  games — the grid, which lines may be slid, the legal move set, and each piece's
  home cell. It keeps Sixteen's A* + no-progress gate + exact bidirectional
  fallback and its partial-plan behaviour verbatim.
- **Refactor Sixteen onto it** (the extraction is only real if its first consumer
  moves). Behaviour-preserving: Sixteen's existing hint tests, its render
  snapshot, and the cross-game `hint-resume.test.ts` are the guard, plus its
  `__lastHintEngagedFallback()` diagnostic, which pins that the no-progress gate
  still gates.
- **Add `Game.hint` + `hintKeepTrack` to Netslide**, planning slides that
  rebuild the network and narrating each by the consequence it actually has:
  a move that puts a piece in its final place, versus a setting-up move that
  brings one within reach — the "home vs helper" distinction
  [`AGENTS.md`](../../AGENTS.md) flags as the aspirational upgrade for
  Fifteen/Sixteen. It leads with the immovable centre, and it marks and holds a
  stable subgoal (the piece it is currently placing) the way Inertia does.
- **Render the hint** with the conventions the bar already fixes: the piece being
  placed and its destination in `COL_HINT`, the slide arrow highlighted, one
  firing = one multi-leg journey via `continuesPrevious`.
- **Netslide joins `hint-resume.test.ts`** — the cross-game guard for the
  recompute-stability failure Inertia paid for (a heuristic plan that sends the
  player one way, then the other way one move later, for ever).

## What this does NOT change

- No new *solver*. Netslide still has none: the hint plans against the
  generator's `aux` (the unshuffled grid), exactly as `solve` does, and refuses
  honestly ("Solution not known for this puzzle") when there is no `aux` — a
  descriptive `params:desc` id or a loaded save. Reconstructing the target grid
  from the scrambled pieces is a genuine jigsaw solve and is out of scope; see
  design D1 for why, and what it would take.
- No change to the `Game` interface, the `Midend`, or the app shell. The hint
  hooks, plan-carrying, `continuesPrevious` journeys and auto-hint pacing are all
  already generic.

## Impact

- Affected specs: **`netslide`** gains a hint requirement; **`ts-engine`** gains
  the shared slide-planner requirement.
- Affected code: `src/native/engine/slide-planner.ts` (new),
  `src/native/games/sixteen/index.ts` (refactored onto it — no behaviour change),
  `src/native/games/netslide/{index,render,hint}.ts`,
  `src/native/engine/hint-resume.test.ts` (netslide joins the roster).
- Risk to manage: the Sixteen refactor is the one place this change could
  *regress* something that works today. It is behaviour-preserving by
  construction and guarded by Sixteen's existing tests; design D3 states the
  escape hatch if the extraction turns ugly (keep the planner game-local, ship
  Netslide's hint on its own copy, and share only the vocabulary).
