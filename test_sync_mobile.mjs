import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {assertMobileLocation,checkedConfig,loadHostingConfig,assertIdentity,safeMessage,summary,PROJECT} from './tools/firebase-mobile/mobile-policy.mjs';
import {prepareBundle,FILES,CSP} from './tools/firebase-mobile/prepare.mjs';
const preview='https://lifeplan-sync-sandbox--encrypted-mobile-synthetic.web.app/';
const config={projectId:PROJECT,authDomain:PROJECT+'.firebaseapp.com',apiKey:'synthetic-web-key',appId:'synthetic-web-app'};
const response=value=>({ok:true,redirected:false,headers:{get:()=> 'application/json; charset=utf-8'},text:async()=>JSON.stringify(value)});
test('only the dedicated sandbox preview origin is accepted',()=>{
 assert.doesNotThrow(()=>assertMobileLocation({href:preview}));
 for(const href of [preview.replace('https:','http:'),preview+'?config=other',preview+'#password',preview.replace('.web.app/','.web.app.evil.invalid/'),preview.replace('lifeplan-sync-sandbox','lifeplan-private-sync'),'https://lifeplan-sync-sandbox.web.app/','https://nakayama2536-happy.github.io/Retirement-income-sim/',preview.replace('.web.app/','.web.app:8443/'),preview.replace('https://','https://user:password@')])assert.throws(()=>assertMobileLocation({href}),/wrong-origin/);
});
test('checked configuration permits only four known fields from sandbox',()=>{
 assert.deepEqual(checkedConfig({...config,databaseURL:'https://other.invalid',measurementId:'ignored'}),config);
 assert.ok(Object.isFrozen(checkedConfig(config)));
});
test('bad project or authDomain cannot be automatically adopted',()=>{
 for(const invalid of [{...config,projectId:'other'},{...config,authDomain:'other.firebaseapp.com'},null,[],{...config,apiKey:''},{...config,appId:null},{...config,apiKey:'a'.repeat(257)}])assert.throws(()=>checkedConfig(invalid));
});
test('config fetch stays same-origin, no cookies, no redirects and no caching',async()=>{
 const controller=new AbortController();let calls=0;
 const out=await loadHostingConfig(async(path,options)=>{calls++;assert.equal(path,'/__/firebase/init.json');assert.deepEqual(options,{cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});return response(config);},{signal:controller.signal});
 assert.equal(calls,1);assert.deepEqual(out,config);
});
test('missing, redirected, HTML, malformed and oversized config stop',async()=>{
 for(const r of [{...response(config),ok:false},{...response(config),redirected:true},{...response(config),headers:{get:()=> 'text/html'}},{...response(config),text:async()=>'{invalid'},{...response(config),text:async()=> ' '.repeat(16385)}])await assert.rejects(loadHostingConfig(async()=>r));
});
test('authenticated audience, issuer and UID must all match sandbox',()=>{
 const user={uid:'synthetic-user'},claims={aud:PROJECT,iss:'https://securetoken.google.com/'+PROJECT,sub:user.uid};
 assert.equal(assertIdentity(user,claims),user.uid);
 for(const [u,c] of [[user,{...claims,aud:'other'}],[user,{...claims,iss:'other'}],[user,{...claims,sub:'other'}],[{uid:'bad/path'},claims],[{},claims]])assert.throws(()=>assertIdentity(u,c),/wrong-identity/);
});
test('safe errors never reveal SDK error text or credentials',()=>{
 const secret='private-password-and-email';assert.ok(!safeMessage({code:secret,message:secret}).includes(secret));
 assert.match(safeMessage({code:'unfinished'}),/再実行せず/);assert.match(safeMessage({code:'wrong-origin'}),/HTTPS/);
});
test('shareable summary excludes unknown properties and identities',()=>{
 const text=summary({ok:true,steps:Array.from({length:12},(_,i)=>i+1),cleanup:'confirmed',uid:'SECRET_UID',password:'SECRET_PASSWORD',configuration:config},true);
 assert.match(text,/12\/12 成功/);assert.ok(!text.includes('SECRET'));assert.ok(!text.includes(config.apiKey));assert.match(text,/PC・iPhone間の同期確認：未実施/);
});
test('unknown cleanup and session failure never appear as complete',()=>{
 const text=summary({ok:false,steps:[1,2],cleanup:'unknown'},false);assert.match(text,/2\/12で停止/);assert.match(text,/後片付け：未確認/);assert.match(text,/認証・接続の終了：未確認/);
});
test('initial HTML has disabled actions and no config, JSON or app restore inputs',()=>{
 const html=readFileSync(new URL('./tools/firebase-mobile/mobile.html',import.meta.url),'utf8');
 assert.match(html,/<button id="prepare"[^>]+disabled/);assert.match(html,/<fieldset id="fields" disabled/);
 assert.ok(!/type=["']file["']|name=["'](?:apiKey|appId|projectId)/.test(html));
 assert.match(html,/autocomplete="off"/);assert.match(html,/本人の資産データは使用しません/);
});
test('mobile flow uses memory-only auth, exact identity, lazy SDK and incomplete marker',()=>{
 const code=readFileSync(new URL('./tools/firebase-mobile/mobile.mjs',import.meta.url),'utf8');
 for(const token of ['initializeAuth(app,{persistence:authSdk.inMemoryPersistence})','assertIdentity(login.user,token.claims)','localStorage.setItem(MARKER','navigator.locks.request','localStorage.removeItem(MARKER','await dbSdk.terminate(database)','await core.deleteApp(app)'])assert.ok(code.includes(token),token);
 assert.ok(code.indexOf("addEventListener('submit'")<code.indexOf("import(SDK_ROOT+'firebase-app.js')"));
 assert.ok(!code.includes('lifeplan-sim-state-v1'));assert.ok(!/console\.(log|error)|serviceWorker\.register/.test(code));
});
test('bundle includes only allowlisted files and exact reused runner/crypto bytes',()=>{
 const parent=mkdtempSync(resolve(tmpdir(),'lifeplan-mobile-bundle-'));
 try{
  const destination=resolve(parent,'preview'),result=prepareBundle(destination);assert.equal(result.deployed,false);assert.equal(result.publicFileCount,7);
  const manifest=JSON.parse(readFileSync(resolve(destination,'bundle-sha256.json')));
  assert.deepEqual(manifest.files.map(x=>x.path).sort(),[...Object.keys(FILES),'robots.txt'].sort());
  for(const item of manifest.files){const bytes=readFileSync(resolve(destination,'public',item.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);if(FILES[item.path])assert.deepEqual(bytes,readFileSync(new URL('./'+FILES[item.path],import.meta.url)));}
  const cfg=JSON.parse(readFileSync(resolve(destination,'firebase.json')));assert.equal(cfg.hosting.site,PROJECT);assert.equal(cfg.hosting.public,'public');assert.deepEqual(Object.keys(cfg),['hosting']);
  assert.ok(!Object.keys(cfg.hosting).includes('rewrites'));assert.deepEqual(readdirSync(destination).sort(),['APPROVAL_REQUIRED.json','bundle-sha256.json','firebase.json','public']);
 }finally{rmSync(parent,{recursive:true,force:true});}
});
test('bundle generation refuses overwriting and repository destinations',()=>{
 const parent=mkdtempSync(resolve(tmpdir(),'lifeplan-mobile-refuse-'));
 try{assert.throws(()=>prepareBundle(parent),/EEXIST/);assert.throws(()=>prepareBundle(new URL('./tools/firebase-mobile/output',import.meta.url).pathname),/outside/);}finally{rmSync(parent,{recursive:true,force:true});}
});
test('CSP limits endpoints, disables framing/forms/workers, and allows no inline script',()=>{
 assert.match(CSP,/frame-ancestors 'none'/);assert.match(CSP,/worker-src 'none'/);assert.match(CSP,/form-action 'none'/);
 assert.ok(!CSP.includes('unsafe-inline'));assert.ok(!CSP.includes('unsafe-eval'));assert.ok(!CSP.includes('github.io'));assert.ok(!CSP.includes('*'));
});
