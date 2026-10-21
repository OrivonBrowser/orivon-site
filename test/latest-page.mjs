// A start page of the latest.orivonstack.eth folder for a release that is not out yet, in the format of
// orivon-mvp's release pinner (scripts/pin-releases.sh, start_page). fixtures/latest-start-page-v0.0.8.html is
// the real one, as published for v0.0.8. Takes [name, size in bytes] pairs.
export function startPage(version, files) {
  const items = files.map(([name, size]) => `<li><a href="./${name}" download>${name}</a> <span>${Math.round(size / 1e6)} MB</span></li>`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Orivon ${version}</title>
</head>
<body>
<main>
<h1>Orivon ${version}</h1>
<p id="msg">Choose the package for your system:</p>
<ul>
${items.join('\n')}
</ul>
</main>
</body>
</html>
`;
}

export const V009 = [
  ['Orivon-0.0.9-arm64.dmg', 101e6], ['Orivon-0.0.9-x64.dmg', 102e6], ['Orivon-0.0.9-x86_64.AppImage', 104e6],
  ['Orivon-Setup-0.0.9-x64.exe', 100e6], ['orivon_0.0.9_amd64.deb', 103e6],
];
export const V009_TAGGED = [['Orivon-0.0.9-x86_64.freetube.AppImage', 104e6], ['Orivon-Setup-0.0.9-x64.freetube.exe', 100e6]];
