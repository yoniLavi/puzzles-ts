# Tasks — separate-agents-md-from-history

## 1. Sweep before deleting — the whole risk lives here

- [x] 1.1 Grep the sections being moved for normative language and check each hit
      is already stated in a retained section, or lift it. **Two were stated
      nowhere else**, both load-bearing and both rediscovered repeatedly:
      *"a guard must measure the thing it claims to guard, not a neighbour"*
      (twice in the chronicle, absent from `docs/` and `openspec/specs/`) and
      *"prove a guard fails before trusting it"* (absent from both).
- [x] 1.2 Lift them, plus the vacuity guard, verify-by-shape, check-the-instrument
      (including its dependency form) and "an optimised artefact needs its bounds
      asserted", into a new `## Method: make the check check the thing`.

## 2. Move, mechanically

- [x] 2.1 Move `What's been done`, `Migration order`, `Helper extractions: status`
      and `C deletion: per game` to `docs/project-history.md`, **verbatim**, by
      script — so the move is checkable by shape and no prose rewrite hides
      inside it.
- [x] 2.2 **Verified by shape**: 255 lines removed from `AGENTS.md`, **0 added**,
      and all 255 present verbatim in the new file. The first attempt at this
      check was a shell loop whose `grep -Fqx "$l"` read any content line
      starting with `-` as an option and reported dozens of false orphans — the
      quoting minefield the project's own guidance warns about, which is why the
      check is a script.
- [x] 2.3 Retitle the moved sections so they read as record rather than as live
      status ("The changes, in order, and what each one found").

## 3. Sweep what remains

- [x] 3.1 `Approach: top-down, product-value first` was a plan whose every item is
      complete. Replaced by `## Acceptance bar`, carrying the one rule that still
      binds: owner acceptance over a green suite, and never "cosmetic" / "out of
      scope" / deferred without approval.
- [x] 3.2 Restate past-tense passages as present-tense rules — `Project at a
      glance`, `Upstream policy`, `Goal`, the byte-parity subsection, `Repo
      layout`, `Documentation`, the openspec version-floor rationale, and
      `Long-tail migration risks` (now `Traps that catch new game work`, since
      three of its four entries were rules wearing a risk's clothing).
- [x] 3.3 Drop the struck-through `Known unresolved questions` entries — a
      question answered is not an open question, and strikethrough is a diff
      annotation.
- [x] 3.4 Repoint cross-references to renamed sections; confirm every relative
      link in `AGENTS.md` resolves.

## 4. Verify

- [x] 4.1 `AGENTS.md` **581 → 416 lines**, with zero occurrences of the chronicle
      markers (`landed`, `owner-accepted`, `owner-confirmed`, `~~`).
- [ ] 4.2 Full gate green.
- [ ] 4.3 Owner acceptance, then archive.
