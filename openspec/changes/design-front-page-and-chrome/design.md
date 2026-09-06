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

## 3. Direction

*(To be recorded once the owner picks on the canvas.)*
