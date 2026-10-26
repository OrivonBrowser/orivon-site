// What Google is told about the two copies of the site: www.orivonstack.com and its IPFS twin name the Web2 page as
// canonical, and the page of the bare name orivonstack.eth is a page of its own with its own canonical.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { rewrite } = await import('../scripts/web3-links.mjs');

test('the .eth.limo twin keeps the Web2 address in rel=canonical and rewrites the rest', () => {
  const html = '<link rel="canonical" href="https://www.orivonstack.com/"><link data-rh="true" rel=canonical href="https://docs.orivonstack.com/docs/">'
    + '<meta property="og:url" content="https://www.orivonstack.com/"><a href="https://docs.orivonstack.com/x">d</a> mail@orivonstack.com';
  const { out, count } = rewrite(html);
  assert.match(out, /<link rel="canonical" href="https:\/\/www\.orivonstack\.com\/">/);
  assert.match(out, /<link data-rh="true" rel=canonical href="https:\/\/docs\.orivonstack\.com\/docs\/">/);
  assert.match(out, /og:url" content="https:\/\/www\.orivonstack\.eth\.limo\/"/);
  assert.match(out, /href="https:\/\/docs\.orivonstack\.eth\.limo\/x"/);
  assert.match(out, /mail@orivonstack\.com/);
  assert.equal(count, 2);
});

test('the Web3 build has no sitemap and no Sitemap line, and the Web2 site has both', () => {
  const dir = mkdtempSync(join(tmpdir(), 'web3-'));
  const web2 = join(dir, 'build'), web3 = join(dir, 'build-web3');
  spawnSync('mkdir', ['-p', web2]);
  writeFileSync(join(web2, 'index.html'), '<link rel="canonical" href="https://www.orivonstack.com/">');
  writeFileSync(join(web2, 'sitemap.xml'), '<urlset><url><loc>https://www.orivonstack.com/</loc></url></urlset>');
  writeFileSync(join(web2, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: https://www.orivonstack.com/sitemap.xml\n');
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'web3-links.mjs'), web2, web3], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(join(web3, 'sitemap.xml')), false);
  assert.doesNotMatch(readFileSync(join(web3, 'robots.txt'), 'utf8'), /sitemap/i);
  assert.doesNotMatch(r.stdout, /left as it is/);
  assert.match(readFileSync(join(root, 'site', 'robots.txt'), 'utf8'), /^Sitemap: https:\/\/www\.orivonstack\.com\/sitemap\.xml$/m);
  assert.match(readFileSync(join(root, 'site', 'sitemap.xml'), 'utf8'), /<loc>https:\/\/www\.orivonstack\.com\/<\/loc>/);
});

test('the page of orivonstack.eth is its own page and lists only Orivon\'s own sites', () => {
  const html = readFileSync(join(root, 'site-eth', 'index.html'), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/orivonstack\.eth\.limo\/">/);
  assert.doesNotMatch(html, /noindex/i);
  assert.match(readFileSync(join(root, 'site-eth', 'robots.txt'), 'utf8'), /^Sitemap: https:\/\/orivonstack\.eth\.limo\/sitemap\.xml$/m);
  assert.match(readFileSync(join(root, 'site-eth', 'sitemap.xml'), 'utf8'), /<loc>https:\/\/orivonstack\.eth\.limo\/<\/loc>/);
  // Only hosts Orivon runs. Third-party apps published under orivonstack.eth stay off this page until their teams agree.
  const own = new Set(['www', 'download', 'latest', 'docs', 'status', 'explore']);
  const hosts = [...html.matchAll(/href="https?:\/\/([^/"]+)/g)].map((m) => m[1]);
  for (const h of hosts) {
    const m = /^([a-z0-9-]+)\.orivonstack\.eth\.limo$/.exec(h);
    if (m) assert.ok(own.has(m[1]), `${h} is not one of Orivon's own sites`);
    else assert.ok(['orivonstack.eth.limo', 'www.orivonstack.com', 'docs.orivonstack.com', 'github.com'].includes(h), `unexpected link to ${h}`);
  }
  assert.ok(hosts.filter((h) => h.endsWith('.orivonstack.eth.limo')).length >= own.size);
});
