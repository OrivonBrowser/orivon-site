// Headless browser check of the download page with ?app=<id>. Not part of `npm test`:
//   npm run check-page
// Uses the Playwright of PLAYWRIGHT_DIR (default: the orivon-mvp checkout next to this one); skips (exit 0)
// when none is found. Serves site/ on a loopback port, answers api.github.com with a fake release, and fails
// on any other third-party request. No window is opened.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const pwDir = process.env.PLAYWRIGHT_DIR || join(root, '..', 'orivon-mvp');
let chromium;
try {
  chromium = createRequire(join(pwDir, 'package.json'))('playwright').chromium;
} catch {
  console.log('page-check: Playwright not found (set PLAYWRIGHT_DIR); skipped');
  process.exit(0);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  const file = join(site, p === '/' ? 'index.html' : p.replace(/\.\./g, ''));
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
async function scenario(name, { os, query, tagged = true, js = true, openInOrivon = false }, check) {
  const ctx = await browser.newContext({ userAgent: UA[os], javaScriptEnabled: js, viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  page.on('request', (r) => { const h = new URL(r.url()).hostname; if (h !== '127.0.0.1' && h !== 'api.github.com') foreign.add(r.url()); });
  await page.route('https://api.github.com/**', (r) => r.fulfill({ json: releaseJson(tagged) }));
  if (openInOrivon) await page.route('**/orivon-download.js', async (r) => {
    const src = readFileSync(join(site, 'assets/js/orivon-download.js'), 'utf8').replace('var OPEN_IN_ORIVON = false;', 'var OPEN_IN_ORIVON = true;');
    r.fulfill({ contentType: 'text/javascript', body: src });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + query);
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
  assert.match(await page.locator('[data-dl="auto"]').first().getAttribute('href'), /^ms-windows-store:\/\/pdp\/\?/);
});
await scenario('windows: the Store first, then winget, then the installer', { os: 'win', query: '' }, async (page) => {
  const hero = page.locator('[data-dl="auto"]').first();
  assert.match(await hero.getAttribute('href'), /^ms-windows-store:\/\/pdp\/\?/);
  assert.equal(await hero.getAttribute('data-dl-mode'), 'store');
  assert.equal(await text(page, '[data-dl="detail"]'), 'Free on the Microsoft Store \u00b7 Windows 10 and 11');
  assert.equal(await text(page, '[data-dl="alt"]'), 'winget or installer');
  assert.deepEqual(await page.locator('#panel-win h4').allInnerTexts(), ['Microsoft Store', 'winget', 'Installer (.exe)']);
  assert.match(await page.locator('#panel-win .dl-rec [data-dl-store]').getAttribute('href'), /^ms-windows-store:\/\/pdp\/\?/);
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
await scenario('JavaScript off: the plain download page', { os: 'win', query: '?app=freetube', js: false }, async (page) => {
  assert.equal(await vis(page, '[data-app-head]'), false);
  assert.equal(await vis(page, '[data-app-offer="win"]'), false);
  assert.ok(await vis(page, '#download h2'));
});

assert.deepEqual([...foreign], [], 'third-party requests');
await browser.close();
server.close();
if (failures) { console.log(`page-check: ${failures} scenario(s) failed`); process.exit(1); }
console.log('page-check: all scenarios passed; requests only to the page and api.github.com');
