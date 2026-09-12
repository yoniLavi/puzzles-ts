# Write the spec purposes

## 1. Re-take the population

- [x] 1.1 List the placeholder specs with the query, not the proposal's count:
      `grep -l "TBD - created by archiving" openspec/specs/*/spec.md`. Also grep
      for a bare `TBD`/`TODO` Purpose, which 1.11's check matches too. Record the
      count here; it is the vacuity check for 3.2.
      **Measured 2026-09-12: 66 of 71 specs carry the placeholder; no other
      Purpose opens with `TBD` or `TODO`.**

## 2. Write the purposes

- [x] 2.1 For each spec, read its requirement headings (and the change named in
      the placeholder, if the headings leave the capability unclear), then write
      one or two sentences saying **what the capability is for** — not a summary
      of its requirements, not the history of the change that created it. At
      least 50 characters (`validate --strict`'s floor for a Purpose). Model:
      `ts-engine`'s and `ts-migration`'s existing Purposes.
      Each game's rule clause was taken from its page in `help/games/`, not
      from memory of the puzzle.
- [x] 2.2 Game specs share a shape, so keep their Purposes parallel without making
      them identical: the puzzle in a clause, then what this port adds that is
      particular to it (a hint, a mode, a divergence). A Purpose that would be
      true of any game says nothing.
- [x] 2.3 Batch commits by whatever keeps a diff readable. Verify each by shape:
      every changed line in the diff is inside a `## Purpose` section, and no
      requirement or scenario line moved.
      One commit: each file changes one block. Verified by stripping the
      Purpose section from both sides of all 66 specs and comparing — identical
      in every file — and every removed line is a placeholder.

## 3. Upgrade openspec

- [x] 3.1 Check the current openspec release and read its changelog from 1.11.0
      onward for breaking changes and new strict-mode checks — the 2026-09-12
      reading found none beyond the Purpose warning, and a newer release may add
      one.
      1.13.0 is still the latest; the package ships no changelog, so the GitHub
      release notes for 1.11.0–1.13.0 were read. The Purpose warning is the only
      new strict check; 1.13.0's archive and delta-parser fixes only narrow
      silent loss.
- [x] 3.2 `npm install -D @fission-ai/openspec@^<latest>`, then
      `npx openspec update`. Run `openspec validate --all --strict` and confirm it
      reports zero failures across the same number of items section 1 counted
      plus the rest of the tree.
      79 passed, 0 failed: the 71 specs and the 8 open changes, no warnings.
      Planting one placeholder back into a copy of `openspec/` fails it.
- [x] 3.3 `AGENTS.md` names no openspec version number (it points at
      `package.json`); confirm nothing else in `docs/` or `scripts/` states the
      pin as a current fact. Historical mentions (the version floor's comment,
      postmortems) stay.
      The only survivors are the floor's history comment and `AGENTS.md`'s dated
      "read … through openspec 1.13.0", both records of a reading.
- [ ] 3.4 Full gate, then archive.
