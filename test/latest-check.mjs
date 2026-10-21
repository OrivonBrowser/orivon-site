// Headless browser check of the latest.orivonstack.com redirect (build-latest/). Not part of `npm test`:
//   npm run build:latest && npm run check-latest
// Uses the Playwright of PLAYWRIGHT_DIR (default: the orivon-mvp checkout next to this one); skips (exit 0)
// when none is found. Serves build-latest/ on a loopback port, answers api.github.com with a fake release, and
// asserts where each system is sent. No window is opened.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'build-latest');
if (!existsSync(join(site, 'index.html'))) { console.error('latest-check: run `npm run build:latest` first'); process.exit(1); }
const pwDir = process.env.PLAYWRIGHT_DIR || join(root, '..', 'orivon-mvp');
let chromium;
try {
  chromium = createRequire(join(pwDir, 'package.json'))('playwright').chromium;
} catch {
  console.log('latest-check: Playwright not found (set PLAYWRIGHT_DIR); skipped');
  process.exit(0);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  const file = join(site, p === '/' ? 'index.html' : p.replace(/\.\./g, ''));
  if (!existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const DL = 'https://github.com/OrivonBrowser/orivon-mvp/releases/download/';
const gh = (name) => ({ name, size: 1e8, digest: null, browser_download_url: `${DL}v0.0.99/${name}` });
const RELEASE = [{
  tag_name: 'v0.0.99', html_url: 'https://github.com/OrivonBrowser/orivon-mvp/releases/tag/v0.0.99',
  published_at: '2030-01-01T00:00:00Z', draft: false, prerelease: false, body: '',
  assets: ['Orivon-Setup-0.0.99-x64.exe', 'Orivon-0.0.99-arm64.dmg', 'Orivon-0.0.99-x64.dmg', 'orivon_0.0.99_amd64.deb', 'Orivon-0.0.99-x86_64.AppImage'].map(gh),
}];
const HOME = 'https://www.orivonstack.com/#download';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const LNX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const browser = await chromium.launch({ headless: true });
// Each case: the system the browser reports, and the URL the page must send it to.
async function target({ ua, platform, arch, api = true, js = true }) {
  const ctx = await browser.newContext({ userAgent: ua, javaScriptEnabled: js });
  const page = await ctx.newPage();
  // Headless Chromium reports this machine's platform and architecture whatever the user agent says.
  await page.addInitScript(([plat, ar]) => {
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => plat });
    Object.defineProperty(Navigator.prototype, 'userAgentData', {
      get: () => ({ platform: plat, getHighEntropyValues: () => Promise.resolve({ architecture: ar }) }),
    });
  }, [platform, arch]);
  const third = [];
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
    const u = r.request().url();
    if (u.startsWith('https://api.github.com/')) return api ? r.fulfill({ json: RELEASE }) : r.abort();
    // A request URL carries no fragment: HOME arrives as the bare www address.
    if (u.startsWith(DL) || u === 'https://www.orivonstack.com/' || u.startsWith('https://github.com/')) return r.fulfill({ contentType: 'text/html', body: 'ok' });
    third.push(u);
    return r.abort();
  });
  await page.goto(base);
  await page.waitForURL((u) => !u.href.startsWith(base), { timeout: 10_000 });
  const url = page.url();
  await ctx.close();
  assert.deepEqual(third, [], 'no third-party request besides api.github.com');
  return url;
}

const fallbackTag = /var TAG = '([^']+)'/.exec(readFileSync(join(site, 'assets/js/orivon-download.js'), 'utf8'))[1];
try {
  assert.equal(await target({ ua: WIN, platform: 'Windows', arch: 'x86' }), `${DL}v0.0.99/Orivon-Setup-0.0.99-x64.exe`);
  assert.equal(await target({ ua: LNX, platform: 'Linux', arch: 'x86' }), `${DL}v0.0.99/orivon_0.0.99_amd64.deb`);
  assert.equal(await target({ ua: MAC, platform: 'macOS', arch: 'arm' }), `${DL}v0.0.99/Orivon-0.0.99-arm64.dmg`);
  assert.equal(await target({ ua: MAC, platform: 'macOS', arch: 'x86' }), `${DL}v0.0.99/Orivon-0.0.99-x64.dmg`);
  assert.equal(await target({ ua: IOS, platform: 'iPhone', arch: '' }), HOME);
  assert.match(await target({ ua: WIN, platform: 'Windows', arch: 'x86', api: false }), new RegExp(`^${DL}${fallbackTag}/Orivon-Setup-.+-x64\\.exe$`));
  assert.equal(await target({ ua: WIN, platform: 'Windows', arch: 'x86', js: false }), HOME);
  console.log('latest-check: 7 cases passed');
} finally {
  await browser.close();
  server.close();
}
