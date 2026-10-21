#!/usr/bin/env node
// Builds the site. Plain Node, no dependencies.
//
//   node scripts/build.mjs          site/ -> build/        (the Web2 site, www.orivonstack.com)
//   node scripts/build.mjs --web3   the same, then build/ -> build-web3/ with every Orivon address
//                                   pointed at its .eth.limo twin (see scripts/web3-links.mjs)
//   node scripts/build.mjs --latest the redirect for latest.orivonstack.com -> build-latest/ (with the shared download
//                                   scripts; deployed by the Pages workflow of its own repo)
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'site');
const out = join(root, 'build');
const out3 = join(root, 'build-web3');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
// Screenshots from the QA tool (_shots) and dotfiles stay out of the build.
cpSync(src, out, {
  recursive: true,
  filter: (p) => !/^(_shots|\.)/.test(basename(p)) || p === src,
});
writeFileSync(join(out, 'CNAME'), 'www.orivonstack.com\n');
console.log('build: site/ -> build/ (CNAME www.orivonstack.com)');

if (process.argv.includes('--latest')) {
  // latest.orivonstack.com has no page of its own: one small file that sends the visitor to the right installer,
  // using the main site's detection and release scripts.
  const outL = join(root, 'build-latest');
  rmSync(outL, { recursive: true, force: true });
  cpSync(join(root, 'site-latest'), outL, { recursive: true });
  for (const f of ['js/orivon-flavours.js', 'js/orivon-download.js', 'img/icon-48.png']) {
    cpSync(join(src, 'assets', f), join(outL, 'assets', f));
  }
  writeFileSync(join(outL, 'CNAME'), 'latest.orivonstack.com\n');
  console.log('build: site-latest/ -> build-latest/ (CNAME latest.orivonstack.com)');
}

if (process.argv.includes('--web3')) {
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'web3-links.mjs'), out, out3], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}
