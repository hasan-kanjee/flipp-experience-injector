# Flipp Experience Injector

A Chrome extension (Manifest V3) for **demoing a Flipp experience directly on a publisher's live website**. It lets you drop a test Flipp ad slot anywhere on a page, point it at a campaign, and render that campaign in place — so you can preview how a Flipp experience looks and behaves on the real publisher page without any site-side integration.

It loads the Flipp loader tag (`flipptag.js`), which requests campaign data from **flyer-locator-service** and renders the returned experience into a placeholder element you choose on the page.

> This is a demo / QA tool, not a production publisher integration.

## Features

- Inject a Flipp experience into any page by clicking where you want it.
- Configure **Site ID** and **Zone IDs**.
- Toggle common loader options: Nested Iframe, Expand on Readmore, Dwell Expandable, Preview, Start Compact, Google Amp.
- Provide arbitrary **Loader Options** as JSON (merged over the toggle values) via a built-in editor.
- Inject **multiple experiences** on the same page at once.
- **Clear ALL** injected experiences in one click.
- Form state (Site ID, Zone IDs, toggles, JSON options) **persists** across closing and reopening the popup.
- A version badge in the popup header shows which build is loaded.

## Install (unpacked)

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. After editing source, click the **reload ↻** icon on the extension card to pick up changes.
   - The popup files (`popup.html` / `popup.js` / `popup.css`) are re-read each time the popup opens, so most edits show up on the next open. A `manifest.json` change (e.g. the version) requires a reload.

## Usage

1. Click the extension icon to open the popup.
2. Enter a **Site ID** and **Zone IDs**, and set any loader toggles / JSON options.
3. Click **Select**, then close the popup and click the spot on the page where the experience should be inserted. A green "WILL BE INJECTED HERE!" placeholder appears.
4. Reopen the popup and click **Inject**. The Flipp tag loads and renders the campaign into the placeholder.
5. Use **Clear ALL** to remove all injected experiences from the page.

## How it works

- All page interaction runs via `chrome.scripting.executeScript` with `world: 'MAIN'`, so the injected functions execute in the page's own JS context (required to reach `window.flippxp`).
- **Inject** sets up `window.flippxp.run`, calls `window.flippxp.registerSlot('#flipp-scroll-ad-content-N', 'wishabi-test-publisher', siteId, [zoneIds], loaderOptions)`, then fetches and evaluates `https://cdn-gateflipp.flippback.com/tag/js/flipptag.js`.
- Each injected slot is numbered, allowing multiple experiences on one page.
- Because the injected functions are serialized and run in the page's MAIN world, they can't reference popup-scope variables — everything they need is passed through `args`.

### Avoiding CSS collisions

The injected wrapper uses a namespaced class (`flipp-injector-container`) plus defensive inline styles so the publisher's stylesheet can't hijack the container's sizing. (An earlier generic `iframe-container` class collided with sites that define their own `.iframe-container` rules, causing the experience to overlap page content.)

## Project structure

| Path | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest (permissions, CSP, version). |
| `popup.html` | Popup UI. |
| `popup.js` | Popup logic: select / inject / clear, slot registration, form persistence. |
| `popup.css` | Popup styling. |
| `images/` | Flipp logos and extension icon. |
| `js/flipptag.js` | Local copy of the Flipp loader tag (the live tag is fetched from the CDN at runtime). |
| `js/ace.js`, `js/mode-*`, `js/theme-*`, `js/ext-*`, `js/snippets/*` | [Ace editor](https://ace.c9.io/) — used for the Loader Options JSON box. |
| `js/jquery-*`, `js/bootstrap.min.js`, `js/alertify.min.js`, `*.min.css` | Vendored UI libraries. |

There is no build step, package manager, or test suite — it's plain HTML/CSS/JS loaded directly as an unpacked extension.

## Key identifiers

- Flipp tag CDN: `https://cdn-gateflipp.flippback.com/tag/js/flipptag.js`
- Publisher name passed to `registerSlot`: `wishabi-test-publisher`
- Campaign data is resolved server-side by **flyer-locator-service** (called by the Flipp tag).
