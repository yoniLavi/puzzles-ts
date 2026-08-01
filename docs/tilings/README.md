# Aperiodic tiling reference diagrams

Upstream's own explanation of the **hat** and **spectre** aperiodic monotiles —
how a hat is assembled from kites, what the four metatile types (H, T, P, F)
expand into, and the kitemap/metamap lookup tables that drive the construction.

Start at [`hats.html`](hats.html); [`hatmaps.html`](hatmaps.html) covers the
generated tables.

**Why these live here.** They were written by Simon Tatham as
`puzzles/auxiliary/doc/`, documenting `hat.c` / `spectre.c` and the generators
that produced their tables. That C is gone — the tilings are native TypeScript
in [`src/native/engine/tilings/`](../../src/native/engine/tilings/), landed by
`add-aperiodic-tilings` and used by Loopy's Hats and Spectres grids. The
diagrams outlived the code they were written for, because what they explain is
the *construction*, which the port reproduces exactly. `retire-c-engine` moved
them out of `puzzles/` rather than deleting them with the rest of the tree.

They are unmodified upstream material, MIT-licensed with the rest of the
collection (see
[`licences/sgt-puzzles-LICENCE`](../../licences/sgt-puzzles-LICENCE)). Some references in
them point at C files that no longer exist here; read those as pointers into
upstream's repository, not this one.
