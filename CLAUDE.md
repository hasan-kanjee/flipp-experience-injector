# CLAUDE.md

## What this is

**Flipp Experience Injector** is a Chrome extension (Manifest V3) used to **demo a Flipp experience directly on a publisher's live site**. It injects a test Flipp ad slot into any webpage, points it at a campaign (Site ID / Zone IDs / content code), and renders it in place.

This is a demo/QA tool, not a production publisher integration.

## How it works

The popup ([popup.html](popup.html)) has two switches up front:

- **Environment**: Production or Staging (URLs in `ENVIRONMENTS` in [popup.js](popup.js), taken from shopper-ad-web `packages/snippet/rollup.config.js`).
- **Mode**:
  - **Kevel tag (`/campaigns`)**: `addFlippExperience` registers a slot with `window.flippxp.registerSlot('#flipp-scroll-ad-content-N', 'wishabi-test-publisher', siteId, [zoneIds], loaderOptions)`, then fetches and evals flipptag, which calls FLS `/campaigns` (Kevel only by design). Content code goes in as the `flippContentCode` loader option.
  - **Bidding (`/client_bidding`)**: the popup itself POSTs to FLS `/client_bidding` with the body shape from shopper-ad-web `bidding.ts` `requestBidding` (`credentials: 'omit'`, `Content-Type: text/plain`). Popup requests skip CORS, so custom headers work. `renderBiddingCreative` writes `decisions.inline[0].prebid.creative` (a full HTML doc that loads flipptag with the decision embedded) into an iframe in the placeholder, like `bidding.ts` `wonAuction`. This is the only mode that can return **AdMixer**.

Flow: **Select** inserts a placeholder `<div class="flipp-element" id="flipp-container-N">` after the next clicked element. **Inject** renders into the latest one (numbered by the count of `.flipp-element` nodes, so multiple experiences work). **Clear all** removes them.

Result panel: badge "AdMixer" when `decision.demand.dspName` is set, else "Kevel"; ids, `uapIds`, "No bid", HTTP errors, raw response.

Staging-only `X-LD-Flags` / `X-LD-Authorization` headers are added in `stagingHeaders()` and only when the environment is staging. Never send them to prod and never commit a token.

Persistence: form state in `chrome.storage.local`; the LD token and last result in `chrome.storage.session`; a stable `user.key` in local storage.

## Key files (everything else is vendored)

- [manifest.json](manifest.json): MV3 manifest. Permissions `storage`, `declarativeContent`, `activeTab`, `scripting`, host `<all_urls>`. The popup header badge reads its `version`.
- [popup.html](popup.html), [popup.css](popup.css): Bootstrap 5 UI, Flipp blue `#43c4f4`.
- [popup.js](popup.js): all logic.
- `images/`: Flipp logo (`flipp-logo-white.svg`) and extension icons (`icon-*.png`).

### Vendored / third-party (do not hand-edit)

- `js/flipptag.js`: local copy of the loader tag. At runtime the tag is fetched from the CDN instead.
- `js/ace.js` and the other `js/mode-*`, `js/theme-*`, `js/ext-*`, `js/worker-*`, `js/snippets/*` files: Ace editor (Advanced JSON box only).
- `js/jquery-3.6.3.min.js`, `js/bootstrap.min.js`, `js/alertify.min.js`, `*.min.css`: UI libraries (the popup loads alertify and Ace only).

## Important identifiers

- Publisher name: `wishabi-test-publisher`
- Kevel network: 10922 prod, 11090 staging
- Default Site ID: `1243066`. Staging sample with a Kevel flight: site `1192075`, zone `260678`, content code `e2e-staging-sfml-native`.

## Working on this

- No build step, package manager, or test suite. Load unpacked from `chrome://extensions` and hit reload after edits.
- Injected functions (`addFlippExperience`, `renderBiddingCreative`, `hasPlaceholder`, `selectInjection`, `clearFlippExperience`) are serialized and run in the page's MAIN world. They can't reference popup-scope variables; pass everything through `args`.
- Git remote: `git@github.com:hasan-kanjee/flipp-experience-injector.git` (branch `master`).
