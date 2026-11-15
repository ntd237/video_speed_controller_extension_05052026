(function () {
  "use strict";

  var LIST_LABELS = {
    blacklist: "chặn",
    whitelist: "cho phép"
  };

  var state = {
    settings: null,
    dirty: false,
    listSnapshot: { blacklist: "", whitelist: "" }
  };

  function $(id) {
    return document.getElementById(id);
  }

  function normalizeEntry(line) {
    return line
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/$/, "");
  }

  function analyzeList(rawValue) {
    var entries = rawValue
      .split("\n")
      .map(normalizeEntry)
      .filter(function (line) {
        return line.length > 0;
      });

    var invalid = entries.filter(function (entry) {
      return !isValidSiteEntry(entry);
    });

    return {
      entries: entries,
      invalid: invalid,
      unique: Array.from(new Set(entries))
    };
  }

  function setRange(input, min, max, step) {
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
  }

  function applyBounds() {
    setRange($("step-size"), DEFAULTS.minStepSize, DEFAULTS.maxStepSize, DEFAULTS.numberInputStep);
    setRange($("default-speed"), DEFAULTS.minSpeed, DEFAULTS.maxSpeed, DEFAULTS.speedSliderStep);
    setRange($("favorite-speed"), DEFAULTS.minSpeed, DEFAULTS.maxSpeed, DEFAULTS.numberInputStep);
    setRange($("overlay-opacity"), DEFAULTS.overlayMinOpacity, DEFAULTS.overlayMaxOpacity, DEFAULTS.opacitySliderStep);
  }

  function syncSliderText() {
    var speed = VSCUI.formatSpeed($("default-speed").value);
    $("default-speed-value").textContent = speed;
    $("default-speed").setAttribute("aria-valuetext", speed + "x");

    var opacity = VSCUI.formatSpeed($("overlay-opacity").value);
    $("overlay-opacity-value").textContent = opacity;
    $("overlay-opacity").setAttribute("aria-valuetext", opacity);
  }

  function setSaveState(mode, text) {
    $("stateDot").dataset.state = mode;
    $("stateText").textContent =
      text ||
      (mode === "dirty"
        ? "Có thay đổi chưa lưu"
        : mode === "saving"
          ? "Đang lưu cài đặt…"
          : mode === "error"
            ? "Lưu cài đặt thất bại"
            : "Tất cả thay đổi đã được lưu");
  }

  function markDirty() {
    if (state.dirty) {
      return;
    }
    state.dirty = true;
    setSaveState("dirty");
  }

  function renderStepPresets() {
    var container = $("stepPresets");
    var current = state.settings ? Number(state.settings.stepSize) : DEFAULTS.stepSize;
    container.innerHTML = "";

    (DEFAULTS.stepSizeOptions || []).forEach(function (option) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = option.toFixed(2);
      btn.setAttribute("aria-pressed", String(Math.abs(option - current) < 0.001));
      btn.addEventListener("click", function () {
        state.settings.stepSize = option;
        $("step-size").value = option.toFixed(2);
        renderStepPresets();
        markDirty();
      });
      container.appendChild(btn);
    });
  }

  function updateCount(listType) {
    var textarea = $("list-" + listType);
    var chip = $("count-" + listType);
    var analysis = analyzeList(textarea.value);
    var validCount = analysis.entries.length - analysis.invalid.length;

    if (analysis.invalid.length > 0) {
      chip.textContent = validCount + " trang · " + analysis.invalid.length + " lỗi";
      chip.dataset.tone = "warn";
      return;
    }

    chip.textContent = validCount + " trang";
    chip.dataset.tone = "ok";
  }

  function updateListButton(listType) {
    var textarea = $("list-" + listType);
    var btn = $("save-" + listType);
    btn.disabled = textarea.value === state.listSnapshot[listType];
  }

  function showListError(listType, invalid) {
    var box = $("error-" + listType);
    var list = $("error-" + listType + "-list");
    var textarea = $("list-" + listType);
    var limit = UI_CONFIG.listErrorPreviewLimit;

    list.innerHTML = "";
    invalid.slice(0, limit).forEach(function (entry) {
      var row = document.createElement("div");
      row.textContent = entry;
      list.appendChild(row);
    });

    if (invalid.length > limit) {
      var more = document.createElement("div");
      more.textContent = "… và " + (invalid.length - limit) + " dòng nữa";
      list.appendChild(more);
    }

    box.hidden = false;
    textarea.setAttribute("aria-invalid", "true");
  }

  function clearListError(listType) {
    $("error-" + listType).hidden = true;
    $("list-" + listType).removeAttribute("aria-invalid");
  }

  function applyMode(mode) {
    $("panel-blacklist").hidden = mode !== "blacklist";
    $("panel-whitelist").hidden = mode !== "whitelist";
  }

  function syncOpacityAvailability() {
    var enabled = $("show-overlay").checked;
    var slider = $("overlay-opacity");
    slider.disabled = !enabled;
    slider.title = enabled ? "" : "Bật overlay tốc độ để chỉnh độ trong suốt";
  }

  function currentThemeChoice() {
    var pressed = document.querySelector('[data-theme-choice][aria-pressed="true"]');
    return pressed ? pressed.dataset.themeChoice : DEFAULTS.theme;
  }

  function saveDomainList(listType) {
    var textarea = $("list-" + listType);
    var btn = $("save-" + listType);
    var analysis = analyzeList(textarea.value);

    if (analysis.invalid.length > 0) {
      showListError(listType, analysis.invalid);
      textarea.focus();
      return;
    }

    clearListError(listType);
    VSCUI.setBusy(btn, true);

    var payload = {};
    payload[listType] = analysis.unique;

    chrome.storage.sync
      .set(payload)
      .then(function () {
        var normalized = analysis.unique.join("\n");
        textarea.value = normalized;
        state.listSnapshot[listType] = normalized;
        state.settings[listType] = analysis.unique;
        VSCUI.setBusy(btn, false);
        updateListButton(listType);
        updateCount(listType);
        VSCUI.toast($("toastRegion"), "Đã lưu danh sách " + LIST_LABELS[listType], "success");
      })
      .catch(function () {
        VSCUI.setBusy(btn, false);
        updateListButton(listType);
        VSCUI.toast(
          $("toastRegion"),
          "Chưa lưu được danh sách " + LIST_LABELS[listType],
          "error",
          function () {
            saveDomainList(listType);
          }
        );
      });
  }

  function saveAll() {
    var stepInput = $("step-size");
    var defaultInput = $("default-speed");
    var favoriteInput = $("favorite-speed");
    var opacityInput = $("overlay-opacity");

    var rawStep = Number(stepInput.value);
    var stepSize = VSCUI.round2(
      VSCUI.clamp(
        Number.isFinite(rawStep) && rawStep > 0 ? rawStep : DEFAULTS.stepSize,
        DEFAULTS.minStepSize,
        DEFAULTS.maxStepSize
      )
    );
    var defaultSpeed = VSCUI.round2(Number(defaultInput.value));
    var favoriteRaw = favoriteInput.value.trim();
    var favoriteSpeed = favoriteRaw === "" ? null : VSCUI.round2(Number(favoriteRaw));
    var overlayOpacity = VSCUI.round2(Number(opacityInput.value));

    var invalidFields = [];

    if (!(defaultSpeed >= DEFAULTS.minSpeed && defaultSpeed <= DEFAULTS.maxSpeed)) {
      defaultInput.setAttribute("aria-invalid", "true");
      invalidFields.push(defaultInput);
    } else {
      defaultInput.removeAttribute("aria-invalid");
    }

    if (
      favoriteSpeed !== null &&
      !(favoriteSpeed >= DEFAULTS.minSpeed && favoriteSpeed <= DEFAULTS.maxSpeed)
    ) {
      favoriteInput.setAttribute("aria-invalid", "true");
      invalidFields.push(favoriteInput);
    } else {
      favoriteInput.removeAttribute("aria-invalid");
    }

    if (!(overlayOpacity >= DEFAULTS.overlayMinOpacity && overlayOpacity <= DEFAULTS.overlayMaxOpacity)) {
      opacityInput.setAttribute("aria-invalid", "true");
      invalidFields.push(opacityInput);
    } else {
      opacityInput.removeAttribute("aria-invalid");
    }

    if (invalidFields.length > 0) {
      setSaveState("error", "Giá trị chưa hợp lệ");
      VSCUI.toast($("toastRegion"), "Giá trị chưa hợp lệ, kiểm tra ô được đánh dấu", "error");
      invalidFields[0].focus();
      return;
    }

    stepInput.value = stepSize.toFixed(2);
    defaultInput.value = String(defaultSpeed);
    favoriteInput.value = favoriteSpeed === null ? "" : favoriteSpeed.toFixed(2);
    VSCUI.syncFill(defaultInput);
    VSCUI.syncFill(opacityInput);
    syncSliderText();

    var payload = {
      mode: document.querySelector('input[name="mode"]:checked').value,
      stepSize: stepSize,
      defaultSpeed: defaultSpeed,
      favoriteSpeed: favoriteSpeed,
      showOverlay: $("show-overlay").checked,
      overlayOpacity: overlayOpacity,
      autoApply: $("auto-apply").checked,
      theme: currentThemeChoice()
    };

    var saveBtn = $("saveAll");
    VSCUI.setBusy(saveBtn, true);
    setSaveState("saving");

    chrome.storage.sync
      .set(payload)
      .then(function () {
        state.settings = Object.assign(state.settings || {}, payload);
        state.dirty = false;
        VSCUI.setBusy(saveBtn, false);
        setSaveState("saved");
        renderStepPresets();
        VSCUI.toast($("toastRegion"), "Đã lưu cài đặt", "success");
      })
      .catch(function () {
        VSCUI.setBusy(saveBtn, false);
        setSaveState("error");
        VSCUI.toast($("toastRegion"), "Chưa lưu được cài đặt", "error", saveAll);
      });
  }

  function initScrollSpy() {
    var sections = Array.prototype.slice.call(document.querySelectorAll(".group"));
    var links = Array.prototype.slice.call(document.querySelectorAll("[data-spy]"));

    if (sections.length === 0 || links.length === 0) {
      return;
    }

    var stickyId = null;

    function setActive(id) {
      Array.prototype.forEach.call(links, function (link) {
        link.classList.toggle("is-active", link.dataset.spy === id);
      });
    }

    function updateActive() {
      if (stickyId) {
        setActive(stickyId);
        return;
      }

      var current = sections[0].id;

      sections.forEach(function (section) {
        if (section.getBoundingClientRect().top - UI_CONFIG.scrollSpyProbePx <= 0) {
          current = section.id;
        }
      });

      var atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;

      if (atBottom) {
        current = sections[sections.length - 1].id;
      }

      setActive(current);
    }

    Array.prototype.forEach.call(links, function (link) {
      link.addEventListener("click", function () {
        stickyId = link.dataset.spy;
        setActive(stickyId);
      });
    });

    function releaseSticky() {
      if (!stickyId) {
        return;
      }
      stickyId = null;
      updateActive();
    }

    window.addEventListener("wheel", releaseSticky, { passive: true });
    window.addEventListener("touchmove", releaseSticky, { passive: true });
    window.addEventListener("pointerdown", releaseSticky);
    window.addEventListener("keydown", releaseSticky);
    window.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("resize", updateActive);

    updateActive();
  }

  function render(settings) {
    state.settings = settings;
    state.dirty = false;

    applyBounds();

    $("step-size").value = Number(settings.stepSize).toFixed(2);
    $("default-speed").value = String(settings.defaultSpeed);
    $("favorite-speed").value =
      settings.favoriteSpeed === null || settings.favoriteSpeed === undefined
        ? ""
        : Number(settings.favoriteSpeed).toFixed(2);
    $("overlay-opacity").value = String(settings.overlayOpacity);
    $("show-overlay").checked = Boolean(settings.showOverlay);
    $("auto-apply").checked = Boolean(settings.autoApply);

    var mode = settings.mode === "whitelist" ? "whitelist" : "blacklist";
    document.getElementById("mode-" + mode).checked = true;
    applyMode(mode);

    state.listSnapshot.blacklist = (settings.blacklist || []).join("\n");
    state.listSnapshot.whitelist = (settings.whitelist || []).join("\n");
    $("list-blacklist").value = state.listSnapshot.blacklist;
    $("list-whitelist").value = state.listSnapshot.whitelist;

    updateCount("blacklist");
    updateCount("whitelist");
    updateListButton("blacklist");
    updateListButton("whitelist");

    VSCUI.syncFill($("default-speed"));
    VSCUI.syncFill($("overlay-opacity"));
    syncSliderText();
    syncOpacityAvailability();
    renderStepPresets();

    VSCTheme.apply(settings.theme);
    setSaveState("saved");
  }

  function load() {
    chrome.storage.sync
      .get(null)
      .then(function (stored) {
        render(Object.assign({}, DEFAULTS, stored));
      })
      .catch(function () {
        render(Object.assign({}, DEFAULTS));
        setSaveState("error", "Không đọc được cài đặt đã lưu");
        VSCUI.toast($("toastRegion"), "Không đọc được cài đặt đã lưu", "error", load);
      });
  }

  function handleStepInput() {
    var value = Number($("step-size").value);
    if (Number.isFinite(value) && value > 0) {
      state.settings.stepSize = value;
      renderStepPresets();
    }
    markDirty();
  }

  function commitStepInput() {
    var input = $("step-size");
    var value = Number(input.value);

    if (!Number.isFinite(value) || value <= 0) {
      input.value = Number(state.settings.stepSize).toFixed(2);
      return;
    }

    var clamped = VSCUI.round2(
      VSCUI.clamp(value, DEFAULTS.minStepSize, DEFAULTS.maxStepSize)
    );
    state.settings.stepSize = clamped;
    input.value = clamped.toFixed(2);
    renderStepPresets();
  }

  function init() {
    $("versionBadge").textContent = chrome.runtime.getManifest().version;

    load();

    Array.prototype.forEach.call(document.querySelectorAll('input[name="mode"]'), function (radio) {
      radio.addEventListener("change", function (event) {
        applyMode(event.target.value);
        markDirty();
      });
    });

    ["blacklist", "whitelist"].forEach(function (listType) {
      var textarea = $("list-" + listType);

      textarea.addEventListener("input", function () {
        clearListError(listType);
        updateCount(listType);
        updateListButton(listType);
      });

      $("save-" + listType).addEventListener("click", function () {
        saveDomainList(listType);
      });
    });

    $("step-size").addEventListener("input", handleStepInput);
    $("step-size").addEventListener("change", commitStepInput);
    $("step-size").addEventListener("blur", commitStepInput);

    $("default-speed").addEventListener("input", function () {
      VSCUI.syncFill(this);
      syncSliderText();
      markDirty();
    });

    $("favorite-speed").addEventListener("input", markDirty);

    $("show-overlay").addEventListener("change", function () {
      syncOpacityAvailability();
      markDirty();
    });

    $("overlay-opacity").addEventListener("input", function () {
      VSCUI.syncFill(this);
      syncSliderText();
      markDirty();
    });

    $("auto-apply").addEventListener("change", markDirty);

    Array.prototype.forEach.call(document.querySelectorAll("[data-theme-choice]"), function (btn) {
      btn.addEventListener("click", function () {
        var choice = VSCTheme.apply(btn.dataset.themeChoice);
        VSCTheme.persist(choice).catch(function () {
          VSCUI.toast($("toastRegion"), "Chưa lưu được lựa chọn giao diện", "error");
        });
      });
    });

    $("saveAll").addEventListener("click", saveAll);

    document.addEventListener("keydown", function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveAll();
      }
    });

    window.addEventListener("beforeunload", function (event) {
      if (!state.dirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    });

    initScrollSpy();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
