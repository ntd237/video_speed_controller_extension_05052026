const VSCTheme = (function () {
  "use strict";

  var CHOICES = (typeof DEFAULTS !== "undefined" && DEFAULTS.themeOptions) || ["system", "light", "dark"];

  function normalize(choice) {
    return CHOICES.indexOf(choice) === -1 ? "system" : choice;
  }

  function readCache() {
    try {
      var raw = window.localStorage.getItem(UI_CONFIG.themeCacheKey);
      return raw === null ? null : normalize(raw);
    } catch (err) {
      return null;
    }
  }

  function writeCache(choice) {
    try {
      window.localStorage.setItem(UI_CONFIG.themeCacheKey, choice);
    } catch (err) {
    }
  }

  function paint(choice) {
    var value = normalize(choice);
    if (value === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", value);
    }
    return value;
  }

  function syncButtons(choice) {
    var buttons = document.querySelectorAll("[data-theme-choice]");
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.setAttribute("aria-pressed", String(btn.dataset.themeChoice === choice));
    });
  }

  function apply(choice) {
    var value = paint(choice);
    writeCache(value);
    syncButtons(value);
    return value;
  }

  function persist(choice) {
    var value = normalize(choice);
    writeCache(value);
    var payload = {};
    payload.theme = value;
    return chrome.storage.sync.set(payload).then(function () {
      return value;
    });
  }

  function init() {
    var cached = readCache();
    if (cached !== null) {
      paint(cached);
    }
    return cached;
  }

  init();

  return {
    apply: apply,
    persist: persist
  };
})();
