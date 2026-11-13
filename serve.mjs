#!/usr/bin/env node
// Static dev server for the game:  node serve.mjs [port]   ->  http://127.0.0.1:5173/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

export function startServer(port = PORT) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        // optional music overrides (assets/audio/<state>.mp3) are probed on every load: answer "no content" instead of
        // a 404 so the browser console stays clean when there are none
        if (/^\/assets\/audio\/[^/]+\.(mp3|ogg|wav)$/.test(rel)) { res.writeHead(204, { 'cache-control': 'no-store' }); return res.end(); }
        res.writeHead(404); return res.end('not found');
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'content-length': st.size, 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = await startServer();
  console.log(`serving ${ROOT} at http://127.0.0.1:${s.address().port}/`);
}
