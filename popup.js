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
const NO_PLACEHOLDER = "No placeholder on the page. Click Select, then click a spot on the page.";

// ---- Injected into the page (MAIN world). These only see their args.

function clearFlippExperience() {
  var flippElements = document.getElementsByClassName('flipp-element');
  while(flippElements[0]) {
    flippElements[0].parentNode.removeChild(flippElements[0]);
  }
}

async function addFlippExperience(siteId, zoneIds, loaderOptions, tagUrl) {
  const flippElementCount = document.getElementsByClassName('flipp-element').length;
  const placeholder = document.getElementById(`flipp-scroll-ad-content-${flippElementCount}`);
  if (!placeholder) return false;
  placeholder.innerHTML = "";

  window.flippxp = window.flippxp || { run: [] };
  window.flippxp.run.push(function () {
    window.flippxp.registerSlot(
      `#flipp-scroll-ad-content-${flippElementCount}`,
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

function hasPlaceholder() {
  const count = document.getElementsByClassName('flipp-element').length;
  return !!document.getElementById(`flipp-scroll-ad-content-${count}`);
}

// Mirrors shopper-ad-web bidding.ts wonAuction
function renderBiddingCreative(creative, height) {
  const count = document.getElementsByClassName('flipp-element').length;
  const placeholder = document.getElementById(`flipp-scroll-ad-content-${count}`);
  if (!placeholder) return false;
  placeholder.innerHTML = "";

  const iframe = document.createElement('iframe');
  iframe.className = 'flippxp-frame-container';
  iframe.style.border = 'none';
  iframe.style.display = 'block';
  iframe.style.width = '100%';
  iframe.style.height = `${height}px`;
  placeholder.appendChild(iframe);

  const doc = iframe.contentDocument;
  doc.open();
  doc.write(creative);
  doc.close();
  return true;
}

function selectInjection(evt) {
  const flippElementCount = document.getElementsByClassName('flipp-element').length;
  var html = `<div class="flipp-injector-container flipp-element" id="flipp-container-${flippElementCount+1}" style="position:relative; display:block; width:100%; height:auto; clear:both; float:none; margin:0;">
<div id="flipp-scroll-ad-content-${flippElementCount+1}">
  <div style="font-size: 20px; background-color: green; height: 100px;">
    WILL BE INJECTED HERE!
  </div>
</div>
</div>`

  document.body.addEventListener("click", async function (e) {
    e.stopPropagation();
    e.preventDefault();
    e.target.insertAdjacentHTML("afterEnd", html);
  }, { once: true });
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

function isEmptyObject(value) {
  return !value || typeof value !== "object" || Object.keys(value).length === 0;
}

// Toggles, then content code (tag mode), then the JSON editor on top.
function buildLoaderOptions(mode) {
  const options = {};
  CHECKBOX_IDS.forEach((id) => { options[id] = byId(id).checked; });
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
  const key = crypto.randomUUID();
  await chrome.storage.local.set({ [USER_KEY_STORAGE_KEY]: key });
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

// ---- Actions

async function injectTag(envKey) {
  const env = ENVIRONMENTS[envKey];
  const options = buildLoaderOptions("tag");
  const ok = await runInPage(addFlippExperience, [getSiteId(), getZoneIds(), options, env.tagUrl]);
  if (!ok) {
    alertify.error(NO_PLACEHOLDER);
    return;
  }
  showResult({ kind: "tag", env: envKey });
  celebrate();
}

async function injectBidding(envKey) {
  const env = ENVIRONMENTS[envKey];
  if (!(await runInPage(hasPlaceholder))) {
    alertify.error(NO_PLACEHOLDER);
    return;
  }
  const headers = { "Content-Type": "text/plain" };
  // Header overrides never go to production
  if (envKey === "staging") Object.assign(headers, stagingHeaders());

  const tab = await getActiveTab();
  const options = buildLoaderOptions("bidding");
  const body = await buildBiddingBody(env, tab.url, options);

  showResult({ kind: "loading", env: envKey }, false);
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
    showResult({ kind: "error", env: envKey, message: `Request failed: ${e.message}` });
    return;
  }
  if (!res.ok) {
    showResult({ kind: "error", env: envKey, status: res.status, message: text.slice(0, 500) });
    return;
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    showResult({ kind: "error", env: envKey, status: res.status, message: "Response is not JSON." });
    return;
  }

  const decision = json.decisions?.inline?.[0];
  if (!decision) {
    showResult({ kind: "nobid", env: envKey, status: res.status, raw: json });
    return;
  }
  showResult({ kind: "bid", env: envKey, status: res.status, raw: json });

  const creative = decision.prebid?.creative;
  if (!creative) {
    alertify.error("The decision has no prebid.creative to render.");
    return;
  }
  const rendered = await runInPage(renderBiddingCreative, [creative, creativeHeight(decision, options)]);
  if (rendered) {
    celebrate();
  } else {
    alertify.error(NO_PLACEHOLDER);
  }
}

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
    alertify.error(e.message);
  } finally {
    button.disabled = false;
  }
}

async function runAction(func) {
  try {
    await runInPage(func);
  } catch (e) {
    alertify.error(e.message);
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
    message = "flipptag loaded on the page. It fetches the campaign from /campaigns itself.";
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
      const decision = result.raw.decisions.inline[0];
      badge = decision.demand?.dspName
        ? el("span", "fx-badge fx-badge-admixer", "AdMixer")
        : el("span", "fx-badge fx-badge-kevel", "Kevel");
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

// ---- Mode and environment UI

function updateModeUI() {
  const mode = getMode();
  byId("modeHint").textContent = MODE_HINTS[mode];
  byId("stagingOverrides").hidden = !(getEnv() === "staging" && mode === "bidding");
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
const CHECKBOX_IDS = ["nestedIframe", "expandOnReadmore", "dwellExpandable", "preview", "startCompact", "isGoogleAmp"];
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
  const local = await chrome.storage.local.get(FORM_STORAGE_KEY);
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
  byId("select").addEventListener("click", () => runAction(selectInjection));
  byId("inject").addEventListener("click", inject);
  byId("clear").addEventListener("click", async () => {
    await runAction(clearFlippExperience);
    clearResult();
  });
  byId("flipp-injector-form").addEventListener("submit", (e) => e.preventDefault());
}

document.body.onload = function () {
  editor.setTheme("ace/theme/textmate");
  editor.session.setMode("ace/mode/json");
  byId("flippInjectorVersion").textContent = `v${chrome.runtime.getManifest().version}`;
  wireForm();
  restoreFormState();
};
