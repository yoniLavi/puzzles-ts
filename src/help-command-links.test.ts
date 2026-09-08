// @vitest-environment happy-dom
/**
 * **Every `<command-link>` in the help names a command that exists.**
 *
 * The help pages invite a player to act — "open the
 * `<command-link command="settings:data">preferences</command-link>" — and
 * `command-link` renders as a real button only when the command is registered
 * on the screen around it. When it is not, the component **falls back to plain
 * inline text**, by design and on purpose: that is what lets the same markdown
 * serve a standalone help page, where no app is running.
 *
 * Which makes a typo invisible. `about:credit` for `about:credits` does not
 * throw, does not warn and does not look broken — it reads as an ordinary
 * sentence with one word that is not a link, on a page most readers will never
 * open. Nothing else in the gate can see it: the markdown is valid, the HTML is
 * valid, and the component is behaving exactly as specified.
 *
 * So the inventory is taken from the **screens themselves** rather than from a
 * list kept here — `Screen` registers `about`, `home` and `settings`, and each
 * subclass adds its own — and the help is checked against that. A command that
 * stops being registered fails this without anyone remembering to look.
 */
import "./test-setup/element-internals.ts";
import "./test-setup/indexeddb.ts";
import { describe, expect, it } from "vitest";
import { HomeScreen } from "./screens/home-screen.ts";
import { PuzzleScreen } from "./screens/puzzle-screen.ts";

/** Every help page's raw markdown, keyed by path. */
const helpPages = import.meta.glob<string>("../help/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * The commands a player can actually invoke, from the screens that register
 * them. `commandMap` is protected, and reaching past that is the point: the
 * alternative is a second copy of the list in this file, which is the thing
 * that rots.
 */
function registeredCommands(): Set<string> {
  const commands = new Set<string>();
  for (const screen of [new HomeScreen(), new PuzzleScreen()]) {
    const map = (screen as unknown as { commandMap: Record<string, unknown> })
      .commandMap;
    for (const name of Object.keys(map)) commands.add(name);
  }
  return commands;
}

/** Every `command-link` in the help, with the page and command it names. */
function helpCommandLinks(): { page: string; command: string; name: string }[] {
  const found: { page: string; command: string; name: string }[] = [];
  for (const [path, text] of Object.entries(helpPages)) {
    for (const m of text.matchAll(/<command-link\s+command="([^"]+)"/g)) {
      const command = m[1];
      // `Screen.handleCommand` splits on ":" and dispatches on the head; the
      // rest are arguments (a panel to open, say). So the head is what has to
      // be registered, and it is what `hasCommand` itself checks.
      found.push({ page: path, command, name: command.split(":")[0] });
    }
  }
  return found;
}

describe("every command-link in the help names a registered command", () => {
  const links = helpCommandLinks();
  const commands = registeredCommands();

  it("finds command links to check (sanity)", () => {
    // Vacuity guard, both sides: an unmatched glob or a changed attribute
    // spelling would leave every assertion below passing over nothing.
    expect(links.length).toBeGreaterThanOrEqual(8);
    expect(commands.size).toBeGreaterThanOrEqual(3);
  });

  it.each(links)("$page → $command", ({ command, name, page }) => {
    expect(
      commands.has(name),
      `${page} links to command "${command}", which no screen registers. ` +
        "`command-link` falls back to plain inline text when a command is " +
        "unknown, so this does not fail loudly anywhere — the sentence just " +
        `quietly stops being actionable. Registered: ${[...commands].sort().join(", ")}`,
    ).toBe(true);
  });
});
