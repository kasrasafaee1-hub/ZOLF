// Inlines the app into a single self-contained HTML file.
//
// The Artifact host serves one document with no module resolution and no
// same-origin asset fetches, so the ES modules are concatenated in dependency
// order and the stylesheet is inlined. Nothing is minified — the published
// source stays readable.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Dependency order: a module may only use what is already above it.
const MODULES = [
  'src/core/programs.js',
  'src/core/training.js',
  'src/core/nutrition.js',
  'src/core/store.js',
  'src/core/sync.js',
  'src/ui/dom.js',
  'src/ui/app.js',
];

const IMPORT_RE = /^\s*import\s+(?:[\s\S]*?)\s+from\s+['"][^'"]+['"];?\s*$/gm;
const BARE_IMPORT_RE = /^\s*import\s+['"][^'"]+['"];?\s*$/gm;

/** Strips module syntax so the files can be concatenated into one script. */
export function flatten(source) {
  return source
    .replace(IMPORT_RE, '')
    .replace(BARE_IMPORT_RE, '')
    .replace(/^export\s+(const|let|var|function|class|async\s+function)\b/gm, '$1')
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    .replace(/^export\s+default\s+/gm, 'const __default = ')
    .trim();
}

export async function bundle() {
  const css = await readFile(join(ROOT, 'src/ui/styles.css'), 'utf8');
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');

  const parts = [];
  for (const file of MODULES) {
    const src = await readFile(join(ROOT, file), 'utf8');
    parts.push(`// ---------- ${file} ----------\n${flatten(src)}`);
  }
  // The Artifact host serves a single document, so there is no service worker
  // to register; drop the block rather than let it throw a console error.
  const script = parts
    .join('\n\n')
    .replace(
      /\s*if \('serviceWorker' in navigator[\s\S]*?\n  \}\n/,
      '\n'
    );

  // Keep only the body markup of the shell; the host supplies the skeleton.
  const body = html
    .replace(/[\s\S]*<body>/, '')
    .replace(/<\/body>[\s\S]*/, '')
    .replace(/\s*<script type="module"[\s\S]*?<\/script>/, '')
    .trim();

  const out = `<title>ZOLF Lift</title>
<style>
${css}
</style>

${body}

<script type="module">
${script}
</script>
`;

  await mkdir(dirname(join(ROOT, 'dist/zolf-lift.html')), { recursive: true });
  await writeFile(join(ROOT, 'dist/zolf-lift.html'), out);

  // A local stand-in for the wrapper the Artifact host adds, so the end-to-end
  // suite can run against the very file that gets published.
  await writeFile(
    join(ROOT, 'dist/preview.html'),
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: light; }
  body { margin: 0; font: 14px system-ui, sans-serif; background: #fafaf9; }
  img { max-width: 100%; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
${out}
</body>
</html>
`
  );
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = await bundle();
  console.log(`dist/zolf-lift.html — ${(out.length / 1024).toFixed(1)} KB`);
}
