var editor = ace.edit("editor");

// URLs from shopper-ad-web packages/snippet/rollup.config.js
const ENVIRONMENTS = {
  production: {
    label: "Production",
    tagUrl: "https://cdn-gateflipp.flippback.com/tag/js/flipptag.js",
    biddingUrl: "https://ads-flipp.com/flyer-locator-service/client_bidding",
    networkId: 10922,
  },
  staging: {
    label: "Staging",
    tagUrl: "https://cdn-gateflipp-stg.flippback.com/tag/js/flipptag.js",
    biddingUrl: "https://cdn-gateflipp.flippback.com/flyer-locator-service-stg/client_bidding",
    networkId: 11090,
  },
};

const MODE_HINTS = {
  tag: "Loads flipptag on the page. The tag calls /campaigns, which is Kevel only.",
  bidding: "The popup calls /client_bidding (Kevel or AdMixer) and renders the returned creative in an iframe, like Prebid.",
};

const PUBLISHER = "wishabi-test-publisher";
const AD_TYPES = [4309, 641];
const CREATIVE_TYPE = "NativeX";
// Same defaults as the Prebid flippBidAdapter
const COMPACT_DEFAULT_HEIGHT = 600;
const STANDARD_DEFAULT_HEIGHT = 1800;
const NO_PLACEHOLDER = "No spot selected on the page. Press Select, then click a spot on the page.";

// ---- Injected into the page (MAIN world). These only see their args.

// Starts select mode, or cancels it if it is already on. Returns true when started.
function toggleSelecting() {
  const state = (window.__flippInjector = window.__flippInjector || { seq: 0 });
  if (state.stopSelecting) {
    state.stopSelecting();
    return false;
  }

  const banner = document.createElement('div');
  banner.setAttribute('data-flipp-injector-ui', '');
  banner.textContent = 'Flipp Injector: click where the experience should go. Esc to cancel.';
  banner.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:8px 16px;border-radius:999px;background:#0e86b8;color:#fff;font:600 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none;';
  document.documentElement.appendChild(banner);

  let hovered = null;
  let saved = ['', ''];
  const isOurs = (node) => node.closest && node.closest('[data-flipp-injector-ui], .flipp-element');
  const unhover = () => {
    if (!hovered) return;
    hovered.style.outline = saved[0];
    hovered.style.outlineOffset = saved[1];
    hovered = null;
  };
  const over = (e) => {
    if (isOurs(e.target)) return;
    unhover();
    hovered = e.target;
    saved = [hovered.style.outline, hovered.style.outlineOffset];
    hovered.style.outline = '2px solid #43c4f4';
    hovered.style.outlineOffset = '2px';
  };
  // Keep the page from reacting to clicks while selecting
  const block = (e) => {
    if (isOurs(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const click = (e) => {
    if (isOurs(e.target)) return;
    block(e);
    const target = e.target;
    stop();
    // Only one pending spot at a time
    document.querySelectorAll('.flipp-element[data-flipp-injector="pending"]').forEach((n) => n.remove());
    state.seq += 1;
    const id = `${Date.now().toString(36)}${state.seq}`;
    const html = `<div class="flipp-injector-container flipp-element" data-flipp-injector="pending" id="flipp-container-${id}" style="position:relative;display:block;width:100%;height:auto;clear:both;float:none;margin:16px 0;padding:0;box-sizing:border-box;">
<div id="flipp-scroll-ad-content-${id}">
<div style="box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:120px;padding:16px;border:2px dashed #43c4f4;border-radius:12px;background-color:#f0faff;background-image:repeating-linear-gradient(135deg,rgba(67,196,244,.06) 0 14px,rgba(67,196,244,.14) 14px 28px);color:#0e86b8;font:600 16px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-align:center;letter-spacing:normal;text-transform:none;">
<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:#43c4f4;color:#fff;font-size:11px;font-weight:700;letter-spacing:.08em;">FLIPP</span>
<span>The Flipp experience will render here</span>
<span style="font-weight:400;font-size:12px;color:#5f6f7b;">Open the injector and press Inject</span>
</div>
</div>
</div>`;
    if (target === document.body || target === document.documentElement) {
      document.body.insertAdjacentHTML('beforeend', html);
    } else {
      target.insertAdjacentHTML('afterend', html);
    }
  };
  const key = (e) => {
    if (e.key === 'Escape') stop();
  };
  const blocked = ['pointerdown', 'mousedown', 'pointerup', 'mouseup'];
  function stop() {
    unhover();
    banner.remove();
    window.removeEventListener('mouseover', over, true);
    window.removeEventListener('click', click, true);
    window.removeEventListener('keydown', key, true);
    blocked.forEach((type) => window.removeEventListener(type, block, true));
    state.stopSelecting = null;
  }
  window.addEventListener('mouseover', over, true);
  window.addEventListener('click', click, true);
  window.addEventListener('keydown', key, true);
  blocked.forEach((type) => window.addEventListener(type, block, true));
  state.stopSelecting = stop;
  return true;
}

function getInjectorState() {
  return {
    selecting: !!(window.__flippInjector && window.__flippInjector.stopSelecting),
    pending: !!document.querySelector('.flipp-element[data-flipp-injector="pending"]'),
    injected: document.querySelectorAll('.flipp-element[data-flipp-injector="injected"]').length,
  };
}

function clearFlippExperience() {
  if (window.__flippInjector && window.__flippInjector.stopSelecting) {
    window.__flippInjector.stopSelecting();
  }
  document.querySelectorAll('.flipp-element').forEach((n) => n.remove());
}

async function addFlippExperience(siteId, zoneIds, loaderOptions, tagUrl) {
  const container = document.querySelector('.flipp-element[data-flipp-injector="pending"]');
  if (!container) return false;
  const slot = container.firstElementChild;
  slot.innerHTML = "";
  container.setAttribute('data-flipp-injector', 'injected');

  window.flippxp = window.flippxp || { run: [] };
  window.flippxp.run.push(function () {
    window.flippxp.registerSlot(
      `#${slot.id}`,
      'wishabi-test-publisher',
      siteId,
      [zoneIds],
      loaderOptions
    );
  });

  let x = await fetch(tagUrl);
  let y = await x.text();
  setTimeout(y, 1);
  return true;
}

// Mirrors shopper-ad-web bidding.ts wonAuction
function renderBiddingCreative(creative, height) {
  const container = document.querySelector('.flipp-element[data-flipp-injector="pending"]');
  if (!container) return false;
  const slot = container.firstElementChild;
  slot.innerHTML = "";
  container.setAttribute('data-flipp-injector', 'injected');

  const iframe = document.createElement('iframe');
  iframe.className = 'flippxp-frame-container';
  iframe.style.border = 'none';
  iframe.style.display = 'block';
  iframe.style.width = '100%';
  iframe.style.height = `${height}px`;
  slot.appendChild(iframe);

  const doc = iframe.contentDocument;
  doc.open();
  doc.write(creative);
  doc.close();
  return true;
}

// ---- Popup helpers

const byId = (id) => document.getElementById(id);

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function runInPage(func, args = []) {
  const tab = await getActiveTab();
  const [{ result }] = await chrome.scripting.executeScript({
    func,
    args,
    target: { tabId: tab.id },
    world: 'MAIN',
  });
  return result;
}

function getEnv() {
  return document.querySelector('input[name="env"]:checked').value;
}

function getMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function getSiteId() {
  return byId("flippExtenstionSiteId").value.trim();
}

function getZoneIds() {
  return byId("flippExtenstionZoneIds").value.trim();
}

function getContentCode() {
  return byId("contentCode").value.trim();
}

function parseZoneIds() {
  const ids = getZoneIds().split(/[\s,]+/).filter(Boolean).map(Number);
  if (ids.some((id) => !Number.isInteger(id))) {
    throw new Error("Zone IDs must be numbers, separated by commas.");
  }
  return ids;
}

function isEmptyObject(value) {
  return !value || typeof value !== "object" || Object.keys(value).length === 0;
}

function getJsonOptions() {
  const raw = editor.getSession().getValue().trim();
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (!isEmptyObject(value)) alertify.success('Parsed JSON successfully!');
    return value;
  } catch (e) {
    alertify.error('Ignoring JSON because it failed to parse');
    return {};
  }
}

// Toggles, then content code (tag mode), then the JSON editor on top.
// The newer toggles are only sent when on, so they never override campaign settings.
function buildLoaderOptions(mode) {
  const options = {};
  CORE_TOGGLE_IDS.forEach((id) => { options[id] = byId(id).checked; });
  EXTRA_TOGGLE_IDS.forEach((id) => { if (byId(id).checked) options[id] = true; });
  const contentCode = getContentCode();
  if (mode === "tag" && contentCode) options.flippContentCode = contentCode;
  return { ...options, ...getJsonOptions() };
}

function stagingHeaders() {
  const headers = {};
  const flags = byId("ldFlags").value.trim();
  if (flags) {
    let parsed;
    try {
      parsed = JSON.parse(flags);
    } catch (e) {
      throw new Error("X-LD-Flags is not valid JSON.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("X-LD-Flags must be a JSON object.");
    }
    headers["X-LD-Flags"] = JSON.stringify(parsed);
  }
  const token = byId("ldToken").value.trim().replace(/^bearer\s+/i, "");
  if (token) headers["X-LD-Authorization"] = `Bearer ${token}`;
  return headers;
}

async function getUserKey() {
  const stored = await chrome.storage.local.get(USER_KEY_STORAGE_KEY);
  if (stored[USER_KEY_STORAGE_KEY]) return stored[USER_KEY_STORAGE_KEY];
  return resetUserKey();
}

async function resetUserKey() {
  const key = crypto.randomUUID();
  await chrome.storage.local.set({ [USER_KEY_STORAGE_KEY]: key });
  byId("userKey").textContent = key;
  return key;
}

function pageContentCode(pageUrl) {
  try {
    return new URL(pageUrl).searchParams.get("flipp-content-code");
  } catch (e) {
    return null;
  }
}

// Same shape as shopper-ad-web bidding.ts requestBidding
async function buildBiddingBody(env, pageUrl, options) {
  const requestId = crypto.randomUUID();
  const contentCode = getContentCode() || pageContentCode(pageUrl) || options.flippContentCode;
  const properties = {};
  if (contentCode) properties.contentCode = String(contentCode).slice(0, 32);
  if (options.mediaPartnerDescriptiveValueTag) {
    properties.mediaPartnerDescriptiveValueTag = String(options.mediaPartnerDescriptiveValueTag).slice(0, 32);
  }
  return {
    placements: [{
      divName: "inline",
      networkId: env.networkId,
      siteId: Number(getSiteId()),
      adTypes: AD_TYPES,
      count: 1,
      zoneIds: parseZoneIds(),
      properties,
      options: {
        ...options,
        prebid: { cpm: 0, creativeType: CREATIVE_TYPE, creative: "", requestId },
      },
      prebid: {
        requestId,
        publisherNameIdentifier: PUBLISHER,
        height: 1,
        width: 1,
        creativeType: CREATIVE_TYPE,
      },
    }],
    keywords: [],
    url: pageUrl,
    user: { key: await getUserKey() },
    sessionId: crypto.randomUUID(),
  };
}

function creativeHeight(decision, options) {
  const customData = decision.contents?.[0]?.data?.customData ?? {};
  return options.startCompact
    ? customData.compactHeight ?? COMPACT_DEFAULT_HEIGHT
    : customData.standardHeight ?? STANDARD_DEFAULT_HEIGHT;
}

function decisionSource(decision) {
  return decision.demand?.dspName ? "AdMixer" : "Kevel";
}

// ---- Actions

async function injectTag(envKey) {
  const env = ENVIRONMENTS[envKey];
  const options = buildLoaderOptions("tag");
  log("tag", `Loading flipptag (${env.label})`, { tagUrl: env.tagUrl, siteId: getSiteId(), zoneIds: getZoneIds(), loaderOptions: options });
  const ok = await runInPage(addFlippExperience, [getSiteId(), getZoneIds(), options, env.tagUrl]);
  if (!ok) {
    log("error", NO_PLACEHOLDER);
    alertify.error(NO_PLACEHOLDER);
    return;
  }
  log("tag", "Slot registered. flipptag will call /campaigns from the page.");
  showResult({ kind: "tag", env: envKey });
  celebrate();
}

async function injectBidding(envKey) {
  const env = ENVIRONMENTS[envKey];
  const state = await runInPage(getInjectorState);
  if (!state.pending) {
    log("error", NO_PLACEHOLDER);
    alertify.error(NO_PLACEHOLDER);
    return;
  }
  const headers = { "Content-Type": "text/plain" };
  // Header overrides never go to production
  if (envKey === "staging") Object.assign(headers, stagingHeaders());

  const tab = await getActiveTab();
  const options = buildLoaderOptions("bidding");
  const body = await buildBiddingBody(env, tab.url, options);

  const shownHeaders = { ...headers };
  if (shownHeaders["X-LD-Authorization"]) shownHeaders["X-LD-Authorization"] = "Bearer (hidden)";
  log("request", `POST /client_bidding (${env.label})`, { url: env.biddingUrl, headers: shownHeaders, body });

  showResult({ kind: "loading", env: envKey }, false);
  const started = performance.now();
  let res;
  let text;
  try {
    res = await fetch(env.biddingUrl, {
      method: "POST",
      credentials: "omit",
      headers,
      body: JSON.stringify(body),
    });
    text = await res.text();
  } catch (e) {
    log("error", `Request failed: ${e.message}`);
    showResult({ kind: "error", env: envKey, message: `Request failed: ${e.message}` });
    return;
  }
  const took = `${Math.round(performance.now() - started)} ms`;
  if (!res.ok) {
    log("error", `HTTP ${res.status} in ${took}`, text.slice(0, 2000));
    showResult({ kind: "error", env: envKey, status: res.status, message: text.slice(0, 500) });
    return;
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    log("error", `HTTP ${res.status} in ${took}, but the response is not JSON`, text.slice(0, 2000));
    showResult({ kind: "error", env: envKey, status: res.status, message: "Response is not JSON." });
    return;
  }

  const decision = json.decisions?.inline?.[0];
  if (!decision) {
    log("response", `HTTP ${res.status} in ${took}: no bid`, { location: json.location });
    showResult({ kind: "nobid", env: envKey, status: res.status, raw: json });
    return;
  }
  log("response", `HTTP ${res.status} in ${took}: ${decisionSource(decision)} decision, campaign ${show(decision.campaignId)}, flight ${show(decision.flightId)}`, {
    demand: decision.demand,
    uapIds: decision.uapIds,
    adId: decision.adId,
    creativeId: decision.creativeId,
    impressionUrl: decision.impressionUrl,
    events: decision.events,
    location: json.location,
  });
  showResult({ kind: "bid", env: envKey, status: res.status, raw: json });

  const creative = decision.prebid?.creative;
  if (!creative) {
    log("error", "The decision has no prebid.creative to render.");
    alertify.error("The decision has no prebid.creative to render.");
    return;
  }
  const height = creativeHeight(decision, options);
  const rendered = await runInPage(renderBiddingCreative, [creative, height]);
  if (rendered) {
    log("info", `Creative rendered in a ${height}px iframe. Trackers fire from the page.`);
    celebrate();
  } else {
    log("error", NO_PLACEHOLDER);
    alertify.error(NO_PLACEHOLDER);
  }
}

async function inject() {
  if (!byId("flipp-injector-form").reportValidity()) return;
  const button = byId("inject");
  button.disabled = true;
  try {
    if (getMode() === "bidding") {
      await injectBidding(getEnv());
    } else {
      await injectTag(getEnv());
    }
  } catch (e) {
    log("error", e.message);
    alertify.error(e.message);
  } finally {
    button.disabled = false;
    refreshSteps();
  }
}

async function select() {
  try {
    const started = await runInPage(toggleSelecting);
    log("info", started ? "Select mode on. Click a spot on the page." : "Select mode cancelled.");
  } catch (e) {
    alertify.error(e.message);
  }
  refreshSteps();
}

async function clearAll() {
  try {
    await runInPage(clearFlippExperience);
    log("info", "Cleared all injected slots.");
  } catch (e) {
    alertify.error(e.message);
  }
  clearResult();
  refreshSteps();
}

// ---- Steps: highlight what to do next

async function refreshSteps() {
  let state = { selecting: false, pending: false, injected: 0 };
  try {
    state = await runInPage(getInjectorState);
  } catch (e) {
    // Pages like chrome:// can't be scripted
  }
  const selectBtn = byId("select");
  const injectBtn = byId("inject");
  selectBtn.classList.toggle("fx-step-primary", !state.pending);
  selectBtn.classList.toggle("fx-step-selecting", state.selecting);
  injectBtn.classList.toggle("fx-step-primary", state.pending && !state.selecting);
  selectBtn.querySelector("strong").textContent = state.selecting ? "Selecting..." : "Select";
  selectBtn.querySelector("small").textContent = state.selecting
    ? "Click a spot on the page. Press to cancel"
    : state.pending ? "Pick a different spot" : "Then click a spot on the page";
  injectBtn.querySelector("small").textContent = state.pending
    ? "Spot selected. Render it now"
    : "Select a spot first";
  // Keep checking while the page is in select mode
  clearTimeout(refreshTimer);
  if (state.selecting) refreshTimer = setTimeout(refreshSteps, 800);
}

let refreshTimer;

// ---- Just for fun: flip the logo and burst flipping flyer cards from Inject

const CONFETTI_COLORS = ["#43c4f4", "#0e86b8", "#ffffff", "#ffd23f"];

function flipLogo() {
  const logo = byId("fxLogo");
  logo.classList.remove("fx-flip");
  void logo.offsetWidth; // restart the animation
  logo.classList.add("fx-flip");
}

function celebrate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  flipLogo();
  const box = byId("inject").getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  for (let i = 0; i < 24; i++) {
    const card = el("span", "fx-confetti");
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    card.style.border = "1px solid rgba(14, 134, 184, 0.4)";
    document.body.append(card);
    const angle = Math.random() * Math.PI * 2;
    const distance = 80 + Math.random() * 140;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 60;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 360);
    card.animate(
      [
        { transform: "translate(-50%, -50%) rotateY(0deg) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotateY(${spin * 2}deg) rotate(${spin}deg)`, opacity: 1, offset: 0.7 },
        { transform: `translate(${dx}px, ${dy + 80}px) rotateY(${spin * 3}deg) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: 1200 + Math.random() * 600, easing: "cubic-bezier(.2,.7,.3,1)" }
    ).onfinish = () => card.remove();
  }
}

// ---- Result panel

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function show(value) {
  return value === undefined || value === null || value === "" ? "-" : String(value);
}

function decisionFields(decision) {
  const fields = [
    ["Campaign ID", decision.campaignId],
    ["Flight ID", decision.flightId],
    ["Ad ID", decision.adId],
    ["Creative ID", decision.creativeId],
  ];
  if (decision.demand?.dspName) fields.push(["DSP", decision.demand.dspName]);
  if (decision.uapIds) {
    fields.push(
      ["UAP campaign", decision.uapIds.campaignId],
      ["UAP flight", decision.uapIds.flightId],
      ["UAP creative", decision.uapIds.creativeId],
      ["UAP advertiser", decision.uapIds.advertiserId],
    );
  }
  const storefront = decision.storefront;
  if (storefront?.merchant) {
    fields.push(["Merchant", [storefront.merchant, storefront.name].filter(Boolean).join(", ")]);
  }
  return fields;
}

function renderResult(result) {
  const box = byId("result");
  box.replaceChildren();
  if (!result) {
    box.append(el("p", "fx-hint", "No result yet. Select a spot on the page, then Inject."));
    return;
  }

  const envLabel = ENVIRONMENTS[result.env]?.label ?? "";
  const head = el("div", "fx-result-head");
  const meta = [envLabel];
  let badge;
  let message;

  if (result.kind === "tag") {
    badge = el("span", "fx-badge fx-badge-kevel", "Kevel tag");
    meta.push("flipptag");
    message = "flipptag loaded on the page. It fetches the campaign from /campaigns itself. Watch Activity for the call.";
  } else {
    meta.push("/client_bidding");
    if (result.status) meta.push(`HTTP ${result.status}`);
    if (result.kind === "loading") {
      badge = el("span", "fx-badge", "Requesting");
    } else if (result.kind === "error") {
      badge = el("span", "fx-badge fx-badge-error", "Error");
      message = result.message || "Request failed.";
    } else if (result.kind === "nobid") {
      badge = el("span", "fx-badge", "No bid");
      message = "decisions.inline is empty.";
    } else {
      const source = decisionSource(result.raw.decisions.inline[0]);
      badge = el("span", `fx-badge fx-badge-${source.toLowerCase()}`, source);
    }
  }

  head.append(badge, el("span", "fx-meta", meta.join(" · ")));
  box.append(head);
  if (message) box.append(el("p", "fx-result-msg", message));

  if (result.kind === "bid") {
    const list = el("dl", "fx-fields");
    decisionFields(result.raw.decisions.inline[0]).forEach(([label, value]) => {
      const item = el("div");
      item.append(el("dt", null, label), el("dd", null, show(value)));
      list.append(item);
    });
    box.append(list);
  }

  if (result.raw) {
    const raw = el("details", "fx-raw");
    raw.append(el("summary", null, "Raw response"), el("pre", null, JSON.stringify(result.raw, null, 2)));
    box.append(raw);
  }
}

// Keeps the last result for this browser session so it survives closing the popup.
function showResult(result, persist = true) {
  renderResult(result);
  if (persist) chrome.storage.session.set({ [RESULT_STORAGE_KEY]: result });
}

function clearResult() {
  renderResult(null);
  chrome.storage.session.remove(RESULT_STORAGE_KEY);
}

// ---- Activity log
// Popup events live under LOG_STORAGE_KEY. background.js adds page network
// events (FLS calls, flipptag, Kevel and AdMixer trackers) under NET_LOG_STORAGE_KEY.

const LOG_STORAGE_KEY = "flippInjectorLog";
const NET_LOG_STORAGE_KEY = "flippInjectorNetLog";
const LOG_LIMIT = 300;
const LOG_TAGS = {
  info: "Popup",
  tag: "Tag",
  request: "Request",
  response: "Response",
  error: "Error",
};
let logWrites = Promise.resolve();

function log(kind, text, detail) {
  const entry = { t: Date.now(), kind, text };
  if (detail !== undefined) {
    entry.detail = typeof detail === "string" ? detail : JSON.stringify(detail, null, 2);
  }
  logWrites = logWrites.then(async () => {
    const stored = await chrome.storage.session.get(LOG_STORAGE_KEY);
    const entries = (stored[LOG_STORAGE_KEY] || []).concat(entry).slice(-LOG_LIMIT);
    await chrome.storage.session.set({ [LOG_STORAGE_KEY]: entries });
  });
}

function formatTime(t) {
  return new Date(t).toLocaleTimeString([], { hour12: false });
}

async function renderLog() {
  const stored = await chrome.storage.session.get([LOG_STORAGE_KEY, NET_LOG_STORAGE_KEY]);
  const entries = [...(stored[LOG_STORAGE_KEY] || []), ...(stored[NET_LOG_STORAGE_KEY] || [])]
    .sort((a, b) => b.t - a.t);
  const list = byId("activityList");
  list.replaceChildren();
  byId("activityCount").textContent = entries.length ? String(entries.length) : "";
  if (!entries.length) {
    list.append(el("li", "fx-hint", "Nothing yet. Requests, responses and trackers show up here."));
    return;
  }
  entries.forEach((entry) => {
    const item = el("li", `fx-log-item fx-log-${entry.kind}`);
    const row = el(entry.detail ? "summary" : "div", "fx-log-row");
    row.append(
      el("span", "fx-log-time", formatTime(entry.t)),
      el("span", "fx-log-tag", entry.label || LOG_TAGS[entry.kind] || entry.kind),
      el("span", "fx-log-text", entry.text),
    );
    if (entry.detail) {
      const details = el("details");
      details.append(row, el("pre", null, entry.detail));
      item.append(details);
    } else {
      item.append(row);
    }
    list.append(item);
  });
}

async function clearLog() {
  await logWrites;
  await chrome.storage.session.remove([LOG_STORAGE_KEY, NET_LOG_STORAGE_KEY]);
}

// ---- Mode and environment UI

function updateModeUI() {
  const mode = getMode();
  byId("modeHint").textContent = MODE_HINTS[mode];
  byId("stagingOverrides").hidden = !(getEnv() === "staging" && mode === "bidding");
  byId("userKeyRow").hidden = mode !== "bidding";
}

function updateJsonActive() {
  let active = false;
  try {
    active = !isEmptyObject(JSON.parse(editor.getSession().getValue()));
  } catch (e) {
    active = editor.getSession().getValue().trim() !== "";
  }
  byId("jsonActive").hidden = !active;
}

// ---- Form persistence
// The popup reloads from disk every time it opens, so inputs are saved to
// chrome.storage. The LD token goes to session storage only.

const FORM_STORAGE_KEY = "flippInjectorFormState";
const USER_KEY_STORAGE_KEY = "flippInjectorUserKey";
const TOKEN_STORAGE_KEY = "flippInjectorLdToken";
const RESULT_STORAGE_KEY = "flippInjectorLastResult";
const TEXT_INPUT_IDS = ["flippExtenstionSiteId", "flippExtenstionZoneIds", "contentCode", "ldFlags"];
const CORE_TOGGLE_IDS = ["nestedIframe", "expandOnReadmore", "dwellExpandable", "preview", "startCompact", "isGoogleAmp"];
const EXTRA_TOGGLE_IDS = ["disableLazyLoading", "fixedHeightUnit", "mobileSwipe"];
const CHECKBOX_IDS = [...CORE_TOGGLE_IDS, ...EXTRA_TOGGLE_IDS];
const RADIO_NAMES = ["env", "mode"];

function saveFormState() {
  const state = { editor: editor.getSession().getValue() };
  TEXT_INPUT_IDS.forEach((id) => { state[id] = byId(id).value; });
  CHECKBOX_IDS.forEach((id) => { state[id] = byId(id).checked; });
  RADIO_NAMES.forEach((name) => {
    state[name] = document.querySelector(`input[name="${name}"]:checked`).value;
  });
  chrome.storage.local.set({ [FORM_STORAGE_KEY]: state });
}

async function restoreFormState() {
  const local = await chrome.storage.local.get([FORM_STORAGE_KEY, USER_KEY_STORAGE_KEY]);
  const state = local[FORM_STORAGE_KEY];
  if (state) {
    TEXT_INPUT_IDS.forEach((id) => {
      if (state[id] !== undefined) byId(id).value = state[id];
    });
    CHECKBOX_IDS.forEach((id) => {
      if (state[id] !== undefined) byId(id).checked = state[id];
    });
    RADIO_NAMES.forEach((name) => {
      const radio = document.querySelector(`input[name="${name}"][value="${state[name]}"]`);
      if (radio) radio.checked = true;
    });
    if (state.editor !== undefined) editor.setValue(state.editor, -1);
  }
  byId("userKey").textContent = local[USER_KEY_STORAGE_KEY] || "created on first request";

  const session = await chrome.storage.session.get([TOKEN_STORAGE_KEY, RESULT_STORAGE_KEY]);
  if (session[TOKEN_STORAGE_KEY]) byId("ldToken").value = session[TOKEN_STORAGE_KEY];
  renderResult(session[RESULT_STORAGE_KEY]);
  updateModeUI();
  updateJsonActive();
}

function wireForm() {
  TEXT_INPUT_IDS.forEach((id) => byId(id).addEventListener("input", saveFormState));
  CHECKBOX_IDS.forEach((id) => byId(id).addEventListener("change", saveFormState));
  document.querySelectorAll('input[type="radio"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      saveFormState();
      updateModeUI();
    });
  });
  byId("ldToken").addEventListener("input", () => {
    chrome.storage.session.set({ [TOKEN_STORAGE_KEY]: byId("ldToken").value });
  });
  editor.getSession().on("change", () => {
    saveFormState();
    updateJsonActive();
  });
  // Ace needs a resize once its collapsed section opens
  byId("advanced").addEventListener("toggle", () => editor.resize());

  byId("fxLogo").addEventListener("click", flipLogo);
  byId("select").addEventListener("click", select);
  byId("inject").addEventListener("click", inject);
  byId("clear").addEventListener("click", clearAll);
  byId("resetUserKey").addEventListener("click", async () => {
    await resetUserKey();
    log("info", "New bidding user key.");
    alertify.success("New user key");
  });
  byId("clearLog").addEventListener("click", clearLog);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "session" && (changes[LOG_STORAGE_KEY] || changes[NET_LOG_STORAGE_KEY])) renderLog();
  });
  byId("flipp-injector-form").addEventListener("submit", (e) => e.preventDefault());
}

document.body.onload = function () {
  editor.setTheme("ace/theme/textmate");
  editor.session.setMode("ace/mode/json");
  byId("flippInjectorVersion").textContent = `v${chrome.runtime.getManifest().version}`;
  wireForm();
  restoreFormState();
  refreshSteps();
  renderLog();
};
