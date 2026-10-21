# Orivon website

The source of [www.orivonstack.com](https://www.orivonstack.com), the release page of the Orivon desktop Web3 browser. The same site is published on IPFS as `www.orivonstack.eth`, `orivonstack.eth` and `download.orivonstack.eth` (the last one opens at the download section).

## Run it locally

```
npm run serve        # http://localhost:4320, serves site/ as it is
```

The page needs no build step: `site/index.html` plus `site/assets/` is the whole site.

## Web2 and Web3 builds

```
npm run build        # build/       the Web2 site, with CNAME www.orivonstack.com (GitHub Pages)
npm run build:web3   # also build-web3/   the Web3 site
```

`build/` is the Web2 site. `build-web3/` holds the same files with every address of an Orivon site pointing at its `.eth.limo` twin: `www.orivonstack.com` and `orivonstack.com` become `www.orivonstack.eth.limo`, and `docs.orivonstack.com` becomes `docs.orivonstack.eth.limo`. The rewrite is done by `scripts/web3-links.mjs`, the file shared by every Orivon repository that builds a static site. eth.limo serves `.eth` names to any browser, and Orivon resolves them itself, so the Web3 build works in both. The Web3 build is what is published on IPFS, behind the IPNS name that `www.orivonstack.eth`, `orivonstack.eth` and `download.orivonstack.eth` point to.

The Web3 build also hands no download to GitHub. `latest.orivonstack.eth` always opens the newest release on IPFS: its files under their own names plus a start page listing them, a folder the release pinner of `OrivonBrowser/orivon-mvp` (`scripts/pin-releases.sh`) moves the IPNS key `latest-release` to after each release. `build:web3` points every package link at that folder (`https://latest.orivonstack.eth.limo/<file>`) and sets `LATEST` in its copy of `orivon-download.js`, so the page reads the newest release from the folder's start page instead of api.github.com and offers the package the visitor picks from there, on the same page. The folder lists no checksums: a release newer than the baked one shows its packages without them until `sync-release` runs and the Web3 build is published again. If the folder cannot be read, the baked release is offered, still from the folder. The macOS install command, winget and the Microsoft Store stay as they are, since the visitor knowingly goes to them. `site/` keeps `LATEST` empty: the Web2 site and latest.orivonstack.com use GitHub.

Source files keep the Web2 addresses. Never hand-edit `.eth.limo` variants of Orivon's own sites into `site/`.

## Release links

The download links, version label, file sizes, checksums and IPFS CID in `site/index.html`, and the fallback release at the top of `site/assets/js/orivon-download.js` (between `release:begin` and `release:end`), are generated from the latest release of `OrivonBrowser/orivon-mvp`: the newest published release with a `vMAJOR.MINOR.PATCH` tag and every installer (pre-releases count, drafts and other tags do not). Checksums come from each asset's `digest`, else from the release's `ipfs.json`.

```
npm run sync-release    # rewrite site/ from the latest release, then commit the result
npm run check-release   # change nothing; exit 1 if site/ lags the latest release
```

`.github/workflows/release-links.yml` runs the check on pull requests, on pushes to `main` and every day, so a new release turns it red until `sync-release` is committed and the Web3 build is published again. Never edit these values by hand.

A push to `main` runs `.github/workflows/pages.yml`: it runs `sync-release` (a failure there is ignored), builds both, deploys `build/` to GitHub Pages and keeps `build-web3/` as the `web3-build` artifact.

## latest.orivonstack.com

`latest.orivonstack.com` starts the download of the newest installer for the visitor's system: the `.exe` on Windows, the `.dmg` for Apple silicon or Intel on macOS, the `.deb` on Linux. Phones, unknown systems and browsers without JavaScript go to `www.orivonstack.com/#download`. It is `site-latest/index.html` plus the site's own `orivon-download.js`, so the system detection and the live release are the same as on the main page.

```
npm run build:latest   # also build-latest/   the redirect, with CNAME latest.orivonstack.com
npm run check-latest   # headless check of where each system is sent (Playwright, as check-page)
```

A Pages site has one domain, so the redirect is deployed by [OrivonBrowser/orivon-latest](https://github.com/OrivonBrowser/orivon-latest), whose workflow checks out this repository, runs `sync-release` and `build:latest` and publishes `build-latest/`. A push here does not trigger it; it rebuilds daily. A new release is offered at once anyway, because the page reads the live release from api.github.com and uses the baked one only when that fails.

## Opening the page for one app: `?app=<id>`

An app's page outside Orivon links to `https://download.orivonstack.eth.limo/?app=<id>` (and the same path on the Web2 site). The page then names the app and offers the package that opens it on first run:

- **Allowlist only.** The ids are the six apps in `site/assets/js/orivon-flavours.js` (explore, webtorrent, asgardex, thelounge, freetube, element), each with its display name and `.eth` address. Anything else in `?app=` (an unknown id, capitals, a URL, script text, a repeated parameter) is ignored and the page renders as without it. The query string is never written into the page or sent anywhere; only the allowlisted name is shown, through `textContent`.
- **Windows and Linux.** If the latest release has the tagged package (`Orivon-Setup-<ver>-x64.<id>.exe`, `Orivon-<ver>-x86_64.<id>.AppImage`, the same bytes as the plain ones), the page offers it, with "After installing, Orivon opens <App>." and the file's own SHA-256. If not, it offers the plain package and says nothing about opening the app. On Linux the hero button points at the tagged AppImage instead of the .deb only when that file exists.
- **macOS.** The install command carries the id: `curl -fsSL .../install-macos.sh | bash -s <id>`, in the panel, the hero copy button and its detail line.
- **Open in Orivon.** A link `orivon:open?u=<address>&flavour=<id>` and a "Copy address" button (`ipfs://<address>`) for people who already have Orivon. Both sit behind `OPEN_IN_ORIVON` at the top of `site/assets/js/orivon-download.js`, which is `false` until a released Orivon handles `orivon:` links; set it to `true` then.
- **No JavaScript.** The parameter needs JavaScript; without it the page is the plain download page.
- **IPFS copy.** Nothing depends on the origin: the same relative files serve `build-web3/`.

`sync-release` also records the tagged packages a release carries (ids from the allowlist only; none is fine) in the fallback block of `orivon-download.js`.

### Keeping the allowlist honest

`orivon-flavours.js` copies `resources/flavours.json` of `OrivonBrowser/orivon-mvp` by hand. `npm run check-flavours` compares id, name and address with that file on its `main` branch (`-- --ref <branch>` for another; it passes with a note while the file is not on the ref), and `.github/workflows/release-links.yml` runs it on every pull request, push and daily, so an app added to or removed from the browser turns the check red until the list here follows.

```
npm test                 # pure functions (?app= parsing, picking the offered package) and sync-release's tagged records
npm run check-page       # headless Chromium on the page: valid and invalid ?app= values, per OS, with and without tagged packages; and the Web3 build's downloads
npm run check-flavours   # the allowlist against the browser's
```

`check-page` needs Playwright; it looks in `PLAYWRIGHT_DIR` (default `../orivon-mvp`) and skips when there is none.

## Constraints

- Plain HTML, CSS and vanilla JS. No framework, no build step for the page itself, no dependencies.
- Zero third-party requests, except `api.github.com` for the live release (with a baked fallback). The Web3 build asks `latest.orivonstack.eth.limo` instead and sends nothing to GitHub. Fonts are self-hosted (see `site/assets/fonts/README.txt`).
- Relative links only, so the site works from any path, including an IPFS gateway.
- Responsive from 360 px, keyboard-navigable, readable with JavaScript off. Light and dark themes.

## Licence

Apache-2.0, see `LICENSE`. The fonts are under the SIL Open Font License 1.1.
