// The Web3 build downloads from latest.orivonstack.eth: the version-free names it offers until it has read the folder,
// the release model read from that folder's start page and ipfs.json, and the build step that switches it on.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { startPage, V009, V009_TAGGED } from './latest-page.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await import('../site/assets/js/orivon-flavours.js');
const F = globalThis.OrivonFlavours;
const LATEST = 'https://latest.orivonstack.eth.limo/';
const KEYS = ['win-x64', 'mac-arm64', 'mac-x64', 'linux-deb', 'linux-appimage'];
const SRC = readFileSync(join(root, 'site/assets/js/orivon-download.js'), 'utf8');

function load(src, search = '') {
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
  vm.runInContext(src, ctx);
  return win.OrivonDownload;
}
const web3 = (search) => load(SRC.replace("var LATEST = '';", `var LATEST = '${LATEST}';`), search);
const mb = (bytes) => Math.round(bytes / 1e6);
// The folder's names with `latest` in place of the version (orivon-mvp scripts/pin-releases.sh).
const UNVERSIONED = {
  'win-x64': 'Orivon-Setup-latest-x64.exe', 'mac-arm64': 'Orivon-latest-arm64.dmg', 'mac-x64': 'Orivon-latest-x64.dmg',
  'linux-deb': 'orivon_latest_amd64.deb', 'linux-appimage': 'Orivon-latest-x86_64.AppImage',
};
// ipfs.json as the release workflow attaches it and the pinner copies it into the folder.
const manifestOf = (cid, files) => ({ cid, add: 'ipfs add -r --cid-version=1', kubo: '0.43.1', files: files.map(([name, sha256]) => ({ name, sha256 })) });
const CID_009 = 'bafybeidyxrss4ztdgfimz2egbcn4jevgeky3pl73kfhxrnz46exrmvafke';
// Objects made inside the vm context have its own prototypes: compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));

test('the Web2 page downloads from GitHub, the Web3 one from the latest folder under version-free names', () => {
  for (const k of KEYS) assert.match(load(SRC).release.assets[k].url, /^https:\/\/github\.com\/OrivonBrowser\/orivon-mvp\/releases\/download\//);
  const rel = web3().release;
  for (const k of KEYS) assert.deepEqual(plain(rel.assets[k]), { name: UNVERSIONED[k], url: LATEST + UNVERSIONED[k], size: 0, sha: '' }, k);
  assert.deepEqual([rel.tag, rel.published, rel.cid, rel.url], ['', '', '', 'https://github.com/OrivonBrowser/orivon-mvp/releases/latest']);
});

test('the real start page of the folder names the packages it holds', () => {
  const rel = web3().buildLatest(readFileSync(join(root, 'test/fixtures/latest-start-page-v0.0.8.html'), 'utf8'));
  assert.equal(rel.tag, 'v0.0.8');
  const want = {
    'win-x64': ['Orivon-Setup-0.0.8-x64.exe', 137], 'mac-arm64': ['Orivon-0.0.8-arm64.dmg', 163], 'mac-x64': ['Orivon-0.0.8-x64.dmg', 170],
    'linux-deb': ['orivon_0.0.8_amd64.deb', 125], 'linux-appimage': ['Orivon-0.0.8-x86_64.AppImage', 162],
  };
  for (const k of KEYS) {
    assert.equal(rel.assets[k].name, want[k][0], k);
    assert.equal(rel.assets[k].url, LATEST + want[k][0], k);
    assert.equal(mb(rel.assets[k].size), want[k][1], k);
  }
  assert.deepEqual(plain(rel.tagged), {});
});

test('the baked release, listed by the folder, keeps its exact sizes, digests and CID', () => {
  const baked = load(SRC).release;
  const rel = web3().buildLatest(startPage(baked.tag.slice(1), KEYS.map((k) => [baked.assets[k].name, baked.assets[k].size])));
  assert.equal(rel.tag, baked.tag);
  assert.equal(rel.cid, baked.cid);
  for (const k of KEYS) {
    const b = baked.assets[k];
    assert.deepEqual(plain(rel.assets[k]), { name: b.name, url: LATEST + b.name, size: b.size, sha: b.sha }, k);
  }
});

test('a newer release is offered from the folder, without the digests it does not list', () => {
  const rel = web3('?app=freetube').buildLatest(startPage('0.0.9', [...V009, ...V009_TAGGED, ['Orivon-Setup-0.0.9-x64.bogus.exe', 100e6]]));
  assert.equal(rel.tag, 'v0.0.9');
  assert.equal(rel.cid, '');
  assert.equal(rel.url, 'https://github.com/OrivonBrowser/orivon-mvp/releases/tag/v0.0.9');
  assert.deepEqual(plain(rel.assets['linux-deb']), { name: 'orivon_0.0.9_amd64.deb', url: LATEST + 'orivon_0.0.9_amd64.deb', size: 103e6, sha: '' });
  assert.equal(rel.assets['win-x64'].name, 'Orivon-Setup-0.0.9-x64.exe', 'the tagged installer is not the plain one');
  assert.deepEqual(Object.keys(rel.tagged), ['freetube']);
  assert.equal(rel.tagged.freetube['win-x64'].url, LATEST + 'Orivon-Setup-0.0.9-x64.freetube.exe');
  assert.equal(rel.tagged.freetube['linux-appimage'].url, LATEST + 'Orivon-0.0.9-x86_64.freetube.AppImage');
  assert.equal(rel.tagged.freetube['win-x64'].sha, '');
});

test('the ipfs.json in the folder gives a newer release its digests and CID', () => {
  const sha = (i) => String(i).repeat(64);
  const all = [...V009, ...V009_TAGGED];
  const rel = web3('?app=freetube').buildLatest(startPage('0.0.9', all), manifestOf(CID_009, all.map(([n], i) => [n, sha(i)])));
  assert.equal(rel.tag, 'v0.0.9');
  assert.equal(rel.cid, CID_009);
  assert.deepEqual(plain(rel.assets['linux-deb']), { name: 'orivon_0.0.9_amd64.deb', url: LATEST + 'orivon_0.0.9_amd64.deb', size: 103e6, sha: sha(4) });
  assert.equal(rel.assets['mac-arm64'].sha, sha(0));
  assert.equal(rel.tagged.freetube['win-x64'].sha, sha(6));
});

test('an ipfs.json of another release gives no CID, and only the digests of files it names', () => {
  const sha = 'e'.repeat(64);
  const page = startPage('0.0.9', V009);
  const api = web3();
  // Another release's manifest (the folder moved between the two reads): none of its names is listed.
  const other = api.buildLatest(page, manifestOf(CID_009, V009.map(([n]) => [n.replace('0.0.9', '0.0.10'), sha])));
  assert.equal(other.cid, '');
  for (const k of KEYS) assert.equal(other.assets[k].sha, '', k);
  // Part of it: the digests it names count, the CID does not.
  const part = api.buildLatest(page, manifestOf(CID_009, [['orivon_0.0.9_amd64.deb', sha]]));
  assert.equal(part.cid, '');
  assert.equal(part.assets['linux-deb'].sha, sha);
  assert.equal(part.assets['win-x64'].sha, '');
  // Malformed ones change nothing.
  for (const bad of [null, 'x', [], { files: 'x' }, manifestOf('Qm' + 'a'.repeat(44), V009.map(([n]) => [n, sha])),
    manifestOf(CID_009, V009.map(([n]) => [n, 'not-a-digest']))]) {
    const rel = api.buildLatest(page, bad);
    assert.equal(rel.cid, '', JSON.stringify(bad));
    assert.equal(rel.tag, 'v0.0.9');
  }
});

test('anything but a start page listing a package is refused, and odd links are skipped', () => {
  const api = web3();
  for (const html of [undefined, null, '', '<html></html>', startPage('0.0.9', []), startPage('<b>0.0.9</b>', V009),
    startPage('0.0.9', [['README.md', 1e6]]), '{"files":[]}']) {
    assert.equal(api.buildLatest(html), null, String(html).slice(0, 60));
  }
  const odd = startPage('0.0.9', V009.slice(0, 4)).replace('</ul>', [
    '<li><a href="./../orivon_0.0.9_amd64.deb" download>x</a> <span>1 MB</span></li>',
    '<li><a href="./orivon_0.0.9_amd64.deb?x=1" download>x</a> <span>1 MB</span></li>',
    '<li><a href="https://evil.example/orivon_0.0.9_amd64.deb" download>x</a> <span>1 MB</span></li>',
    '</ul>'].join('\n'));
  const rel = api.buildLatest(odd);
  assert.equal(rel.tag, 'v0.0.9');
  assert.equal(rel.assets['linux-deb'].url, LATEST + UNVERSIONED['linux-deb'], 'no .deb listed: the version-free one stays');
});

test('build --web3 points every package link at the version-free names in the folder and keeps no release facts; build/ keeps GitHub', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orivon-site-build-'));
  cpSync(join(root, 'site'), join(dir, 'site'), { recursive: true, filter: (p) => basename(p) !== '_shots' });
  cpSync(join(root, 'scripts'), join(dir, 'scripts'), { recursive: true });
  cpSync(join(root, 'package.json'), join(dir, 'package.json'));
  const r = spawnSync(process.execPath, ['scripts/build.mjs', '--web3'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const read = (p) => readFileSync(join(dir, p), 'utf8');
  const web3Html = read('build-web3/index.html'), web2Html = read('build/index.html');
  assert.doesNotMatch(web3Html, /releases\/download\//);
  const hrefs = Object.fromEntries([...web3Html.matchAll(/data-dl-asset="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(hrefs, Object.fromEntries(KEYS.map((k) => [k, LATEST + UNVERSIONED[k]])));
  const baked = load(SRC).release;
  assert.ok(!web3Html.includes(baked.tag) && !web3Html.includes(baked.cid.slice(0, 6) + '…'), 'no baked version or CID');
  for (const k of KEYS) assert.ok(!web3Html.includes(baked.assets[k].sha), `no baked digest for ${k}`);
  assert.match(web3Html, /data-dl-version>latest</);
  assert.match(web3Html, /data-dl-checksums hidden>/);
  assert.match(web3Html, /data-dl-notes href="https:\/\/github\.com\/OrivonBrowser\/orivon-mvp\/releases\/latest"/);
  assert.match(web3Html, /<b data-dl-name="win-x64">Orivon-Setup-latest-x64\.exe<\/b><small data-dl-size="win-x64"><\/small>/);
  assert.equal(web2Html.match(/data-dl-asset="[^"]+" href="https:\/\/github\.com\/OrivonBrowser\/orivon-mvp\/releases\/download\//g).length, 5);
  assert.match(read('build-web3/assets/js/orivon-download.js'), /var LATEST = 'https:\/\/latest\.orivonstack\.eth\.limo\/';/);
  assert.match(read('build/assets/js/orivon-download.js'), /var LATEST = '';/);
});
