# Notes for agents

The release website of Orivon (www.orivonstack.com). Plain static site in `site/`.

## Build constraints

- Plain HTML, CSS, vanilla JS. No framework, no build step for the page, never add dependencies, never `npm install`.
- Zero third-party requests except `api.github.com` (live release). Self-hosted fonts only.
- Relative links only (works from any path, including an IPFS gateway). Responsive from 360 px, keyboard-navigable, WCAG AA contrast, readable with JS off, light and dark designed.
- Copy: only facts the public README and docs support. No competitor names, no roadmap, no invented numbers or partners. English, British spelling.

## Commands

- `npm run serve` serves `site/` on port 4320.
- `npm run build` writes `build/` (the Web2 site plus `CNAME`). `npm run build:web3` also writes `build-web3/`.
- Heavy tools (browsers, bundlers) only through the machine's heavy-command wrapper, one at a time.

## The Web2/Web3 standard

`build/` is the Web2 site (www.orivonstack.com, GitHub Pages). `build-web3/` is the same files with every Orivon address pointed at its `.eth.limo` twin (www.orivonstack.com and orivonstack.com to www.orivonstack.eth.limo, docs.orivonstack.com to docs.orivonstack.eth.limo), via `scripts/web3-links.mjs`, which is shared byte for byte by every Orivon repository that builds a static site: do not edit it here. The Web3 build is published on IPFS behind the IPNS name that www.orivonstack.eth and download.orivonstack.eth point to. Source files keep Web2 addresses; never hand-edit `.eth.limo` variants of Orivon's own sites into `site/`.

## Download wiring

- `site/assets/js/orivon-download.js` does OS detection, the hero button, package links, sizes and the live release. Its header comment documents every `data-*` attribute.
- Constants at its top: `STORE` (Microsoft Store identity: set `productId` from Partner Center to switch every Store link to it), `WINGET_ID`, `MAC_CMD`.
- Hero per OS: Windows opens the Store app link; macOS copies the install command; Linux downloads the .deb; mobile and unknown go to `#download`.
- `#download` is an OS-tabbed panel (tabs built by `site/assets/js/site.js`; without JS all three panels stack). Copy buttons use `data-copy` or `data-copy-from=<id>`.
- The commands also stay literally in the HTML so they read with JS off.
- `site.js` also jumps to `#download` when the page is opened on a `download.` host.

## QA

A browser-based check (outside this repo) loads the page at 1440 and 390 px in light, dark and with the Dark Reader extension, and asserts: the download matrix per OS (hero href, text, detail, alt, Store link, selected tab), 0 console errors, no horizontal overflow, no third-party requests besides api.github.com, and that Dark Reader hands over to the site's own dark theme. Screenshots go to `site/_shots/`, which is git-ignored and excluded from the build.
