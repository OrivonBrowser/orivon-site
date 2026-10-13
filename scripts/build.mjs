#!/usr/bin/env node
// Builds the site. Plain Node, no dependencies.
//
//   node scripts/build.mjs          site/ -> build/        (the Web2 site, www.orivonstack.com)
//   node scripts/build.mjs --web3   the same, then build/ -> build-web3/ with every Orivon address
//                                   pointed at its .eth.limo twin (see scripts/web3-links.mjs)
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

if (process.argv.includes('--web3')) {
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'web3-links.mjs'), out, out3], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}
