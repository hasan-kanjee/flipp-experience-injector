// Watches page requests for FLS calls, flipptag loads and ad trackers, and keeps
// a short log in session storage for the popup's Activity panel.

const NET_LOG_STORAGE_KEY = "flippInjectorNetLog";
const LOG_LIMIT = 300;

// [pattern, label, kind]. First match wins.
const RULES = [
  [/\/flyer-locator-service[^/]*\/(campaigns|client_bidding|prebid_campaigns|openrtb)\b/, (m) => `FLS /${m[1]}`, "fls"],
  [/\/tag\/js\/flipptag\.js/, () => "flipptag", "tag-load"],
  [/adzerk\.net\/i\.gif/, () => "Kevel impression", "kevel"],
  [/adzerk\.net\/e\.gif/, (m, url) => `Kevel event${kevelEventType(url)}`, "kevel"],
  [/adzerk\.net\/r\?/, () => "Kevel click", "kevel"],
  [/admixer\.net\/(impression|viewability|click|bill|win|loss)\b/, (m) => `AdMixer ${m[1]}`, "admixer"],
  [/admixer\.net\//, () => "AdMixer", "admixer"],
  [/holodeck\.flippback\.com|p\.flipp\.com\/beacons|data\.shopfully\.com/, () => "Flipp beacon", "beacon"],
];

// Kevel event pixels carry a base64 JSON "e" param with the event type in "et".
function kevelEventType(url) {
  try {
    const e = new URL(url).searchParams.get("e");
    const json = JSON.parse(atob(e.replace(/-/g, "+").replace(/_/g, "/")));
    return json.et !== undefined ? ` et=${json.et}` : "";
  } catch (err) {
    return "";
  }
}

function classify(url) {
  for (const [pattern, label, kind] of RULES) {
    const m = url.match(pattern);
    if (m) return { label: label(m, url), kind };
  }
  return null;
}

let queue = [];
let writing = Promise.resolve();

function record(details, outcome) {
  // The popup logs its own requests (tabId -1) with more detail
  if (details.tabId < 0) return;
  const match = classify(details.url);
  if (!match) return;
  const blocked = outcome.error === "net::ERR_BLOCKED_BY_CLIENT";
  const failed = outcome.error || outcome.status >= 400;
  const url = new URL(details.url);
  const where = `${details.method} ${url.host}${url.pathname}`;
  queue.push({
    t: Date.now(),
    tabId: details.tabId,
    kind: blocked ? "blocked" : failed ? "failed" : match.kind,
    // flipptag and FLS are needed for the experience to show at all
    core: match.kind === "fls" || match.kind === "tag-load",
    label: match.label,
    text: blocked ? `Blocked by an ad blocker: ${where}` : `${outcome.error || outcome.status} ${where}`,
    detail: JSON.stringify({ url: details.url, type: details.type, tabId: details.tabId, ...outcome }, null, 2),
  });
  writing = writing.then(flush);
}

async function flush() {
  if (!queue.length) return;
  const batch = queue;
  queue = [];
  const stored = await chrome.storage.session.get(NET_LOG_STORAGE_KEY);
  const entries = (stored[NET_LOG_STORAGE_KEY] || []).concat(batch).slice(-LOG_LIMIT);
  await chrome.storage.session.set({ [NET_LOG_STORAGE_KEY]: entries });
}

const filter = { urls: ["<all_urls>"] };

chrome.webRequest.onCompleted.addListener((d) => record(d, { status: d.statusCode }), filter);
chrome.webRequest.onBeforeRedirect.addListener((d) => record(d, { status: d.statusCode, redirectUrl: d.redirectUrl }), filter);
chrome.webRequest.onErrorOccurred.addListener((d) => record(d, { error: d.error }), filter);
