/**
 * **An open change's spec deltas may only add.** A delta that edits, removes or
 * renames an existing requirement is refused here; the edit is made directly in
 * `openspec/specs/<capability>/spec.md` when the change is archived.
 *
 * The hazard this closes is specific and has already cost real work. `openspec
 * archive` *replaces* a live requirement with whatever a `MODIFIED` delta
 * contains, and that delta is a **full copy taken at one moment and applied at
 * another** — scaffolded when the change was written, applied when it was
 * archived, with days and other changes in between. Nothing keeps the copy
 * fresh. Archiving `disambiguate-hint-deixis` (2026-08-15) silently removed
 * **134 lines** of the `ts-engine` hint requirement, and it was caught by
 * reading `git diff` afterwards, which is not a control.
 *
 * The previous version of this file policed that copy instead of removing it:
 * it compared scenario *names* between the delta and the live requirement and
 * failed when the delta dropped one. It worked — three of the four then-active
 * `MODIFIED` deltas were unsafe — and that hit rate is the argument against the
 * mechanism rather than for the check. Two things it could never do: prose
 * inside a requirement has no name to enumerate, so a copy that drops the
 * paragraph explaining *why* a rule exists passes; and nothing made a delta
 * target the requirement it claimed to. Converting the three open deltas found
 * exactly that — `add-slide-keyboard-control` narrated the removal of a sentence
 * that lives in a different requirement, so archiving it would have left the
 * sentence in place under a spec that said it was gone.
 *
 * `openspec validate --strict` cannot see either: a partial copy still has a
 * `SHALL` and a scenario, so it is a structurally valid delta describing a
 * smaller requirement.
 *
 * **Why all three verbs and not just `MODIFIED`.** Only `MODIFIED` carries a
 * copy, so only it can delete content silently; `REMOVED` names a requirement
 * plus a reason, and `RENAMED` is a `FROM:`/`TO:` pair. Their staleness is
 * milder — the *decision* ages, not the text. They are banned anyway, because
 * "`ADDED` is the only verb" is a rule with nothing to remember and a check that
 * cannot be subtly wrong, whereas a per-verb carve-out re-opens "is this one
 * safe?" at every use. An in-place removal is an ordinary diff to the spec,
 * legible in `git log openspec/specs/<capability>/spec.md`; the reason for it
 * goes in the change's `proposal.md`, where the `**Reason**`/`**Migration**`
 * prose of a `REMOVED` block was already being written by hand.
 *
 * The archive is deliberately out of scope: its 112 non-`ADDED` deltas were
 * authored under the previous scheme and are history. Rewriting them would risk
 * the very loss the rule prevents.
 *
 * Reads the markdown through `import.meta.glob` rather than `node:fs`,
 * following `asset-integrity.test.ts` and `palette-source.test.ts`: it keeps the
 * test inside the browser-shaped type world and preserves the project's
 * `"types": []` posture. That carries the glob's own hazard — an unmatched glob
 * yields `{}` and every assertion below would pass over nothing — so both sets
 * are counted before they are used.
 */
import { describe, expect, it } from "vitest";

/**
 * The live specs, and the *active* changes' deltas.
 *
 * The single `*` after `changes/` is what excludes the archive: an archived
 * delta sits at `changes/archive/<date-name>/specs/…`, one level deeper, so it
 * cannot match. That is deliberate — an archived delta was written against the
 * spec of its day and is history, not a claim about the spec now.
 */
const liveSpecs = import.meta.glob<string>("../openspec/specs/*/spec.md", {
  query: "?raw",
  import: "default",
  eager: true,
});
const deltaSpecs = import.meta.glob<string>("../openspec/changes/*/specs/*/spec.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * The openspec instruction file, which still documents the retired mechanism in
 * its own voice — it is upstream openspec's text, regenerated wholesale by
 * `openspec update`. The project override that countermands it therefore has a
 * deletion scheduled for whenever that command is next run, and its loss would
 * be silent: the guidance would simply go back to prescribing `MODIFIED`, with
 * only the commit gate disagreeing and no explanation of why.
 */
const openspecInstructions = import.meta.glob<string>(
  "../openspec/OPENSPEC_AGENTS.md",
  { query: "?raw", import: "default", eager: true },
);
const PROJECT_OVERRIDE_MARKER = "PROJECT OVERRIDE — re-apply after `openspec update`";

/**
 * The delta verbs that are not `ADDED`, i.e. every openspec operation that acts
 * on a requirement the live spec already has.
 */
const EDITING_VERBS = ["MODIFIED", "REMOVED", "RENAMED"] as const;

/**
 * Editing-verb headings in a delta, with their line numbers.
 *
 * Matched **more loosely than openspec applies them** (`##` plus any run of
 * spaces, and the verb alone is enough — `Requirements` is not required to
 * follow). A guard over-approximating the hazard is the right way round here:
 * a heading openspec fails to recognise is inert and harmless, so the only cost
 * of a wider match is being told not to write a heading that would not have
 * worked anyway. Ordinary `##` prose sections are untouched — four archived
 * deltas carry `## Types`, `## Testing`, `## Registration` and
 * `## Game interface methods`, and those are fine.
 */
function editingVerbHeadings(md: string): { line: number; text: string }[] {
  const pattern = new RegExp(`^##\\s+(${EDITING_VERBS.join("|")})\\b`);
  return md
    .split("\n")
    .map((text, i) => ({ line: i + 1, text: text.trim() }))
    .filter((entry) => pattern.test(entry.text));
}

/**
 * `<change>` and `<capability>` out of a delta path.
 *
 * Cut at the two markers and **throw** when either is missing, rather than
 * indexing into the split — path arithmetic keyed to depth is what silently
 * turned a game id into `".."` in `group-crowded-source-directories`, and this
 * file's own depth is exactly the kind of thing a later move changes.
 */
function locate(path: string): { change: string; capability: string } {
  const match = /\/changes\/([^/]+)\/specs\/([^/]+)\/spec\.md$/.exec(path);
  if (!match) throw new Error(`unrecognised delta path: ${path}`);
  return { change: match[1], capability: match[2] };
}

describe("an open change's spec deltas only add", () => {
  it("detects each editing verb, and passes a delta that only adds", () => {
    // The instrument, tested against cases whose answers are known — because the
    // sweep below asserts nothing on a day when every active delta is clean, and
    // a checker nobody has seen fail is a checker nobody has seen work.
    for (const verb of EDITING_VERBS) {
      const found = editingVerbHeadings(
        ["# delta", "", `## ${verb} Requirements`, "", "### Requirement: A thing"].join(
          "\n",
        ),
      );
      expect(found.map((f) => f.text)).toEqual([`## ${verb} Requirements`]);
      expect(found[0].line).toBe(3);
    }

    expect(
      editingVerbHeadings(
        [
          "# delta",
          "",
          "## ADDED Requirements",
          "",
          "### Requirement: A thing SHALL hold",
          "",
          "#### Scenario: It holds",
          "",
          "## Testing",
          "",
          "Prose about how the requirement above is checked.",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("finds the specs and the active deltas at all", () => {
    // The "how many did I look at?" guard. An unmatched glob is `{}`, and the
    // sweep below would then report a clean bill of health over nothing — the
    // silent failure this repo has now met six times.
    expect(Object.keys(liveSpecs).length).toBeGreaterThan(50);
    expect(Object.keys(deltaSpecs).length).toBeGreaterThan(0);
    // …and the archive stays out of it, or the sweep would judge history.
    for (const path of Object.keys(deltaSpecs)) {
      expect(path).not.toContain("/changes/archive/");
    }
  });

  it("the openspec instructions still carry the project override", () => {
    const entries = Object.entries(openspecInstructions);
    // Vacuity guard again: a moved or renamed instruction file must fail loudly
    // rather than let the marker check pass over an empty set.
    expect(entries.length, "openspec/OPENSPEC_AGENTS.md was not found").toBe(1);
    const [path, md] = entries[0];
    expect(
      md,
      `${path} has lost the project-override block. \`openspec update\` regenerates` +
        " this file from upstream's text, which prescribes the retired MODIFIED" +
        " mechanism; without the override the instructions and the commit gate" +
        ' contradict each other. Re-apply the block (AGENTS.md, "Work management")',
    ).toContain(PROJECT_OVERRIDE_MARKER);
  });

  it("no active change's delta edits, removes or renames a live requirement", () => {
    for (const [path, md] of Object.entries(deltaSpecs)) {
      const headings = editingVerbHeadings(md);
      if (headings.length === 0) continue;
      const { change, capability } = locate(path);
      expect(
        headings.map((h) => `line ${h.line}: ${h.text}`),
        `${change}/${capability}: a delta may only use '## ADDED Requirements'.` +
          " An edit to an existing requirement is made directly in" +
          ` openspec/specs/${capability}/spec.md as part of archiving, reading the` +
          " live text at the moment it edits it, with the intent stated in prose" +
          ' in the change\'s proposal.md (AGENTS.md, "Work management")',
      ).toEqual([]);
    }
  });
});
