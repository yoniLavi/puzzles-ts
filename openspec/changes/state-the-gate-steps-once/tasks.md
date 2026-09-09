# state-the-gate-steps-once — tasks

## 1. Verify the census before editing anything

- [x] 1.1 Re-derive the gate's real command sequence from `scripts/gate.sh`
      rather than from any prose about it, and confirm the five copies and their
      five different errors. **The proposal's table is itself a prose census, so
      it gets the same treatment as any other.** — **It was wrong. There are
      eight copies, not five.** See Finding 1; the proposal's table is corrected
      by it rather than reprinted.
- [x] 1.2 Confirm `tsgo` appears in no live document and that `npm run typecheck`
      runs exactly the gate's two passes. If either has changed, the change's
      argument moves with it. — Both hold. `tsgo` appears in no live document at
      all (only two archived changes), and `npm run typecheck` is exactly
      `tsgo -b --noEmit && tsgo --noEmit -p tsconfig.node.json`, the gate's two
      passes.

## 2. The one enumeration

- [x] 2.1 `AGENTS.md` § "Git": state the full sequence, both `tsgo` passes
      included, in the order the script runs it, keeping every per-step rationale
      already there. Name `npm run gate` and `npm run typecheck`. — Nine numbered
      steps. Two rationales that had no home elsewhere are now stated there: why
      steps 5–7 sit ahead of the documentation-only shortcut, and the two
      scopings by role.
- [x] 2.2 Say *why* the enumeration is here and not elsewhere, in one sentence,
      so the next person who wants a copy in their own section knows the answer
      is a link.

## 3. The three references

- [x] 3.1 `AGENTS.md` § "Test discipline" pt 3 — kept the `vite build` argument,
      which is made nowhere else.
- [x] 3.2 `AGENTS.md` § "Test discipline", "The gate is not what gets trimmed".
- [x] 3.3 `docs/games/README.md` § "Close out" — cites `AGENTS.md` § "Git" by
      file + heading name, per the repo-layout guide rule.
- [x] 3.4 *(added)* `.husky/pre-commit` — the sixth copy, found by task 1.1.
- [x] 3.5 *(added)* `openspec/specs/build-pipeline/spec.md` § "Purpose" — the
      seventh. Edited directly rather than by a delta: no delta verb reaches a
      spec's preamble, and leaving it would have reproduced this change's own
      defect inside the spec that governs the gate.

## 4. The script's own header

- [x] 4.1 `scripts/gate.sh`'s header describes the shape and names no command
      that lives in its own body.
- [x] 4.2 Check the rest of the file's comments for the same defect. — Swept.
      The two surviving `tsc` mentions at lines 66–67 are the deliberate
      *explanation* of why the gate runs `tsgo` instead, which is the one place
      that word belongs. See Finding 3 for the two mentions elsewhere in the
      tree that were deliberately left alone.

## 5. The normative copies

- [x] 5.1 *(added)* `MODIFIED` delta on `build-pipeline` § "The pre-commit gate
      minimizes wall-clock without dropping checks" — 179 lines, 9 scenarios —
      replacing the enumerate-and-count sentence with a property. **Verified by
      shape, not by the validator alone**: the delta was seeded verbatim from the
      live requirement and diffed against it, and the diff is exactly the
      intended hunks with all 9 scenarios byte-identical.
- [x] 5.2 *(added)* `MODIFIED` delta on § "Continuous integration runs the full
      gate on push to main" — same treatment, 3 scenarios, one hunk.
- [x] 5.3 `openspec validate state-the-gate-steps-once --strict` — valid.

## 6. Close

- [x] 6.1 Re-run the citation guard: this change edits `AGENTS.md` and
      `docs/games/`, both scanned.
- [x] 6.2 `npm run gate`.
- [x] 6.3 Archive under self-driven initiative.

## Findings

### Finding 1 — the census in the proposal was itself a prose census, and it was wrong

The proposal counted five copies of the gate's step list. Task 1.1 existed
because a proposal's table is a claim like any other, and it caught three more:

| # | Copy | Kind |
| --- | --- | --- |
| 1 | `scripts/gate.sh` header | comment, contradicting its own body 8 lines below |
| 2 | `.husky/pre-commit` header | comment — **missed by the proposal** |
| 3 | `AGENTS.md` § "Test discipline" pt 3 | prose |
| 4 | `AGENTS.md` § "Test discipline", trimming rule | prose |
| 5 | `AGENTS.md` § "Git" | prose |
| 6 | `docs/games/README.md` § "Close out" | prose |
| 7 | `build-pipeline` spec § "Purpose" | **normative doc** — missed |
| 8 | `build-pipeline` spec, the gate requirement | **a `SHALL`** — missed |

**The eighth is the one that matters and the one the proposal's grep style could
not see.** It reads *"The pre-commit gate SHALL run all six checks"* and names
them. The gate runs eleven. That is a bare count in the present tense inside a
normative requirement — the exact shape `AGENTS.md` § "Method" says rots — and it
was also the least likely copy to be found by someone fixing "the docs", because
nobody thinks of a spec as a place a recipe hides.

Had this change shipped its original scope, it would have declared "one
enumeration" while leaving three more, one of them a `SHALL`. That is the failure
mode the proposal was written to avoid, one layer out.

### Finding 2 — `tsgo` replaced `tsc` on 2026-08-05 and reached no document at all

`a8ff83ec` switched the gate to `tsgo` (`@typescript/native-preview`) thirty-five
days before this change. In that time **`tsgo` appeared in no live document** —
only in two archived changes — while all eight copies above continued to name
`tsc`, including `scripts/gate.sh`'s own header, eight lines above the line that
runs `tsgo`.

So the drift was never "somebody forgot to add a check". A tool was replaced,
every copy of the recipe kept the old name, and the only place a reader could
have learned the truth was the executable itself. `npm run typecheck` runs
exactly what the gate runs and was named nowhere; a session checking its work by
hand ran a different compiler from the one that would judge the commit.

### Finding 3 — two mentions of `tsc` were left alone on purpose, and the rule is the same one

Not every stale-looking word is stale. Two were kept:

- **The CI requirement quotes its own superseded text** — *"no valid asset-free
  CI tier (a no-asset job fails at `tsc -b`)"* — introduced by the sentence
  "This reverses the original requirement, which stated…". It is a quotation of
  what the spec used to say. Rewriting it would falsify the record inside the
  sentence explaining the record.
- **`scripts/check-rename-shape.mjs` narrates a past incident** — *"`tsc`, biome,
  the full suite and `vite build` were all green"* — describing what did not fail
  when `retire-native-directory` corrupted a dozen games' output. It is history,
  and history keeps the words it was written in (`AGENTS.md` § "Spelling" makes
  the same carve-out for the archive and the postmortems).

The distinction is exactly the one this change turns on: **a recipe is followed,
a record is read.** A recipe must be true now or retired; a record must stay what
it was.
