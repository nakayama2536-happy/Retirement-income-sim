import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const index = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));
const sw = read('sw.js');

assert.ok(index.includes('href="manifest.webmanifest"'), 'index.html must reference manifest.webmanifest');
assert.ok(index.includes('href="styles.css"'), 'index.html must reference styles.css');
assert.ok(index.includes('src="app.mjs"'), 'index.html must load app.mjs');

assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest must define icons');
for (const icon of manifest.icons) {
  assert.ok(icon?.src, 'manifest icon must have src');
  assert.ok(fs.existsSync(icon.src), `manifest icon is missing: ${icon.src}`);
}

const assetsMatch = sw.match(/const\s+ASSETS\s*=\s*\[([\s\S]*?)\];/);
assert.ok(assetsMatch, 'sw.js must define ASSETS');

const assets = [...assetsMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
assert.ok(assets.length > 0, 'service worker ASSETS must not be empty');

for (const asset of assets) {
  if (asset === './' || /^https?:\/\//.test(asset)) continue;
  const local = asset.replace(/^\.\//, '');
  assert.ok(fs.existsSync(local), `service worker asset is missing: ${local}`);
}

for (const required of [
  './index.html',
  './styles.css',
  './app.mjs',
  './calc.mjs',
  './cashflow.mjs',
  './csv-export.mjs',
  './storage.mjs',
  './rules.mjs',
  './manifest.webmanifest'
]) {
  assert.ok(assets.includes(required), `service worker cache is missing required asset: ${required}`);
}

console.log('OK: PWA static assets, manifest icons and service worker cache references are consistent');
