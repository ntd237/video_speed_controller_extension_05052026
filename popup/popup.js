(function () {
  "use strict";

  var POPUP_KEY_MAP = {
    d: "speed-up",
    s: "speed-down",
    r: "speed-reset",
    g: "speed-favorite",
    v: "toggle-overlay"
  };

  var state = {
    currentSpeed: DEFAULTS.currentSpeed,
    defaultSpeed: DEFAULTS.defaultSpeed,
    stepSize: DEFAULTS.stepSize,
    favoriteSpeed: DEFAULTS.favoriteSpeed,
    overlayOpacity: DEFAULTS.overlayOpacity,
    mode: DEFAULTS.mode,
    blacklist: [],
    whitelist: [],
    currentDomain: "",
    currentPagePort: "",
    canControlCurrentTab: true
  };

  function $(id) {
    return document.getElementById(id);
  }

  function clampSpeed(value) {
    return VSCUI.round2(VSCUI.clamp(value, DEFAULTS.minSpeed, DEFAULTS.maxSpeed));
  }

  function clampStepSize(value) {
    return VSCUI.round2(VSCUI.clamp(value, DEFAULTS.minStepSize, DEFAULTS.maxStepSize));
  }

  function setRange(input, min, max, step) {
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
  }

  function applyBounds() {
    setRange($("speedSlider"), DEFAULTS.minSpeed, DEFAULTS.maxSpeed, DEFAULTS.numberInputStep);
    setRange($("stepSizeInput"), DEFAULTS.minStepSize, DEFAULTS.maxStepSize, DEFAULTS.numberInputStep);
    setRange($("favoriteSpeedInput"), DEFAULTS.minSpeed, DEFAULTS.maxSpeed, DEFAULTS.numberInputStep);
    setRange($("overlayOpacitySlider"), DEFAULTS.overlayMinOpacity, DEFAULTS.overlayMaxOpacity, DEFAULTS.opacitySliderStep);
  }

  function persistSettings(payload, errorMessage) {
    return chrome.storage.sync.set(payload).catch(function () {
      VSCUI.toast($("toastRegion"), errorMessage, "error");
    });
  }

  function isSiteEnabled() {
    if (!state.currentDomain) {
      return state.canControlCurrentTab;
    }
    if (state.mode === "blacklist") {
      return !state.blacklist.some(function (entry) {
        return matchesSiteEntry(entry, state.currentDomain, state.currentPagePort);
      });
    }
    return state.whitelist.some(function (entry) {
      return matchesSiteEntry(entry, state.currentDomain, state.currentPagePort);
    });
  }

  function renderSiteState() {
    var enabled = isSiteEnabled();
    $("siteState").dataset.enabled = String(enabled);
    $("siteDot").dataset.state = enabled ? "saved" : "dirty";
    $("siteStateText").textContent = enabled ? "Đang bật" : "Đang tắt";
    $("siteToggle").checked = enabled;
    $("siteToggleLabel").textContent = state.currentDomain
      ? (enabled ? "Bật trên " : "Tắt trên ") + state.currentDomain
      : "Bật trên trang này";
    renderControlsState();
  }

  function renderSpeed() {
    var value = VSCUI.formatSpeed(state.currentSpeed);
    $("speedDisplay").textContent = value;
    $("speedSlider").value = String(state.currentSpeed);
    $("speedSlider").setAttribute("aria-valuetext", value + "x");
    VSCUI.syncFill($("speedSlider"));
  }

  function renderControlsState() {
    var disabled = !state.canControlCurrentTab;
    ["speedSlider", "decreaseBtn", "resetBtn", "increaseBtn"].forEach(function (id) {
      $(id).disabled = disabled;
    });
    $("speedDisplay").dataset.muted = String(disabled || !isSiteEnabled());
  }

  function renderStepPresets() {
    var container = $("stepPresets");
    container.innerHTML = "";

    (DEFAULTS.stepSizeOptions || []).forEach(function (option) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = option.toFixed(2);
      btn.setAttribute("aria-pressed", String(Math.abs(option - state.stepSize) < 0.001));
      btn.addEventListener("click", function () {
        selectStepPreset(option);
      });
      container.appendChild(btn);
    });
  }

  async function selectStepPreset(value) {
    state.stepSize = value;
    $("stepSizeInput").value = value.toFixed(2);
    renderStepPresets();
    await persistSettings({ stepSize: value }, "Chưa lưu được bước nhảy");
  }

  async function setSpeed(value) {
    var speed = clampSpeed(value);
    var display = speed;
    var shouldPersist = true;

    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      try {
        var response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: "setSpeed",
          speed: speed
        });
        if (response && response.currentSpeed !== undefined) {
          display = response.currentSpeed;
        }
        if (response && response.canControlSpeed === false) {
          state.canControlCurrentTab = false;
          shouldPersist = false;
        } else {
          state.canControlCurrentTab = true;
        }
      } catch (err) {
        state.canControlCurrentTab = true;
      }
    }

    state.currentSpeed = display;
    renderSpeed();
    renderControlsState();

    if (shouldPersist) {
      await persistSettings({ currentSpeed: speed }, "Chưa lưu được tốc độ");
    }
  }

  function commitFavorite() {
    var raw = $("favoriteSpeedInput").value.trim();

    if (raw === "") {
      state.favoriteSpeed = null;
      return null;
    }

    var value = Number(raw);
    if (!Number.isFinite(value)) {
      $("favoriteSpeedInput").value =
        state.favoriteSpeed === null ? "" : Number(state.favoriteSpeed).toFixed(2);
      return state.favoriteSpeed;
    }

    state.favoriteSpeed = clampSpeed(value);
    $("favoriteSpeedInput").value = state.favoriteSpeed.toFixed(2);
    return state.favoriteSpeed;
  }

  function handleSiteToggle(enabled) {
    if (!state.currentDomain) {
      renderSiteState();
      return;
    }

    if (state.mode === "blacklist") {
      state.blacklist = enabled
        ? state.blacklist.filter(function (entry) {
            return entry !== state.currentDomain;
          })
        : state.blacklist.concat([state.currentDomain]);
    } else {
      state.whitelist = enabled
        ? state.whitelist.concat([state.currentDomain])
        : state.whitelist.filter(function (entry) {
            return entry !== state.currentDomain;
          });
    }

    state.blacklist = Array.from(new Set(state.blacklist));
    state.whitelist = Array.from(new Set(state.whitelist));

    renderSiteState();

    persistSettings(
      { blacklist: state.blacklist, whitelist: state.whitelist },
      "Chưa lưu được trạng thái trang này"
    );
  }

  function commitStepSize() {
    var input = $("stepSizeInput");
    var value = clampStepSize(Number(input.value) || DEFAULTS.stepSize);
    var changed = Math.abs(value - state.stepSize) > 0.0001;

    state.stepSize = value;
    input.value = value.toFixed(2);
    renderStepPresets();

    if (changed) {
      persistSettings({ stepSize: value }, "Chưa lưu được bước nhảy");
    }
  }

  function attachEventListeners() {
    $("speedSlider").addEventListener("input", function () {
      setSpeed(Number(this.value));
    });

    $("decreaseBtn").addEventListener("click", function () {
      setSpeed(state.currentSpeed - state.stepSize);
    });

    $("increaseBtn").addEventListener("click", function () {
      setSpeed(state.currentSpeed + state.stepSize);
    });

    $("resetBtn").addEventListener("click", function () {
      setSpeed(state.defaultSpeed);
    });

    $("stepSizeInput").addEventListener("change", commitStepSize);
    $("stepSizeInput").addEventListener("blur", commitStepSize);

    $("favoriteSpeedInput").addEventListener("blur", function () {
      var value = commitFavorite();
      persistSettings({ favoriteSpeed: value }, "Chưa lưu được tốc độ yêu thích");
    });

    $("favoriteSpeedInput").addEventListener("keydown", function (event) {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      var value = commitFavorite();
      persistSettings({ favoriteSpeed: value }, "Chưa lưu được tốc độ yêu thích");
    });

    $("saveFavoriteBtn").addEventListener("click", function () {
      var value = commitFavorite();
      if (value === null) {
        value = state.currentSpeed;
        state.favoriteSpeed = value;
        $("favoriteSpeedInput").value = value.toFixed(2);
      }
      persistSettings({ favoriteSpeed: value }, "Chưa lưu được tốc độ yêu thích");
      VSCUI.toast($("toastRegion"), "Đã lưu tốc độ yêu thích", "success");
    });

    $("overlayOpacitySlider").addEventListener("input", function () {
      state.overlayOpacity = Number(this.value);
      $("overlayOpacityValue").textContent = VSCUI.formatSpeed(state.overlayOpacity);
      this.setAttribute("aria-valuetext", VSCUI.formatSpeed(state.overlayOpacity));
      VSCUI.syncFill(this);
      persistSettings({ overlayOpacity: state.overlayOpacity }, "Chưa lưu được độ trong suốt");
    });

    $("siteToggle").addEventListener("change", function () {
      handleSiteToggle(this.checked);
    });

    $("settingsBtn").addEventListener("click", function () {
      chrome.runtime.openOptionsPage().catch(function () {
        VSCUI.toast($("toastRegion"), "Không mở được trang cài đặt", "error");
      });
    });

    document.addEventListener("keydown", function (event) {
      var tag = event.target && event.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      var command = POPUP_KEY_MAP[event.key.toLowerCase()];
      if (!command) {
        return;
      }
      event.preventDefault();
      chrome.runtime.sendMessage({ action: "keyCommand", command: command }).catch(function () {});
    });

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "sync") {
        return;
      }
      if (changes.currentSpeed && state.canControlCurrentTab) {
        state.currentSpeed = changes.currentSpeed.newValue;
        renderSpeed();
      }
    });
  }

  function renderAll(settings) {
    state.currentSpeed = Number(settings.currentSpeed);
    state.defaultSpeed = Number(settings.defaultSpeed);
    state.stepSize = Number(settings.stepSize);
    state.favoriteSpeed =
      settings.favoriteSpeed === null || settings.favoriteSpeed === undefined
        ? null
        : Number(settings.favoriteSpeed);
    state.overlayOpacity = Number(settings.overlayOpacity);
    state.mode = settings.mode === "whitelist" ? "whitelist" : "blacklist";
    state.blacklist = (settings.blacklist || []).slice();
    state.whitelist = (settings.whitelist || []).slice();

    applyBounds();
    VSCTheme.apply(settings.theme);

    renderSpeed();
    renderStepPresets();
    $("stepSizeInput").value = state.stepSize.toFixed(2);
    $("favoriteSpeedInput").value =
      state.favoriteSpeed === null ? "" : state.favoriteSpeed.toFixed(2);
    $("overlayOpacitySlider").value = String(state.overlayOpacity);
    $("overlayOpacityValue").textContent = VSCUI.formatSpeed(state.overlayOpacity);
    $("overlayOpacitySlider").setAttribute(
      "aria-valuetext",
      VSCUI.formatSpeed(state.overlayOpacity)
    );
    VSCUI.syncFill($("overlayOpacitySlider"));
    renderSiteState();
  }

  async function init() {
    var settings = {};

    try {
      settings = await chrome.storage.sync.get(null);
    } catch (err) {
      VSCUI.toast($("toastRegion"), "Không đọc được cài đặt", "error");
    }

    var tabs = [];
    try {
      tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch (err) {
      tabs = [];
    }

    var target = tabs.length > 0 ? tabs[0] : null;

    if (target && target.url) {
      try {
        var url = new URL(target.url);
        if (url.protocol === "http:" || url.protocol === "https:") {
          state.currentDomain = url.hostname;
          state.currentPagePort = url.port || (url.protocol === "https:" ? "443" : "80");
        }
      } catch (err) {
        state.currentDomain = "";
        state.currentPagePort = "";
      }
    }

    renderAll(Object.assign({}, DEFAULTS, settings));
    attachEventListeners();

    $("siteToggle").disabled = !state.currentDomain;
    $("siteToggle").title = state.currentDomain
      ? ""
      : "Chỉ điều khiển được trên trang web thường";

    if (!target) {
      return;
    }

    try {
      var response = await chrome.tabs.sendMessage(target.id, { action: "getStatus" });
      if (response && response.currentSpeed !== undefined) {
        state.currentSpeed = response.currentSpeed;
        state.canControlCurrentTab = response.canControlSpeed !== false;
        renderSpeed();
        renderControlsState();
      }
    } catch (err) {
      /* content script không chạy trên tab này */
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
