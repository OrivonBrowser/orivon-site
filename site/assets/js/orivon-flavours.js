/*!
 * orivon-flavours.js  -  the apps the download page can name with ?app=<id>, and the pure functions around them.
 * Classic script (no module), safe with <script defer>; also loads in Node (scripts/ and test/ read
 * globalThis.OrivonFlavours). No DOM access here.
 *
 * FLAVOURS mirrors resources/flavours.json of OrivonBrowser/orivon-mvp, the allowlist of the apps a
 * tagged Orivon package can open on first run. `npm run check-flavours` compares the two; edit the list
 * here only to follow that file.
 *
 *   parseApp(search)               the allowlisted entry named by exactly one ?app=<id>, else null
 *   taggedId(key, name)            the id in a tagged package name, else null
 *   pickAsset(release, key, id)    { asset, tagged }: the tagged package for key if the release has it, else the plain one
 *   openLink(flavour)              orivon:open?u=<address>&flavour=<id>
 *   ipfsAddress(flavour)           ipfs://<address>
 *   macCommand(base, flavour)      base ("... | bash") with ` -s <id>` appended
 */
(function (g) {
  'use strict';
  var FLAVOURS = [
    { id: 'explore', name: 'Explore', app: 'explore.orivonstack.eth' },
    { id: 'webtorrent', name: 'WebTorrent', app: 'webtorrent.orivonstack.eth' },
    { id: 'asgardex', name: 'ASGARDEX', app: 'asgardex.orivonstack.eth' },
    { id: 'thelounge', name: 'The Lounge', app: 'thelounge.orivonstack.eth' },
    { id: 'freetube', name: 'FreeTube', app: 'freetube.orivonstack.eth' },
    { id: 'element', name: 'Element', app: 'element.orivonstack.eth' }
  ];

  // The packages a release can carry under a tagged name; the plain ones are in orivon-download.js.
  var TAGGED = {
    'win-x64': /^Orivon-Setup-.+-x64\.([a-z0-9]{2,24})\.exe$/,
    'linux-appimage': /^Orivon-.+-x86_64\.([a-z0-9]{2,24})\.AppImage$/
  };

  function byId(id) {
    for (var i = 0; i < FLAVOURS.length; i++) if (FLAVOURS[i].id === id) return FLAVOURS[i];
    return null;
  }

  // Exactly one `app` parameter whose whole decoded value is an allowlisted id. Anything else is null.
  function parseApp(search) {
    try {
      if (typeof search !== 'string') return null;
      var values = new URLSearchParams(search).getAll('app');
      return values.length === 1 ? byId(values[0]) : null;
    } catch (e) { return null; }
  }

  function taggedId(key, name) {
    var re = TAGGED[key], m = re && typeof name === 'string' ? re.exec(name) : null;
    return m && byId(m[1]) ? m[1] : null;
  }

  function pickAsset(release, key, id) {
    var t = release && release.tagged && id ? release.tagged[id] : null;
    if (t && Object.prototype.hasOwnProperty.call(t, key) && t[key]) return { asset: t[key], tagged: true };
    var a = release && release.assets ? release.assets[key] : null;
    return a ? { asset: a, tagged: false } : null;
  }

  function openLink(f) {
    return 'orivon:open?u=' + encodeURIComponent(f.app) + '&flavour=' + encodeURIComponent(f.id);
  }
  function ipfsAddress(f) { return 'ipfs://' + f.app; }
  function macCommand(base, f) { return f ? base + ' -s ' + f.id : base; }

  g.OrivonFlavours = {
    FLAVOURS: FLAVOURS, TAGGED: TAGGED,
    parseApp: parseApp, taggedId: taggedId, pickAsset: pickAsset,
    openLink: openLink, ipfsAddress: ipfsAddress, macCommand: macCommand
  };
})(typeof self !== 'undefined' ? self : globalThis);
