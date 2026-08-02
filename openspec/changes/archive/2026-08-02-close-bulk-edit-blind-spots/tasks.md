# Tasks — close-bulk-edit-blind-spots

## 1. The checker

- [x] 1.1 `scripts/check-rename-shape.mjs`, generalised from the two ad-hoc
      checks `group-crowded-source-directories` wrote in a scratch directory and
      threw away. `--kind import|comment|any` (shape), repeated
      `--moved <fragment>` (scope), `--staged`.
- [x] 1.2 It reports **lines inspected** as well as offenders. Both checks report
      offenders, so a diff parser that parsed nothing would otherwise return a
      clean bill of health — precisely the `module-layering.test.ts` failure.
- [x] 1.3 **Not** wired into the gate, unchanged from the postmortem's reasoning:
      only the author knows a diff was meant to be a pure rename.
- [x] 1.4 Exercised on a live diff in both modes.

## 2. The `toContain` blind spot — verified, not assumed

- [x] 2.1 **Reproduce it first.** `abcd.test.ts:416` is
      `expect(text).toContain(".")`. Planting the original corruption
      (`state.ts:444` `"."` → `"./"`, which renders *every cell of every board*
      wrong) leaves **28/28 green**. Confirmed 2026-08-03, which turns the
      postmortem's guess into a measurement.
- [x] 2.2 Replace the four single-character assertions with
      `toMatchInlineSnapshot()` of the whole rendering — auto-filled, so nothing
      is transcribed by hand.
- [x] 2.3 **Verify the replacement fails on the same defect.** It does: 1 failed.
      A stronger assertion that has not been shown to fire is the same mistake
      one level up.
- [x] 2.4 `docs/test-strength.md` gains the trap, next to the other two
      can't-fail shapes, including the asymmetry: `not.toContain("x")` is
      *strengthened* by the superstring property, so only the positive form is
      blind.

## 3. Specs and close-out

- [x] 3.1 `repo-layout` — two ADDED requirements (shape-and-scope for bulk edits;
      an assertion distinguishes its value from a superstring).
- [x] 3.2 `openspec validate close-bulk-edit-blind-spots --strict`; full gate.
- [x] 3.3 Archive. Owner waived acceptance (2026-08-03) — the change is a script
      that runs nowhere automatically plus one test strengthened against a
      demonstrated defect, with no player-visible surface.

## 4. Handoff — the other 18 positive short-needle sites

- [x] 4.1 The list is the deliverable; the rewrites are deliberately **not** done
      here. Each needs its own expected value
      worked out, across ten games, with no demonstrated defect at any one of
      them — which is what made `abcd` worth changing and makes these blind
      churn. The documented trap is what stops the next one being written. The
      list, for whoever picks it up — **18** sites, counted 2026-08-03 (a grep
      returns twenty; two of the hits are this trap being *quoted* in
      `abcd.test.ts`'s explanatory comment). Two needles are two characters
      rather than one, and are blind for the same reason — a short needle in a
      small alphabet:

      | file | needles |
      | --- | --- |
      | `slide.test.ts` | `"fe"`, `"%"`, `"#"`, `"*"` |
      | `fifteen.test.ts`, `fifteen-render.test.ts` | `"1"`, `"3"`, `"1"`, `"15"` |
      | `sticks.test.ts` | `"#"`, `"|"`, `"."` |
      | `twiddle-render.test.ts` | `"1"`, `"9"` |
      | `seismic.test.ts` | `" "` |
      | `flip.test.ts` | `"+"` |
      | `singles-hint.test.ts` | `"4"` |
      | `salad.test.ts` | `"C"` |
      | `subsets.test.ts` | `"?"` |

      The text-format ones (slide, sticks, fifteen, twiddle, flip, salad) are the
      `toMatchInlineSnapshot` shape `abcd` now uses. `singles-hint.test.ts`'s
      `"4"` is a hint *explanation*, where the right assertion is the sentence,
      not a digit in it.
