// External script consumed by fixture-xhr-pause.html.
// Kept as a separate file so list_scripts / get_script_source can find it by URL.
window.computeSig = function computeSig(payload) {
  return btoa(JSON.stringify(payload));
};
// M7.07 multi-statement row: used by triggerPause.test.ts cases B/C.
window.packed = function packed(){ var a=1,b=2,c=btoa('x'+b),d=String(a+b+c.length);return d; };
