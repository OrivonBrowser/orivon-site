#!/usr/bin/env node
// Builds the site. Plain Node, no dependencies.
//
//   node scripts/build.mjs          site/ -> build/        (the Web2 site, www.orivonstack.com)
//   node scripts/build.mjs --web3   the same, then build/ -> build-web3/ with every Orivon address
//                                   pointed at its .eth.limo twin (see scripts/web3-links.mjs), and every
//                                   package downloaded from latest.orivonstack.eth instead of GitHub
//   node scripts/build.mjs --latest the redirect for latest.orivonstack.com -> build-latest/ (with the shared download
//                                   scripts; deployed by the Pages workflow of its own repo)
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  web3Downloads(out3);
}

// The Web3 site hands no download to GitHub. latest.orivonstack.eth (IPNS key latest-release, moved by orivon-mvp's
// release pinner) always opens the newest release's files plus a start page listing them: the package links point
// there under the same file names, and orivon-download.js reads that start page instead of api.github.com.
// The macOS install command, winget and the Microsoft Store stay as they are: the visitor knowingly goes there.
function web3Downloads(dir) {
  const LATEST = 'https://latest.orivonstack.eth.limo/';
  const edit = (file, fn) => { const p = join(dir, file); writeFileSync(p, fn(readFileSync(p, 'utf8'))); };
  let set = 0, links = 0;
  edit('assets/js/orivon-download.js', (js) => js.replace("var LATEST = '';", () => { set++; return `var LATEST = '${LATEST}';`; }));
  edit('index.html', (html) => {
    const out = html.replace(/https:\/\/github\.com\/OrivonBrowser\/orivon-mvp\/releases\/download\/[^/"]+\/([^/"]+)/g,
      (_, name) => { links++; return LATEST + name; });
    if (/releases\/download\//.test(out)) throw new Error('build: a GitHub download link is left in build-web3/index.html');
    return out;
  });
  if (set !== 1) throw new Error("build: `var LATEST = '';` not found once in orivon-download.js");
  if (!links) throw new Error('build: no package link found in index.html');
  console.log(`build: ${links} package link(s) and orivon-download.js in build-web3/ download from ${LATEST}`);
}
