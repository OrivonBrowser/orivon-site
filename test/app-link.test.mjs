// Pure functions behind ?app=<id>, the release model with tagged packages, and sync-release's tagged records.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await import('../site/assets/js/orivon-flavours.js');
const F = globalThis.OrivonFlavours;

test('parseApp accepts exactly one allowlisted id', () => {
  assert.equal(F.parseApp('?app=freetube').name, 'FreeTube');
  assert.equal(F.parseApp('?theme=dark&app=thelounge&x=1').app, 'thelounge.orivonstack.eth');
  assert.equal(F.parseApp('?app=free%74ube').id, 'freetube');
  for (const id of ['explore', 'webtorrent', 'asgardex', 'thelounge', 'freetube', 'element']) {
    assert.equal(F.parseApp('?app=' + id).id, id);
  }
});

test('parseApp ignores everything else', () => {
  const bad = [
    '', '?', '?app=', '?app=FreeTube', '?app=FREETUBE', '?app=freetube%20', '?app=%20freetube', '?app=unknown',
    '?app=<script>alert(1)</script>', '?app=%3Cscript%3E', '?app=https://example.org', '?app=freetube.orivonstack.eth',
    '?app=freetube&app=element', '?app=freetube&app=freetube', '?app[]=freetube', '?App=freetube', '?app=__proto__',
    '?app=constructor', '?app=freetube%00', '?app=freetube;x', '?app=free tube', '?app=%E0%A4%A', '?foo=app=freetube',
  ];
  for (const s of bad) assert.equal(F.parseApp(s), null, s);
  for (const s of [undefined, null, 5, {}]) assert.equal(F.parseApp(s), null);
});

test('links and commands for an app', () => {
  const f = F.parseApp('?app=thelounge');
  assert.equal(F.openLink(f), 'orivon:open?u=thelounge.orivonstack.eth&flavour=thelounge');
  assert.equal(F.ipfsAddress(f), 'ipfs://thelounge.orivonstack.eth');
  assert.equal(F.macCommand('curl -fsSL https://x/install-macos.sh | bash', f), 'curl -fsSL https://x/install-macos.sh | bash -s thelounge');
  assert.equal(F.macCommand('a | bash', null), 'a | bash');
});

test('taggedId reads the id from a tagged package name only', () => {
  assert.equal(F.taggedId('win-x64', 'Orivon-Setup-0.0.9-x64.freetube.exe'), 'freetube');
  assert.equal(F.taggedId('linux-appimage', 'Orivon-0.0.9-x86_64.element.AppImage'), 'element');
  assert.equal(F.taggedId('win-x64', 'Orivon-Setup-0.0.9-x64.exe'), null);
  assert.equal(F.taggedId('linux-appimage', 'Orivon-0.0.9-x86_64.AppImage'), null);
  assert.equal(F.taggedId('win-x64', 'Orivon-Setup-0.0.9-x64.unknown.exe'), null);
  assert.equal(F.taggedId('linux-appimage', 'Orivon-0.0.9-x86_64.freetube.exe'), null);
  assert.equal(F.taggedId('mac-arm64', 'Orivon-0.0.9-arm64.freetube.dmg'), null);
});

const asset = (name) => ({ name, url: 'https://dl/' + name, size: 1, sha: 'a'.repeat(64) });
const release = (tagged) => ({
  assets: { 'win-x64': asset('Orivon-Setup-0.0.9-x64.exe'), 'linux-appimage': asset('Orivon-0.0.9-x86_64.AppImage'), 'linux-deb': asset('orivon_0.0.9_amd64.deb') },
  tagged,
});

test('pickAsset offers the tagged package only when the release has it', () => {
  const rel = release({ freetube: { 'win-x64': asset('Orivon-Setup-0.0.9-x64.freetube.exe') } });
  const w = F.pickAsset(rel, 'win-x64', 'freetube');
  assert.deepEqual([w.tagged, w.asset.name], [true, 'Orivon-Setup-0.0.9-x64.freetube.exe']);
  const l = F.pickAsset(rel, 'linux-appimage', 'freetube');
  assert.deepEqual([l.tagged, l.asset.name], [false, 'Orivon-0.0.9-x86_64.AppImage']);
  assert.equal(F.pickAsset(rel, 'win-x64', 'element').tagged, false);
  assert.equal(F.pickAsset(rel, 'win-x64', null).tagged, false);
  assert.equal(F.pickAsset(release(undefined), 'win-x64', 'freetube').tagged, false);
  assert.equal(F.pickAsset(rel, 'mac-arm64', 'freetube'), null);
  assert.equal(F.pickAsset(release({ freetube: {} }), 'win-x64', 'constructor').tagged, false);
});

function loadDownload(search) {
  const doc = {
    readyState: 'loading', documentElement: { dataset: {} }, addEventListener() {}, querySelectorAll: () => [],
    getElementById: () => null,
  };
  const win = { OrivonFlavours: F, document: doc };
  win.window = win;
  const ctx = vm.createContext({
    window: win, document: doc, location: { search }, navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64' },
    sessionStorage: { getItem: () => null, setItem() {} }, Promise, Date, Math, JSON, Array, Object, RegExp, Intl, CustomEvent: class {},
    setTimeout, clearTimeout, console,
  });
  vm.runInContext(readFileSync(join(root, 'site/assets/js/orivon-download.js'), 'utf8'), ctx);
  return win.OrivonDownload;
}

test('the live release model records tagged packages with their own digest', () => {
  const api = loadDownload('?app=freetube');
  assert.equal(api.app.id, 'freetube');
  const sha = 'b'.repeat(64);
  const gh = (name, size, digest) => ({ name, size, digest, browser_download_url: 'https://gh/' + name });
  const rel = api.buildRelease([{
    tag_name: 'v0.0.9', published_at: '2026-11-01T00:00:00Z', body: '',
    assets: [
      gh('Orivon-Setup-0.0.9-x64.exe', 100, 'sha256:' + 'a'.repeat(64)),
      gh('Orivon-Setup-0.0.9-x64.freetube.exe', 100, 'sha256:' + sha),
      gh('Orivon-Setup-0.0.9-x64.nope.exe', 100, 'sha256:' + sha),
      gh('Orivon-0.0.9-x86_64.freetube.AppImage', 100, null),
      gh('Orivon-0.0.9-x86_64.AppImage', 100, 'sha256:' + 'c'.repeat(64)),
    ],
  }]);
  assert.equal(rel.assets['win-x64'].name, 'Orivon-Setup-0.0.9-x64.exe');
  assert.equal(rel.tagged.freetube['win-x64'].sha, sha);
  assert.equal(rel.tagged.freetube['win-x64'].url, 'https://gh/Orivon-Setup-0.0.9-x64.freetube.exe');
  assert.equal(rel.tagged.freetube['linux-appimage'].sha, 'c'.repeat(64), 'no digest of its own, same size: the plain one');
  assert.deepEqual(Object.keys(rel.tagged), ['freetube']);
  const none = api.buildRelease([{ tag_name: 'v0.0.9', published_at: '2026-11-01T00:00:00Z', assets: [gh('Orivon-Setup-0.0.9-x64.exe', 1, null)] }]);
  assert.equal(Object.keys(none.tagged).length, 0);
});

test('the page ignores a bad ?app= completely', () => {
  for (const s of ['', '?app=FreeTube', '?app=<script>', '?app=freetube&app=element']) assert.equal(loadDownload(s).app, null, s);
});

test('sync-release records tagged packages in the fallback, and none when there are none', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orivon-site-sync-'));
  for (const p of ['scripts/sync-release.mjs', 'site/index.html', 'site/assets/js/orivon-download.js', 'site/assets/js/orivon-flavours.js']) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    cpSync(join(root, p), join(dir, p));
  }
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  const mk = (tagged) => {
    const sha = (c) => 'sha256:' + c.repeat(64);
    const a = (name, size, d) => ({ name, size, digest: d, browser_download_url: 'https://dl/' + name });
    const assets = [
      a('Orivon-Setup-0.0.9-x64.exe', 10, sha('a')), a('Orivon-0.0.9-arm64.dmg', 11, sha('b')), a('Orivon-0.0.9-x64.dmg', 12, sha('c')),
      a('orivon_0.0.9_amd64.deb', 13, sha('d')), a('Orivon-0.0.9-x86_64.AppImage', 14, sha('e')),
    ];
    if (tagged) assets.push(a('Orivon-Setup-0.0.9-x64.freetube.exe', 10, sha('a')), a('Orivon-0.0.9-x86_64.element.AppImage', 14, null), a('Orivon-Setup-0.0.9-x64.bogus.exe', 10, sha('a')));
    return [{ tag_name: 'v0.0.9', draft: false, published_at: '2026-11-01T00:00:00Z', body: 'ipfs://bafybeib4liozf4uwoq57zklkldjtfx5e7u65yl2e4prn3evpl6si3qgwr4', assets }];
  };
  const run = (releases) => {
    writeFileSync(join(dir, 'stub.mjs'), `globalThis.fetch = async () => ({ ok: true, json: async () => (${JSON.stringify(releases)}) });`);
    const r = spawnSync(process.execPath, ['--import', './stub.mjs', 'scripts/sync-release.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return readFileSync(join(dir, 'site/assets/js/orivon-download.js'), 'utf8');
  };
  const withTagged = run(mk(true));
  assert.match(withTagged, /'element': \{ 'linux-appimage': baked\('Orivon-0\.0\.9-x86_64\.element\.AppImage', 14, 'e{64}'\) \}/);
  assert.match(withTagged, /'freetube': \{ 'win-x64': baked\('Orivon-Setup-0\.0\.9-x64\.freetube\.exe', 10, 'a{64}'\) \}/);
  assert.doesNotMatch(withTagged, /bogus/);
  assert.match(run(mk(false)), /tagged: \{\}\n/);
});
