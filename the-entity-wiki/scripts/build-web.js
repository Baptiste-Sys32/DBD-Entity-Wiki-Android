// Builds the shippable web app from web/ source into dist/.
// - Precompiles the <script type="text/babel"> JSX block with esbuild (classic
//   runtime against the global React UMD build). Drops the Babel runtime.
// - Replaces the Tailwind Play CDN runtime with static CSS from tailwindcss v3
//   CLI (content-scanned from the source index.html). Drops the CDN runtime.
// - Copies the rest of web/ verbatim (data bundles, images, assets, React UMD).
// Usage: node scripts/build-web.js [--check]
// --check verifies dist/ is up to date (byte-compare), exit 1 if stale.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'web', 'index.html');
const DIST = path.join(ROOT, 'dist');
const DIST_INDEX = path.join(DIST, 'index.html');

function buildIndexHtml() {
  const src = fs.readFileSync(SRC, 'utf8');

  let html = src;
  // Drop the Babel runtime (no longer needed).
  const babelTag = '<script src="./vendor/babel.min.js"></script>';
  if (!html.includes(babelTag)) throw new Error('babel script tag not found');
  html = html.replace(babelTag + '\n', '');

  // Replace Tailwind Play CDN with a placeholder for static CSS.
  const twTag = '<script src="./vendor/tailwindcss.min.js"></script>';
  if (!html.includes(twTag)) throw new Error('tailwind script tag not found');
  html = html.replace(twTag, '<!--TAILWIND_CSS-->');

  // Locate the babel block AFTER the replacements above (indices shift).
  const openTag = '<script type="text/babel">';
  const i = html.indexOf(openTag);
  if (i < 0) throw new Error('babel block not found');
  const codeStart = i + openTag.length;
  const j = html.indexOf('</script>', codeStart);
  if (j < 0) throw new Error('babel block end not found');
  const jsx = html.slice(codeStart, j);

  const out = esbuild.transformSync(jsx, {
    loader: 'jsx',
    jsx: 'transform',
    target: 'es2019',
    minify: true,
    charset: 'utf8',
  });
  if (out.warnings.length) {
    for (const w of out.warnings) console.warn('esbuild warning:', w.text);
  }
  const compiled = out.code;

  // Swap the babel block for the precompiled script (open tag included).
  html = html.slice(0, i) + '<script>\n/* Precompiled at build time with esbuild (JSX classic runtime, minified). */\n'
    + compiled + '\n</script>' + html.slice(j + '</script>'.length);

  // Static Tailwind CSS.
  const css = buildTailwindCss(src);
  if (!css.includes('.flex')) throw new Error('tailwind output looks empty');
  html = html.replace('<!--TAILWIND_CSS-->', '<style>\n/* Static Tailwind v3 build (replaces Play CDN runtime). */\n' + css + '\n</style>');

  return html;
}

function buildTailwindCss(sourceHtml) {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'tw-'));
  const inputCss = path.join(tmpDir, 'input.css');
  const outCss = path.join(tmpDir, 'out.css');
  const contentFile = path.join(tmpDir, 'content.html');
  fs.writeFileSync(inputCss, '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
  // Scan the source file so JSX className strings are all visible to the scanner.
  fs.writeFileSync(contentFile, sourceHtml);
  execFileSync('npx', ['tailwindcss', '-i', inputCss, '-o', outCss, '--content', contentFile, '--minify'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  return fs.readFileSync(outCss, 'utf8');
}

function copyTree(srcDir, dstDir, skipFiles) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(dstDir, entry.name);
    if (skipFiles.has(path.relative(ROOT, s))) continue;
    if (entry.isDirectory()) copyTree(s, d, skipFiles);
    else fs.copyFileSync(s, d);
  }
}

function main() {
  const check = process.argv.includes('--check');
  const html = buildIndexHtml();
  if (check) {
    const cur = fs.existsSync(DIST_INDEX) ? fs.readFileSync(DIST_INDEX, 'utf8') : null;
    if (cur !== html) {
      console.error('build-web: dist/index.html is stale. Run node scripts/build-web.js');
      process.exit(1);
    }
    console.log('build-web: dist/ is up to date.');
    return;
  }
  const skip = new Set(['web/index.html', 'web/vendor/babel.min.js', 'web/vendor/tailwindcss.min.js']);
  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true });
  copyTree(path.join(ROOT, 'web'), DIST, skip);
  fs.writeFileSync(DIST_INDEX, html);
  const kb = (p) => Math.round(fs.statSync(p).size / 1024) + 'K';
  console.log('build-web: wrote dist/index.html', kb(DIST_INDEX), '(src', kb(SRC) + ')');
}

main();
