// Error and latency monitoring for prism.jeremyfhall.com. It starts on that host only, and does nothing anywhere
// else.
(function () {
  'use strict';
  var HOST = 'prism.jeremyfhall.com';
  var SITE = 'prism';
  if (window.location.hostname !== HOST || window.__jfhTelemetryStarted || !window.Traceway || !window.fetch) return;
  window.__jfhTelemetryStarted = true;
  function mask() {
    var fields = document.querySelectorAll('input, textarea, select, [contenteditable="true"]');
    for (var i = 0; i < fields.length; i++) fields[i].classList.add('rr-mask', 'rr-ignore', 'rr-block');
  }
  mask();
  if (window.MutationObserver) new MutationObserver(mask).observe(document.documentElement, { childList: true, subtree: true });
  window.fetch('https://blog.jeremyfhall.com/api/telemetry-config?site=' + SITE)
    .then(function (response) { return response.ok ? response.json() : null; })
    .then(function (config) {
      if (!config || !config.connectionString) return;
      var Traceway = window.Traceway;
      Traceway.init(config.connectionString, {
        recordAllSessions: true, sessionRecording: true, captureNavigation: true,
        captureNetwork: true, captureLogs: false, captureHttpServerErrors: true,
        version: 'atlas-site-2026-10-11'
      });
      Traceway.setAttribute('site', HOST);
      var report = function (metric) { Traceway.recordAction('performance', metric.name, { value: metric.value, rating: metric.rating }); };
      if (window.webVitals) ['onCLS', 'onINP', 'onLCP', 'onFCP', 'onTTFB'].forEach(function (name) { window.webVitals[name](report); });
      document.addEventListener('click', function (event) {
        var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
        if (link) Traceway.recordAction('navigation', 'link-click', { path: new URL(link.href, window.location.href).pathname });
      });
    })
    ['catch'](function () {});
}());
