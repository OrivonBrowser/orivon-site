#!/usr/bin/env node
// Checks that the apps the page can name with ?app=<id> (site/assets/js/orivon-flavours.js) are exactly
// the browser's allowlist, resources/flavours.json of OrivonBrowser/orivon-mvp. Plain Node, no dependencies.
//
//   node scripts/check-flavours.mjs                  compare with the file on the main branch
//   node scripts/check-flavours.mjs --ref <branch>   compare with another ref
//
// Exit 1 on a difference. While the file does not exist on the ref (404) the check says so and passes;
// GITHUB_TOKEN (optional) raises the API rate limit.

await import('../site/assets/js/orivon-flavours.js');
const mine = globalThis.OrivonFlavours.FLAVOURS;
const i = process.argv.indexOf('--ref');
const ref = i > 0 && process.argv[i + 1] ? process.argv[i + 1] : 'main';
const url = `https://api.github.com/repos/OrivonBrowser/orivon-mvp/contents/resources/flavours.json?ref=${encodeURIComponent(ref)}`;
const headers = { Accept: 'application/vnd.github.raw+json', 'User-Agent': 'orivon-site-check' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const res = await fetch(url, { headers });
if (res.status === 404) {
  console.log(`check-flavours: resources/flavours.json is not on ${ref} of orivon-mvp yet; nothing to compare`);
  process.exit(0);
}
if (!res.ok) { console.error(`check-flavours: ${url}: HTTP ${res.status}`); process.exit(1); }
const theirs = (await res.json()).flavours;
const key = (f) => JSON.stringify([f.id, f.name, f.app]);
const a = mine.map(key).sort(), b = theirs.map(key).sort();
if (JSON.stringify(a) !== JSON.stringify(b)) {
  console.error('check-flavours: site/assets/js/orivon-flavours.js differs from orivon-mvp resources/flavours.json (id, name, app)');
  console.error('  site:   ' + a.join(' '));
  console.error('  browser: ' + b.join(' '));
  process.exit(1);
}
console.log(`check-flavours: ${mine.length} apps, same as orivon-mvp ${ref}`);
