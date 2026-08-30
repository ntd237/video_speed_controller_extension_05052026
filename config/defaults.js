const DEFAULTS = {
  currentSpeed: 1.0,
  defaultSpeed: 1.0,
  stepSize: 0.5,
  favoriteSpeed: 2,
  autoApply: true,
  showOverlay: true,
  overlayOpacity: 0.7,
  mode: 'blacklist',   // 'blacklist' | 'whitelist'
  blacklist: [],
  whitelist: [],

  // Speed constraints
  minSpeed: 0.1,
  maxSpeed: 20.0,

  // Overlay
  overlayMinOpacity: 0.1,
  overlayMaxOpacity: 1.0,

  // Step size options shown in UI
  stepSizeOptions: [0.25, 0.5, 1.0, 2.0],
};

// --- Site entry helpers (shared by content script, popup and options) ---

const SITE_DOMAIN_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$|^localhost$/;
const SITE_IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const SITE_IPV6_REGEX = /^[0-9a-fA-F]{0,4}(:[0-9a-fA-F]{0,4}){2,7}$/;
const SITE_BRACKET_PORT_REGEX = /^\[([0-9a-fA-F:]+)\](?::(\d{1,5}))?$/;

function isValidSiteHost(host) {
  return SITE_DOMAIN_REGEX.test(host) || SITE_IPV4_REGEX.test(host) || SITE_IPV6_REGEX.test(host);
}

/**
 * Tách một entry danh sách thành { host, port } (port là null khi không có port).
 * IPv6 kèm port dùng dạng ngoặc: [::1]:8080. IPv6 trần chứa nhiều dấu ':' nên không tách port.
 * @param {string} entry
 * @returns {{host: string, port: number|null}}
 */
function parseSiteEntry(entry) {
  entry = entry.trim();
  const bracket = entry.match(SITE_BRACKET_PORT_REGEX);
  if (bracket) {
    return { host: bracket[1], port: bracket[2] ? parseInt(bracket[2], 10) : null };
  }
  const lastColon = entry.lastIndexOf(':');
  if (lastColon !== -1 && entry.indexOf(':') === lastColon && /^\d{1,5}$/.test(entry.slice(lastColon + 1))) {
    return { host: entry.slice(0, lastColon), port: parseInt(entry.slice(lastColon + 1), 10) };
  }
  return { host: entry, port: null };
}

/**
 * Kiểm tra entry hợp lệ: domain/IPv4/IPv6, port (nếu có) trong khoảng 1-65535.
 * @param {string} entry
 * @returns {boolean}
 */
function isValidSiteEntry(entry) {
  const { host, port } = parseSiteEntry(entry);
  return isValidSiteHost(host) && (port === null || (port >= 1 && port <= 65535));
}

/**
 * So khớp hostname/port của trang với một entry trong danh sách.
 * Host giữ nguyên ngữ nghĩa cũ (substring match); port chỉ kiểm tra khi entry có port.
 * @param {string} entry - Entry trong blacklist/whitelist
 * @param {string} hostname - location.hostname của trang
 * @param {string} port - location.port của trang (đã map về '80'/'443' khi là port mặc định)
 * @returns {boolean}
 */
function matchesSiteEntry(entry, hostname, port) {
  const { host, port: entryPort } = parseSiteEntry(entry);
  if (!hostname.includes(host)) return false;
  return entryPort === null || String(port) === String(entryPort);
}
