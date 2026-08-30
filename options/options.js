// Load settings on page load
document.addEventListener('DOMContentLoaded', initializeOptions);

// Event listeners
document.getElementById('mode-blacklist').addEventListener('change', handleModeChange);
document.getElementById('mode-whitelist').addEventListener('change', handleModeChange);

document.getElementById('blacklist-add-btn').addEventListener('click', () => addDomain('blacklist'));
document.getElementById('whitelist-add-btn').addEventListener('click', () => addDomain('whitelist'));

document.getElementById('blacklist-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addDomain('blacklist');
});
document.getElementById('whitelist-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addDomain('whitelist');
});

document.getElementById('default-speed').addEventListener('input', updateDefaultSpeedDisplay);
document.getElementById('overlay-opacity').addEventListener('input', updateOpacityDisplay);

document.getElementById('save-btn').addEventListener('click', saveSettings);

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

    // Populate domain lists
    renderDomainList('blacklist', settings.blacklist);
    renderDomainList('whitelist', settings.whitelist);
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

// Add domain to list
function addDomain(listType) {
  const inputId = `${listType}-input`;
  const input = document.getElementById(inputId);
  let domain = input.value.trim();

  // Validate domain
  if (!domain) {
    alert('Vui lòng nhập tên miền');
    return;
  }

  // Strip http/https prefix if present
  domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Basic domain/IP validation (hỗ trợ domain, IPv4/IPv6, kèm hoặc không kèm port)
  if (!isValidSiteEntry(domain)) {
    alert('Tên miền không hợp lệ');
    return;
  }

  // Get current list
  chrome.storage.sync.get([listType], (result) => {
    const list = result[listType] || DEFAULTS[listType];

    // Check if domain already exists
    if (list.includes(domain)) {
      alert('Tên miền này đã có trong danh sách');
      return;
    }

    // Add domain
    list.push(domain);
    chrome.storage.sync.set({ [listType]: list }, () => {
      renderDomainList(listType, list);
      input.value = '';
      input.focus();
    });
  });
}

// Remove domain from list
function removeDomain(listType, domain) {
  chrome.storage.sync.get([listType], (result) => {
    let list = result[listType] || DEFAULTS[listType];
    list = list.filter((d) => d !== domain);
    chrome.storage.sync.set({ [listType]: list }, () => {
      renderDomainList(listType, list);
    });
  });
}

// Render domain list
function renderDomainList(listType, domains) {
  const listContainer = document.getElementById(`${listType}-list`);
  listContainer.innerHTML = '';

  if (domains.length === 0) {
    listContainer.innerHTML = '<p class="empty-list">Danh sách trống</p>';
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'domain-items';

  domains.forEach((domain) => {
    const li = document.createElement('li');
    li.className = 'domain-item';

    const domainSpan = document.createElement('span');
    domainSpan.className = 'domain-name';
    domainSpan.textContent = domain;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-remove';
    removeBtn.textContent = 'Xóa';
    removeBtn.addEventListener('click', () => removeDomain(listType, domain));

    li.appendChild(domainSpan);
    li.appendChild(removeBtn);
    ul.appendChild(li);
  });

  listContainer.appendChild(ul);
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
