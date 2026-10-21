/*!
 * orivon-download.js  -  shared OS-detecting download wiring for the Orivon sites.
 * Vanilla JS, no dependencies, ES2019, IIFE, safe with <script defer>. Include once per page.
 * Works with a baked fallback release (TAG below) immediately, then upgrades to the live GitHub release
 * (api.github.com, 4 s timeout, cached 15 min in sessionStorage). Without JS the page keeps
 * whatever static hrefs you wrote (hero -> #download, packages -> baked URLs, Store -> web link).
 *
 * CONFIG (top of the IIFE)
 *   STORE      Microsoft Store identity. Setting productId (the 9N... id from Partner Center) switches
 *              every Store link to it; until then the package family name (pfn) and a Store search are used.
 *   WINGET_ID  the winget package id, MAC_CMD  the one-line macOS install command.
 *
 * DATA-ATTRIBUTE API (all optional, any element, any number of each)
 *   [data-dl="auto"]     Hero button. Its href and action depend on the detected OS:
 *                          win     href = the Microsoft Store app link (ms-windows-store://pdp/...), text unchanged.
 *                                  With ?app= and a tagged installer in the release: href = that .exe, and a click
 *                                  downloads it and reveals [data-dl="hint"][data-for="win"] (the SmartScreen steps).
 *                          mac     a copy action: a click copies MAC_CMD (href stays #download as the fallback if
 *                                  copying is impossible). Label -> "Copy install command", then "Copied. Paste it
 *                                  in Terminal" for 4 s, and [data-dl="hint"][data-for="mac"] is revealed.
 *                          linux   href = the .deb.   mobile/unknown: href "#download", text unchanged.
 *                        Gets data-dl-platform and data-dl-mode (store | copy | file | page). The label is the
 *                        child [data-dl-label] (text only changes on mac); icons: child .ico-dl and .ico-copy.
 *   [data-dl="detail"]   Text: win "Free on the Microsoft Store · Windows 10 and 11"; mac the shortened command
 *                        "curl -fsSL …/install-macos.sh | bash" (class is-cmd, title = full command);
 *                        linux "v0.0.5 · Linux · .deb · 122 MB"; mobile: "A desktop browser for Linux,
 *                        Windows and macOS"; unknown: "For Linux, Windows and macOS".
 *   [data-dl="alt"]      Secondary choice. win: "winget or installer" -> #download; mac: "Prefer a .dmg?" ->
 *                        the .dmg for this Mac (Apple silicon or Intel); linux: "AppImage for any distro".
 *                        Otherwise hidden=true; when shown the hidden attribute is removed.
 *   [data-dl="hint"]     Hint under the hero button for the OS in its data-for (win | mac, default mac); hidden
 *                        until the hero was used on that OS (win: the tagged installer's download started; mac:
 *                        the command copied).
 *   [data-dl="note"]     First-run hint. win: "The installer isn't signed yet: More info → Run anyway."
 *                        mac: "First open: System Settings → Privacy & Security → Open Anyway."
 *                        else empty string.
 *   [data-dl-store]      Microsoft Store link. Static href = the web link (apps.microsoft.com); on Windows the
 *                        app link is set, so one click opens the Store page.
 *   [data-copy="<text>"] | [data-copy-from="<id>"]
 *                        Copy button (any element, one shared handler). Copies the text, or the text of the
 *                        element with that id. A child <span> shows "Copied" for 2 s (class is-copied); the
 *                        result is announced in #dl-live (a polite live region, created if missing).
 *   [data-dl-os="win|mac|linux"]  class "is-detected" on the match, removed from the others.
 *   [data-dl-asset="win-x64|mac-arm64|mac-x64|linux-deb|linux-appimage"]
 *                        href = download URL; class "is-detected" on the one equal to the detected platform.
 *   [data-dl-size="<key>"]  "122 MB".
 *   [data-dl-name="<key>"]  the file name, e.g. "Orivon-Setup-0.0.5-x64.exe".
 *   [data-dl-sha="<key>"]   first 8 hex + "…", title = full hex; with attribute data-full the full hex is the text.
 *                           Hidden if the live file has no known digest.
 *   [data-dl-version]       release tag, e.g. "v0.0.5".
 *   [data-dl-date]          "6 Oct 2026" (en-GB).
 *   [data-dl-notes]         href = release page.
 *   [data-dl-source]        href = source tree at the release tag.
 *   [data-dl-ipfs]          text "ipfs://bafybe…35tu", title "ipfs://<cid>"; on an <a> also href "ipfs://<cid>".
 *                           Hidden (hidden=true) when no CID is known.
 *
 * APP LINK  (?app=<id>, needs orivon-flavours.js; without it, or for any value not on its allowlist, nothing below happens)
 *   An allowlisted id (see orivon-flavours.js) makes the page offer that app. Only the allowlisted name is shown,
 *   always through textContent; the raw query string is never written into the page or sent anywhere.
 *   [data-app-head]       block above the tabs, shown for a valid id.
 *   [data-app-name]       the app's name.   [data-app-community]  "A community build by Orivon, not the official <name>."
 *   [data-app-open-row]   "Open in Orivon" row, shown only when OPEN_IN_ORIVON is true:
 *     [data-app-open]       href = orivon:open?u=<address>&flavour=<id>;  [data-app-copy-address]  copies ipfs://<address>.
 *   [data-app-offer="win|mac|linux"]  block at the top of that OS panel. win and linux are shown only when the latest
 *                         release has the tagged package (Orivon-Setup-<ver>-x64.<id>.exe, Orivon-<ver>-x86_64.<id>.AppImage):
 *     [data-app-pkg]        href = the tagged package;  [data-app-size], [data-app-sha] (full hex, hidden without a digest)
 *     [data-app-opens]      "After installing, Orivon opens <name>."
 *   macOS always gets the id in the install command (#cmd-mac, the hero copy and its detail line).
 *   The hero offers the tagged .exe on Windows (instead of the Store) and the tagged AppImage on Linux when the
 *   release has them.
 *
 * OUTPUTS
 *   <html data-os="win|mac|linux|mobile|unknown" data-arch="arm64|x64|" data-platform="<asset key>|">
 *     (data-os / data-platform are set synchronously at load; Apple silicon vs Intel refined shortly after.)
 *   window.OrivonDownload = { os, platform, release, ready: Promise, app: the ?app= entry or null, buildRelease(list) }  (ready resolves after the live apply
 *     or after the live fetch failed and the fallback stays).
 *   document event "orivon:download-ready", detail {source: "fallback" | "api"}, fired after every apply.
 *   Never throws or logs to the console: API down, storage blocked, clipboard denied, missing elements are all fine.
 */
(function () {
  'use strict';
  // Microsoft Store: setting productId (from Partner Center) switches every Store link to it.
  var STORE = { productId: '', pfn: 'OrivonBrowser.OrivonBrowser_vv109psb4rm8a', name: 'Orivon Browser' };
  var WINGET_ID = 'Orivon.Browser.Preview';
  var MAC_CMD = 'curl -fsSL https://raw.githubusercontent.com/OrivonBrowser/orivon-mvp/main/scripts/install-macos.sh | bash';
  var MAC_CMD_SHORT = 'curl -fsSL \u2026/install-macos.sh | bash';
  // The "Open in Orivon" link needs a released Orivon that handles orivon: links. Keep false until one is out.
  var OPEN_IN_ORIVON = false;
  var F = window.OrivonFlavours || null;
  var APP = null;
  try { APP = F ? F.parseApp(location.search) : null; } catch (e) { APP = null; }
  if (APP) { MAC_CMD = F.macCommand(MAC_CMD, APP); MAC_CMD_SHORT = F.macCommand(MAC_CMD_SHORT, APP); }
  var STORE_APP = 'ms-windows-store://pdp/?' + (STORE.productId ? 'ProductId=' + STORE.productId : 'PFN=' + STORE.pfn);
  var STORE_WEB = STORE.productId ? 'https://apps.microsoft.com/detail/' + STORE.productId
    : 'https://apps.microsoft.com/search?query=' + encodeURIComponent(STORE.name);
  var REPO = 'OrivonBrowser/orivon-mvp';
  var GH = 'https://github.com/' + REPO;
  var API = 'https://api.github.com/repos/' + REPO + '/releases?per_page=10';
  var CACHE_KEY = 'orivon-dl-v1', CACHE_MS = 15 * 60 * 1000, TIMEOUT_MS = 4000;
  var KEYS = ['win-x64', 'mac-arm64', 'mac-x64', 'linux-deb', 'linux-appimage'];
  var PATTERNS = {
    'win-x64': /^Orivon-Setup-.+-x64\.exe$/,
    'mac-arm64': /^Orivon-.+-arm64\.dmg$/,
    'mac-x64': /^Orivon-.+-x64\.dmg$/,
    'linux-deb': /^orivon_.+_amd64\.deb$/,
    'linux-appimage': /^Orivon-.+-x86_64\.AppImage$/
  };
  // release:begin (generated by scripts/sync-release.mjs, do not edit by hand)
  var TAG = 'v0.0.8';
  function baked(file, size, sha) {
    return { name: file, url: GH + '/releases/download/' + TAG + '/' + file, size: size, sha: sha };
  }
  var FALLBACK = {
    tag: TAG,
    published: '2026-10-17T18:10:52Z',
    url: GH + '/releases/tag/' + TAG,
    cid: 'bafybeib4liozf4uwoq57zklkldjtfx5e7u65yl2e4prn3evpl6si3qgwr4',
    assets: {
      'win-x64': baked('Orivon-Setup-0.0.8-x64.exe', 136692189, 'aaf02abe8a63433eb808bd7607f80aba1d416f804930fda88a84e5caed2866c2'),
      'mac-arm64': baked('Orivon-0.0.8-arm64.dmg', 163494340, '92175230dbc1802563edd481458e6fe41a4560133bafde9a4efa7002cbc5a7ec'),
      'mac-x64': baked('Orivon-0.0.8-x64.dmg', 170324820, '98ff5a0265cb11291a962b0d23252b9d9e55b2113b055b8ca14348672a8cba62'),
      'linux-deb': baked('orivon_0.0.8_amd64.deb', 125166248, '985b53fd5dfb2d45884e26bdde0ace27cc32adfe34b316cf7b7097ad873a3a96'),
      'linux-appimage': baked('Orivon-0.0.8-x86_64.AppImage', 161767956, 'f555b52a5a284843655b9c94f2137ac6a0b66248f433ef7e2e0ab8d8e7b3be28')
    },
    tagged: {}
  };
  // release:end

  var doc = document, root = doc.documentElement, nav = navigator;

  // ---- detection -------------------------------------------------------------------------------
  function detect() {
    var ua = '', plat = '', touch = 0;
    try { ua = nav.userAgent || ''; } catch (e) {}
    try { plat = (nav.userAgentData && nav.userAgentData.platform) || nav.platform || ''; } catch (e) {}
    try { touch = nav.maxTouchPoints || 0; } catch (e) {}
    var both = plat + ' ' + ua;
    if (/Android|iPhone|iPad|iPod/i.test(ua) || (/Mac/.test(plat) && touch > 1)) return { os: 'mobile', platform: '' };
    if (/Win/.test(both)) return { os: 'win', platform: 'win-x64' };
    if (/Mac/.test(both)) return { os: 'mac', platform: 'mac-arm64' };
    if (/Linux|X11|CrOS/.test(both)) return { os: 'linux', platform: 'linux-deb' };
    return { os: 'unknown', platform: '' };
  }
  var det = detect();
  var state = { os: det.os, platform: det.platform, release: FALLBACK, source: 'fallback' };
  var api = window.OrivonDownload = { os: det.os, platform: det.platform, release: FALLBACK, ready: null, app: APP, buildRelease: null };

  function archOf(p) {
    return p === 'mac-arm64' ? 'arm64' : (p === 'win-x64' || p === 'mac-x64' || p === 'linux-deb') ? 'x64' : '';
  }
  function setRoot() {
    try {
      root.dataset.os = state.os;
      root.dataset.arch = archOf(state.platform);
      root.dataset.platform = state.platform;
    } catch (e) {}
  }
  setRoot();

  // ---- release model from live API -------------------------------------------------------------
  function buildRelease(list) {
    if (!Array.isArray(list)) return null;
    var best = null, bestT = -1, i, r, t;
    for (i = 0; i < list.length; i++) {
      r = list[i];
      if (!r || r.draft || !Array.isArray(r.assets)) continue;
      var any = false;
      for (var j = 0; j < r.assets.length && !any; j++) {
        var n = r.assets[j] && r.assets[j].name;
        for (var k = 0; k < KEYS.length; k++) if (PATTERNS[KEYS[k]].test(n || '')) { any = true; break; }
      }
      if (!any) continue;
      t = Date.parse(r.published_at || r.created_at || '') || 0;
      if (t > bestT) { best = r; bestT = t; }
    }
    if (!best) return null;
    var assets = {};
    KEYS.forEach(function (key) {
      var found = null;
      for (var x = 0; x < best.assets.length; x++) {
        var a = best.assets[x];
        if (a && a.name && a.browser_download_url && PATTERNS[key].test(a.name)) { found = a; break; }
      }
      var b = FALLBACK.assets[key];
      if (!found) { assets[key] = b; return; }
      var sha = '';
      var m = /^sha256:([0-9a-f]{64})$/i.exec(found.digest || '');
      if (m) sha = m[1].toLowerCase(); else if (found.name === b.name) sha = b.sha;
      assets[key] = { name: found.name, url: found.browser_download_url, size: +found.size || 0, sha: sha };
    });
    var tagged = {};
    if (F) best.assets.forEach(function (a) {
      if (!a || !a.name || !a.browser_download_url) return;
      ['win-x64', 'linux-appimage'].forEach(function (key) {
        var id = F.taggedId(key, a.name);
        if (!id) return;
        var sha = '', m = /^sha256:([0-9a-f]{64})$/i.exec(a.digest || '');
        var plain = assets[key];
        if (m) sha = m[1].toLowerCase();
        else if (plain && plain.sha && plain.size === +a.size) sha = plain.sha;  // same bytes as the plain file
        (tagged[id] = tagged[id] || {})[key] = { name: a.name, url: a.browser_download_url, size: +a.size || 0, sha: sha };
      });
    });
    var cm = /ipfs:\/\/(baf[a-z2-7]+)/.exec(best.body || '');
    var cid = cm ? cm[1] : (best.tag_name === FALLBACK.tag ? FALLBACK.cid : '');
    return {
      tag: best.tag_name || FALLBACK.tag,
      published: best.published_at || best.created_at || FALLBACK.published,
      url: best.html_url || (GH + '/releases/tag/' + best.tag_name),
      cid: cid,
      assets: assets,
      tagged: tagged
    };
  }

  api.buildRelease = buildRelease;

  // ---- DOM binding -----------------------------------------------------------------------------
  function all(sel, from) { try { return Array.prototype.slice.call((from || doc).querySelectorAll(sel)); } catch (e) { return []; } }
  function setText(el, t) { el.textContent = t; }
  function mb(bytes) { return bytes ? Math.round(bytes / 1e6) + ' MB' : ''; }
  var DATE_FMT = null;
  function fmtDate(iso) {
    try {
      DATE_FMT = DATE_FMT || new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      var d = new Date(iso);
      if (isNaN(d)) return '';
      return DATE_FMT.format(d).replace('Sept', 'Sep');
    } catch (e) { return ''; }
  }
  // The package the hero offers: the tagged one for the chosen app when the release has it.
  function heroPick(rel) {
    var p = state.platform, key = p === 'linux-deb' ? 'linux-appimage' : p;
    if (APP && (key === 'win-x64' || key === 'linux-appimage')) {
      var t = F.pickAsset(rel, key, APP.id);
      if (t && t.tagged) return { asset: t.asset, tagged: true, key: key };
    }
    return rel.assets[p] ? { asset: rel.assets[p], tagged: false, key: p } : null;
  }
  // Windows opens the Store, unless ?app= has a tagged installer: only that one opens the app.
  function heroMode(hp) {
    var os = state.os;
    return os === 'mac' ? 'copy' : os === 'win' && !(hp && hp.tagged) ? 'store' : hp ? 'file' : 'page';
  }
  function detailText(rel) {
    var os = state.os, hp = heroPick(rel);
    if (os === 'mobile') return 'A desktop browser for Linux, Windows and macOS';
    if (os === 'mac') return MAC_CMD_SHORT;
    if (heroMode(hp) === 'store') return 'Free on the Microsoft Store \u00b7 Windows 10 and 11';
    if (!hp) return 'For Linux, Windows and macOS';
    var label = { 'win-x64': 'Windows · .exe', 'mac-arm64': 'macOS · Apple silicon', 'mac-x64': 'macOS · Intel', 'linux-deb': 'Linux · .deb', 'linux-appimage': 'Linux · AppImage' }[hp.key];
    return rel.tag + ' · ' + label + ' · ' + mb(hp.asset.size) + (hp.tagged ? ' · opens ' + APP.name : '');
  }

  // ---- the ?app= block -------------------------------------------------------------------------
  function showHead() {
    var head = all('[data-app-head]')[0];
    if (!head) return;
    all('[data-app-name]').forEach(function (el) { setText(el, APP.name); });
    all('[data-app-community]').forEach(function (el) { setText(el, 'A community build by Orivon, not the official ' + APP.name + '.'); });
    all('[data-app-open-row]').forEach(function (el) { el.hidden = !OPEN_IN_ORIVON; });
    if (OPEN_IN_ORIVON) {
      all('[data-app-open]').forEach(function (el) {
        el.setAttribute('href', F.openLink(APP));
        var l = el.querySelector('[data-app-open-label]');
        if (l) setText(l, 'Open ' + APP.name + ' in Orivon');
      });
      all('[data-app-copy-address]').forEach(function (el) { el.setAttribute('data-copy', F.ipfsAddress(APP)); });
    }
    head.hidden = false;
    head.removeAttribute('hidden');
  }
  function applyOffers(rel) {
    var opens = 'After installing, Orivon opens ' + APP.name + '.';
    all('[data-app-offer]').forEach(function (box) {
      var os = box.getAttribute('data-app-offer'), t = null;
      if (os === 'mac') t = { asset: null };
      else t = F.pickAsset(rel, os === 'win' ? 'win-x64' : 'linux-appimage', APP.id);
      if (!t || (os !== 'mac' && !t.tagged)) { box.hidden = true; return; }
      all('[data-app-opens]', box).forEach(function (el) { setText(el, opens); });
      var a = t.asset;
      if (a) {
        all('[data-app-pkg]', box).forEach(function (el) { el.setAttribute('href', a.url); });
        all('[data-app-size]', box).forEach(function (el) { setText(el, mb(a.size)); });
        all('[data-app-sha-row]', box).forEach(function (row) {
          row.hidden = !a.sha;
          all('[data-app-sha]', row).forEach(function (el) { setText(el, a.sha); });
        });
      }
      box.hidden = false;
      box.removeAttribute('hidden');
    });
  }

  function apply(rel, source) {
    state.release = rel; state.source = source;
    api.os = state.os; api.platform = state.platform; api.release = rel;
    setRoot();
    var p = state.platform, os = state.os, hp = heroPick(rel);
    try {
      var mode = heroMode(hp);
      all('[data-dl="auto"]').forEach(function (el) {
        el.setAttribute('href', mode === 'store' ? STORE_APP : mode === 'file' ? hp.asset.url : '#download');
        el.setAttribute('data-dl-platform', p);
        el.setAttribute('data-dl-mode', mode);
        var label = el.querySelector('[data-dl-label]');
        if (label) setText(label, mode === 'copy' ? (heroCopied ? 'Copied. Paste it in Terminal' : 'Copy install command') : 'Download Orivon');
        var idl = el.querySelector('.ico-dl'), icp = el.querySelector('.ico-copy');
        if (idl) { if (mode === 'copy') idl.setAttribute('hidden', ''); else idl.removeAttribute('hidden'); }
        if (icp) { if (mode !== 'copy') icp.setAttribute('hidden', ''); else icp.removeAttribute('hidden'); }
      });
      all('[data-dl="hint"]').forEach(function (el) { el.hidden = !(heroHint && (el.getAttribute('data-for') || 'mac') === os); });
      all('[data-dl="detail"]').forEach(function (el) {
        setText(el, detailText(rel));
        el.classList.toggle('is-cmd', os === 'mac');
        if (os === 'mac') el.title = MAC_CMD; else el.removeAttribute('title');
      });
      var altKey = p === 'linux-deb' ? 'linux-appimage' : os === 'mac' ? p : '';
      var altText = { 'linux-appimage': 'AppImage for any distro', 'mac-x64': 'Prefer a .dmg?', 'mac-arm64': 'Prefer a .dmg?' }[altKey];
      all('[data-dl="alt"]').forEach(function (el) {
        if (os === 'win') {
          setText(el, 'winget or installer');
          el.setAttribute('href', '#download');
          el.removeAttribute('hidden');
          el.hidden = false;
        } else if (altKey && rel.assets[altKey]) {
          setText(el, altText);
          el.setAttribute('href', rel.assets[altKey].url);
          el.removeAttribute('hidden');
          el.hidden = false;
        } else { el.hidden = true; }
      });
      if (APP) {
        showHead();
        applyOffers(rel);
        all('#cmd-mac').forEach(function (el) { setText(el, MAC_CMD); });
      }
      all('#cmd-winget').forEach(function (el) { setText(el, 'winget install ' + WINGET_ID); });
      all('[data-dl-store]').forEach(function (el) { el.setAttribute('href', os === 'win' ? STORE_APP : STORE_WEB); });
      var note = os === 'win' ? "The installer isn't signed yet: More info \u2192 Run anyway."
        : os === 'mac' ? 'First open: System Settings → Privacy & Security → Open Anyway.' : '';
      all('[data-dl="note"]').forEach(function (el) { setText(el, note); });
      all('[data-dl-os]').forEach(function (el) {
        el.classList.toggle('is-detected', el.getAttribute('data-dl-os') === os);
      });
      all('[data-dl-asset]').forEach(function (el) {
        var k = el.getAttribute('data-dl-asset'), x = rel.assets[k];
        if (x) el.setAttribute('href', x.url);
        el.classList.toggle('is-detected', !!p && k === p);
      });
      all('[data-dl-size]').forEach(function (el) {
        var x = rel.assets[el.getAttribute('data-dl-size')];
        if (x) setText(el, mb(x.size));
      });
      all('[data-dl-name]').forEach(function (el) {
        var x = rel.assets[el.getAttribute('data-dl-name')];
        if (x) setText(el, x.name);
      });
      all('[data-dl-sha]').forEach(function (el) {
        var x = rel.assets[el.getAttribute('data-dl-sha')];
        if (!x) return;
        if (!x.sha) { el.hidden = true; return; }  // live file differs from the baked one and has no digest
        el.hidden = false; el.removeAttribute('hidden');
        setText(el, el.hasAttribute('data-full') ? x.sha : x.sha.slice(0, 8) + '…');
        el.title = x.sha;
      });
      all('[data-dl-version]').forEach(function (el) { setText(el, rel.tag); });
      all('[data-dl-date]').forEach(function (el) { var d = fmtDate(rel.published); if (d) setText(el, d); });
      all('[data-dl-notes]').forEach(function (el) { el.setAttribute('href', rel.url); });
      all('[data-dl-source]').forEach(function (el) { el.setAttribute('href', GH + '/tree/' + rel.tag); });
      all('[data-dl-ipfs]').forEach(function (el) {
        if (!rel.cid) { el.hidden = true; return; }
        el.hidden = false; el.removeAttribute('hidden');
        setText(el, 'ipfs://' + rel.cid.slice(0, 6) + '…' + rel.cid.slice(-4));
        el.title = 'ipfs://' + rel.cid;
        if (el.tagName === 'A') el.setAttribute('href', 'ipfs://' + rel.cid);
      });
    } catch (e) {}
    try {
      doc.dispatchEvent(new CustomEvent('orivon:download-ready', { detail: { source: source } }));
    } catch (e) {}
  }

  // ---- copy to clipboard -----------------------------------------------------------------------
  var heroCopied = false, heroHint = false, heroTimer = 0;
  function announce(msg) {
    try {
      var live = doc.getElementById('dl-live');
      if (!live) {
        live = doc.createElement('p');
        live.id = 'dl-live'; live.className = 'sr'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
        doc.body.appendChild(live);
      }
      live.textContent = '';
      setTimeout(function () { live.textContent = msg; }, 30);
    } catch (e) {}
  }
  function legacyCopy(text) {
    var prev = doc.activeElement, ok = false, t = null;
    try {
      t = doc.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.setAttribute('aria-hidden', 'true');
      t.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;';
      doc.body.appendChild(t);
      t.focus(); t.select(); t.setSelectionRange(0, text.length);
      ok = !!doc.execCommand('copy');
    } catch (e) { ok = false; }
    try { if (t && t.parentNode) t.parentNode.removeChild(t); } catch (e) {}
    try { if (prev && prev.focus) prev.focus(); } catch (e) {}
    return ok;
  }
  function copyText(text) {
    try {
      if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
        return nav.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
      }
    } catch (e) {}
    return Promise.resolve(legacyCopy(text));
  }
  function selectNode(el) {
    try {
      var r = doc.createRange(); r.selectNodeContents(el);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    } catch (e) {}
  }
  function onCopyButton(btn) {
    var text = btn.getAttribute('data-copy'), src = null;
    if (text == null) {
      src = doc.getElementById(btn.getAttribute('data-copy-from') || '');
      text = src ? src.textContent.trim() : '';
    }
    if (!text) return;
    var label = btn.querySelector('span') || btn;
    if (!btn.hasAttribute('data-label')) btn.setAttribute('data-label', label.textContent);
    copyText(text).then(function (ok) {
      clearTimeout(btn._t);
      if (ok) { btn.classList.add('is-copied'); label.textContent = 'Copied'; announce('Copied to the clipboard'); }
      else { if (src) selectNode(src); label.textContent = 'Press Ctrl+C'; announce('Copying failed. The text is selected: press Ctrl+C or Command C.'); }
      btn._t = setTimeout(function () {
        btn.classList.remove('is-copied'); label.textContent = btn.getAttribute('data-label');
      }, 2000);
    });
  }
  function onHeroDownload() {
    heroHint = true;
    announce('Downloading the installer. Open it when it has finished. If Windows protected your PC appears, choose More info, then Run anyway.');
    apply(state.release, state.source);
  }
  function onHeroCopy(el) {
    copyText(MAC_CMD).then(function (ok) {
      if (!ok) { try { location.hash = '#download'; } catch (e) {} return; }
      heroCopied = true; heroHint = true;
      clearTimeout(heroTimer);
      announce('Install command copied. Open Terminal, paste it and press Return.');
      apply(state.release, state.source);
      heroTimer = setTimeout(function () { heroCopied = false; apply(state.release, state.source); }, 4000);
    });
  }
  doc.addEventListener('click', function (e) {
    try {
      var t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      var hero = t.closest('[data-dl="auto"]');
      if (hero && (state.os === 'mac' || state.os === 'win')) {
        if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (state.os === 'win') {
          // The link itself opens the Store or starts the download; a download adds the SmartScreen hint.
          if (hero.getAttribute('data-dl-mode') === 'file') onHeroDownload();
          return;
        }
        e.preventDefault();
        onHeroCopy(hero);
        return;
      }
      var btn = t.closest('[data-copy],[data-copy-from]');
      if (btn) { e.preventDefault(); onCopyButton(btn); }
    } catch (err) {}
  });

  // ---- live data -------------------------------------------------------------------------------
  function readCache() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (c && Date.now() - c.t < CACHE_MS && Array.isArray(c.data)) return c.data;
    } catch (e) {}
    return null;
  }
  function writeCache(data) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: data })); } catch (e) {}
  }
  function fetchLive() {
    var cached = readCache();
    if (cached) return Promise.resolve(cached);
    if (typeof fetch !== 'function') return Promise.resolve(null);
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    var opts = { headers: { Accept: 'application/vnd.github+json' } };
    if (ctl) opts.signal = ctl.signal;
    return fetch(API, opts).then(function (res) {
      if (!res.ok) throw new Error('http');
      return res.json();
    }).then(function (data) {
      clearTimeout(timer);
      if (Array.isArray(data)) writeCache(data);
      return data;
    }).catch(function () { clearTimeout(timer); return null; });
  }

  var domReady = new Promise(function (resolve) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { resolve(); }, { once: true });
    else resolve();
  });

  // Apple silicon vs Intel (resolves quickly; the live apply waits for it so the 'api' event is final).
  var refine = Promise.resolve();
  try {
    if (state.os === 'mac' && nav.userAgentData && typeof nav.userAgentData.getHighEntropyValues === 'function') {
      refine = nav.userAgentData.getHighEntropyValues(['architecture']).then(function (v) {
        var arch = v && v.architecture;
        if (arch === 'x86') state.platform = 'mac-x64';
        else if (arch === 'arm') state.platform = 'mac-arm64';
      }).catch(function () {});
    }
  } catch (e) { refine = Promise.resolve(); }

  domReady.then(function () { apply(FALLBACK, 'fallback'); });
  var refined = Promise.all([domReady, refine]).then(function () {
    if (state.platform !== api.platform) apply(state.release, state.source);
  });

  api.ready = refined.then(fetchLive).then(function (data) {
    var rel = buildRelease(data);
    apply(rel || state.release, rel ? 'api' : state.source);
    return api;
  }).catch(function () { return api; });
})();
