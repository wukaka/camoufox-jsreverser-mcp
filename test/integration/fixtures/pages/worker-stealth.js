// M7.09 worker fixture: replies to {cmd:'measure'} with the current
// navigator.webdriver + Function.prototype.toString native-check.
self.addEventListener('message', function (ev) {
  if (!ev.data || ev.data.cmd !== 'measure') return;
  var tostring = Function.prototype.toString;
  var nativeMark = false;
  try {
    nativeMark = tostring.call(tostring).indexOf('[native code]') >= 0;
  } catch (e) { /* swallow */ }
  self.postMessage({
    webdriver: navigator.webdriver,
    toStringNative: nativeMark,
  });
});
