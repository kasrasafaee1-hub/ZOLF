// Inlines the app into a single self-contained HTML file.
//
// The Artifact host serves one document with no module resolution and no
// same-origin asset fetches, so the ES modules are concatenated in dependency
// order and the stylesheet is inlined. Nothing is minified — the published
// source stays readable.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Dependency order: a module may only use what is already above it.
const MODULES = [
  'src/core/profile.js',
  'src/core/profiles.js',
  'src/core/programs-amore.js',
  'src/core/programs.js',
  'src/core/rotation.js',
  'src/core/training.js',
  'src/core/nutrition.js',
  'src/core/store.js',
  'src/core/sync.js',
  'src/core/calendar.js',
  'src/core/supplements.js',
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

/**
 * Every module under src/ must be listed in MODULES. Forgetting one produces a
 * bundle that is missing a feature but still builds, so fail the build instead.
 */
export async function assertAllModulesBundled() {
  const found = [];
  for (const dir of ['src/core', 'src/ui']) {
    for (const name of await readdir(join(ROOT, dir))) {
      if (name.endsWith('.js')) found.push(`${dir}/${name}`);
    }
  }
  const missing = found.filter((f) => !MODULES.includes(f));
  if (missing.length) {
    throw new Error(`Not in the bundle (add to MODULES in scripts/bundle.js): ${missing.join(', ')}`);
  }
  return found;
}

/** One app per person: same code, different tokens, wordmark and programs. */
export const PROFILE_BUILDS = {
  zolf: {
    out: 'zolf-lift.html',
    tokens: 'src/ui/tokens-zolf.css',
    fonts:
      'https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;800&family=JetBrains+Mono:wght@600;700&display=swap',
  },
  amore: {
    out: 'amore-splits.html',
    tokens: 'src/ui/tokens-amore.css',
    fonts:
      'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Karla:wght@400;500;600;700&display=swap',
  },
};

const DECL_RE = /^(?:export\s+)?(?:const|let|var|function|async function|class)\s+([A-Za-z_$][\w$]*)/gm;

/**
 * Modules are concatenated into a single scope, so two files declaring the
 * same top-level name silently shadow each other — or, for `const`, throw
 * "Identifier has already been declared" and leave a blank page. Catch it at
 * build time rather than in the browser.
 */
export function assertNoNameCollisions(sources) {
  const owners = new Map();
  const clashes = [];
  for (const [file, src] of sources) {
    for (const [, name] of src.matchAll(DECL_RE)) {
      if (owners.has(name) && owners.get(name) !== file) {
        clashes.push(`${name} (${owners.get(name)} and ${file})`);
      } else {
        owners.set(name, file);
      }
    }
  }
  if (clashes.length) {
    throw new Error(`Top-level names declared in more than one module: ${clashes.join(', ')}`);
  }
}

export async function bundle(profileId = 'zolf') {
  await assertAllModulesBundled();
  const build = PROFILE_BUILDS[profileId];
  if (!build) throw new Error(`Unknown profile: ${profileId}`);

  const tokens = await readFile(join(ROOT, build.tokens), 'utf8');
  const css = tokens + '\n' + (await readFile(join(ROOT, 'src/ui/styles.css'), 'utf8'));
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');

  const parts = [];
  const flattened = [];
  for (const file of MODULES) {
    let src = await readFile(join(ROOT, file), 'utf8');
    // The profile constant is the one thing a build rewrites.
    if (file === 'src/core/profile.js') {
      src = src.replace(/PROFILE_ID = '[^']*'/, `PROFILE_ID = '${profileId}'`);
    }
    parts.push(`// ---------- ${file} ----------\n${flatten(src)}`);
    flattened.push([file, flatten(src)]);
  }
  assertNoNameCollisions(flattened);
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

  const { PROFILES } = await import('../src/core/profiles.js');
  const profile = PROFILES[profileId];
  const body2 = body
    .replace(/<div class="brand">[\s\S]*?<\/div>/, `<div class="brand">${profile.word}<span>${profile.mark}</span></div>`)
    .replace(/href="https:\/\/fonts\.googleapis\.com\/css2[^"]*"/, `href="${build.fonts}"`)
    .replace(
      /(<button class="tab" data-tab="(\w+)" role="tab">)[^<]*(<\/button>)/g,
      (_, open, id, close) => `${open}${profile.tabs[id] ?? id}${close}`
    );

  const out = `<title>${profile.title}</title>
<link rel="stylesheet" href="${build.fonts}" />
<style>
${css}
</style>

${body2}

<script type="module">
${script}
</script>
`;

  await mkdir(join(ROOT, 'dist'), { recursive: true });
  await writeFile(join(ROOT, `dist/${build.out}`), out);

  // A local stand-in for the wrapper the Artifact host adds, so the end-to-end
  // suite can run against the very file that gets published.
  await writeFile(
    join(ROOT, `dist/${profileId}-preview.html`),
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
  const only = process.argv[2];
  for (const id of only ? [only] : Object.keys(PROFILE_BUILDS)) {
    const out = await bundle(id);
    console.log(`dist/${PROFILE_BUILDS[id].out} — ${(out.length / 1024).toFixed(1)} KB`);
  }
}
