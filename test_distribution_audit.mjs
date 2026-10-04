import crypto from 'node:crypto';import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {collect,build,inspect,validatePath} from './tools/package-public.mjs';
const root=path.dirname(new URL(import.meta.url).pathname);
for(const p of ['../backup.json','/etc/passwd','a//b','a/./b','a\\b','a/../b',''])test('配布パス拒否 '+JSON.stringify(p),()=>assert.throws(()=>validatePath(p)));
for(const s of ['-----BEGIN PRIVATE KEY-----','ghp_'+'a'.repeat(30),'AKIA'+'A'.repeat(16),'sk-'+'a'.repeat(30),'libfile_'+'a'.repeat(32),'file_00000000'+'a'.repeat(24)])test('制限トークン拒否 '+s.slice(0,8),()=>assert.throws(()=>inspect(Buffer.from(s))));
test('非公開識別子を内容表示せず拒否',()=>assert.throws(()=>inspect(Buffer.from('example-private-person'),['example-private-person'])));
test('候補には起動37＋案内2＋manifestのみ',()=>{const x=collect(root);assert.equal(x.runtime.length,37);assert.equal(x.out.size,40);assert.equal([...x.out.keys()].some(p=>p.startsWith('test_')||p.startsWith('tools/')||p.includes('I08')||p.endsWith('.patch')),false);});
test('繰返し梱包内容は同一',()=>assert.deepEqual(collect(root),collect(root)));
function clone(fn){const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lifeplan-audit-'));try{fs.cpSync(root,path.join(tmp,'src'),{recursive:true});fn(path.join(tmp,'src'),tmp);}finally{fs.rmSync(tmp,{recursive:true,force:true});}}
test('元資料の個人JSONは抽出しない',()=>clone(src=>{fs.writeFileSync(path.join(src,'personal-backup.json'),'private');assert.equal(collect(src).out.has('personal-backup.json'),false);}));
test('必要なJS欠落を拒否',()=>clone(src=>{fs.unlinkSync(path.join(src,'calc.mjs'));assert.throws(()=>collect(src));}));
test('未梱包モジュール参照を拒否',()=>clone(src=>{fs.appendFileSync(path.join(src,'app.mjs'),"\nimport './hidden.mjs';");assert.throws(()=>collect(src));}));
test('外部モジュール参照を拒否',()=>clone(src=>{fs.appendFileSync(path.join(src,'app.mjs'),"\nimport 'external';");assert.throws(()=>collect(src));}));
test('HTML未梱包参照を拒否',()=>clone(src=>{fs.appendFileSync(path.join(src,'index.html'),'<script src="private.js"></script>');assert.throws(()=>collect(src));}));
test('シンボリックリンク参照を拒否',()=>clone(src=>{fs.renameSync(path.join(src,'calc.mjs'),path.join(src,'calc-copy.mjs'));fs.symlinkSync('calc-copy.mjs',path.join(src,'calc.mjs'));assert.throws(()=>collect(src));}));
test('既存出力を上書きしない',()=>clone((src,tmp)=>assert.throws(()=>build(src,tmp))));
test('manifestのサイズと全体SHAを照合',()=>{const {out}=collect(root);const m=JSON.parse(out.get('distribution-manifest.json'));assert.equal(m.files.length,39);for(const f of m.files){assert.equal(f.size,out.get(f.name).length);assert.equal(f.sha256,crypto.createHash('sha256').update(out.get(f.name)).digest('hex'));}});
test('梱包前失敗時に出力を作らない',()=>clone((src,tmp)=>{fs.appendFileSync(path.join(src,'app.mjs'),'\n'+ 'ghp_'+'x'.repeat(30));const dest=path.join(tmp,'out');assert.throws(()=>build(src,dest));assert.equal(fs.existsSync(dest),false);}));
