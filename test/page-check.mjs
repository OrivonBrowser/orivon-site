// Headless browser check of the download page with ?app=<id>. Not part of `npm test`:
//   npm run check-page
// Uses the Playwright of PLAYWRIGHT_DIR (default: the orivon-mvp checkout next to this one); skips (exit 0)
// when none is found. Serves site/ on a loopback port, answers api.github.com with a fake release, and fails
// on any other third-party request. Then the Web3 build (built here, served at /web3/): it must ask only
// latest.orivonstack.eth.limo, answered with a fake start page, and offer every package from there. No window is opened.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { startPage, V009, V009_TAGGED } from './latest-page.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const site3 = join(root, 'build-web3');
const pwDir = process.env.PLAYWRIGHT_DIR || join(root, '..', 'orivon-mvp');
let chromium;
try {
  chromium = createRequire(join(pwDir, 'package.json'))('playwright').chromium;
} catch {
  console.log('page-check: Playwright not found (set PLAYWRIGHT_DIR); skipped');
  process.exit(0);
}
const built = spawnSync(process.execPath, [join(root, 'scripts', 'build.mjs'), '--web3'], { encoding: 'utf8' });
if (built.status !== 0) { console.log('page-check: npm run build:web3 failed\n' + built.stderr); process.exit(1); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  const [dir, rel] = p.startsWith('/web3/') ? [site3, p.slice(5)] : [site, p];
  const file = join(dir, rel === '/' ? 'index.html' : rel.replace(/\.\./g, ''));
  if (!existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const SHA_PLAIN = 'a'.repeat(64), SHA_TAGGED = 'b'.repeat(64), SHA_APPIMG = 'c'.repeat(64);
const gh = (name, size, sha) => ({ name, size, digest: sha ? 'sha256:' + sha : null, browser_download_url: `https://github.com/OrivonBrowser/orivon-mvp/releases/download/v0.0.9/${name}` });
function releaseJson(tagged) {
  const assets = [
    gh('Orivon-Setup-0.0.9-x64.exe', 100e6, SHA_PLAIN), gh('Orivon-0.0.9-arm64.dmg', 101e6, 'd'.repeat(64)), gh('Orivon-0.0.9-x64.dmg', 102e6, 'e'.repeat(64)),
    gh('orivon_0.0.9_amd64.deb', 103e6, 'f'.repeat(64)), gh('Orivon-0.0.9-x86_64.AppImage', 104e6, SHA_APPIMG),
  ];
  if (tagged) assets.push(gh('Orivon-Setup-0.0.9-x64.freetube.exe', 100e6, SHA_TAGGED), gh('Orivon-0.0.9-x86_64.freetube.AppImage', 104e6, SHA_TAGGED));
  return [{ tag_name: 'v0.0.9', draft: false, published_at: '2026-11-01T00:00:00Z', html_url: 'https://github.com/OrivonBrowser/orivon-mvp/releases/tag/v0.0.9', body: 'ipfs://bafybeib4liozf4uwoq57zklkldjtfx5e7u65yl2e4prn3evpl6si3qgwr4', assets }];
}
const UA = {
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
};

const browser = await chromium.launch({ headless: true });
const foreign = new Set();
let failures = 0;
const LATEST = 'https://latest.orivonstack.eth.limo/';
// web3: the Web3 build, whose latest folder answers with the v0.0.9 start page (latest: 'down' makes it unreachable).
async function scenario(name, { os, query, tagged = true, js = true, openInOrivon = false, web3 = false, latest = 'up' }, check) {
  const ctx = await browser.newContext({ userAgent: UA[os], javaScriptEnabled: js, viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  const allowed = web3 ? 'latest.orivonstack.eth.limo' : 'api.github.com';
  page.on('request', (r) => { const h = new URL(r.url()).hostname; if (h !== '127.0.0.1' && h !== allowed) foreign.add(r.url()); });
  await page.route('https://api.github.com/**', (r) => r.fulfill({ json: releaseJson(tagged) }));
  await page.route(LATEST + '**', (r) => latest === 'down' ? r.abort()
    : r.fulfill({ contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: startPage('0.0.9', tagged ? [...V009, ...V009_TAGGED] : V009) }));
  if (openInOrivon) await page.route('**/orivon-download.js', async (r) => {
    const src = readFileSync(join(site, 'assets/js/orivon-download.js'), 'utf8').replace('var OPEN_IN_ORIVON = false;', 'var OPEN_IN_ORIVON = true;');
    r.fulfill({ contentType: 'text/javascript', body: src });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + (web3 ? 'web3/' : '') + query);
  if (js) {
    await page.evaluate(() => window.OrivonDownload.ready);
    await page.waitForFunction(() => document.documentElement.dataset.os);
  }
  try {
    await check(page);
    assert.deepEqual(errors, [], 'page errors');
    console.log('ok   ' + name);
  } catch (e) {
    failures++;
    console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     '));
  }
  await ctx.close();
}
// Orivon's Microsoft Store listing: the app link on Windows, the web page elsewhere and without JavaScript.
const STORE_APP = 'ms-windows-store://pdp/?ProductId=9MXV3FNMFBP4', STORE_WEB = 'https://apps.microsoft.com/detail/9MXV3FNMFBP4';
const vis = (page, sel) => page.locator(sel).first().isVisible();
const text = (page, sel) => page.locator(sel).first().innerText();
const downloadHtml = (page) => page.evaluate(() => document.getElementById('download').innerHTML);

await scenario('windows, tagged installer in the release', { os: 'win', query: '?app=freetube' }, async (page) => {
  assert.equal(await text(page, '[data-app-name]'), 'FreeTube');
  assert.match(await text(page, '[data-app-community]'), /^A community build by Orivon, not the official FreeTube\.$/);
  assert.ok(await vis(page, '[data-app-offer="win"]'));
  assert.match(await text(page, '[data-app-offer="win"]'), /After installing, Orivon opens FreeTube\./);
  assert.match(await page.locator('[data-app-offer="win"] [data-app-pkg]').getAttribute('href'), /Orivon-Setup-0\.0\.9-x64\.freetube\.exe$/);
  assert.equal(await text(page, '[data-app-offer="win"] [data-app-sha]'), SHA_TAGGED);
  assert.match(await page.locator('[data-dl="auto"]').first().getAttribute('href'), /x64\.freetube\.exe$/);
  assert.equal(await vis(page, '[data-app-open-row]'), false, 'Open in Orivon stays hidden');
  assert.equal(await page.locator('[data-app-open]').getAttribute('href'), '#download');
});
await scenario('windows, release without tagged packages', { os: 'win', query: '?app=freetube', tagged: false }, async (page) => {
  assert.equal(await text(page, '[data-app-name]'), 'FreeTube');
  assert.equal(await vis(page, '[data-app-offer="win"]'), false);
  assert.doesNotMatch(await page.locator('body').innerText(), /After installing, Orivon opens/);
  assert.equal(await page.locator('[data-dl="auto"]').first().getAttribute('href'), STORE_APP);
});
await scenario('windows: the Store first, then winget, then the installer', { os: 'win', query: '' }, async (page) => {
  const hero = page.locator('[data-dl="auto"]').first();
  assert.equal(await hero.getAttribute('href'), STORE_APP);
  assert.equal(await hero.getAttribute('data-dl-mode'), 'store');
  assert.equal(await text(page, '[data-dl="detail"]'), 'Free on the Microsoft Store \u00b7 Windows 10 and 11');
  assert.equal(await text(page, '[data-dl="alt"]'), 'winget or installer');
  assert.deepEqual(await page.locator('#panel-win h4').allInnerTexts(), ['Microsoft Store', 'winget', 'Installer (.exe)']);
  assert.equal(await page.locator('#panel-win .dl-rec [data-dl-store]').getAttribute('href'), STORE_APP);
  await hero.click({ trial: true });
  assert.equal(await vis(page, '[data-dl="hint"][data-for="win"]'), false, 'no SmartScreen hint for the Store');
});
await scenario('linux, tagged AppImage in the release', { os: 'linux', query: '?app=freetube' }, async (page) => {
  assert.ok(await vis(page, '[data-app-offer="linux"]'));
  assert.match(await page.locator('[data-app-offer="linux"] [data-app-pkg]').getAttribute('href'), /x86_64\.freetube\.AppImage$/);
  assert.equal(await text(page, '[data-app-offer="linux"] [data-app-sha]'), SHA_TAGGED);
  assert.match(await page.locator('[data-dl="auto"]').first().getAttribute('href'), /x86_64\.freetube\.AppImage$/);
});
await scenario('linux, release without tagged packages', { os: 'linux', query: '?app=freetube', tagged: false }, async (page) => {
  assert.equal(await vis(page, '[data-app-offer="linux"]'), false);
  assert.match(await page.locator('[data-dl="auto"]').first().getAttribute('href'), /\.deb$/);
  assert.doesNotMatch(await page.locator('body').innerText(), /After installing, Orivon opens/);
});
await scenario('macOS gets the id in the install command', { os: 'mac', query: '?app=thelounge', tagged: false }, async (page) => {
  assert.match(await text(page, '#cmd-mac'), /install-macos\.sh \| bash -s thelounge$/);
  assert.match(await text(page, '[data-app-offer="mac"]'), /After installing, Orivon opens The Lounge\./);
  assert.match(await text(page, '[data-dl="detail"]'), /\| bash -s thelounge$/);
  assert.match(await text(page, '[data-app-name]'), /^The Lounge$/);
});
await scenario('Open in Orivon when the constant is on', { os: 'mac', query: '?app=thelounge', openInOrivon: true }, async (page) => {
  assert.ok(await vis(page, '[data-app-open-row]'));
  assert.equal(await page.locator('[data-app-open]').getAttribute('href'), 'orivon:open?u=thelounge.orivonstack.eth&flavour=thelounge');
  assert.equal(await page.locator('[data-app-copy-address]').getAttribute('data-copy'), 'ipfs://thelounge.orivonstack.eth');
  assert.match(await text(page, '[data-app-open]'), /^Open The Lounge in Orivon$/);
});

// An invalid value leaves the page exactly as without the parameter.
const baseline = {};
for (const os of ['win', 'mac', 'linux']) {
  await scenario(`${os}, no parameter`, { os, query: '' }, async (page) => {
    baseline[os] = await downloadHtml(page);
    assert.equal(await vis(page, '[data-app-head]'), false);
  });
  for (const q of ['?app=FreeTube', '?app=<script>alert(1)</script>', '?app=freetube&app=element', '?app=unknown', '?app=https://evil.example/']) {
    await scenario(`${os}, ${q} is ignored`, { os, query: q }, async (page) => {
      assert.equal(await vis(page, '[data-app-head]'), false);
      assert.equal(await downloadHtml(page), baseline[os], 'download section differs from the page without the parameter');
      const body = await page.locator('body').innerText();
      assert.doesNotMatch(body, /alert\(1\)|evil\.example|After installing, Orivon opens/);
      assert.doesNotMatch(await page.locator('#download').innerText(), /FreeTube/);
    });
  }
}
await scenario('macOS: the Store link opens the Store web page', { os: 'mac', query: '' }, async (page) => {
  assert.equal(await page.locator('[data-dl-store]').first().getAttribute('href'), STORE_WEB);
});
await scenario('JavaScript off: the plain download page', { os: 'win', query: '?app=freetube', js: false }, async (page) => {
  assert.equal(await page.locator('[data-dl-store]').first().getAttribute('href'), STORE_WEB);
  assert.equal(await vis(page, '[data-app-head]'), false);
  assert.equal(await vis(page, '[data-app-offer="win"]'), false);
  assert.ok(await vis(page, '#download h2'));
});

// The Web3 build: every package from the latest folder, never from GitHub; the Store, winget and the macOS command stay.
const BAKED = readFileSync(join(site, 'assets/js/orivon-download.js'), 'utf8').match(/var TAG = 'v([^']+)';/)[1];
const hrefs = (page, sel) => page.locator(sel).evaluateAll((els) => els.map((e) => e.getAttribute('href')));
const shaShown = (page) => page.locator('[data-dl-sha]').evaluateAll((els) => els.filter((e) => !e.hidden).length);
await scenario('web3, linux: the newest release in the folder, from the folder', { os: 'linux', query: '', web3: true }, async (page) => {
  assert.equal(await page.locator('[data-dl="auto"]').first().getAttribute('href'), LATEST + 'orivon_0.0.9_amd64.deb');
  assert.equal(await text(page, '[data-dl="detail"]'), 'v0.0.9 · Linux · .deb · 103 MB');
  assert.equal(await page.locator('[data-dl="alt"]').getAttribute('href'), LATEST + 'Orivon-0.0.9-x86_64.AppImage');
  assert.deepEqual(await hrefs(page, '[data-dl-asset]'), ['Orivon-Setup-0.0.9-x64.exe', 'Orivon-0.0.9-arm64.dmg', 'Orivon-0.0.9-x64.dmg',
    'orivon_0.0.9_amd64.deb', 'Orivon-0.0.9-x86_64.AppImage'].map((n) => LATEST + n));
  assert.equal(await text(page, '[data-dl-version]'), 'v0.0.9');
  assert.equal(await shaShown(page), 0, 'the folder lists no digests: none is shown for a release newer than the baked one');
  assert.equal(await vis(page, '[data-dl-ipfs]'), false);
});
await scenario('web3, windows: the Store first, the installer from the folder', { os: 'win', query: '', web3: true }, async (page) => {
  assert.equal(await page.locator('[data-dl="auto"]').first().getAttribute('href'), STORE_APP);
  assert.equal(await page.locator('#panel-win [data-dl-asset="win-x64"]').getAttribute('href'), LATEST + 'Orivon-Setup-0.0.9-x64.exe');
  assert.equal(await text(page, '#cmd-winget'), 'winget install Orivon.Browser.Preview');
});
await scenario('web3, windows, tagged installer in the folder', { os: 'win', query: '?app=freetube', web3: true }, async (page) => {
  assert.equal(await page.locator('[data-dl="auto"]').first().getAttribute('href'), LATEST + 'Orivon-Setup-0.0.9-x64.freetube.exe');
  assert.equal(await page.locator('[data-app-offer="win"] [data-app-pkg]').getAttribute('href'), LATEST + 'Orivon-Setup-0.0.9-x64.freetube.exe');
  assert.equal(await vis(page, '[data-app-offer="win"] [data-app-sha-row]'), false);
});
await scenario('web3, macOS: the .dmg from the folder, the install command as it is', { os: 'mac', query: '', web3: true }, async (page) => {
  // Chromium tells the host's architecture: the .dmg for that one.
  const arch = await page.evaluate(() => document.documentElement.dataset.arch);
  assert.equal(await page.locator('[data-dl="alt"]').getAttribute('href'), LATEST + `Orivon-0.0.9-${arch}.dmg`);
  assert.match(await text(page, '#cmd-mac'), /^curl -fsSL https:\/\/raw\.githubusercontent\.com\/OrivonBrowser\/orivon-mvp\/main\/scripts\/install-macos\.sh \| bash$/);
});
await scenario('web3, folder unreachable: the baked release, still from the folder', { os: 'linux', query: '', web3: true, latest: 'down' }, async (page) => {
  assert.equal(await page.locator('[data-dl="auto"]').first().getAttribute('href'), LATEST + `orivon_${BAKED}_amd64.deb`);
  assert.equal(await text(page, '[data-dl-version]'), 'v' + BAKED);
  assert.equal(await shaShown(page), 5, 'the baked digests stay');
  for (const h of await hrefs(page, '[data-dl-asset]')) assert.ok(h.startsWith(LATEST), h);
});
await scenario('web3, JavaScript off: the packages link to the folder', { os: 'linux', query: '', web3: true, js: false }, async (page) => {
  for (const h of await hrefs(page, '[data-dl-asset]')) assert.ok(h.startsWith(LATEST), h);
  assert.equal(await page.locator('[data-dl-store]').first().getAttribute('href'), STORE_WEB);
});

assert.deepEqual([...foreign], [], 'third-party requests');
await browser.close();
server.close();
if (failures) { console.log(`page-check: ${failures} scenario(s) failed`); process.exit(1); }
console.log('page-check: all scenarios passed; requests only to the page and api.github.com (Web3 build: latest.orivonstack.eth.limo)');
