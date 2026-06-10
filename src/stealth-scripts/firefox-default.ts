export const FIREFOX_DEFAULT_STEALTH = `(function(){
  try {
    Object.defineProperty(navigator, 'webdriver', { get: function(){ return false; }, configurable: true });
  } catch (e) {}

  try {
    var keys = Object.getOwnPropertyNames(window);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (typeof k === 'string' && (k.indexOf('__webdriver_') === 0 || k.indexOf('cdc_') === 0)) {
        try { delete window[k]; } catch (e) {}
      }
    }
  } catch (e) {}

  try {
    Object.defineProperty(navigator, 'languages', { get: function(){ return ['en-US', 'en']; }, configurable: true });
  } catch (e) {}

  try {
    var origQuery = navigator.permissions && navigator.permissions.query;
    if (origQuery) {
      navigator.permissions.query = function(params) {
        if (params && params.name === 'notifications') {
          return Promise.resolve({ state: 'denied', onchange: null });
        }
        return origQuery.apply(navigator.permissions, arguments);
      };
    }
  } catch (e) {}

  try {
    if (typeof window.chrome === 'undefined') {
      window.chrome = { runtime: {} };
    }
  } catch (e) {}
})();
`;
