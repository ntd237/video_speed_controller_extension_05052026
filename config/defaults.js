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

  theme: 'system',     // 'system' | 'light' | 'dark'
  themeOptions: ['system', 'light', 'dark'],

  // Speed constraints
  minSpeed: 0.1,
  maxSpeed: 20.0,
  minStepSize: 0.01,
  maxStepSize: 20.0,
  numberInputStep: 0.01,
  speedSliderStep: 0.05,

  // Overlay
  overlayMinOpacity: 0.1,
  overlayMaxOpacity: 1.0,
  opacitySliderStep: 0.05,

  // Thời gian tối đa chờ service worker phản hồi yêu cầu đọc cài đặt
  settingsRequestTimeoutMs: 2000,

  // Step size options shown in UI
  stepSizeOptions: [0.25, 0.5, 1.0, 2.0],
};

const SITE_DOMAIN_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$|^localhost$/;
const SITE_IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const SITE_IPV6_REGEX = /^[0-9a-fA-F]{0,4}(:[0-9a-fA-F]{0,4}){2,7}$/;
const SITE_BRACKET_PORT_REGEX = /^\[([0-9a-fA-F:]+)\](?::(\d{1,5}))?$/;

function isValidSiteHost(host) {
  return SITE_DOMAIN_REGEX.test(host) || SITE_IPV4_REGEX.test(host) || SITE_IPV6_REGEX.test(host);
}

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

function isValidSiteEntry(entry) {
  const { host, port } = parseSiteEntry(entry);
  return isValidSiteHost(host) && (port === null || (port >= 1 && port <= 65535));
}

function matchesSiteEntry(entry, hostname, port) {
  const { host, port: entryPort } = parseSiteEntry(entry);
  if (!hostname.includes(host)) return false;
  return entryPort === null || String(port) === String(entryPort);
}
