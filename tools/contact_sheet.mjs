#!/usr/bin/env node
// Tile images into one PNG:  node tools/contact_sheet.mjs out.png <cols> <cellWidth> img1 img2 ...
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('../node_modules/puppeteer-core');
const [out, cols = '3', cw = '480', ...imgs] = process.argv.slice(2);
const C = +cols, W = +cw;
const cells = imgs.map(f => {
  const b64 = fs.readFileSync(f).toString("base64"); const mime = f.endsWith(".jpg") ? "image/jpeg" : "image/png";
  return `<figure><img src="data:${mime};base64,${b64}"><figcaption>${path.basename(f)}</figcaption></figure>`;
}).join('');
const html = `<!doctype html><style>body{margin:0;background:#111;font:12px -apple-system,sans-serif;color:#aaa}
.g{display:grid;grid-template-columns:repeat(${C},${W}px);gap:4px;padding:4px}figure{margin:0;position:relative}
img{width:${W}px;display:block}figcaption{position:absolute;left:4px;top:2px;background:rgba(0,0,0,.6);padding:1px 4px}</style>
<div class="g">${cells}</div>`;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: C * (W + 4) + 4, height: 400 });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('saved ' + out);
