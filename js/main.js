/* Boot: load content (live JSON over http, bundled copy offline), then show the title screen */
(function (BH) {
  BH.Content.init(() => {
    BH.UI.init();
    BH.UI.go('title');
  });

  // Offline support when served over http(s). Opening index.html directly also works offline.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})(window.BH);
