/**
 * **A `## MODIFIED Requirements` delta must reproduce the requirement it is
 * modifying — all of it.**
 *
 * `openspec archive` replaces the live requirement with whatever the delta
 * contains, so a delta written against a *stale* copy deletes everything added
 * to that requirement since. This is not hypothetical and not cheap: archiving
 * `disambiguate-hint-deixis` silently removed **134 lines** of the `ts-engine`
 * hint requirement — the whole Check / Tactic / Search taxonomy and four of its
 * scenarios, a change's worth of work from `audit-guessing-tier-names` — because
 * the delta had been scaffolded from an earlier copy. It was caught by reading
 * `git diff` after the archive, which is not a control.
 *
 * `openspec validate --strict` cannot catch it: a MODIFIED delta needs a SHALL
 * and one scenario, and a partial one has both. `OPENSPEC_AGENTS.md` has warned
 * about the pitfall in prose since long before this happened, which is the
 * lesson rather than a mitigation — **a rule with no instrument is a rule that
 * holds until someone is in a hurry.**
 *
 * The decidable proxy is **scenario names**. Prose cannot be diffed
 * meaningfully, but scenarios are named and enumerable, and dropping them is
 * exactly what a stale copy does. Renaming one deliberately trips this too, and
 * that is intended: it forces the author to look at the live requirement, which
 * is the whole of what went wrong here.
 *
 * **It found two more the moment it ran**, neither yet archived and both
 * therefore still fixable: `add-latin-repeats-support` would have dropped two
 * Salad scenarios, and `add-slide-keyboard-control` two Slide ones.
 * `walk-tactic-hint-chains` was worse and became the demonstration of the other
 * half of the rule — it modified this same hint requirement and would have taken
 * **eleven** scenarios with it, so it is an ADDED requirement now, which is what
 * `OPENSPEC_AGENTS.md` prescribes for a delta that adds a concern rather than
 * changing one. Three of four active MODIFIED deltas were unsafe; the practice
 * was not "usually right".
 *
 * Unrelated trap, met twice while writing those deltas and cheap to pass on:
 * `openspec validate` reads a requirement's *first line* as its text, so a
 * requirement whose `SHALL` falls on the second line is rejected as having none.
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

interface Requirement {
  name: string;
  scenarios: string[];
}

/**
 * Requirements and their scenario names, from a spec or delta file. `section`
 * limits the scan to one `## <section> Requirements` block — deltas keep ADDED
 * and MODIFIED in one file, and only MODIFIED replaces anything.
 */
function parseRequirements(md: string, section?: string): Requirement[] {
  const out: Requirement[] = [];
  let inSection = section === undefined;
  let current: Requirement | null = null;
  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) {
      if (section !== undefined)
        inSection = line.trim() === `## ${section} Requirements`;
      current = null;
      continue;
    }
    if (!inSection) continue;
    if (line.startsWith("### Requirement:")) {
      current = { name: line.slice("### Requirement:".length).trim(), scenarios: [] };
      out.push(current);
      continue;
    }
    if (line.startsWith("#### Scenario:") && current) {
      current.scenarios.push(line.slice("#### Scenario:".length).trim());
    }
  }
  return out;
}

/** Scenario names the live requirement has and the delta's copy does not. */
function droppedScenarios(live: Requirement, delta: Requirement): string[] {
  const kept = new Set(delta.scenarios);
  return live.scenarios.filter((s) => !kept.has(s));
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

describe("openspec MODIFIED deltas reproduce the whole requirement", () => {
  it("detects a delta that drops a scenario, and passes one that keeps them", () => {
    // The instrument, tested against a case whose answer is known — because the
    // sweep below asserts nothing on a day when no active change modifies a
    // requirement, and a checker nobody has seen fail is a checker nobody has
    // seen work.
    const live = parseRequirements(
      [
        "### Requirement: A thing SHALL hold",
        "",
        "#### Scenario: The old one",
        "",
        "#### Scenario: The other old one",
      ].join("\n"),
    )[0];
    const stale = parseRequirements(
      [
        "## MODIFIED Requirements",
        "",
        "### Requirement: A thing SHALL hold",
        "",
        "#### Scenario: The old one",
        "",
        "#### Scenario: A new one",
      ].join("\n"),
      "MODIFIED",
    )[0];
    expect(droppedScenarios(live, stale)).toEqual(["The other old one"]);

    const faithful = parseRequirements(
      [
        "## MODIFIED Requirements",
        "",
        "### Requirement: A thing SHALL hold",
        "",
        "#### Scenario: The old one",
        "",
        "#### Scenario: The other old one",
        "",
        "#### Scenario: A new one",
      ].join("\n"),
      "MODIFIED",
    )[0];
    expect(droppedScenarios(live, faithful)).toEqual([]);
  });

  it("finds the specs and the active deltas at all", () => {
    // The "how many did I look at?" guard. An unmatched glob is `{}`, and the
    // sweep below would then report a clean bill of health over nothing — the
    // silent failure this repo has now met five times.
    expect(Object.keys(liveSpecs).length).toBeGreaterThan(50);
    expect(Object.keys(deltaSpecs).length).toBeGreaterThan(0);
    // …and the archive stays out of it, or the sweep would judge history.
    for (const path of Object.keys(deltaSpecs)) {
      expect(path).not.toContain("/changes/archive/");
    }
  });

  it("every active change's MODIFIED delta keeps the live requirement's scenarios", () => {
    for (const [path, md] of Object.entries(deltaSpecs)) {
      const modified = parseRequirements(md, "MODIFIED");
      if (modified.length === 0) continue;
      const { change, capability } = locate(path);
      const livePath = `../openspec/specs/${capability}/spec.md`;
      const liveMd = liveSpecs[livePath];
      expect(
        liveMd,
        `${change}: MODIFIED delta for '${capability}', which has no live spec`,
      ).toBeDefined();
      if (!liveMd) continue;
      const live = parseRequirements(liveMd);
      for (const delta of modified) {
        const match = live.find((r) => r.name === delta.name);
        expect(
          match,
          `${change}/${capability}: MODIFIED "${delta.name}" matches no requirement in the live spec` +
            " — a renamed or mistyped header, which archives as a brand-new requirement",
        ).toBeDefined();
        if (!match) continue;
        expect(
          droppedScenarios(match, delta),
          `${change}/${capability}: MODIFIED "${delta.name}" drops scenarios the live` +
            " requirement has; archiving would delete them. Re-copy the requirement" +
            " from the live spec and re-apply the edit (OPENSPEC_AGENTS.md," +
            ' "Authoring a MODIFIED requirement correctly")',
        ).toEqual([]);
      }
    }
  });
});
