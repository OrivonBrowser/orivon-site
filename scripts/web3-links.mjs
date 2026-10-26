#!/usr/bin/env node
// Writes the Web3 build of a static site: a copy of the Web2 build in which every address of an
// Orivon site points at its .eth.limo twin. eth.limo serves the .eth name to any browser, and
// Orivon resolves the same name itself, so the copy works on both.
//
//   node scripts/web3-links.mjs <web2-build-dir> <web3-out-dir>
//
// The same file, with the same HOSTS table, is in every Orivon repository that builds a static site.
// Plain Node, no dependencies.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

// Web2 host -> Web3 host. A host missing here has no Web3 twin and is left as it is.
export const HOSTS = {
  'orivonstack.com': 'www.orivonstack.eth.limo',
  'www.orivonstack.com': 'www.orivonstack.eth.limo',
  'docs.orivonstack.com': 'docs.orivonstack.eth.limo',
};

const TEXT = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.svg', '.webmanifest', '.map', '.md']);
// A host at a word start (not a subdomain of something else, not the domain of an e-mail address),
// with an optional scheme, which always becomes https.
const HOST_RE = /(https?:\/\/)?(?<![\w@.-])((?:www\.|docs\.)?orivonstack\.com)(?![\w-])/gi;
const LEFT_RE = /(?<![\w@-])[\w.-]*orivonstack\.com(?![\w-])/gi;
// A page's <link rel="canonical"> keeps its Web2 address. The .eth.limo copy is a mirror, and a mirror that names
// itself canonical gives a search engine two equal claims: Google took the .eth.limo copy of www.orivonstack.com
// and of several docs pages as the canonical one and left the Web2 pages out of its index (Search Console, 2026-10).
const CANONICAL_RE = /<link\b[^>]*\brel=["']?canonical["']?[^>]*>/gi;

export function rewrite(text) {
  let count = 0;
  const kept = [];
  const guarded = text.replace(CANONICAL_RE, (tag) => `\u0000${kept.push(tag) - 1}\u0000`);
  const out = guarded.replace(HOST_RE, (m, scheme, host) => {
    const to = HOSTS[host.toLowerCase()];
    if (!to) return m;
    count++;
    return (scheme ? 'https://' : '') + to;
  }).replace(/\u0000(\d+)\u0000/g, (_, i) => kept[i]);
  return { out, count };
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else yield p;
  }
}

function main() {
  const [src, dest] = process.argv.slice(2);
  if (!src || !dest) {
    console.error('usage: node scripts/web3-links.mjs <web2-build-dir> <web3-out-dir>');
    process.exit(2);
  }
  if (!existsSync(src)) {
    console.error(`web3-links: ${src} does not exist; build the Web2 site first`);
    process.exit(1);
  }
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
  // A CNAME names the Web2 host for GitHub Pages; the Web3 build has none.
  rmSync(join(dest, 'CNAME'), { force: true });
  // The Web2 sitemap lists the Web2 pages, which the twin names as canonical, so the twin has no sitemap of its own.
  rmSync(join(dest, 'sitemap.xml'), { force: true });
  const robots = join(dest, 'robots.txt');
  if (existsSync(robots)) writeFileSync(robots, readFileSync(robots, 'utf8').replace(/^sitemap:.*(?:\r?\n|$)/gim, ''));

  let total = 0, changed = 0;
  const left = new Map();
  for (const p of files(dest)) {
    if (!TEXT.has(extname(p).toLowerCase())) continue;
    const before = readFileSync(p, 'utf8');
    const { out, count } = rewrite(before);
    if (count) { writeFileSync(p, out); total += count; changed++; }
    for (const m of out.replace(CANONICAL_RE, '').match(LEFT_RE) || []) {
      if (!left.has(m)) left.set(m, relative(dest, p));
    }
  }
  console.log(`web3-links: ${total} address(es) in ${changed} file(s) now point at .eth.limo -> ${dest}`);
  for (const [host, file] of left) console.log(`web3-links: left as it is (no Web3 twin): ${host} (first in ${file})`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
