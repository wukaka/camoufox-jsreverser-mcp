// External script consumed by fixture-xhr-pause.html.
// Kept as a separate file so list_scripts / get_script_source can find it by URL.
window.computeSig = function computeSig(payload) {
  return btoa(JSON.stringify(payload));
};
