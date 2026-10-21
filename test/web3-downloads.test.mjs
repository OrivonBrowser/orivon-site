// The Web3 build downloads from latest.orivonstack.eth: the release model read from that folder's start page, and
// the build step that switches it on. Run: npm test
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
// Objects made inside the vm context have its own prototypes: compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));

test('the Web2 page downloads from GitHub, the Web3 one from the latest folder', () => {
  for (const k of KEYS) assert.match(load(SRC).release.assets[k].url, /^https:\/\/github\.com\/OrivonBrowser\/orivon-mvp\/releases\/download\//);
  const baked = web3().release;
  for (const k of KEYS) assert.equal(baked.assets[k].url, LATEST + baked.assets[k].name, k);
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
  const api = web3();
  const baked = api.release;
  const rel = api.buildLatest(startPage(baked.tag.slice(1), KEYS.map((k) => [baked.assets[k].name, baked.assets[k].size])));
  assert.equal(rel.tag, baked.tag);
  assert.equal(rel.cid, baked.cid);
  for (const k of KEYS) assert.deepEqual(plain(rel.assets[k]), plain(baked.assets[k]), k);
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
  assert.equal(rel.assets['linux-deb'].url, api.release.assets['linux-deb'].url, 'no .deb listed: the baked one stays');
});

test('build --web3 points every package link at the folder; build/ keeps GitHub', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orivon-site-build-'));
  cpSync(join(root, 'site'), join(dir, 'site'), { recursive: true, filter: (p) => basename(p) !== '_shots' });
  cpSync(join(root, 'scripts'), join(dir, 'scripts'), { recursive: true });
  cpSync(join(root, 'package.json'), join(dir, 'package.json'));
  const r = spawnSync(process.execPath, ['scripts/build.mjs', '--web3'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const read = (p) => readFileSync(join(dir, p), 'utf8');
  const web3Html = read('build-web3/index.html'), web2Html = read('build/index.html');
  assert.doesNotMatch(web3Html, /releases\/download\//);
  assert.equal(web3Html.match(/data-dl-asset="[^"]+" href="https:\/\/latest\.orivonstack\.eth\.limo\/[^"/]+"/g).length, 5);
  assert.equal(web2Html.match(/data-dl-asset="[^"]+" href="https:\/\/github\.com\/OrivonBrowser\/orivon-mvp\/releases\/download\//g).length, 5);
  assert.match(read('build-web3/assets/js/orivon-download.js'), /var LATEST = 'https:\/\/latest\.orivonstack\.eth\.limo\/';/);
  assert.match(read('build/assets/js/orivon-download.js'), /var LATEST = '';/);
});
