const VSCUI = (function () {
  "use strict";

  var ICON_CHECK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';
  var ICON_ALERT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4"></path><path d="M12 16h.01"></path></svg>';

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  function formatSpeed(value) {
    return Number(value).toFixed(2);
  }

  function syncFill(slider) {
    var min = Number(slider.min);
    var max = Number(slider.max);
    var value = Number(slider.value);
    var ratio = max === min ? 0 : (value - min) / (max - min);
    slider.style.setProperty("--fill", (ratio * 100).toFixed(2) + "%");
  }

  function setBusy(button, busy) {
    if (busy) {
      button.setAttribute("aria-busy", "true");
      button.disabled = true;
      return;
    }
    button.removeAttribute("aria-busy");
    button.disabled = false;
  }

  function createIcon(markup) {
    var holder = document.createElement("span");
    holder.innerHTML = markup;
    return holder.firstChild;
  }

  function toast(region, message, tone, retryFn) {
    if (!region) {
      return;
    }

    var el = document.createElement("div");
    el.className = "toast";
    el.dataset.tone = tone;

    el.appendChild(createIcon(tone === "error" ? ICON_ALERT : ICON_CHECK));

    var text = document.createElement("span");
    text.textContent = message;
    el.appendChild(text);

    if (typeof retryFn === "function") {
      var retry = document.createElement("button");
      retry.type = "button";
      retry.className = "link-btn";
      retry.textContent = "Thử lại";
      retry.addEventListener("click", function () {
        el.remove();
        retryFn();
      });
      el.appendChild(retry);
    }

    region.appendChild(el);

    window.setTimeout(
      function () {
        el.remove();
      },
      tone === "error" ? UI_CONFIG.toastErrorMs : UI_CONFIG.toastSuccessMs
    );
  }

  return {
    clamp: clamp,
    round2: round2,
    formatSpeed: formatSpeed,
    syncFill: syncFill,
    setBusy: setBusy,
    toast: toast
  };
})();
