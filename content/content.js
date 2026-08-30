(function() {
  'use strict';

  // ============================================================================
  // Hằng số và trạng thái toàn cục
  // ============================================================================

  // WeakMap để lưu trữ tham chiếu overlay cho mỗi video
  const videoOverlayMap = new WeakMap();

  // Set để theo dõi các video đã được xử lý
  const processedVideos = new WeakSet();

  // Set để theo dõi các video đã có loadstart listener (tránh duplicate)
  const videosWithLoadstartListener = new WeakSet();

  // WeakMap để quản lý ratechange listener hiện tại của mỗi video
  const rateChangeListenerMap = new WeakMap();

  // Các video đã được xác định là không thể thay đổi playbackRate
  const speedLockedVideos = new WeakSet();

  // MutationObserver để theo dõi video mới
  let mutationObserver = null;

  // ============================================================================
  // Hàm tiện ích
  // ============================================================================

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

  /**
   * Kiểm tra xem miền hiện tại có được phép hay không dựa trên cài đặt
   * @param {Object} settings - Cài đặt từ storage
   * @returns {boolean} true nếu miền được phép
   */
  function isDomainAllowed(settings) {
    let loc;
    try {
      loc = window.top.location;
    } catch (e) {
      loc = location;
    }
    const hostname = loc.hostname;
    // Map port mặc định (location.port rỗng với http/https thường) để khớp entry có port 80/443
    const port = loc.port || (loc.protocol === 'https:' ? '443' : '80');
    if (settings.mode === 'blacklist') {
      return !settings.blacklist.some((d) => matchesSiteEntry(d, hostname, port));
    } else {
      return settings.whitelist.some((d) => matchesSiteEntry(d, hostname, port));
    }
  }

  /**
   * Giới hạn tốc độ trong khoảng cho phép
   * @param {number} speed - Tốc độ cần giới hạn
   * @returns {number} Tốc độ đã giới hạn
   */
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

  function isKnownUncontrollableVideo(video) {
    const isStreamSource =
      typeof MediaStream !== 'undefined' &&
      video.srcObject instanceof MediaStream;
    const hasLoadedMetadata = video.readyState >= HTMLMediaElement.HAVE_METADATA;
    const isInfiniteDuration = hasLoadedMetadata && !Number.isFinite(video.duration);

    return isStreamSource || isInfiniteDuration;
  }

  function isPlaybackRateLocked(video, targetSpeed = getVideoPlaybackRate(video)) {
    const actualSpeed = getVideoPlaybackRate(video);

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

  function attachRateChangeListener(video, targetSpeed, settings) {
    removeRateChangeListener(video);

    let retryCount = 0;
    const maxRetries = 10;

    const handleRateChange = async () => {
      const actualSpeed = getVideoPlaybackRate(video);

      if (Math.abs(actualSpeed - targetSpeed) <= 0.01) {
        speedLockedVideos.delete(video);
        updateOverlay(video, actualSpeed, settings);
        return;
      }

      retryCount++;
      if (retryCount > maxRetries || isPlaybackRateLocked(video, targetSpeed)) {
        speedLockedVideos.add(video);
        removeRateChangeListener(video);
        updateOverlay(video, getVideoPlaybackRate(video), settings);
        return;
      }

      video.playbackRate = targetSpeed;
      await wait(120);
      updateOverlay(video, getVideoPlaybackRate(video), settings);
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

        chrome.storage.sync.get(DEFAULTS, (newSettings) => {
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

  /**
   * Lấy tốc độ phát lại hiện tại từ video đầu tiên (nếu có)
   * @returns {number} Tốc độ phát lại hiện tại
   */
  function getCurrentSpeed() {
    const videos = collectVideos(document.documentElement);
    if (videos.length > 0) {
      return getVideoPlaybackRate(videos[0]);
    }
    return DEFAULTS.currentSpeed;
  }

  // ============================================================================
  // Quản lý overlay
  // ============================================================================

  /**
   * Tạo overlay badge cho video
   * @param {HTMLVideoElement} video - Phần tử video
   * @param {number} speed - Tốc độ hiển thị
   * @param {Object} settings - Cài đặt từ storage
   * @returns {HTMLElement} Phần tử overlay
   */
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

    // Thêm sự kiện kéo
    addDragListener(overlay, video);

    return overlay;
  }

  /**
   * Thêm sự kiện kéo cho overlay
   * @param {HTMLElement} overlay - Phần tử overlay
   * @param {HTMLVideoElement} video - Phần tử video
   */
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

  /**
   * Cập nhật overlay cho video
   * @param {HTMLVideoElement} video - Phần tử video
   * @param {number} speed - Tốc độ mới
   * @param {Object} settings - Cài đặt từ storage
   */
  function updateOverlay(video, speed, settings) {
    let overlay = videoOverlayMap.get(video);

    // Tạo overlay mới nếu chưa tồn tại hoặc bị xóa khỏi DOM
    if (!overlay || !overlay.isConnected) {
      overlay = createOverlay(video, speed, settings);

      // Đảm bảo parent container có position relative để overlay absolute hoạt động
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

    // Cập nhật nội dung
    overlay.textContent = speed.toFixed(1);

    // Cập nhật opacity
    overlay.style.opacity = clampSpeed(settings.overlayOpacity);

    // Cập nhật hiển thị
    overlay.style.display = settings.showOverlay ? 'block' : 'none';
  }

  /**
   * Cập nhật tất cả overlay
   * @param {Object} settings - Cài đặt từ storage
   */
  function updateAllOverlays(settings) {
    const videos = collectVideos(document.documentElement);
    videos.forEach(video => {
      const speed = getVideoPlaybackRate(video);
      updateOverlay(video, speed, settings);
    });
  }

  // ============================================================================
  // Áp dụng tốc độ
  // ============================================================================

  /**
   * Áp dụng tốc độ cho một video
   * @param {HTMLVideoElement} video - Phần tử video
   * @param {number} speed - Tốc độ cần áp dụng
   * @param {Object} settings - Cài đặt từ storage
   */
  async function applySpeedToVideo(video, speed, settings) {
    try {
      const clampedSpeed = clampSpeed(speed);
      removeRateChangeListener(video);

      if (isKnownUncontrollableVideo(video)) {
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
      await wait(120);

      const actualSpeed = getVideoPlaybackRate(video);
      const isApplied = Math.abs(actualSpeed - clampedSpeed) <= 0.01;
      const canControlSpeed = isApplied || !isPlaybackRateLocked(video, clampedSpeed);

      if (canControlSpeed) {
        speedLockedVideos.delete(video);
      } else {
        speedLockedVideos.add(video);
      }

      // Overlay luôn phản ánh playbackRate thực tế của video.
      updateOverlay(video, isApplied ? clampedSpeed : actualSpeed, settings);

      // Đánh dấu video đã được xử lý
      processedVideos.add(video);

      if (canControlSpeed) {
        attachRateChangeListener(video, clampedSpeed, settings);
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

  /**
   * Áp dụng tốc độ cho tất cả video
   * @param {number} speed - Tốc độ cần áp dụng
   * @param {Object} settings - Cài đặt từ storage
   */
  async function applySpeedToAllVideos(speed, settings) {
    const videos = collectVideos(document.documentElement);
    if (videos.length === 0) {
      return {
        applied: true,
        canControlSpeed: true,
        currentSpeed: clampSpeed(speed),
      };
    }

    const results = await Promise.all(videos.map(video => applySpeedToVideo(video, speed, settings)));

    return {
      applied: results.some(result => result.applied),
      canControlSpeed: results.some(result => result.canControlSpeed),
      currentSpeed: results[0].currentSpeed,
    };
  }

  // ============================================================================
  // Phát hiện video
  // ============================================================================

  /**
   * Xử lý video mới được phát hiện
   * @param {HTMLVideoElement} video - Phần tử video
   * @param {Object} settings - Cài đặt từ storage
   */
  function handleNewVideo(video, settings) {
    if (processedVideos.has(video)) {
      return;
    }

    if (settings.autoApply) {
      void applySpeedToVideo(video, settings.currentSpeed, settings);
    } else {
      // Vẫn tạo overlay nhưng không áp dụng tốc độ
      updateOverlay(video, getVideoPlaybackRate(video), settings);
      processedVideos.add(video);
    }
  }

  /**
   * Quét tất cả video hiện tại trên trang
   * @param {Object} settings - Cài đặt từ storage
   */
  function scanForVideos(settings) {
    const videos = collectVideos(document.documentElement);
    videos.forEach(video => {
      handleNewVideo(video, settings);
    });
  }

  /**
   * Khởi tạo MutationObserver để theo dõi video mới
   */
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

      // Lấy settings mới nhất từ storage để tránh dùng closure cũ
      chrome.storage.sync.get(DEFAULTS, (settings) => {
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

  // ============================================================================
  // Lắng nghe tin nhắn
  // ============================================================================

  /**
   * Lắng nghe tin nhắn từ popup/service_worker
   */
  function initMessageListener() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      try {
        if (msg.action === 'setSpeed') {
          chrome.storage.sync.get(DEFAULTS, (settings) => {
            void applySpeedToAllVideos(msg.speed, settings)
              .then((result) => {
                sendResponse({ ok: true, ...result });
              })
              .catch((error) => {
                console.error('Lỗi áp dụng tốc độ từ message:', error);
                sendResponse({ ok: false, error: error.message });
              });
          });
          return true; // Giữ channel mở cho sendResponse không đồng bộ
        }

        if (msg.action === 'getStatus') {
          const videos = collectVideos(document.documentElement);
          if (videos.length === 0) {
            chrome.storage.sync.get(DEFAULTS, (settings) => {
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
      } catch (error) {
        console.error('Lỗi xử lý tin nhắn:', error);
        sendResponse({ ok: false, error: error.message });
      }
    });
  }

  // ============================================================================
  // Phím tắt bàn phím
  // ============================================================================

  const KEY_COMMAND_MAP = {
    'd': 'speed-up',
    's': 'speed-down',
    'r': 'speed-reset',
    'g': 'speed-favorite',
    'v': 'toggle-overlay',
  };

  /**
   * Khởi tạo listener phím tắt đơn
   * Chỉ kích hoạt khi không có input/textarea đang được focus
   */
  function initKeyListener() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const command = KEY_COMMAND_MAP[e.key.toLowerCase()];
      if (!command) return;
      e.preventDefault();
      chrome.runtime.sendMessage({ action: 'keyCommand', command });
    });
  }

  // ============================================================================
  // Lắng nghe thay đổi storage
  // ============================================================================

  /**
   * Lắng nghe thay đổi storage
   */
  function initStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;

      chrome.storage.sync.get(DEFAULTS, (settings) => {
        // Cập nhật overlay nếu showOverlay hoặc overlayOpacity thay đổi
        if (changes.showOverlay || changes.overlayOpacity) {
          updateAllOverlays(settings);
        }

        // Áp dụng tốc độ mới nếu currentSpeed thay đổi
        if (changes.currentSpeed) {
          void applySpeedToAllVideos(changes.currentSpeed.newValue, settings);
        }

        // Nếu autoApply thay đổi, có thể cần xử lý lại
        if (changes.autoApply) {
          // Không cần hành động cụ thể, chỉ cập nhật cài đặt
        }
      });
    });
  }

  // ============================================================================
  // Khởi tạo
  // ============================================================================

  /**
   * Khởi tạo content script
   */
  function init() {
    chrome.storage.sync.get(DEFAULTS, (settings) => {
      // Kiểm tra xem miền có được phép không
      if (!isDomainAllowed(settings)) {
        console.log('Miền này không được phép sử dụng Video Speed Controller');
        return;
      }

      // Quét video hiện tại
      scanForVideos(settings);

      // Khởi tạo MutationObserver
      initMutationObserver();

      // Khởi tạo lắng nghe tin nhắn
      initMessageListener();

      // Khởi tạo lắng nghe storage
      initStorageListener();

      // Khởi tạo phím tắt bàn phím
      initKeyListener();

      console.log('Video Speed Controller đã được khởi tạo');
    });
  }

  // Khởi tạo khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
