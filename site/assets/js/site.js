(function () {
  'use strict';
  var header = document.getElementById('site-header');
  var btn = document.getElementById('menu-btn');
  var links = document.getElementById('nav-links');

  function onScroll() {
    if (!header) return;
    header.classList.toggle('is-scrolled', (window.scrollY || 0) > 8);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Smooth scrolling only for in-page link clicks, so programmatic scrolls stay instant.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var root = document.documentElement;
    root.classList.add('smooth');
    setTimeout(function () { root.classList.remove('smooth'); }, 1200);
  });

  function setOpen(open) {
    if (!btn || !links) return;
    links.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (btn && links) {
    btn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(!links.classList.contains('open')); });
    links.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('click', function (e) { if (!links.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    window.addEventListener('scroll', function () { setOpen(false); }, { passive: true });
  }
  // download.orivonstack.eth opens straight at the download section.
  try {
    if (/^download\./i.test(location.hostname) && !location.hash) {
      var dl = document.getElementById('download');
      if (dl) {
        history.replaceState(null, '', location.pathname + location.search + '#download');
        dl.scrollIntoView();
        var moved = false;
        ['wheel', 'touchstart', 'keydown'].forEach(function (t) { window.addEventListener(t, function () { moved = true; }, { once: true, passive: true }); });
        window.addEventListener('load', function () { if (!moved) dl.scrollIntoView(); });
      }
    }
  } catch (e) {}

  // Download tabs: Windows, macOS, Linux. Without JS all three panels stay visible, stacked.
  (function () {
    var list = document.querySelector('.dl-tabs');
    if (!list) return;
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    var panels = {};
    tabs.forEach(function (t) {
      var p = document.getElementById(t.getAttribute('aria-controls'));
      if (!p) return;
      panels[t.id] = p;
      p.setAttribute('role', 'tabpanel');
      p.setAttribute('aria-labelledby', t.id);
    });
    if (!tabs.length || Object.keys(panels).length !== tabs.length) return;
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        panels[t.id].hidden = !on;
      });
      if (focus) tab.focus();
    }
    list.hidden = false;
    document.documentElement.classList.add('js-tabs');
    var os = document.documentElement.dataset.os || '';
    var start = document.getElementById('tab-' + (os === 'mac' || os === 'linux' ? os : 'win')) || tabs[0];
    select(start, false);
    tabs.forEach(function (t) { t.addEventListener('click', function () { select(t, false); }); });
    // A link into a hidden panel (the hero's "See the steps") selects that panel's tab first.
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      var el = a && document.getElementById(a.getAttribute('href').slice(1));
      var panel = el && el.closest('[role="tabpanel"]');
      var tab = panel && panel.hidden && document.getElementById(panel.getAttribute('aria-labelledby'));
      if (tab) select(tab, false);
    });
    list.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var n = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i + tabs.length - 1) % tabs.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = tabs.length - 1;
      if (n < 0) return;
      e.preventDefault();
      select(tabs[n], true);
    });
  })();
})();
