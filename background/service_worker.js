// Service worker: keyboard commands
// Tải DEFAULTS từ config/defaults.js
importScripts('../config/defaults.js');

/**
 * Lắng nghe tin nhắn từ content script (phím tắt) và xử lý lệnh
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'keyCommand') return;
  handleCommand(msg.command, sender.tab).then(() => sendResponse({ ok: true }));
  return true;
});

/**
 * Xử lý lệnh tốc độ / overlay
 * @param {string} command - Tên lệnh: speed-up|speed-down|speed-reset|speed-favorite|toggle-overlay
 * @param {Object} tab - Tab nguồn từ sender
 */
async function handleCommand(command, tab) {
  try {
    const settings = await getSettings();

    if (command === 'toggle-overlay') {
      await chrome.storage.sync.set({ showOverlay: !settings.showOverlay });
      return;
    }

    let newSpeed = settings.currentSpeed;

    if (command === 'speed-up') {
      newSpeed = Math.min(DEFAULTS.maxSpeed, settings.currentSpeed + settings.stepSize);
    } else if (command === 'speed-down') {
      newSpeed = Math.max(DEFAULTS.minSpeed, settings.currentSpeed - settings.stepSize);
    } else if (command === 'speed-reset') {
      newSpeed = DEFAULTS.defaultSpeed;
    } else if (command === 'speed-favorite') {
      if (settings.favoriteSpeed !== null) {
        newSpeed = settings.favoriteSpeed;
      } else {
        return;
      }
    } else {
      return;
    }

    // Làm tròn tốc độ đến 2 chữ số thập phân để tránh lỗi floating point
    newSpeed = Math.round(newSpeed * 100) / 100;

    if (tab) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'setSpeed', speed: newSpeed });
        if (response?.canControlSpeed === false) {
          return;
        }
      } catch (error) {
        console.debug('Không thể gửi tin nhắn đến tab:', error.message);
      }
    }

    await chrome.storage.sync.set({ currentSpeed: newSpeed });
  } catch (error) {
    console.error('Lỗi xử lý lệnh:', error);
  }
}

/**
 * Đọc cài đặt từ chrome.storage.sync
 * @returns {Promise<Object>} Đối tượng cài đặt
 */
async function getSettings() {
  const data = await chrome.storage.sync.get(null);
  return { ...DEFAULTS, ...data };
}
