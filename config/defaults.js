const DEFAULTS = {
  currentSpeed: 1.0,
  defaultSpeed: 1.0,
  stepSize: 0.5,
  favoriteSpeed: 3,
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
