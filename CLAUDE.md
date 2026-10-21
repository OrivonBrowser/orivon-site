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
- `npm run build:latest` also writes `build-latest/`, the latest.orivonstack.com redirect (`site-latest/`), deployed by the OrivonBrowser/orivon-latest repository. `npm run check-latest` checks it headless.
- Heavy tools (browsers, bundlers) only through the machine's heavy-command wrapper, one at a time.

## The Web2/Web3 standard

`build/` is the Web2 site (www.orivonstack.com, GitHub Pages). `build-web3/` is the same files with every Orivon address pointed at its `.eth.limo` twin (www.orivonstack.com and orivonstack.com to www.orivonstack.eth.limo, docs.orivonstack.com to docs.orivonstack.eth.limo), via `scripts/web3-links.mjs`, which is shared byte for byte by every Orivon repository that builds a static site: do not edit it here. The Web3 build is published on IPFS behind the IPNS name that www.orivonstack.eth and download.orivonstack.eth point to. Source files keep Web2 addresses; never hand-edit `.eth.limo` variants of Orivon's own sites into `site/`.

## Release links

Never hand-edit the version, package hrefs, sizes, checksums or CID: `npm run sync-release` generates them from the latest release (`scripts/sync-release.mjs`), `npm run check-release` verifies, and `.github/workflows/release-links.yml` runs it daily. After a release, run sync, commit, rebuild `build-web3/` and have it published.

## Download wiring

- `site/assets/js/orivon-download.js` does OS detection, the hero button, package links, sizes and the live release. Its header comment documents every `data-*` attribute.
- Constants at its top: `STORE` (Microsoft Store identity: `productId` `9MXV3FNMFBP4` makes every Store link open Orivon's Store page, `ms-windows-store://pdp/?ProductId=` on Windows and `apps.microsoft.com/detail/` elsewhere and in the static HTML), `WINGET_ID`, `MAC_CMD`.
- Hero per OS: Windows opens the Store app link (with `?app=` and a tagged installer in the release, it downloads that installer and shows the SmartScreen hint); macOS copies the install command; Linux downloads the .deb; mobile and unknown go to `#download`.
- `#download` is an OS-tabbed panel (tabs built by `site/assets/js/site.js`; without JS all three panels stack). Copy buttons use `data-copy` or `data-copy-from=<id>`.
- Windows panel order (owner's choice): Microsoft Store (Recommended), then winget (with a note that the package may not be available yet), then the .exe with the SmartScreen steps (`#install-win`).
- The commands also stay literally in the HTML so they read with JS off.
- `?app=<id>` (`site/assets/js/orivon-flavours.js` holds the allowlist and the pure functions; `orivon-download.js` binds them): only the six allowlisted ids count, anything else leaves the page as if there were no parameter, and only the allowlisted name is shown, via `textContent`. Never echo the query string. The list mirrors orivon-mvp `resources/flavours.json`; `npm run check-flavours` (in the release-links workflow) keeps it honest. The tagged `.exe` and `.AppImage` are offered only when the latest release has them (`sync-release` records them in the fallback). `OPEN_IN_ORIVON` in `orivon-download.js` stays `false` until a released Orivon handles `orivon:` links.
- `site.js` also jumps to `#download` when the page is opened on a `download.` host.

## Tests

`npm test` (Node's built-in runner, no dependencies) covers the `?app=` functions and `sync-release`'s tagged records. `npm run check-page` drives the page in headless Chromium (Playwright from `PLAYWRIGHT_DIR`, default `../orivon-mvp`; skipped when missing), with a fake release answering api.github.com.

## QA

A browser-based check (outside this repo) loads the page at 1440 and 390 px in light, dark and with the Dark Reader extension, and asserts: the download matrix per OS (hero href, text, detail, alt, Store link, selected tab), 0 console errors, no horizontal overflow, no third-party requests besides api.github.com, and that Dark Reader hands over to the site's own dark theme. Screenshots go to `site/_shots/`, which is git-ignored and excluded from the build.
