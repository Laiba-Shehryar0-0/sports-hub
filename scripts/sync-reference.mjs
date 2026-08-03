/**
 * Re-copies the frontend source files that `docs/EXTRACTED.md` and `docs/backend-plan.md` are
 * written against into `docs/frontend-reference/`, each stamped with a header saying where it
 * came from and when.
 *
 *   npm run sync:reference            # rewrite the mirrors from ../kit-frontend
 *   npm run sync:reference -- --check # report drift, write nothing, exit 1 if out of date
 *
 * The `--check` form is the point of this script: the mirrors are a manual copy and otherwise go
 * stale silently, which is how the reference ended up describing a 3-value sport enum and four
 * product names that no longer existed. Wire it into CI if that keeps happening.
 *
 * `docs/EXTRACTED.md` is deliberately NOT synced — it is analysis written in this repo, not a
 * mirror, which is why it lives in `docs/` rather than in `docs/frontend-reference/`.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendRoot = path.resolve(repoRoot, '..', 'kit-frontend');
const destDir = path.join(repoRoot, 'docs', 'frontend-reference');

// Source paths are relative to the frontend repo root; the basename is the mirror's filename.
const SOURCES = [
  'src/customize/kitShapes.js',
  'src/customize/KitCanvasEditor.jsx',
  'src/pages/Customize.jsx',
  'src/pages/Checkout.jsx',
  'src/data/kitsSeed.js',
  'src/data/featuredKitsSeed.js',
  'src/data/galleryProductsSeed.js',
];

const checkOnly = process.argv.includes('--check');
const today = new Date().toISOString().slice(0, 10);

function header(src, date) {
  return `// Snapshot of ../kit-frontend as of ${date} — reference only, do not edit here.\n`
       + `// Source: ${src}\n\n`;
}

/** Splits a mirror into its header block and the copied body. */
function splitMirror(text) {
  const at = text.indexOf('\n\n');
  return at === -1 ? { head: '', body: text } : { head: text.slice(0, at + 2), body: text.slice(at + 2) };
}

if (!existsSync(frontendRoot)) {
  console.error(`Frontend repo not found at ${frontendRoot}`);
  console.error('This script expects kit-frontend to sit alongside kit-backend.');
  process.exit(1);
}

let drifted = 0;
let missing = 0;

for (const src of SOURCES) {
  const srcPath = path.join(frontendRoot, src);
  const destPath = path.join(destDir, path.basename(src));

  if (!existsSync(srcPath)) {
    console.error(`MISSING  ${src} — not found in ../kit-frontend`);
    missing++;
    continue;
  }

  const live = readFileSync(srcPath, 'utf8');
  const existing = existsSync(destPath) ? readFileSync(destPath, 'utf8') : null;
  const inSync = existing !== null && splitMirror(existing).body === live;

  if (checkOnly) {
    if (!inSync) drifted++;
    console.log(`${inSync ? 'ok     ' : 'DRIFTED'}  ${path.basename(src)}`);
    continue;
  }

  if (inSync) {
    // Body already matches: leave the existing header alone so an untouched mirror doesn't get
    // a misleading newer date.
    console.log(`unchanged  ${path.basename(src)}`);
    continue;
  }

  writeFileSync(destPath, header(src, today) + live, 'utf8');
  console.log(`synced     ${path.basename(src)}  <- ${src}`);
}

if (missing > 0) {
  console.error(`\n${missing} source file(s) missing — the mirror list in this script is out of date.`);
  process.exit(1);
}

if (checkOnly) {
  if (drifted > 0) {
    console.error(`\n${drifted} mirror(s) out of date. Run: npm run sync:reference`);
    process.exit(1);
  }
  console.log('\nAll mirrors match ../kit-frontend.');
} else {
  console.log('\nMirrors up to date. docs/EXTRACTED.md is not synced — update it by hand if the');
  console.log('literals it documents (enums, prices, bounds) changed.');
}
