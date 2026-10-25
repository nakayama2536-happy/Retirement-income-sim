import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,existsSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareAppPreview} from './tools/app-sandbox-preview/prepare.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const sha=b=>createHash('sha256').update(b).digest('hex');
test('synthetic full app candidate is isolated and cannot overwrite original repository contents',()=>{
 const tmp=mkdtempSync(join(tmpdir(),'lifeplan-full-preview-'));
 try{
  const output=join(tmp,'candidate');
  const result=prepareAppPreview(output);
  assert.equal(result.previewAdapterOverride,true);
  assert.equal(result.firestoreRuleChanged,false);
  assert.equal(result.deployed,false);
  assert(result.files>50);
  const bundle=JSON.parse(readFileSync(join(output,'PREVIEW_SHA256.json'),'utf8'));
  for(const f of bundle.files){
   const b=readFileSync(join(output,'public',f.name));
   assert.equal(b.length,f.size);
   assert.equal(sha(b),f.sha256);
  }
  assert(!bundle.files.some(f=>f.name.startsWith('docs/')||f.name==='README.md'||/\.env|personal_config|private/i.test(f.name)));
  const base=read('./sync-firebase.mjs');
  const patched=readFileSync(join(output,'public','sync-firebase.mjs'),'utf8');
  assert.match(base,/dbApi\.doc\(db,'owners',user\(\)\.uid,'snapshots','current'\)/);
  assert.doesNotMatch(patched,/dbApi\.doc\(db,'owners',user\(\)\.uid,'snapshots','current'\)/);
  assert.match(patched,/dbApi\.doc\(db,'sandbox',user\(\)\.uid,'snapshots','trial'\)/);
  assert.match(patched,/config\.projectId!=='lifeplan-sync-sandbox'/);
  assert.match(patched,/const KEY_FIELDS=\['apiKey','authDomain','projectId'\]/);
  assert.match(patched,/Object\.hasOwn\(value,'appId'\)/);
  assert.match(patched,/config\.appId=value\.appId/);
  const sourcePanel=read('./sync-panel.mjs');
  const previewPanel=readFileSync(join(output,'public','sync-panel.mjs'),'utf8');
  assert.match(previewPanel,/if\(!values\.appId\)delete values\.appId/);
  assert.equal(previewPanel.replace(
   "function values(){const values=Object.fromEntries(Object.entries(cfg).map(([k,v])=>[k,v.value.trim()]));\n  if(!values.appId)delete values.appId; // preview only: optional appId if Hosting omitted it\n  return validateFirebaseConfig(values);}",
   "function values(){return validateFirebaseConfig(Object.fromEntries(Object.entries(cfg).map(([k,v])=>[k,v.value.trim()])));}"),sourcePanel);
  assert.doesNotMatch(sourcePanel,/delete values\.appId/,'production still requires the explicit appId');
  assert.equal(
   patched.replace("dbApi.doc(db,'sandbox',user().uid,'snapshots','trial')","dbApi.doc(db,'owners',user().uid,'snapshots','current')")
    .replace("const KEY_FIELDS=['apiKey','authDomain','projectId'];","const KEY_FIELDS=['apiKey','authDomain','projectId','appId'];")
    .replace(" if(Object.hasOwn(value,'appId')){if(typeof value.appId!=='string'||!value.appId.trim()||value.appId.length>500)throw Error('Firebase appIdの形式が不正です。');config.appId=value.appId;}\n","")
    .replace(" if(config.projectId!=='lifeplan-sync-sandbox'||config.authDomain!=='lifeplan-sync-sandbox.firebaseapp.com')throw Error('架空データ用Firebase以外は接続できません。');\n",""),base);
  const html=readFileSync(join(output,'public','index.html'),'utf8');
  for(const id of ['importFile','importFile2','recoveryCheckFile'])assert.match(html,new RegExp('id="'+id+'" type="file" disabled'));
  assert(html.includes('検証専用／架空データのみ'));
  const conf=JSON.parse(readFileSync(join(output,'firebase.json'),'utf8'));
  assert.equal(Object.keys(conf).join(','),'hosting');
  assert.equal(conf.hosting.site,'lifeplan-sync-sandbox');
  assert.equal(conf.hosting.public,'public');
  assert.equal(conf.hosting.headers[0].headers.find(x=>x.key==='X-Robots-Tag').value.includes('noindex'),true);
  const approval=JSON.parse(readFileSync(join(output,'APPROVED_SCOPE.json'),'utf8'));
  assert.equal(approval.channel,'app-sync-check');assert.equal(approval.expires,'7d');
  assert.equal(approval.requiresFirestoreRuleChange,false);
  assert.equal(approval.requiresRealUserData,false);
  assert.equal(approval.liveChannelAllowed,false);
  assert(existsSync(join(output,'deploy-preview.mjs')));
  assert(statSync(join(output,'public','setup.html')).isFile());
  assert.throws(()=>prepareAppPreview(output));
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
test('setup and cleanup do not import a real backup or authorize a different firebase project',()=>{
 const setup=read('./tools/app-sandbox-preview/setup.mjs');
 const cleanup=read('./tools/app-sandbox-preview/cleanup.mjs');
 assert.match(setup,/location\.href/);
 assert.match(setup,/localStorage\.getItem\(STATE_KEY\)/);
 assert.match(setup,/config\.plan\.initialAsset=987/);
 assert.match(setup,/syntheticEvidence/);
 assert.doesNotMatch(setup,/fileReader|FileReader|showOpenFilePicker|lifeplan-private-sync\.firebaseapp\.com/);
 assert.match(cleanup,/createSandboxStore/);
 assert.match(cleanup,/removeOwnedAttempt/);
 assert.match(cleanup,/decryptSnapshot/);
 assert.match(cleanup,/runId/);
 assert.match(cleanup,/sandbox/);
 assert.doesNotMatch(cleanup,/owners\/|lifeplan-private-sync|public-main|FirebaseAppDelete/);
});
