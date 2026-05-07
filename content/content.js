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

  // MutationObserver để theo dõi video mới
  let mutationObserver = null;

  // ============================================================================
  // Hàm tiện ích
  // ============================================================================

  /**
   * Kiểm tra xem miền hiện tại có được phép hay không dựa trên cài đặt
   * @param {Object} settings - Cài đặt từ storage
   * @returns {boolean} true nếu miền được phép
   */
  function isDomainAllowed(settings) {
    const hostname = location.hostname;
    if (settings.mode === 'blacklist') {
      return !settings.blacklist.some(d => hostname.includes(d));
    } else {
      return settings.whitelist.some(d => hostname.includes(d));
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

  /**
   * Lấy tốc độ phát lại hiện tại từ video đầu tiên (nếu có)
   * @returns {number} Tốc độ phát lại hiện tại
   */
  function getCurrentSpeed() {
    const videos = document.querySelectorAll('video');
    if (videos.length > 0) {
      return videos[0].playbackRate;
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
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      const speed = video.playbackRate || DEFAULTS.currentSpeed;
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
  function applySpeedToVideo(video, speed, settings) {
    try {
      const clampedSpeed = clampSpeed(speed);
      video.playbackRate = clampedSpeed;

      // Tạo hoặc cập nhật overlay
      updateOverlay(video, clampedSpeed, settings);

      // Đánh dấu video đã được xử lý
      processedVideos.add(video);

      // Xử lý race condition: nếu trình phát video reset playbackRate,
      // ta sẽ re-apply tốc độ mong muốn. Sử dụng counter để tránh vòng lặp vô hạn.
      let retryCount = 0;
      const maxRetries = 10;
      const handleRateChange = () => {
        // Nếu tốc độ hiện tại khác tốc độ mong muốn, re-apply
        if (Math.abs(video.playbackRate - clampedSpeed) > 0.01) {
          retryCount++;
          if (retryCount <= maxRetries) {
            video.playbackRate = clampedSpeed;
          } else {
            // Đã retry đủ lần, xóa listener
            video.removeEventListener('ratechange', handleRateChange);
          }
        } else {
          // Tốc độ đã ổn định, xóa listener
          video.removeEventListener('ratechange', handleRateChange);
        }
      };

      video.addEventListener('ratechange', handleRateChange);

      // Thêm loadstart listener để phát hiện khi video element tải nội dung mới
      // (xử lý trường hợp SPA reuse video element)
      // Chỉ thêm listener một lần để tránh duplicate
      if (!videosWithLoadstartListener.has(video)) {
        videosWithLoadstartListener.add(video);

        const handleLoadstart = () => {
          try {
            // Xóa video khỏi processedVideos để cho phép re-apply tốc độ
            processedVideos.delete(video);

            // Xóa ratechange listener cũ
            video.removeEventListener('ratechange', handleRateChange);

            // Lấy settings mới nhất từ storage
            chrome.storage.sync.get(DEFAULTS, (newSettings) => {
              try {
                if (newSettings.autoApply) {
                  // Áp dụng tốc độ mới
                  const newClampedSpeed = clampSpeed(newSettings.currentSpeed);
                  video.playbackRate = newClampedSpeed;

                  // Cập nhật overlay
                  updateOverlay(video, newClampedSpeed, newSettings);

                  // Đánh dấu video đã được xử lý
                  processedVideos.add(video);

                  // Thêm ratechange listener mới với retry logic
                  let newRetryCount = 0;
                  const newMaxRetries = 10;
                  const newHandleRateChange = () => {
                    if (Math.abs(video.playbackRate - newClampedSpeed) > 0.01) {
                      newRetryCount++;
                      if (newRetryCount <= newMaxRetries) {
                        video.playbackRate = newClampedSpeed;
                      } else {
                        video.removeEventListener('ratechange', newHandleRateChange);
                      }
                    } else {
                      video.removeEventListener('ratechange', newHandleRateChange);
                    }
                  };

                  video.addEventListener('ratechange', newHandleRateChange);
                } else {
                  // Chỉ cập nhật overlay với playbackRate hiện tại
                  updateOverlay(video, video.playbackRate || DEFAULTS.currentSpeed, newSettings);
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
    } catch (error) {
      console.error('Lỗi khi áp dụng tốc độ cho video:', error);
    }
  }

  /**
   * Áp dụng tốc độ cho tất cả video
   * @param {number} speed - Tốc độ cần áp dụng
   * @param {Object} settings - Cài đặt từ storage
   */
  function applySpeedToAllVideos(speed, settings) {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      applySpeedToVideo(video, speed, settings);
    });
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
      applySpeedToVideo(video, settings.currentSpeed, settings);
    } else {
      // Vẫn tạo overlay nhưng không áp dụng tốc độ
      updateOverlay(video, video.playbackRate || DEFAULTS.currentSpeed, settings);
      processedVideos.add(video);
    }
  }

  /**
   * Quét tất cả video hiện tại trên trang
   * @param {Object} settings - Cài đặt từ storage
   */
  function scanForVideos(settings) {
    const videos = document.querySelectorAll('video');
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
              if (node.tagName === 'VIDEO') {
                newVideos.push(node);
              }
              const videos = node.querySelectorAll('video');
              videos.forEach(video => {
                newVideos.push(video);
              });
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
            applySpeedToAllVideos(msg.speed, settings);
            sendResponse({ ok: true });
          });
          return true; // Giữ channel mở cho sendResponse không đồng bộ
        }

        if (msg.action === 'getStatus') {
          sendResponse({ currentSpeed: getCurrentSpeed() });
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
          applySpeedToAllVideos(changes.currentSpeed.newValue, settings);
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
