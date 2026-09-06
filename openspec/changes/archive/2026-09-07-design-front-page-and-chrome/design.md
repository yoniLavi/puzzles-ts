# Design — design-front-page-and-chrome

## 1. Inventory: what a redesign touches

Split by whether a change needs a *drawn decision* (layout) or is a *retheme in
one place* (tokens). Measured against the running app at
`localhost:5231`, Chrome, 2026-09-06.

### Tokens — retheme in one place

| Where | What it holds |
| --- | --- |
| `src/css/common.css` | The page ground (`--wa-color-brand-fill-quiet`) and the bar (`--app-theme-color` → `--wa-color-brand-fill-normal`); the responsive token block (`--app-size`, `--app-padding`, `--app-gap`, `--app-spacing`, `--app-title-font-size`) and the three breakpoints that rescale `--wa-space-scale`. |
| `src/css/native.css` | Bare-element type: `h1`–`h6`, `p`, lists, `hr`, `small`, link color and underline offset. The type scale lives here, in Web Awesome font-size tokens. |
| `src/css/wa-tweaks.css` | Web Awesome component corrections (button appearance, dropdown caret rotation, Lucide's square icon box). Mechanical, not aesthetic. |
| `vite.config.ts:462-463` | `background_color: "#e8f3ff"` and `theme_color: "#d1e8ff"` — **the resolved values of the two tokens above, typed out as hex**. A retheme that misses these ships a manifest whose splash and status bar disagree with the app. |
| `src/css/help.css`, `help-page.css` | The help pages' own type and layout. |

The whole chrome palette today is Web Awesome's stock `brand` blue. Nothing in
the tree chooses a brand hue; the app is the default theme showing through.

### Layout — needs a drawn decision

| Surface | Files |
| --- | --- |
| Front-page header (static, pre-hydration) | `templates/index.html.hbs` — logo, `h1`, tagline, a plain `<a>` Help styled as a button. |
| Front-page header (interactive) | `src/screens/home-screen.ts` `renderWideHeader` / `renderCompactHeader`; `src/css/home-screen.css` — sticky bar, `grid-template-areas` logo/title/subtitle/controls, and the scroll-shrink animation (four `@keyframes`, plus a JS fallback via `ScrollAnimationController`). |
| Intro + catalog | `home-screen.ts` `renderIntro` / `renderPuzzleGrid` / `renderCatalogCard`; `home-screen.css`. |
| Catalog card | `src/components/catalog-card.ts` — 64px icon, title, favorite heart, in-progress badge, "Experimental" stamp, objective text. |
| Puzzle app bar | `src/screens/puzzle-screen.ts` `render()` + styles (`header`, from line 1027); `src/puzzle/components/type-menu.ts`, `other-puzzles-menu.ts`. |
| Puzzle toolbar | `puzzle-screen.ts` `footer`; `src/puzzle/components/history.ts` (the button group), `keys.ts` (the keypad), `renderMouseButtonToggle`. |
| Board frame | `puzzle-screen.ts` `puzzle-view-interactive` block — the gray `--background-color: surface-default` panel the canvas sits in. |
| Panels and overlays | `src/puzzle/components/end-notification.ts`, `history.ts` (the dropdown panel), `src/components/reference-panel.ts`. |
| Dialogs | `src/dialogs/` — about, settings, share, enter-gameid, saved-game, alert, crash, toast. All Web Awesome `wa-dialog`; they inherit tokens and need no bespoke layout. |

### What the "before" shots show

Screenshots at 1440×900 and 390×844, light scheme (session scratchpad,
`before/`). Four things a redesign has to answer, three of them defects rather
than matters of taste:

1. **Two content axes fight on the front page.** The intro is
   `max-width: 61ch; margin: 0 auto` (centered); the card grid is
   `max-width: 75rem` starting at the left padding. At desktop width the prose
   floats mid-viewport while the cards sit hard left — a visible jag.
2. **The phone app bar overflows.** `header` is a non-wrapping flex row with no
   min-width budget: at 390px "Other puzzles" runs under the Help button and
   the type menu truncates to `7…`.
3. **The board panel wastes most of its area.** The gray surface fills the flex
   region while the canvas is centered small inside it — at desktop the board
   is roughly a third of the panel's width, framed by dead gray.
4. **Hint has the same weight as Redo.** The toolbar is up to eight icon-only
   buttons in one `wa-button-group` — undo, history, hint, auto-hint,
   reference, redo, mark-all, quick-save. The explained hint is this fork's
   headline value and the reason the project exists; it is a small bulb among
   seven identical neighbors, in the bottom-right corner, away from the thumb.

## 2. The drawn alternatives

Three directions, on a Claude Design canvas:
<https://claude.ai/code/artifact/8c5b60eb-4b17-4b15-b408-3d8cacab280d>

Fifteen artboards on one page, in four rows — today's screens (real
screenshots, with the three defects marked), then one row per direction. Each
direction row is home-desktop, home-phone, puzzle-desktop, puzzle-phone; all
light scheme. Every direction answers the four findings above, and each
**commits to a different catalog shape**, so the pick decides that too.

**The board is unchanged in all three.** The twelve-color game palette is out
of scope, so every mockup draws Light Up exactly as it renders today; what
differs is the chrome around it.

| | A · Quiet Paper | B · Index | C · Lit |
| --- | --- | --- | --- |
| Feel | calm, warm, unhurried | a well-made reference tool | brand-forward, confident |
| Ground | warm paper `#faf8f4` | cool white, hairlines | navy masthead on `#f2f6fb` |
| Type | Work Sans | IBM Plex Sans + Plex Mono | Outfit + Karla |
| Accent | the lit-cell amber `#ffc83d`, and nothing else | navy for links, amber for hints only | navy as a *surface*, amber as the action color |
| Catalog | card grid, roomier | dense list — 26/screen desktop, 12/phone | icon tiles — 18/screen, name only |
| App bar | four items, so 390px fits | **no top bar**: a 268px left rail | navy bar, four items |
| Hint | labeled amber button + explanation strip under the board | button *and* its explanation together in the rail | amber pill you cannot miss + explanation card |
| Tradeoff | ~12 games per screen; browsing 57 means scrolling | coolest and least playful; the rail costs 268px | a tile shows no objective — search must carry it |

All three use the amber from `public/favicon.svg` as the accent. That amber is
the mark's whole identity and appears nowhere in the chrome today; the current
page ground `#e8f3ff` is the logo's *cell* color, which is its least
distinctive part.

Two things in the drawings are **proposals, not givens**, and either can be
dropped without changing the direction: a **Continue / Resume** row surfacing
the auto-saved game (the data already exists — `savedGames.autoSavedPuzzles`,
which today only draws a corner badge on a card), and a **search field** (B and
C lean on it; C needs it, because a tile shows no objective text).

## 3. Dark, drawn

The owner plays mainly in dark, so all three directions are drawn dark as well
— on a second canvas page ("Dark", the page the canvas opens on), same rows,
same columns, same layouts, so flipping between pages compares like for like.
Implementation may still leave dark to the tokens; the drawings exist so the
direction is chosen on what the owner actually looks at.

**Each dark artboard is derived from its light twin by palette substitution
only**, and the derivation is guarded twice: no color literal passes through
unmapped, and stripping every color literal from the output reproduces the
light file byte for byte. A layout difference between the two pages would
therefore be a bug, not a decision.

**The board is drawn as the app really renders it in dark** — cells `#36383e`,
grid `#515258`, black clues `#000000` — sampled from the running app rather
than guessed. Three things follow that bear on the choice:

1. **The clue squares sit at 1.79 : 1 against the board** (15.9 : 1 in light).
   This is **deliberate**, not a defect: `hand-author-dark-palette` pinned it —
   *"a piece that is black stays black in dark mode"* — and `lightup/render.ts`
   says so at the assignment (`out[COL_BLACK] = BLACK`, "Pinned: a wall *is*
   black and a bulb *is* white, in either scheme"). Recorded here with the
   number because the chrome sits around it and because it is the scheme the
   owner uses; whether the pin is still worth its dark-mode cost is the owner's
   call, and no change is proposed.
2. **The amber hint wash goes olive over a dark board.** `#ffc83d` at 22% over
   `#36383e` reads as marked but muddy, where over the light board it stays a
   clean pale amber. A dark treatment probably wants a stronger ring and little
   or no fill. That is `COL_HINT`, so it belongs to the board palette, not the
   chrome — noted, not proposed.
3. **The 57 icons are light-background PNGs**, so on any dark chrome they
   become bright squares. The effect scales with icon size, which cuts across
   the choice: C's 88px tiles make it the point, A's 60px cards make it lively,
   B's 32px rows make it negligible.

Per-direction, what dark changes:

- **A · Quiet Paper** — warm paper inverts to warm charcoal (`#191714`,
  surfaces `#211f1b`); the amber is unchanged and carries the whole accent.
  The direction dark flatters most: nothing needed adjusting.
- **B · Index** — cool charcoal (`#101319`, rail `#161920`). The one color that
  cannot survive as-is: the navy accent has to brighten to `#6eb3ff` to stay a
  legible link.
- **C · Lit** — masthead navy deepens to `#15325e` on `#0b1220`. **This is where
  the direction changes most**: in light the masthead is a bold block against a
  pale page; in dark it is a slightly lighter block against a dark one, so the
  contrast that gives the direction its confidence is much reduced. Its icon
  tiles, conversely, pop harder than anything else on the dark page.

## 4. The chosen direction — B · Index

Owner, 2026-09-07: *"let's please go with the Index design"*, with the
information architecture of the rail and the bottom bar rebuilt rather than
inherited — *"nothing should be kept just because it's the way things were."*
Drawn on the canvas's **Chosen** page, dark and light, desktop and phone, plus
a command-placement table.

### 4.1 Tokens

Two token layers change; the twelve-color **board** palette does not.

| Role | Light | Dark |
| --- | --- | --- |
| Page ground | `#ffffff` | `#101319` |
| Rail / raised | `#fafafa` | `#161920` |
| Hairline (structure) | `#e3e4e7` | `#282c36` |
| Row rule (list) | `#eef0f2` | `#20242c` |
| Control border | `#dcdee2` | `#333844` |
| Text, normal | `#16181d` | `#e8eaef` |
| Text, secondary | `#2c2f37` / `#40434b` | `#ccd0d8` / `#b3b8c2` |
| Text, quiet | `#63666e` | `#8d93a0` |
| Text, faint | `#8b8e97` / `#a4a7ae` | `#7b8190` / `#666c79` |
| Link / active | `#1f4e8c` | `#6eb3ff` |
| Accent (hint) | `#ffc83d` — unchanged in both schemes |  |
| Hint surface / border / ink | `#fff7e3` / `#e9c96a` / `#3d3526` | `#2f2718` / `#5b4a22` / `#eee3cd` |

The accent is the lit cell from `public/favicon.svg`, the only color the mark
contributes to the chrome. **`vite.config.ts`'s `theme_color` and
`background_color` must move with the ground and rail tokens** — they are those
tokens' resolved values, typed out as hex.

### 4.2 Type, spacing, radius

- **Faces**: IBM Plex Sans for everything; **IBM Plex Mono** for numerals that
  are read as quantities — move counts, list counts, keyboard shortcuts, param
  chips. Google Fonts, with `ui-sans-serif, system-ui` / `ui-monospace`
  fallbacks.
- **Scale**: 22 (game name) · 15.5 (list name) · 14 (body, controls) · 13.5
  (secondary) · 12.5 (list objective) · 11 (shortcut, group label). Weights 400
  / 500 / 600 only.
- **Spacing**: an 8px rhythm loosened at group boundaries — 13px between rail
  groups, 9px inside one, 18–26px between page sections.
- **Radius**: 6px controls, 7px the hint block, 8–9px containers, 3–4px list
  icons. No pill shapes; this direction is rectilinear.
- **Rows**: 33px rail control, 52px desktop list, 64px phone list, 54px phone
  tool. Phone tap targets never below 44px.

### 4.3 The rule the information architecture follows

**One home per command, grouped by what it acts on, ordered by how often it is
used.** Today there are two command surfaces — a 14-item game menu and an
8-button toolbar — with **Hint, Reference and Check & save in both**, and
eleven more split between them with no rule. A player must learn both surfaces
and can still miss things.

**The rail being vertical is what pays for this.** A horizontal bar has no room
for text, which is exactly why today's eight controls are icon-only and several
are unguessable. A rail carries icon + label + shortcut on one row, so "label
everything" costs nothing. Choosing this direction is what makes the fix
affordable — the IA and the look are one decision, not two.

### 4.4 The rail, top to bottom (desktop, 284px)

1. `← All puzzles` — back to the catalog.
2. **Game name** (22/600) and two param chips (`7×7`, `Easy`) that open the
   type menu and show the current value instead of hiding it.
3. **Your position in this game** — one group, because where you are, how you
   move through it, and the checkpoint are one concern:
   - `Move 12 of 18` in mono, and it *is* the timeline control. Under it, the
     game's status line for the **nine games that provide one** (`cube`,
     `fifteen`, `flood`, `inertia`, `mosaic`, `netslide`, `palisade`,
     `samegame`, `twiddle`); absent otherwise.
   - **Undo / Redo**, labeled, with their shortcuts.
   - **Check & save**, bordered so it reads as a button among plain rows, with
     its shortcut. **Back to last save** beneath it.
4. **Help me play** — the fork's differentiator, named as a group:
   **Next hint** (accent, primary) with its explanation and `STEP n / m`
   inline; **Play hints for me** as a *switch*; **Fill all pencil marks**;
   **Reference** (games that have one); **Check without saving**, quiet;
   **Show solution…** last, quiet, and confirmed.
5. Pinned to the bottom: **New game**, **Restart this puzzle**,
   **How to play <game>**, **More…**.

`More…` holds Switch puzzle…, Share, Copy image, Save game, Load game, Enter
game ID, Preferences, About — the rare and the once-ever, and now the *only*
things behind a menu.

### 4.5 The phone

A persistent bottom bar of exactly five: **Undo · Redo · Next hint ·
Check & save · More**, at full tap size, with Next hint taking the free space.
Check & save holds a permanent slot **by owner request** (2026-09-07: *"I am
very interested in it being in a highly accessible quick-access position"*),
outlined rather than filled so the hint stays the one accent. `More` opens the
rail as a sheet in the same order with the same labels, so what a player learns
on one transfers to the other. **The hint's explanation sits above the bar**,
where a thumb cannot cover it. The keypad stays attached to the board — it is
input, not a command.

The top bar carries only back, name, the two chips and the move count: four
items, so the overflow that breaks it today cannot recur. Structurally it
cannot anyway — the commands are not laid out horizontally any more.

### 4.6 What changes, and why

| Change | Reason |
| --- | --- |
| **`Check & save` keeps quick access** | It is an owner-requested feature, deliberately designed: it verifies first and refuses to save over a mistake. It sits high in the rail as a bordered button and keeps a permanent slot in the phone bar. **A first draft of this design demoted it in favor of a new check-only command; that was wrong** — "one production caller" is a fact about the code, not evidence of an oversight, and the same mistake was made about the pinned black clue squares in §3. |
| **`Check without saving` added, quiet** | The narrow case the combined action cannot serve: the quick-save slot is **one per puzzle**, so checking overwrites it. Save a checkpoint before a guess, check later while still consistent, and the pre-guess restore point is gone. Low in "Help me play", never in the phone bar. |
| **Move counter replaces the History button** | `currentMove`/`totalMoves` are already signals on `Puzzle` and are never shown. State and control become one element. |
| **Auto-hint becomes a switch** | It is a mode, drawn as the twin of an action. |
| **`Solve` → `Show solution…`, confirmed** | Terminal, and one unguarded click away. |
| **One name for the save, and its twin beside it** | The button reads `Check & save` for every game rather than switching to `Quick-save` where the game cannot check — one control, one name. `Quick-load` becomes `Back to last save` and sits directly beneath it, instead of living in the menu while its pair lived in the toolbar. Confirmed by the owner (§4.9). |
| **`New game` and `Restart` promoted** | The most common non-move action in a session was two levels deep. |
| **Everything labeled** | Eight icon-only controls, several unguessable; `Fill all pencil marks` can overwrite notes and had no words. |
| **`Other puzzles` menu → a quick-switch** | A 57-item dropdown was a second, worse copy of a home screen that now has search. Owner's call (§4.9): replace it with a type-to-filter jump on `Ctrl/Cmd+K`, plus a `Switch puzzle…` row in `More…` so touch keeps the capability. |
| **The top app bar and the game menu removed** | The bar is what overflows at 390px; the menu is what duplicated the toolbar. |
| **Home gains a Resume row** | The data exists (`savedGames.autoSavedPuzzles`); today it is a corner badge. First thing a returning player wants. |

### 4.7 Keyboard — the experienced player

**There are no app-level shortcuts today.** Keys go straight through
`eventKeyToPuzzleKey` to the game; only Escape, Tab and Ctrl+C are handled by
the frontend. Upstream had them — `midend.c` maps `n`, `u`, `r`, `q` behind a
`one_key_shortcuts` **user preference** (default on), plus control codes that
work regardless — and the port dropped all of them.

Restore in two tiers:

- **Always on**: `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` and `Ctrl+Y` redo. Chords
  cannot collide with a game's letter input. Not `Ctrl+S` — the browser owns it.
- **Behind a preference, default on**: bare `u`, `r`, `n`, `h`, **suppressed for
  a game that consumes that letter**. Derive the conflict from what the game
  already declares — its `requestKeys()` labels and the button codes
  `emittable-keys` already scans — never from a roster of games (`AGENTS.md`,
  "a game joins a shared mechanic by *having* it").

The rail shows each shortcut on its row, which is also what makes the drawn key
chips true rather than decorative.

### 4.8 Explicitly out of scope

The board: game rendering, the twelve-color palette, the per-game colors, and
the two dark-mode observations in §3 (the pinned black clue squares, the olive
hint wash). The chrome changes around them.

### 4.9 The three player-visible calls — decided by the owner, 2026-09-07

Each breaks something a player can already see or has already set, so each was
put to the owner before being designed as settled.

1. **`Other puzzles` → a quick-switch.** Not simply removed: replaced with a
   type-to-filter jump over all 57 games, opened by keyboard (the `Ctrl/Cmd+K`
   convention) from anywhere in the app. It serves an experienced player better
   than a 57-item dropdown, and it works from the home screen too.

   *Implementation call, mine:* it also gets a **`Switch puzzle…` entry in
   `More…`**, so it is reachable by touch. A keyboard-only affordance would
   quietly take away a touch player's ability to change games without going
   home, which is not what "replace" was asked to mean.

2. **`statusbar-placement` is retired.** The rail gives the status line one
   correct home, so `start` / `end` stop denoting anything, and only nine games
   print a line at all. The stored key is dropped; a player who had set it gets
   the rail's placement.

3. **`Check & save` / `Back to last save`.** One name for the save in every
   game, rather than switching to `Quick-save` where the game cannot check, and
   a partner that says where it takes you. The old words are retired from the
   toasts and alerts that carry them.
