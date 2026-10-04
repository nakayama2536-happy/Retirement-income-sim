import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(p)=>fs.readFileSync(p,'utf8');
const index=read('index.html'),manifest=JSON.parse(read('manifest.webmanifest')),sw=read('sw.js');
for(const required of ['manifest.webmanifest','styles.css','app.mjs'])assert.ok(index.includes(required),`index.html must reference ${required}`);
assert.ok(Array.isArray(manifest.icons)&&manifest.icons.length>0);
for(const icon of manifest.icons){assert.ok(icon?.src);assert.ok(fs.existsSync(icon.src),`manifest icon missing: ${icon.src}`);}
const section=sw.slice(sw.indexOf('const ASSETS='),sw.indexOf('const URLS='));
assert.ok(section.includes('const ASSETS='));
const assets=[...section.matchAll(/['\"](\.\/[^'\"]+)['\"]/g)].map(m=>m[1]);
assert.ok(assets.length>=30,'service worker must cache the complete bundle');
for(const asset of assets){if(asset==='./')continue;const local=asset.replace(/^\.\//,'');assert.ok(fs.existsSync(local),`service worker asset missing: ${local}`);}
for(const required of ['./index.html','./styles.css','./app.mjs','./calc.mjs','./storage.mjs','./manifest.webmanifest'])assert.ok(assets.includes(required),`service worker cache missing: ${required}`);
console.log('OK: PWA links, manifest icons and complete service worker bundle are consistent');
