// Popup logic

// DOM Elements
const speedDisplay = document.getElementById('speedDisplay');
const speedSlider = document.getElementById('speedSlider');
const decreaseBtn = document.getElementById('decreaseBtn');
const resetBtn = document.getElementById('resetBtn');
const increaseBtn = document.getElementById('increaseBtn');
const stepSizeInput = document.getElementById('stepSizeInput');
const stepPresetsContainer = document.getElementById('stepPresets');
const favoriteSpeedInput = document.getElementById('favoriteSpeedInput');
const saveFavoriteBtn = document.getElementById('saveFavoriteBtn');
const overlayOpacitySlider = document.getElementById('overlayOpacitySlider');
const overlayOpacityValue = document.getElementById('overlayOpacityValue');
const siteToggle = document.getElementById('siteToggle');
const siteToggleLabel = document.getElementById('siteToggleLabel');
const settingsBtn = document.getElementById('settingsBtn');

// State
let currentSpeed = DEFAULTS.currentSpeed;
let stepSize = DEFAULTS.stepSize;
let favoriteSpeed = DEFAULTS.favoriteSpeed;
let overlayOpacity = DEFAULTS.overlayOpacity;
let currentDomain = '';
let isBlacklistMode = DEFAULTS.mode === 'blacklist';
let blacklist = [];
let whitelist = [];

// Initialize popup
async function initPopup() {
  try {
    // Load settings from storage
    const settings = await chrome.storage.sync.get(null);

    currentSpeed = settings.currentSpeed ?? DEFAULTS.currentSpeed;
    stepSize = settings.stepSize ?? DEFAULTS.stepSize;
    favoriteSpeed = settings.favoriteSpeed ?? DEFAULTS.favoriteSpeed;
    overlayOpacity = settings.overlayOpacity ?? DEFAULTS.overlayOpacity;
    isBlacklistMode = (settings.mode ?? DEFAULTS.mode) === 'blacklist';
    blacklist = settings.blacklist ?? DEFAULTS.blacklist;
    whitelist = settings.whitelist ?? DEFAULTS.whitelist;

    // Get current tab URL and extract domain
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      const url = new URL(tabs[0].url);
      currentDomain = url.hostname;
    }

    // Render UI
    renderUI();
    attachEventListeners();

    // Query content script for current speed
    if (tabs.length > 0) {
      try {
        const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'getStatus' });
        if (response && response.currentSpeed !== undefined) {
          currentSpeed = response.currentSpeed;
          updateSpeedDisplay();
        }
      } catch (err) {
        // Content script not available on this tab
      }
    }
  } catch (err) {
    console.error('Error initializing popup:', err);
  }
}

// Render UI elements
function renderUI() {
  // Update speed display and slider
  updateSpeedDisplay();

  // Render step size presets
  renderStepPresets();

  // Update step size input
  stepSizeInput.value = stepSize.toFixed(2);

  // Update favorite speed input
  if (favoriteSpeed !== null) {
    favoriteSpeedInput.value = favoriteSpeed.toFixed(2);
  } else {
    favoriteSpeedInput.value = '';
  }

  // Update overlay opacity slider
  overlayOpacitySlider.value = overlayOpacity;
  overlayOpacityValue.textContent = overlayOpacity.toFixed(2);

  // Update site toggle
  const isEnabled = isSiteEnabled();
  siteToggle.checked = isEnabled;
  updateSiteToggleLabel();
}

// Render step size preset buttons
function renderStepPresets() {
  stepPresetsContainer.innerHTML = '';
  DEFAULTS.stepSizeOptions.forEach(option => {
    const btn = document.createElement('button');
    btn.className = 'btn-preset' + (option === stepSize ? ' active' : '');
    btn.textContent = option % 1 === 0 ? option + '' : option + '';
    btn.title = option;
    btn.addEventListener('click', () => selectStepPreset(option));
    stepPresetsContainer.appendChild(btn);
  });
}

// Select a step size preset
async function selectStepPreset(value) {
  stepSize = value;
  stepSizeInput.value = value.toFixed(2);
  renderStepPresets();
  await chrome.storage.sync.set({ stepSize });
}

// Update speed display and slider
function updateSpeedDisplay() {
  const displaySpeed = currentSpeed.toFixed(2);
  speedDisplay.textContent = displaySpeed + 'x';
  speedSlider.value = currentSpeed.toString();
}

// Update site toggle label
function updateSiteToggleLabel() {
  if (currentDomain) {
    siteToggleLabel.textContent = `Bật trên ${currentDomain}`;
  } else {
    siteToggleLabel.textContent = 'Bật trên trang này';
  }
}

// Check if site is enabled
function isSiteEnabled() {
  if (isBlacklistMode) {
    // In blacklist mode, enabled if NOT in blacklist
    return !blacklist.includes(currentDomain);
  } else {
    // In whitelist mode, enabled if in whitelist
    return whitelist.includes(currentDomain);
  }
}

// Attach event listeners
function attachEventListeners() {
  // Speed slider
  speedSlider.addEventListener('input', handleSpeedChange);

  // Speed buttons
  decreaseBtn.addEventListener('click', () => changeSpeed(-stepSize));
  resetBtn.addEventListener('click', () => changeSpeed(DEFAULTS.defaultSpeed - currentSpeed));
  increaseBtn.addEventListener('click', () => changeSpeed(stepSize));

  // Step size input
  stepSizeInput.addEventListener('change', handleStepSizeChange);
  stepSizeInput.addEventListener('blur', handleStepSizeChange);

  // Favorite speed input
  favoriteSpeedInput.addEventListener('blur', handleFavoriteSpeedInput);
  favoriteSpeedInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleFavoriteSpeedInput();
    }
  });

  // Save favorite button
  saveFavoriteBtn.addEventListener('click', handleSaveFavorite);

  // Overlay opacity slider
  overlayOpacitySlider.addEventListener('input', handleOpacityChange);

  // Site toggle
  siteToggle.addEventListener('change', handleSiteToggle);

  // Settings button
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

// Handle speed change from slider
async function handleSpeedChange(e) {
  const newSpeed = parseFloat(e.target.value);
  await setSpeed(newSpeed);
}

// Change speed by delta
async function changeSpeed(delta) {
  const newSpeed = Math.max(
    DEFAULTS.minSpeed,
    Math.min(DEFAULTS.maxSpeed, currentSpeed + delta)
  );
  await setSpeed(newSpeed);
}

// Set speed and send to content script
async function setSpeed(speed) {
  // Clamp and round
  speed = Math.max(DEFAULTS.minSpeed, Math.min(DEFAULTS.maxSpeed, speed));
  speed = Math.round(speed * 100) / 100;

  currentSpeed = speed;

  // Update display
  updateSpeedDisplay();

  // Save to storage
  await chrome.storage.sync.set({ currentSpeed: speed });

  // Send to content script
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) {
    try {
      await chrome.tabs.sendMessage(tabs[0].id, {
        action: 'setSpeed',
        speed: speed
      });
    } catch (err) {
      // Content script not available
    }
  }
}

// Handle step size change
async function handleStepSizeChange(e) {
  let value = parseFloat(e.target.value);
  // Clamp to valid range and round to 2 decimals
  value = Math.max(DEFAULTS.minSpeed, Math.min(DEFAULTS.maxSpeed, value));
  value = Math.round(value * 100) / 100;
  stepSize = value;
  stepSizeInput.value = value.toFixed(2);
  renderStepPresets();
  await chrome.storage.sync.set({ stepSize });
}

// Handle favorite speed input
async function handleFavoriteSpeedInput() {
  const value = favoriteSpeedInput.value.trim();

  if (value === '') {
    favoriteSpeed = null;
  } else {
    let speed = parseFloat(value);
    if (!isNaN(speed)) {
      speed = Math.max(DEFAULTS.minSpeed, Math.min(DEFAULTS.maxSpeed, speed));
      speed = Math.round(speed * 100) / 100;
      favoriteSpeed = speed;
      favoriteSpeedInput.value = speed.toFixed(2);
    } else {
      // Invalid input, revert
      if (favoriteSpeed !== null) {
        favoriteSpeedInput.value = favoriteSpeed.toFixed(2);
      } else {
        favoriteSpeedInput.value = '';
      }
    }
  }

  await chrome.storage.sync.set({ favoriteSpeed });
}

// Handle save favorite button
async function handleSaveFavorite() {
  const inputValue = favoriteSpeedInput.value.trim();
  let speed;
  if (inputValue !== '') {
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      speed = Math.max(DEFAULTS.minSpeed, Math.min(DEFAULTS.maxSpeed, parsed));
      speed = Math.round(speed * 100) / 100;
    }
  }
  if (speed === undefined) {
    speed = currentSpeed;
  }
  favoriteSpeed = speed;
  favoriteSpeedInput.value = speed.toFixed(2);
  await chrome.storage.sync.set({ favoriteSpeed });
}

// Handle overlay opacity change
async function handleOpacityChange(e) {
  overlayOpacity = parseFloat(e.target.value);
  overlayOpacityValue.textContent = overlayOpacity.toFixed(2);
  await chrome.storage.sync.set({ overlayOpacity });
}

// Handle site toggle
async function handleSiteToggle(e) {
  const isEnabled = e.target.checked;

  if (isBlacklistMode) {
    // Blacklist mode
    if (isEnabled) {
      // Remove from blacklist
      blacklist = blacklist.filter(domain => domain !== currentDomain);
    } else {
      // Add to blacklist
      if (!blacklist.includes(currentDomain)) {
        blacklist.push(currentDomain);
      }
    }
  } else {
    // Whitelist mode
    if (isEnabled) {
      // Add to whitelist
      if (!whitelist.includes(currentDomain)) {
        whitelist.push(currentDomain);
      }
    } else {
      // Remove from whitelist
      whitelist = whitelist.filter(domain => domain !== currentDomain);
    }
  }

  await chrome.storage.sync.set({ blacklist, whitelist });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initPopup);

// Live-update popup UI when storage changes from outside (keyboard shortcuts)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.currentSpeed) {
    currentSpeed = changes.currentSpeed.newValue;
    updateSpeedDisplay();
  }
});

// Keyboard shortcuts inside popup (D/S/R/G/V)
const POPUP_KEY_MAP = {
  'd': 'speed-up',
  's': 'speed-down',
  'r': 'speed-reset',
  'g': 'speed-favorite',
  'v': 'toggle-overlay',
};

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const command = POPUP_KEY_MAP[e.key.toLowerCase()];
  if (!command) return;
  e.preventDefault();
  chrome.runtime.sendMessage({ action: 'keyCommand', command });
});
