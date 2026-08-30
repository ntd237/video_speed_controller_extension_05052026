// Load settings on page load
document.addEventListener('DOMContentLoaded', initializeOptions);

// Event listeners
document.getElementById('mode-blacklist').addEventListener('change', handleModeChange);
document.getElementById('mode-whitelist').addEventListener('change', handleModeChange);

document.getElementById('blacklist-add-btn').addEventListener('click', () => saveDomainList('blacklist'));
document.getElementById('whitelist-add-btn').addEventListener('click', () => saveDomainList('whitelist'));

// Nút Lưu chỉ bật khi textarea có thay đổi so với lần lưu gần nhất
document.getElementById('blacklist-input').addEventListener('input', () => updateSaveButtonState('blacklist'));
document.getElementById('whitelist-input').addEventListener('input', () => updateSaveButtonState('whitelist'));

document.getElementById('default-speed').addEventListener('input', updateDefaultSpeedDisplay);
document.getElementById('overlay-opacity').addEventListener('input', updateOpacityDisplay);

document.getElementById('save-btn').addEventListener('click', saveSettings);

// Snapshot nội dung đã lưu của mỗi danh sách để so sánh trạng thái nút Lưu
const savedSnapshots = {};

// Initialize options page
function initializeOptions() {
  // Load settings from storage
  chrome.storage.sync.get(null, (stored) => {
    const settings = { ...DEFAULTS, ...stored };

    // Set step size input
    const stepSizeInput = document.getElementById('step-size');
    stepSizeInput.value = settings.stepSize.toFixed(2);

    // Set mode radio buttons
    document.getElementById(`mode-${settings.mode}`).checked = true;
    updateModeVisibility(settings.mode);

    // Set speed sliders and inputs
    document.getElementById('default-speed').value = settings.defaultSpeed;
    updateDefaultSpeedDisplay();

    document.getElementById('overlay-opacity').value = settings.overlayOpacity;
    updateOpacityDisplay();

    // Set favorite speed
    if (settings.favoriteSpeed !== null) {
      document.getElementById('favorite-speed').value = settings.favoriteSpeed;
    }

    // Set toggles
    document.getElementById('show-overlay').checked = settings.showOverlay;
    document.getElementById('auto-apply').checked = settings.autoApply;

    // Nạp sẵn danh sách đã lưu vào textarea (mỗi dòng một entry)
    savedSnapshots.blacklist = settings.blacklist.join('\n');
    savedSnapshots.whitelist = settings.whitelist.join('\n');
    document.getElementById('blacklist-input').value = savedSnapshots.blacklist;
    document.getElementById('whitelist-input').value = savedSnapshots.whitelist;
    updateSaveButtonState('blacklist');
    updateSaveButtonState('whitelist');
  });
}

// Handle mode change
function handleModeChange(e) {
  const newMode = e.target.value;
  updateModeVisibility(newMode);
}

// Update visibility of domain list sections
function updateModeVisibility(mode) {
  const blacklistSection = document.getElementById('blacklist-section');
  const whitelistSection = document.getElementById('whitelist-section');

  if (mode === 'blacklist') {
    blacklistSection.style.display = 'block';
    whitelistSection.style.display = 'none';
  } else {
    blacklistSection.style.display = 'none';
    whitelistSection.style.display = 'block';
  }
}

// Bật nút Lưu khi nội dung textarea khác với lần lưu gần nhất, tắt khi đã khớp
function updateSaveButtonState(listType) {
  const input = document.getElementById(`${listType}-input`);
  const btn = document.getElementById(`${listType}-add-btn`);
  btn.disabled = input.value === savedSnapshots[listType];
}

// Save toàn bộ danh sách từ textarea (textarea là trình soạn thảo của danh sách,
// nội dung khi bấm Lưu sẽ thay thế hoàn toàn danh sách đã lưu)
function saveDomainList(listType) {
  const inputId = `${listType}-input`;
  const input = document.getElementById(inputId);

  // Tách theo dòng, trim, bỏ dòng rỗng, strip http/https prefix
  const entries = input.value
    .split('\n')
    .map((line) => line.trim().replace(/^https?:\/\//, '').replace(/\/$/, ''))
    .filter((line) => line.length > 0);

  // Gom các entry không hợp lệ vào một alert duy nhất, chặn toàn bộ lần lưu này
  const invalid = entries.filter((entry) => !isValidSiteEntry(entry));
  if (invalid.length > 0) {
    alert('Tên miền không hợp lệ:\n' + invalid.join('\n'));
    return;
  }

  // Bỏ dòng trùng lặp (giữ lần xuất hiện đầu), ghi đè toàn bộ danh sách
  const newList = [...new Set(entries)];
  chrome.storage.sync.set({ [listType]: newList }, () => {
    savedSnapshots[listType] = newList.join('\n');
    input.value = savedSnapshots[listType];
    updateSaveButtonState(listType);
    input.focus();
  });
}

// Update default speed display
function updateDefaultSpeedDisplay() {
  const slider = document.getElementById('default-speed');
  const valueSpan = document.getElementById('default-speed-value');
  const value = parseFloat(slider.value);
  valueSpan.textContent = value.toFixed(2) + 'x';
}

// Update opacity display
function updateOpacityDisplay() {
  const slider = document.getElementById('overlay-opacity');
  const valueSpan = document.getElementById('overlay-opacity-value');
  const value = parseFloat(slider.value);
  valueSpan.textContent = value.toFixed(2);
}

// Save all settings
function saveSettings() {
  // Collect all values
  let stepSize = parseFloat(document.getElementById('step-size').value);
  // Clamp step size to valid range and round to 2 decimals
  stepSize = Math.max(DEFAULTS.minSpeed, Math.min(DEFAULTS.maxSpeed, stepSize));
  stepSize = Math.round(stepSize * 100) / 100;

  const settings = {
    mode: document.querySelector('input[name="mode"]:checked').value,
    stepSize: stepSize,
    defaultSpeed: parseFloat(document.getElementById('default-speed').value),
    favoriteSpeed: document.getElementById('favorite-speed').value
      ? parseFloat(document.getElementById('favorite-speed').value)
      : null,
    showOverlay: document.getElementById('show-overlay').checked,
    overlayOpacity: parseFloat(document.getElementById('overlay-opacity').value),
    autoApply: document.getElementById('auto-apply').checked,
  };

  // Validate speed values
  if (
    settings.defaultSpeed < DEFAULTS.minSpeed ||
    settings.defaultSpeed > DEFAULTS.maxSpeed
  ) {
    alert(`Tốc độ mặc định phải nằm trong khoảng ${DEFAULTS.minSpeed} - ${DEFAULTS.maxSpeed}`);
    return;
  }

  if (
    settings.favoriteSpeed !== null &&
    (settings.favoriteSpeed < DEFAULTS.minSpeed || settings.favoriteSpeed > DEFAULTS.maxSpeed)
  ) {
    alert(`Tốc độ yêu thích phải nằm trong khoảng ${DEFAULTS.minSpeed} - ${DEFAULTS.maxSpeed}`);
    return;
  }

  if (
    settings.overlayOpacity < DEFAULTS.overlayMinOpacity ||
    settings.overlayOpacity > DEFAULTS.overlayMaxOpacity
  ) {
    alert(
      `Độ trong suốt phải nằm trong khoảng ${DEFAULTS.overlayMinOpacity} - ${DEFAULTS.overlayMaxOpacity}`
    );
    return;
  }

  // Save to storage
  chrome.storage.sync.set(settings, () => {
    // Show success message
    const saveMessage = document.getElementById('save-message');
    saveMessage.style.display = 'block';

    // Hide after 2 seconds
    setTimeout(() => {
      saveMessage.style.display = 'none';
    }, 2000);
  });
}
