var editor = ace.edit("editor");

function clearFlippExperience() {
  const placeholder = document.getElementById("flipp-scroll-ad-content");
  placeholder.innerHTML = "";
}

async function addFlippExperience(siteId, zoneIds, loaderOptions) {
  console.log(loaderOptions);
  const placeholder = document.getElementById("flipp-scroll-ad-content");
  placeholder.innerHTML = "";

  window.flippxp = window.flippxp || { run: [] };
  window.flippxp.run.push(function () {
    window.flippxp.registerSlot(
      '#flipp-scroll-ad-content',
      'wishabi-test-publisher',
      siteId,
      [zoneIds],
      loaderOptions
    );
  });

  let x = await fetch("https://cdn-gateflipp-stg.flippback.com/tag/js/flipptag.js");
  let y = await x.text();
  setTimeout(y, 1);
}


function selectInjection(evt) {
  var html = `<div class="iframe-container" id="flipp-container">
<div id="flipp-scroll-ad-content">
  <div style="font-size: 20px; background-color: green; height: 100px;">
    WILL BE INJECTED HERE!
  </div>
</div>
</div>`

  document.body.addEventListener("click", async function (e) {
    e.stopPropagation();
    e.preventDefault();
    var container = document.getElementById("flipp-container");
    if (container) {
      container.remove();
    }
    console.dir(this);
    console.log(e.target);
    e.target.insertAdjacentHTML("afterEnd", html);
  }, { once: true });
}

function getSiteId() {
  const siteId = document.getElementById("flippExtenstionSiteId");
  return siteId.value.trim();
}

function getZoneIds() {
  const zoneIds = document.getElementById("flippExtenstionZoneIds");
  return zoneIds.value.trim();
}

function getPublisherLoaderOptions() {
  const loaderOptions = {
    dwellExpandable: false,
    nestedIframe: false,
    expandOnReadmore: false,
    preview: false,
    startCompact: false,
    isGoogleAmp: false
  };
  if ($('#dwellExpandable:checked').val()) {
    loaderOptions.dwellExpandable = true
  }
  if ($('#nestedIframe:checked').val()) {
    loaderOptions.nestedIframe = true
  }
  if ($('#expandOnReadmore:checked').val()) {
    loaderOptions.expandOnReadmore = true
  }
  if ($('#preview:checked').val()) {
    loaderOptions.preview = true
  }
  if ($('#startCompact:checked').val()) {
    loaderOptions.startCompact = true
  }
  if ($('#isGoogleAmp:checked').val()) {
    loaderOptions.isGoogleAmp = true
  }
  return loaderOptions;
}

async function addFlipp() {
  const siteId = getSiteId();
  const zoneIds = getZoneIds();
  var loaderOptions = getPublisherLoaderOptions();
  try {
    var value = JSON.parse(editor.getSession().getValue().replace(/\r?\n|\r/g, ''));
    loaderOptions = {
      ...loaderOptions,
      ...value,
    }
    alertify.success('Parsed JSON successfully!'); 
  } catch (e) {
    alertify.error('Ignoring JSON beacause failed to parse'); 
  }
  const [{result}] = await chrome.scripting.executeScript({
    func: addFlippExperience,
    target: {
      tabId: (await chrome.tabs.query({active: true, currentWindow: true}))[0].id
    },
    world: 'MAIN',
    args: [siteId, zoneIds, loaderOptions]
  });
  return result;
}

async function clearFlipp(tabId) {
  const [{result}] = await chrome.scripting.executeScript({
    func: clearFlippExperience,
    target: {
      tabId: tabId ??
        (await chrome.tabs.query({active: true, currentWindow: true}))[0].id
    },
    world: 'MAIN',
  });
  return result;
}

async function selectFlipp() {
  const [{result}] = await chrome.scripting.executeScript({
    func: selectInjection,
    target: {
      tabId: (await chrome.tabs.query({active: true, currentWindow: true}))[0].id
    },
    world: 'MAIN',
  });
  return result;
}

const inject = document.getElementById("inject");
inject.addEventListener("click", async (event) => {
  (async () => {
    await addFlipp();
  })();
});

const clear = document.getElementById("clear");
clear.addEventListener("click", async (event) => {
  (async () => {
    await clearFlipp();
  })();
});

const select = document.getElementById("select");
select.addEventListener("click", async (event) => {
  (async () => {
    await selectFlipp();
  })();
});

document.body.onload = function(){
  editor.setTheme("ace/theme/textmate");
  editor.session.setMode("ace/mode/json");
}