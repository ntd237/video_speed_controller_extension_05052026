importScripts('../config/defaults.js');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getSettings') {
    getSettings()
      .then((settings) => sendResponse(settings))
      .catch(() => sendResponse(null));
    return true;
  }
  if (msg.action !== 'keyCommand') return;
  handleCommand(msg.command, sender.tab)
    .then((result) => sendResponse(result || { ok: true }))
    .catch(() => sendResponse({ ok: false }));
  return true;
});

let commandQueue = Promise.resolve();

function queueCommand(command) {
  const run = commandQueue.then(() => applyCommandToStorage(command));
  commandQueue = run.catch(() => {});
  return run;
}

async function handleCommand(command, tab) {
  const targetTab = tab && tab.id !== undefined ? tab : await getActiveTab();

  if (targetTab && targetTab.id !== undefined) {
    try {
      const result = await chrome.tabs.sendMessage(targetTab.id, { action: 'keyCommand', command });
      if (result && result.handled) return result;
    } catch (error) {
      console.debug('Không thể gửi phím tắt đến tab:', error.message);
    }
  }

  return queueCommand(command);
}

async function getActiveTab() {
  try {
    const focusedTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (focusedTabs && focusedTabs.length > 0) return focusedTabs[0];
  } catch (error) {
  }

  try {
    const tabs = await chrome.tabs.query({ active: true });
    return tabs && tabs.length > 0 ? tabs[0] : null;
  } catch (error) {
    return null;
  }
}

async function applyCommandToStorage(command) {
  let settings;

  try {
    settings = await getSettings();
  } catch (error) {
    console.error('Lỗi đọc cài đặt:', error);
    return { ok: false, handled: false };
  }

  if (command === 'toggle-overlay') {
    await chrome.storage.sync.set({ showOverlay: !settings.showOverlay });
    return { ok: true, handled: false };
  }

  let newSpeed = settings.currentSpeed;

  if (command === 'speed-up') {
    newSpeed = Math.min(DEFAULTS.maxSpeed, Number(settings.currentSpeed) + Number(settings.stepSize));
  } else if (command === 'speed-down') {
    newSpeed = Math.max(DEFAULTS.minSpeed, Number(settings.currentSpeed) - Number(settings.stepSize));
  } else if (command === 'speed-reset') {
    newSpeed = Number(settings.defaultSpeed);
    if (!Number.isFinite(newSpeed)) {
      newSpeed = DEFAULTS.defaultSpeed;
    }
  } else if (command === 'speed-favorite') {
    if (settings.favoriteSpeed !== null) {
      newSpeed = settings.favoriteSpeed;
    } else {
      return { ok: true, handled: true };
    }
  } else {
    return { ok: true, handled: false };
  }

  newSpeed = Math.round(newSpeed * 100) / 100;

  await chrome.storage.sync.set({ currentSpeed: newSpeed });

  return { ok: true, handled: true, currentSpeed: newSpeed };
}

async function getSettings() {
  const data = await chrome.storage.sync.get(null);
  return { ...DEFAULTS, ...data };
}
