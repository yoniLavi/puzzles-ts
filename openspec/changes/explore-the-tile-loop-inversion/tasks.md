# explore-the-tile-loop-inversion — tasks

## 0. The exploration (`/opsx:explore`) — this change is not ready without it

Run before any design. Each task below is a measurement with a stated vacuity
number, because the population is 57 and every instrument this repo has pointed
at the render layer has over- or under-reported.

- [ ] 0.1 **Take the number.** For every game, read `redraw` and split its body
      into (a) bookkeeping the framework could own — background fill on first
      frame, pack overlays, the per-cell diff test, the commit, `drawUpdate`,
      clip/unclip — and (b) the game's own painting. Report per game, and report
      the *median*, not only the total: the vision's "~80 lines" is a claim about
      a typical game and the total can be carried by a handful of large ones.
      State how many `redraw` bodies were read.
- [ ] 0.2 **Classify the repaint unit.** For each game: is the unit one tile, a
      tile plus named neighbors (Towers' four-way clip), a sub-cell entity
      (edges, vertices, walls), or the whole board (Inertia, Untangle)? The
      inversion serves only the first class cleanly, and the second is where it
      either generalizes or contorts. Give the counts.
- [ ] 0.3 **Check what already ships**, deliverable by deliverable — this is row
      4's lesson and it is the one that cost the most: *a deliverable list is a
      checklist, so walk it.* For each of presentation.md's promises (loop, cache,
      miss test, overlay sidecars, commit, first-frame fill, palette derivation,
      animation scheduling, blitter sprites), name what in `src/engine/` already
      provides it and how many games consume it.
- [ ] 0.4 **Measure the defect the inversion claims to kill by construction.**
      The hint overlay already has a derived paint-twice guard
      (`hint-overlay.test.ts`, 30 games). The mistake overlay does not. Drive
      whatever games can be driven to a mistaken board and check whether any of
      them actually has the "overlay not in the diff key" bug *today*. **If none
      does, the construction argument is worth much less than it sounds**, and
      say so plainly rather than keeping it as motivation.
- [ ] 0.5 **Name the falsifier before designing, and honor it.** Proposed:
      *fewer than half of the 57 games have a one-tile repaint unit, or the
      per-game bookkeeping median is under ~30 lines, or 0.4 finds no live defect
      of the class.* Any of those and the change is withdrawn with a postmortem
      under `openspec/postmortems/`, in the shape rows 3–5 established.
- [ ] 0.6 **Look for the mechanic-keyed alternative while measuring.** Rows 3 and
      4 each produced a better, narrower change than the one they killed
      (`unify-the-note-taking-cell`, `unify-the-board-origin`). The likeliest
      here is the mistake overlay's staleness in the games not using
      `OverlaySidecar`. Report it as its own candidate whatever the verdict on
      the inversion.

## 1. Report

- [ ] 1.1 Write the findings into § Findings below — the measurements, with their
      vacuity numbers, whether or not the change survives.
- [ ] 1.2 Update `docs/framework-rdd/presentation.md` **in place** with the
      verdict, citing this change. If withdrawn, strike it through and keep the
      argument, as `game-definition.md` does for the gesture table and the board
      model; if it survives, mark what was measured and leave the rest fiction.
- [ ] 1.3 Put the owner question from the proposal — *does framework work
      continue to precede the first greenfield game?* — in front of the owner
      with the measurement attached, so it is answered against evidence rather
      than in the abstract.

## 2. Only if it survives

- [ ] 2.1 Rewrite this change's proposal as a ready one, with the exemplar named
      up front and the scene-graph postmortem's bar addressed explicitly: which
      real game is pressuring it, and what measurement will show the inversion
      costs no frames.
- [ ] 2.2 Otherwise, scaffold whichever narrower change 0.6 found and withdraw
      this one.

## Findings

_(none yet — not started)_
