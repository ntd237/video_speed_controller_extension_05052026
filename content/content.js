(function() {
  'use strict';
  const videoOverlayMap = new WeakMap();
  const processedVideos = new WeakSet();
  const videosWithLoadstartListener = new WeakSet();
  const rateChangeListenerMap = new WeakMap();
  const speedLockedVideos = new WeakSet();
  let mutationObserver = null;

  function collectVideos(root) {
    const videos = [];
    const walker = (node) => {
      if (node.tagName === 'VIDEO') videos.push(node);
      if (node.shadowRoot) walker(node.shadowRoot);
      for (const child of node.children || []) walker(child);
    };
    walker(root);
    return videos;
  }

  function isDomainAllowed(settings) {
    let hostname, port;
    try {
      hostname = window.top.location.hostname;
      port = window.top.location.port || (window.top.location.protocol === 'https:' ? '443' : '80');
    } catch (e) {
      hostname = location.hostname;
      port = location.port || (location.protocol === 'https:' ? '443' : '80');
    }
    if (settings.mode === 'blacklist') {
      return !settings.blacklist.some((d) => matchesSiteEntry(d, hostname, port));
    } else {
      return settings.whitelist.some((d) => matchesSiteEntry(d, hostname, port));
    }
  }

  function clampSpeed(speed) {
    return Math.min(DEFAULTS.maxSpeed, Math.max(DEFAULTS.minSpeed, speed));
  }

  function getVideoPlaybackRate(video) {
    if (speedLockedVideos.has(video) || isKnownUncontrollableVideo(video)) {
      return DEFAULTS.currentSpeed;
    }

    const rate = Number(video.playbackRate);
    return Number.isFinite(rate) ? rate : DEFAULTS.currentSpeed;
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isExtensionContextValid() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch (error) {
      return false;
    }
  }

  function getSettings(callback) {
    let settled = false;
    const once = (settings) => {
      if (settled) return;
      settled = true;
      callback({ ...DEFAULTS, ...settings });
    };
    const fallback = () => {
      try {
        if (!isExtensionContextValid()) {
          once(DEFAULTS);
          return;
        }
        chrome.storage.sync.get(DEFAULTS, once);
      } catch (error) {
        once(DEFAULTS);
      }
    };
    let timer = null;
    try {
      timer = setTimeout(fallback, DEFAULTS.settingsRequestTimeoutMs);
      chrome.runtime.sendMessage({ action: 'getSettings' }, (settings) => {
        clearTimeout(timer);
        try {
          if (chrome.runtime.lastError || !settings) {
            fallback();
            return;
          }
          once(settings);
        } catch (error) {
          once(DEFAULTS);
        }
      });
    } catch (e) {
      clearTimeout(timer);
      fallback();
    }
  }

  function isKnownUncontrollableVideo(video) {
    const isStreamSource =
      typeof MediaStream !== 'undefined' &&
      video.srcObject instanceof MediaStream;
    const hasLoadedMetadata = video.readyState >= HTMLMediaElement.HAVE_METADATA;
    const isInfiniteDuration = hasLoadedMetadata && !Number.isFinite(video.duration);

    return isStreamSource || isInfiniteDuration;
  }

  function getRawPlaybackRate(video) {
    const rate = Number(video.playbackRate);
    return Number.isFinite(rate) ? rate : DEFAULTS.currentSpeed;
  }

  function isPlaybackRateLocked(video, targetSpeed = getVideoPlaybackRate(video)) {
    const actualSpeed = getRawPlaybackRate(video);

    return (
      speedLockedVideos.has(video) ||
      isKnownUncontrollableVideo(video) ||
      (
        Math.abs(targetSpeed - actualSpeed) > 0.01 &&
        Math.abs(actualSpeed - DEFAULTS.currentSpeed) <= 0.01
      )
    );
  }

  function hasControllableVideo() {
    const videos = collectVideos(document.documentElement);
    if (videos.length === 0) {
      return true;
    }

    return videos.some(video => !isPlaybackRateLocked(video));
  }

  function removeRateChangeListener(video) {
    const listener = rateChangeListenerMap.get(video);
    if (!listener) {
      return;
    }

    video.removeEventListener('ratechange', listener);
    rateChangeListenerMap.delete(video);
  }

  function attachRateChangeListener(video, targetSpeed, settings, options) {
    const force = Boolean(options && options.force);
    removeRateChangeListener(video);

    let retryCount = 0;
    const maxRetries = DEFAULTS.speedApplyRetries;

    const handleRateChange = async () => {
      const actualSpeed = getRawPlaybackRate(video);

      if (Math.abs(actualSpeed - targetSpeed) <= 0.01) {
        speedLockedVideos.delete(video);
        updateOverlay(video, actualSpeed, settings);
        return;
      }

      retryCount++;
      if (retryCount > maxRetries || (!force && isPlaybackRateLocked(video, targetSpeed))) {
        speedLockedVideos.add(video);
        removeRateChangeListener(video);
        updateOverlay(video, getVideoPlaybackRate(video), settings);
        return;
      }

      video.playbackRate = targetSpeed;
      await wait(DEFAULTS.speedApplyRetryDelayMs);
      updateOverlay(video, getRawPlaybackRate(video), settings);
    };

    rateChangeListenerMap.set(video, handleRateChange);
    video.addEventListener('ratechange', handleRateChange);
  }

  function ensureLoadstartListener(video) {
    if (videosWithLoadstartListener.has(video)) {
      return;
    }

    videosWithLoadstartListener.add(video);

    const handleLoadstart = () => {
      try {
        processedVideos.delete(video);
        speedLockedVideos.delete(video);
        removeRateChangeListener(video);

        getSettings((newSettings) => {
          try {
            if (newSettings.autoApply) {
              void applySpeedToVideo(video, newSettings.currentSpeed, newSettings);
            } else {
              updateOverlay(video, getVideoPlaybackRate(video), newSettings);
              processedVideos.add(video);
            }
          } catch (error) {
            console.error('Lỗi trong loadstart handler:', error);
          }
        });
      } catch (error) {
        console.error('Lỗi xử lý loadstart event:', error);
      }
    };

    video.addEventListener('loadstart', handleLoadstart);
  }

  function getCurrentSpeed() {
    const videos = collectVideos(document.documentElement);
    if (videos.length > 0) {
      return getVideoPlaybackRate(videos[0]);
    }
    return DEFAULTS.currentSpeed;
  }

  function createOverlay(video, speed, settings) {
    const overlay = document.createElement('div');
    overlay.className = 'video-speed-overlay';
    overlay.textContent = speed.toFixed(1);
    overlay.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: bold;
      z-index: 10000;
      cursor: move;
      user-select: none;
      pointer-events: auto;
      opacity: ${clampSpeed(settings.overlayOpacity)};
      display: ${settings.showOverlay ? 'block' : 'none'};
    `;

    addDragListener(overlay, video);

    return overlay;
  }

  function addDragListener(overlay, video) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    overlay.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = parseInt(overlay.style.left) || 0;
      startTop = parseInt(overlay.style.top) || 0;
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      overlay.style.left = (startLeft + dx) + 'px';
      overlay.style.top = (startTop + dy) + 'px';
      e.stopPropagation();
    });

    document.addEventListener('mouseup', (e) => {
      if (!isDragging) return;
      isDragging = false;
      e.stopPropagation();
    });
  }

  function updateOverlay(video, speed, settings) {
    let overlay = videoOverlayMap.get(video);

    if (!overlay || !overlay.isConnected) {
      overlay = createOverlay(video, speed, settings);

      const parent = video.parentElement;
      if (parent) {
        const parentPos = getComputedStyle(parent).position;
        if (parentPos === 'static' || parentPos === '') {
          parent.style.position = 'relative';
        }
        parent.appendChild(overlay);
      } else {
        document.body.appendChild(overlay);
      }

      videoOverlayMap.set(video, overlay);
    }

    overlay.textContent = speed.toFixed(1);
    overlay.style.opacity = clampSpeed(settings.overlayOpacity);
    overlay.style.display = settings.showOverlay ? 'block' : 'none';
  }

  function updateAllOverlays(settings) {
    const videos = collectVideos(document.documentElement);
    videos.forEach(video => {
      const speed = getVideoPlaybackRate(video);
      updateOverlay(video, speed, settings);
    });
  }

  async function applySpeedToVideo(video, speed, settings, options) {
    const force = Boolean(options && options.force);
    try {
      const clampedSpeed = clampSpeed(speed);
      removeRateChangeListener(video);

      if (force) {
        speedLockedVideos.delete(video);
      }

      if (!force && isKnownUncontrollableVideo(video)) {
        speedLockedVideos.add(video);
        video.playbackRate = DEFAULTS.currentSpeed;
        updateOverlay(video, DEFAULTS.currentSpeed, settings);
        processedVideos.add(video);
        ensureLoadstartListener(video);
        return {
          applied: false,
          canControlSpeed: false,
          currentSpeed: DEFAULTS.currentSpeed,
        };
      }

      video.playbackRate = clampedSpeed;
      let actualSpeed = getRawPlaybackRate(video);
      let isApplied = Math.abs(actualSpeed - clampedSpeed) <= 0.01;
      let attempts = 0;
      while (!isApplied && attempts < DEFAULTS.speedApplyRetries) {
        await wait(DEFAULTS.speedApplyRetryDelayMs);
        attempts++;
        actualSpeed = getRawPlaybackRate(video);
        isApplied = Math.abs(actualSpeed - clampedSpeed) <= 0.01;
        if (!isApplied) {
          video.playbackRate = clampedSpeed;
        }
      }
      const canControlSpeed = isApplied || (!isPlaybackRateLocked(video, clampedSpeed) || force);

      if (canControlSpeed) {
        speedLockedVideos.delete(video);
      } else {
        speedLockedVideos.add(video);
      }

      updateOverlay(video, isApplied ? clampedSpeed : actualSpeed, settings);

      processedVideos.add(video);

      if (canControlSpeed && !(force && isKnownUncontrollableVideo(video))) {
        attachRateChangeListener(video, clampedSpeed, settings, { force });
      }

      ensureLoadstartListener(video);

      return {
        applied: isApplied,
        canControlSpeed,
        currentSpeed: isApplied ? clampedSpeed : actualSpeed,
      };
    } catch (error) {
      console.error('Lỗi khi áp dụng tốc độ cho video:', error);
      return {
        applied: false,
        canControlSpeed: false,
        currentSpeed: getVideoPlaybackRate(video),
      };
    }
  }

  async function applySpeedToAllVideos(speed, settings, options) {
    const videos = collectVideos(document.documentElement);
    if (videos.length === 0) {
      return {
        applied: true,
        canControlSpeed: true,
        currentSpeed: clampSpeed(speed),
      };
    }

    const results = await Promise.all(videos.map(video => applySpeedToVideo(video, speed, settings, options)));

    return {
      applied: results.some(result => result.applied),
      canControlSpeed: results.some(result => result.canControlSpeed),
      currentSpeed: results[0].currentSpeed,
    };
  }

  function handleNewVideo(video, settings) {
    if (processedVideos.has(video)) {
      return;
    }

    if (settings.autoApply) {
      void applySpeedToVideo(video, settings.currentSpeed, settings);
    } else {
      updateOverlay(video, getVideoPlaybackRate(video), settings);
      processedVideos.add(video);
    }
  }

  function scanForVideos(settings) {
    const videos = collectVideos(document.documentElement);
    videos.forEach(video => {
      handleNewVideo(video, settings);
    });
  }

  function initMutationObserver() {
    if (mutationObserver) {
      mutationObserver.disconnect();
    }

    mutationObserver = new MutationObserver((mutations) => {
      const newVideos = [];

      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              collectVideos(node).forEach(video => newVideos.push(video));
            }
          });
        }
      });

      if (newVideos.length === 0) return;

      getSettings((settings) => {
        newVideos.forEach(video => {
          handleNewVideo(video, settings);
        });
      });
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function initMessageListener() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      try {
        if (msg.action === 'setSpeed') {
          getSettings((settings) => {
            void applySpeedToAllVideos(msg.speed, settings, { force: true })
              .then((result) => {
                sendResponse({ ok: true, ...result });
              })
              .catch((error) => {
                console.error('Lỗi áp dụng tốc độ từ message:', error);
                sendResponse({ ok: false, error: error.message });
              });
          });
          return true; 
        }

        if (msg.action === 'getStatus') {
          const videos = collectVideos(document.documentElement);
          if (videos.length === 0) {
            getSettings((settings) => {
              sendResponse({
                currentSpeed: settings.currentSpeed,
                canControlSpeed: true,
              });
            });
            return true;
          }

          sendResponse({
            currentSpeed: getCurrentSpeed(),
            canControlSpeed: hasControllableVideo(),
          });
        }

        if (msg.action === 'keyCommand') {
          const videos = collectVideos(document.documentElement);
          if (videos.length === 0) {
            return;
          }

          const result = handleShortcut(msg.command, videos);
          sendResponse({ ok: true, ...result });
        }
      } catch (error) {
        console.error('Lỗi xử lý tin nhắn:', error);
        sendResponse({ ok: false, error: error.message });
      }
    });
  }

  const KEY_COMMAND_MAP = {
    'd': 'speed-up',
    's': 'speed-down',
    'r': 'speed-reset',
    'g': 'speed-favorite',
    'v': 'toggle-overlay',
  };

  const KEY_CODE_MAP = {
    KeyD: 'speed-up',
    KeyS: 'speed-down',
    KeyR: 'speed-reset',
    KeyG: 'speed-favorite',
    KeyV: 'toggle-overlay',
  };

  const VK_PACKET = 231;
  const VK_PROCESSKEY = 229;

  let currentSettings = { ...DEFAULTS };

  function resolveShortcutCommand(event) {
    const byKey = KEY_COMMAND_MAP[String(event.key || '').toLowerCase()];
    if (byKey) return byKey;
    return KEY_CODE_MAP[event.code] || null;
  }

  function getStepSize(settings) {
    const step = Number(settings.stepSize);
    return Number.isFinite(step) && step > 0 ? step : DEFAULTS.stepSize;
  }

  function computeNextSpeed(command, settings) {
    const baseSpeed = Number(settings.currentSpeed);

    if (command === 'speed-up') {
      return baseSpeed + getStepSize(settings);
    }
    if (command === 'speed-down') {
      return baseSpeed - getStepSize(settings);
    }
    if (command === 'speed-reset') {
      return Number(settings.defaultSpeed);
    }
    if (command === 'speed-favorite') {
      if (settings.favoriteSpeed === null || settings.favoriteSpeed === undefined) {
        return null;
      }
      return Number(settings.favoriteSpeed);
    }
    return null;
  }

  function persistSettingsPatch(patch) {
    try {
      if (!isExtensionContextValid()) return;
      const pending = chrome.storage.sync.set(patch);
      if (pending && typeof pending.catch === 'function') {
        pending.catch(() => {});
      }
    } catch (error) {
    }
  }

  function handleShortcut(command, videos) {
    const settings = currentSettings;
    const targets = videos || collectVideos(document.documentElement);

    if (command === 'toggle-overlay') {
      currentSettings = { ...settings, showOverlay: !settings.showOverlay };
      persistSettingsPatch({ showOverlay: currentSettings.showOverlay });
      updateAllOverlays(currentSettings);
      return {
        handled: true,
        applied: true,
        hasVideo: targets.length > 0,
        currentSpeed: currentSettings.currentSpeed,
      };
    }

    const rawSpeed = computeNextSpeed(command, settings);
    if (rawSpeed === null || !Number.isFinite(rawSpeed)) {
      return {
        handled: true,
        applied: false,
        hasVideo: targets.length > 0,
        currentSpeed: settings.currentSpeed,
      };
    }

    const nextSpeed = Math.round(clampSpeed(rawSpeed) * 100) / 100;
    currentSettings = { ...settings, currentSpeed: nextSpeed };
    persistSettingsPatch({ currentSpeed: nextSpeed });

    if (targets.length > 0) {
      void applySpeedToAllVideos(nextSpeed, currentSettings, { force: true });
    }

    return {
      handled: true,
      applied: true,
      hasVideo: targets.length > 0,
      currentSpeed: nextSpeed,
    };
  }

  function forwardShortcutCommand(command) {
    try {
      chrome.runtime.sendMessage({ action: 'keyCommand', command });
    } catch (error) {
    }
  }

  function isShortcutBlockedTarget(target) {
    return Boolean(target) && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable === true
    );
  }

  function isInjectedPacketKey(event) {
    return event.keyCode === VK_PACKET || event.keyCode === VK_PROCESSKEY;
  }

  function runShortcutFromEvent(event) {
    if (isShortcutBlockedTarget(event.target)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const command = resolveShortcutCommand(event);
    if (!command) return;
    if (!isExtensionContextValid()) return;
    try {
      const videos = collectVideos(document.documentElement);
      if (videos.length === 0 && command !== 'toggle-overlay') {
        forwardShortcutCommand(command);
        return;
      }
      handleShortcut(command, videos);
    } catch (error) {
      console.error('Lỗi xử lý phím tắt:', error);
    }
  }

  function initKeyListener() {
    document.addEventListener('keydown', (event) => {
      if (isShortcutBlockedTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!resolveShortcutCommand(event)) return;
      event.preventDefault();
      if (event.repeat) {
        runShortcutFromEvent(event);
      }
    });

    document.addEventListener('keyup', (event) => {
      if (event.repeat || isInjectedPacketKey(event)) return;
      runShortcutFromEvent(event);
    });
  }

  function mergeSettingsChanges(changes) {
    const merged = { ...currentSettings };

    Object.keys(changes).forEach((key) => {
      const nextValue = changes[key].newValue;
      merged[key] = nextValue === undefined ? DEFAULTS[key] : nextValue;
    });

    return merged;
  }

  function initStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;

      currentSettings = mergeSettingsChanges(changes);

      if (changes.showOverlay || changes.overlayOpacity) {
        updateAllOverlays(currentSettings);
      }
    });
  }

  function init() {
    getSettings((settings) => {
      if (!isDomainAllowed(settings)) {
        console.log('Miền này không được phép sử dụng Video Speed Controller');
        return;
      }

      currentSettings = settings;
      scanForVideos(settings);
      initMutationObserver();
      initMessageListener();
      initStorageListener();
      initKeyListener();

      console.log('Video Speed Controller đã được khởi tạo');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
