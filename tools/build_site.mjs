#!/usr/bin/env node
// Build the static site of the game (no bundler: the sources as they are, three.js vendored next to them).
//
//   node tools/build_site.mjs <outDir>
//
// Writes index.html (its import map pointed at ./vendor/three), src/, assets/ and the part of three.js the game
// imports (found by following the imports) into <outDir>. Serve <outDir> from any static host, at any path.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] && path.resolve(process.argv[2]);
if (!out) { console.error('usage: node tools/build_site.mjs <outDir>'); process.exit(2); }
if (out === ROOT || ROOT.startsWith(out + path.sep)) { console.error('refusing to build into the project itself'); process.exit(2); }

const THREE_DIR = path.join(ROOT, 'node_modules/three');
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
const walk = (dir, fn) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, fn); else fn(p); } };

fs.rmSync(out, { recursive: true, force: true });
let n = 0, bytes = 0;
const put = (from, rel) => { copy(from, path.join(out, rel)); n++; bytes += fs.statSync(from).size; };

// the game
// (assets/audio/<music state>.mp3 are local music overrides - a recording someone plays at home - and never go public)
const LOCAL_ONLY = /(\.DS_Store|assets\/audio\/[a-z0-9_]+\.mp3)$/;
for (const dir of ['src', 'assets']) walk(path.join(ROOT, dir), f => { if (!LOCAL_ONLY.test(f)) put(f, path.relative(ROOT, f)); });

// three.js: the module build and every addon the sources import, with what those import
const need = new Set([path.join(THREE_DIR, 'build/three.module.js')]);
const queue = [];
walk(path.join(ROOT, 'src'), f => {
  if (!/\.js$/.test(f)) return;
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/from\s+'three\/addons\/([^']+)'/g)) queue.push(path.join(THREE_DIR, 'examples/jsm', m[1]));
});
queue.push(path.join(THREE_DIR, 'build/three.module.js'));
while (queue.length) {
  const f = queue.pop();
  if (need.has(f) && f !== path.join(THREE_DIR, 'build/three.module.js')) continue;
  need.add(f);
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:from|import)\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const dep = path.resolve(path.dirname(f), m[1]);
    if (!need.has(dep) && fs.existsSync(dep)) queue.push(dep);
  }
}
for (const f of need) put(f, path.join('vendor/three', path.relative(THREE_DIR, f)));

// the page
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const mapped = html.replace('"./node_modules/three/build/three.module.js"', '"./vendor/three/build/three.module.js"').replace('"./node_modules/three/examples/jsm/"', '"./vendor/three/examples/jsm/"');
if (mapped === html) { console.error('index.html: import map not found'); process.exit(1); }
fs.writeFileSync(path.join(out, 'index.html'), mapped); n++;
console.log(`built ${n} files, ${(bytes / 1048576).toFixed(1)} MB -> ${out}`);
