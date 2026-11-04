# Flipp Experience Injector

A Chrome extension (Manifest V3) for **demoing a Flipp experience directly on a publisher's live website**. Drop a test Flipp ad slot anywhere on a page, point it at a campaign, and render it in place, with no site-side integration.

> This is a demo / QA tool, not a production publisher integration.

## Features

- **Environment**: Production or Staging.
- **Mode**:
  - **Kevel tag (`/campaigns`)**: loads flipptag on the page, which calls FLS `/campaigns` (Kevel only).
  - **Bidding (`/client_bidding`)**: the popup calls FLS `/client_bidding` and renders the returned creative in an iframe, the same way Prebid does. This is the path that can serve **AdMixer** as well as Kevel.
- **Result panel**: source badge (Kevel or AdMixer), campaign / flight / ad / creative ids, UAP ids when present, "No bid", HTTP errors, and the raw response.
- Campaign fields: **Site ID**, **Zone IDs**, **Content code**.
- **Activity log**: popup requests and responses, plus page requests seen by the background worker: FLS calls, flipptag loads, Kevel and AdMixer impression / viewability / click trackers, and Flipp beacons. Click a row for details.
- Loader toggles (including Disable Lazy Load, Fixed Height Unit, Mobile Swipe) plus a collapsible **Advanced** JSON editor merged over them.
- **Staging header overrides** (bidding mode only): `X-LD-Flags` and `X-LD-Authorization`. Never sent to production.
- **New user key** (bidding mode, under Advanced) to get past Kevel frequency caps.
- Inject **multiple experiences** on one page, and **Clear all** in one click.
- Form state persists across popup opens. The LD token is kept for the browser session only.

## Install (unpacked)

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. After editing source, click the reload icon on the extension card. Popup files are re-read on each open; `manifest.json` changes need a reload.

## Usage

1. Open the popup, pick the environment and mode.
2. Fill in Site ID, Zone IDs and (optionally) a content code.
3. **Select**. The page shows a banner and outlines elements as you hover. Click one and the placeholder goes right below it. Press Select again or Esc to cancel.
4. Reopen the popup and **Inject**. The highlighted step always shows what to do next. The result panel and Activity log show what happened.
5. **Clear all** removes every injected experience.

Tip: experiences lazy-load until scrolled into view. Turn on **Disable Lazy Load** to render right away.

### Testing AdMixer

FLS only calls AdMixer on prebid-family routes, so use **Bidding** mode. Whether a request gets AdMixer is decided by LaunchDarkly (`fls-admixer-enabled`, `fls-admixer-mode`), targeted by your public IP. On staging you can also force flags with the header overrides.

Staging sample that serves a Kevel flight: site `1192075`, zone `260678`, content code `e2e-staging-sfml-native`.

## How it works

- Page interaction runs via `chrome.scripting.executeScript` with `world: 'MAIN'`. Injected functions are serialized, so everything they need comes through `args`.
- **Kevel tag mode** registers a slot with `window.flippxp.registerSlot(...)` and evaluates flipptag. The content code is passed as the `flippContentCode` loader option.
- **Bidding mode** POSTs the same body shape as shopper-ad-web `bidding.ts` from the popup (no CORS limits, custom headers allowed), then writes `decisions.inline[0].prebid.creative` into an iframe in the placeholder. That HTML loads flipptag with the decision embedded, so trackers fire from the page.

| | Production | Staging |
|---|---|---|
| flipptag | `cdn-gateflipp.flippback.com/tag/js/flipptag.js` | `cdn-gateflipp-stg.flippback.com/tag/js/flipptag.js` |
| client_bidding | `ads-flipp.com/flyer-locator-service/client_bidding` | `cdn-gateflipp.flippback.com/flyer-locator-service-stg/client_bidding` |
| Kevel network | 10922 | 11090 |

The injected wrapper uses a namespaced class (`flipp-injector-container`) plus defensive inline styles so publisher CSS can't hijack its sizing.

## Project structure

| Path | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest (permissions, CSP, version). |
| `popup.html` / `popup.css` | Popup UI. |
| `popup.js` | Popup logic: modes, environments, select / inject / clear, result panel, activity log, persistence. |
| `background.js` | Service worker that logs page requests (FLS, flipptag, trackers) via `webRequest` for the Activity panel. |
| `images/` | Flipp logo and extension icons. |
| `js/flipptag.js` | Local copy of the Flipp loader tag (the live tag is fetched at runtime). |
| `js/ace.js`, `js/mode-*`, `js/theme-*`, ... | [Ace editor](https://ace.c9.io/) for the JSON box. |
| `js/alertify.min.js`, `*.min.css` | Vendored UI libraries. |

There is no build step, package manager, or test suite.
