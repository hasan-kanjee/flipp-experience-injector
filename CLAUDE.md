# CLAUDE.md

## What this is

**Flipp Experience Injector** is a Chrome extension (Manifest V3) used to **demo a Flipp experience directly on a publisher's live site**. It lets you inject a test Flipp ad slot into any webpage, point it at a Flipp campaign (via Site ID / Zone IDs), and render that campaign in place so you can preview how it looks and behaves on the real publisher page.

Under the hood it loads the Flipp loader tag (`flipptag.js`), which sends a request to **flyer-locator-service** to fetch campaign data, then renders the returned test campaign into a placeholder element on the page.

This is a demo/QA tool, not a production publisher integration.

## How it works

1. The user clicks the extension icon to open the popup ([popup.html](popup.html)).
2. They fill in:
   - **Site ID** (defaults to `1243066`) and **Zone IDs**.
   - Loader toggles: Nested Iframe, Expand on Readmore, Dwell Expandable, Preview, Start Compact, Google Amp.
   - **Loader Options** — a JSON editor (Ace) whose parsed object is merged over the toggle values, so it can override or add arbitrary loader options.
3. **Select** — injects a click listener into the page; the next element the user clicks gets a placeholder `<div class="flipp-element" id="flipp-container-N">` inserted after it (with a green "WILL BE INJECTED HERE!" marker).
4. **Inject** — registers a Flipp slot on the placeholder and loads the Flipp tag, which renders the campaign:
   - Sets up `window.flippxp.run` and calls `window.flippxp.registerSlot('#flipp-scroll-ad-content-N', 'wishabi-test-publisher', siteId, [zoneIds], loaderOptions)`.
   - Fetches `https://cdn-gateflipp.flippback.com/tag/js/flipptag.js` and evals it to bootstrap the experience.
5. **Clear ALL** — removes every injected `.flipp-element` from the page.

All page interaction is done via `chrome.scripting.executeScript` with `world: 'MAIN'`, so the injected functions run in the page's own JS context (needed to access `window.flippxp`).

**Multiple experiences** are supported: each injected slot is numbered using `flippElementCount` (the current count of `.flipp-element` nodes), so several campaigns can be injected on the same page at once. This was added in commit `6c6e076` (OFF-694).

## Key files (everything else is vendored)

- [manifest.json](manifest.json) — MV3 manifest. Permissions: `storage`, `declarativeContent`, `activeTab`, `scripting`, host `<all_urls>`. CSP allows loading scripts from `https://shopper.flipp.com/`.
- [popup.html](popup.html) — the extension popup UI (Bootstrap-styled form + Ace JSON editor).
- [popup.js](popup.js) — all the logic: building the placeholder, registering the slot, loading `flipptag.js`, and the Select / Inject / Clear handlers.
- [popup.css](popup.css) — popup styling.
- `images/` — Flipp logos used in the popup and as the extension icon.

### Vendored / third-party (do not hand-edit)

- `js/flipptag.js` — a **local copy** of the minified Flipp loader tag. Note: at runtime the extension fetches the tag fresh from the CDN (`cdn-gateflipp.flippback.com`) rather than using this file. Updated in commit `b0f3b18`.
- `js/ace.js` + `js/mode-*.js`, `js/theme-*.js`, `js/ext-*.js`, `js/keybinding-*.js`, `js/worker-*.js`, `js/snippets/*` — the **Ace code editor** library (used only for the Loader Options JSON box). This is the bulk of the repo's file count (~450 files) and is not project code.
- `js/jquery-3.6.3.min.js`, `js/bootstrap.min.js`, `js/alertify.min.js`, and the `*.min.css` files — UI libraries.

## Important domains / identifiers

- Flipp tag CDN: `https://cdn-gateflipp.flippback.com/tag/js/flipptag.js`
- Publisher name passed to `registerSlot`: `wishabi-test-publisher`
- Campaign data is resolved server-side by **flyer-locator-service** (called by the Flipp tag, not directly by this extension).
- Default Site ID in the form: `1243066`

## Working on this

- There is **no build step, package manager, or test suite** — it's plain HTML/CSS/JS loaded directly as an unpacked extension.
- To run it: Chrome → `chrome://extensions` → enable Developer mode → **Load unpacked** → select this folder. After editing source, hit the reload icon on the extension card.
- When changing injection behavior, remember the injected functions (`addFlippExperience`, `selectInjection`, `clearFlippExperience`) are serialized and run in the **page's** MAIN world — they can't reference popup-scope variables or imports; everything they need must come through `args`.
- Git remote: `git@github.com:hasan-kanjee/flipp-experience-injector.git` (branch `master`).
