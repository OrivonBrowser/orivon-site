#!/usr/bin/env node
// Keeps the release data baked into the page current. Plain Node, no dependencies.
//
//   node scripts/sync-release.mjs           rewrite site/ from the latest release
//   node scripts/sync-release.mjs --check   change nothing; exit 1 if site/ lags the latest release
//
// "Latest" is the newest published release with a v<major>.<minor>.<patch> tag and every installer the
// page links (pre-releases count, drafts and tags like "pre-releases" do not). It is written to:
//   - site/index.html: the package hrefs, file names, sizes, checksums, IPFS CID, version label and links;
//   - site/assets/js/orivon-download.js: the block between "release:begin" and "release:end", the fallback
//     the page uses with JavaScript off and when the live release cannot be read (the Web3 build offers the same
//     files from latest.orivonstack.eth, see scripts/build.mjs).
// A release may also carry the Windows installer and the Linux AppImage under a tagged name
// (Orivon-Setup-<ver>-x64.<id>.exe, Orivon-<ver>-x86_64.<id>.AppImage) that opens the app <id> on first run.
// When it does, they are recorded too (ids from site/assets/js/orivon-flavours.js only); none is fine.
// A checksum comes from the asset's `digest`, else from the release's ipfs.json.
// GITHUB_TOKEN (optional) raises the API rate limit.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../site/assets/js/orivon-flavours.js');
const { taggedId } = globalThis.OrivonFlavours;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(root, 'site', 'index.html');
const JS = join(root, 'site', 'assets', 'js', 'orivon-download.js');
const REPO = 'OrivonBrowser/orivon-mvp';
const GH = `https://github.com/${REPO}`;
const KEYS = ['win-x64', 'mac-arm64', 'mac-x64', 'linux-deb', 'linux-appimage'];
const PATTERNS = {
  'win-x64': /^Orivon-Setup-.+-x64\.exe$/,
  'mac-arm64': /^Orivon-.+-arm64\.dmg$/,
  'mac-x64': /^Orivon-.+-x64\.dmg$/,
  'linux-deb': /^orivon_.+_amd64\.deb$/,
  'linux-appimage': /^Orivon-.+-x86_64\.AppImage$/,
};

async function getJson(url) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'orivon-site-sync' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function latestRelease() {
  const list = await getJson(`https://api.github.com/repos/${REPO}/releases?per_page=20`);
  const candidates = list
    .filter((r) => r && !r.draft && /^v\d+\.\d+\.\d+$/.test(r.tag_name || '') && Array.isArray(r.assets))
    .filter((r) => KEYS.every((k) => r.assets.some((a) => PATTERNS[k].test(a.name))))
    .sort((a, b) => Date.parse(b.published_at || b.created_at) - Date.parse(a.published_at || a.created_at));
  if (!candidates.length) throw new Error('no release with a semver tag and every installer found');
  const r = candidates[0];

  let ipfs = null;
  const ipfsAsset = r.assets.find((a) => a.name === 'ipfs.json');
  if (ipfsAsset) {
    try { ipfs = await getJson(ipfsAsset.browser_download_url); } catch { /* optional */ }
  }
  const assets = {};
  for (const k of KEYS) {
    const a = r.assets.find((x) => PATTERNS[k].test(x.name));
    const m = /^sha256:([0-9a-f]{64})$/i.exec(a.digest || '');
    const fromIpfs = ipfs && (ipfs.files || []).find((f) => f.name === a.name);
    const sha = m ? m[1].toLowerCase() : fromIpfs && /^[0-9a-f]{64}$/i.test(fromIpfs.sha256 || '') ? fromIpfs.sha256.toLowerCase() : '';
    if (!sha) throw new Error(`no sha256 for ${a.name} (no digest, not in ipfs.json)`);
    assets[k] = { name: a.name, size: a.size, sha };
  }
  const tagged = {};
  for (const a of r.assets) {
    for (const k of ['win-x64', 'linux-appimage']) {
      const id = taggedId(k, a.name);
      if (!id) continue;
      const m = /^sha256:([0-9a-f]{64})$/i.exec(a.digest || '');
      const fromIpfs = ipfs && (ipfs.files || []).find((f) => f.name === a.name);
      // A tagged file has the bytes of the plain one: the plain digest stands in when the size matches.
      const sha = m ? m[1].toLowerCase()
        : fromIpfs && /^[0-9a-f]{64}$/i.test(fromIpfs.sha256 || '') ? fromIpfs.sha256.toLowerCase()
        : assets[k].size === a.size ? assets[k].sha : '';
      if (!sha) throw new Error(`no sha256 for ${a.name} (no digest, not in ipfs.json)`);
      (tagged[id] ||= {})[k] = { name: a.name, size: a.size, sha };
    }
  }
  const cm = /ipfs:\/\/(baf[a-z2-7]+)/.exec(r.body || '');
  const cid = cm ? cm[1] : ipfs && /^baf[a-z2-7]+$/.test(ipfs.cid || '') ? ipfs.cid : '';
  if (!cid) throw new Error('no IPFS CID in the release text or ipfs.json');
  return { tag: r.tag_name, published: r.published_at || r.created_at, cid, assets, tagged };
}

const mb = (bytes) => `${Math.round(bytes / 1e6)} MB`;

function renderJs(js, rel) {
  const lines = KEYS.map((k) => {
    const a = rel.assets[k];
    return `      '${k}': baked('${a.name}', ${a.size}, '${a.sha}')`;
  });
  const taggedLines = Object.keys(rel.tagged).sort().map((id) => {
    const parts = Object.keys(rel.tagged[id]).sort().map((k) => {
      const a = rel.tagged[id][k];
      return `'${k}': baked('${a.name}', ${a.size}, '${a.sha}')`;
    });
    return `      '${id}': { ${parts.join(', ')} }`;
  });
  const tagged = taggedLines.length ? `{\n${taggedLines.join(',\n')}\n    }` : '{}';
  const block = `  // release:begin (generated by scripts/sync-release.mjs, do not edit by hand)
  var TAG = '${rel.tag}';
  function baked(file, size, sha) {
    return { name: file, url: GH + '/releases/download/' + TAG + '/' + file, size: size, sha: sha };
  }
  var FALLBACK = {
    tag: TAG,
    published: '${rel.published}',
    url: GH + '/releases/tag/' + TAG,
    cid: '${rel.cid}',
    assets: {
${lines.join(',\n')}
    },
    tagged: ${tagged}
  };
  // release:end`;
  const re = /  \/\/ release:begin[\s\S]*?\/\/ release:end/;
  if (!re.test(js)) throw new Error('release:begin / release:end markers missing in orivon-download.js');
  return js.replace(re, () => block);
}

function renderHtml(html, rel) {
  let out = html;
  const sub = (re, fn, what, optional = false) => {
    let n = 0;
    out = out.replace(re, (...m) => { n++; return fn(...m); });
    if (!n && !optional) throw new Error(`index.html: nothing matched for ${what}`);
  };
  const dl = (name) => `${GH}/releases/download/${rel.tag}/${name}`;
  for (const k of KEYS) {
    const a = rel.assets[k];
    sub(new RegExp(`(data-dl-asset="${k}" href=")[^"]*(")`, 'g'), (_, p, s) => p + dl(a.name) + s, `asset ${k}`);
    sub(new RegExp(`(data-dl-size="${k}">)[^<]*(<)`, 'g'), (_, p, s) => p + mb(a.size) + s, `size ${k}`);
    sub(new RegExp(`(data-dl-name="${k}">)[^<]*(<)`, 'g'), (_, p, s) => p + a.name + s, `name ${k}`, true);
    sub(new RegExp(`(data-dl-sha="${k}" data-full>)[^<]*(<)`, 'g'), (_, p, s) => p + a.sha + s, `sha ${k}`);
  }
  sub(/(data-dl-version>)[^<]*(<)/g, (_, p, s) => p + rel.tag + s, 'version label');
  sub(/(data-dl-notes href=")[^"]*(")/g, (_, p, s) => p + `${GH}/releases/tag/${rel.tag}` + s, 'release notes link');
  sub(/(data-dl-source href=")[^"]*(")/g, (_, p, s) => p + `${GH}/tree/${rel.tag}` + s, 'source link');
  sub(/(data-dl-ipfs>)[^<]*(<)/g, (_, p, s) => p + `ipfs://${rel.cid.slice(0, 6)}…${rel.cid.slice(-4)}` + s, 'IPFS CID');
  return out;
}

const check = process.argv.includes('--check');
const rel = await latestRelease();
const files = [[HTML, renderHtml], [JS, renderJs]];
const stale = [];
for (const [path, render] of files) {
  const before = readFileSync(path, 'utf8');
  const after = render(before, rel);
  if (before !== after) {
    stale.push(path.slice(root.length + 1));
    if (!check) writeFileSync(path, after);
  }
}
if (check) {
  if (stale.length) {
    console.error(`sync-release: ${stale.join(', ')} lag the latest release ${rel.tag}. Run: npm run sync-release`);
    process.exit(1);
  }
  console.log(`sync-release: site/ is current with ${rel.tag}`);
} else {
  console.log(stale.length ? `sync-release: ${rel.tag} written to ${stale.join(', ')}` : `sync-release: already ${rel.tag}`);
}
