# Tasks — separate-agents-md-from-history

## 1. Sweep before removing — the whole risk lives here

- [x] 1.1 Grep the sections being removed for normative language; check each hit
      is already stated in a retained section, or lift it. **Two were stated
      nowhere else**, both load-bearing and both rediscovered repeatedly: *"a
      guard must measure the thing it claims to guard, not a neighbour"* (twice
      in the chronicle, absent from `docs/` and `openspec/specs/`) and *"prove a
      guard fails before trusting it"* (absent from both).
- [x] 1.2 Lift them, plus the vacuity guard, verify-by-shape,
      check-the-instrument (including its dependency form) and "an optimised
      artefact needs its bounds asserted", into a new
      `## Method: make the check check the thing`.
- [x] 1.3 **Second sweep, before the deletion** — and it found a third rule the
      first had missed, *"do not repoint a dead recipe — retire it"*, together
      with its companion about checking what a deleted generator asserted. Now in
      `## Method`. **The sweep is not a formality; it has a hit rate.**

## 2. Remove the chronicle

- [x] 2.1 First cut moved `What's been done`, `Migration order`, `Helper
      extractions: status` and `C deletion: per game` to a new
      `docs/project-history.md`, **verbatim**, by script — so the move was
      checkable by shape rather than by reading. Verified: 255 lines removed from
      `AGENTS.md`, **0 added**, all 255 present verbatim in the destination.
- [x] 2.2 **Then deleted that document instead**, on the owner's challenge. The
      claim "the archive already holds this" was checked, not assumed: 59 of the
      64 change ids it named resolve to an archived change directory, and the
      five that do not are withdrawn work, two of which already have postmortems.
      The workflow produces the record; a maintained digest of it is a third copy
      with a tax and no reader.
- [x] 2.3 Repoint `README.md`, `openspec/config.yaml` and `AGENTS.md` at the
      archive and the git log.

## 3. Sweep what remains

- [x] 3.1 `Approach: top-down, product-value first` was a plan whose every item
      is complete. Replaced by `## Acceptance bar`, carrying the one rule that
      still binds: owner acceptance over a green suite, and never "cosmetic" /
      "out of scope" / deferred without approval.
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

## 4. Narrow the acceptance gate

- [x] 4.1 `AGENTS.md` § "Work management": a change the agent scoped and decided
      is implemented, verified, committed **and archived** in one session.
      Acceptance narrows to player-visible work, work the owner named, and
      compatibility breaks — the last raised *before* the work, not after.
- [x] 4.2 Spec it, so the rule is enforceable rather than advisory: an ADDED
      `repo-layout` requirement with the three exceptions as scenarios.
- [x] 4.3 **Apply it to this change**, which is its own first case — an agent-
      scoped documentation restructure, archived without a checkpoint.

## 5. Verify

- [x] 5.1 `AGENTS.md` **581 → 443 lines** — 255 lines of chronicle out, ~117 of
      method and acceptance rules in. Zero chronicle markers (`landed`,
      `owner-accepted`, `owner-confirmed`, `~~`), every relative link resolving.
- [x] 5.2 Full gate green.
