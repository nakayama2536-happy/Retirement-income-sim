import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,existsSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {PAIR_PROJECT,PAIR_CHANNEL,PAIR_MARKER,PAIR_KIND,assertPairLocation,sourceFixture,validSource,ackFixture,validAck,checkedMarker,markPending,ciphertextRecord,safePairMessage} from './tools/firebase-pair/pair-policy.mjs';
import {PAIR_FILES,PAIR_HEADERS,buildPairedCandidate} from './tools/firebase-pair/prepare.mjs';
const preview='https://lifeplan-sync-sandbox--pair-check-synthetic.web.app/';
const run='c4789d24-1c20-4db0-81bb-83309127265c';
test('new pair-check channel is restricted to the existing sandbox project and its own preview',()=>{
 assert.equal(PAIR_PROJECT,'lifeplan-sync-sandbox');
 assert.equal(PAIR_CHANNEL,'pair-check');
 assert.equal(assertPairLocation(new URL(preview)),true);
 for(const bad of [
  preview+'?utm_source=chatgpt.com',preview+'#one','http://lifeplan-sync-sandbox--pair-check-synthetic.web.app/',
  'https://lifeplan-private-sync.web.app/',
  'https://lifeplan-sync-sandbox--encrypted-mobile-synthetic.web.app/',
  'https://lifeplan-sync-sandbox.web.app/'
 ])assert.throws(()=>assertPairLocation(new URL(bad)));
});
test('fixed synthetic state is deterministic and does not represent a user backup',()=>{
 const value=sourceFixture(run);
 assert.deepEqual(value,sourceFixture(run));
 assert.equal(value.kind,PAIR_KIND);
 assert.equal(value.plan.initialAsset,1234);
 assert.equal(value.scenarios.length,2);
 assert.equal(validSource(value),true);
 assert.equal(validSource({...value,plan:{...value.plan,initialAsset:987654}}),false);
 assert.equal(validSource({...value,unknownFields:null}),false);
 assert.throws(()=>sourceFixture('not-a-uuid'));
});
test('acknowledgment is tied to run identity and cannot silently change the synthetic data',()=>{
 const value=sourceFixture(run),ack=ackFixture(value);
 assert.equal(validAck(ack,run),true);
 assert.equal(validAck(ack,'77a9eb4e-d45a-4e0b-96ab-cc165d23b06b'),false);
 assert.equal(validAck({...ack,phase:'from-PC'},run),false);
 assert.equal(validAck({...ack,plan:{initialAsset:999}},run),false);
 assert.throws(()=>ackFixture({kind:'personal-backup',runId:run}));
});
test('pending marker only contains nonsecret run identity and refuses unknown format',()=>{
 const marker=markPending(run);
 assert.deepEqual(checkedMarker(marker),marker);
 assert.equal(Object.keys(marker).sort().join(','),'kind,runId,version');
 assert.throws(()=>checkedMarker({...marker,password:'secret'}));
 assert.throws(()=>checkedMarker({...marker,runId:'bad'}));
 assert.match(PAIR_MARKER,/pair-check/);
});
test('ciphertext records do not accept malformed or unexpected algorithm',()=>{
 const enc={digest:'a'.repeat(64),payload:{version:1,algorithm:'AES-256-GCM/PBKDF2-SHA256',data:'fictional-encrypted'}};
 assert.deepEqual(ciphertextRecord('sample-uid',1,enc),{ownerUid:'sample-uid',formatVersion:1,revision:1,digest:enc.digest,ciphertext:enc.payload});
 assert.throws(()=>ciphertextRecord('uid/another',1,enc));
 assert.throws(()=>ciphertextRecord('test',0,enc));
 assert.throws(()=>ciphertextRecord('test',1,{...enc,payload:{algorithm:'other'}}));
 assert.throws(()=>ciphertextRecord('test',1,{...enc,digest:'bad'}));
});
test('errors expose neither cloud data nor user credentials',()=>{
 assert.match(safePairMessage({code:'permission-denied'}),/ルール/);
 assert.ok(!safePairMessage({code:'fake-sensitive-message',message:'password=SECRET'}).includes('SECRET'));
});
test('staged deployment is a new channel candidate only, contains no local user state source or service worker',()=>{
 const source=readFileSync(new URL('./tools/firebase-pair/pair.mjs',import.meta.url),'utf8');
 const page=readFileSync(new URL('./tools/firebase-pair/pair.html',import.meta.url),'utf8');
 assert.doesNotMatch(source,/lifeplan-sim-state-v1|lifeplan-private-sync-config|restoreFullBackup|readFile\(|\bfetch\(['"]\/owners/);
 assert.doesNotMatch(page,/type="file"|accept="application\/json"/);
 assert.doesNotMatch(source,/serviceWorker\.register|navigator\.clipboard\.readText/);
 assert.match(source,/readMarker/);
 assert.match(source,/removeOwnedAttempt/);
 assert.match(source,/signOut/);
 assert.deepEqual(Object.keys(PAIR_FILES).sort(),[
  'index.html','sync-crypto.mjs','tools/firebase-emulator/encrypted-sandbox-check.mjs',
  'tools/firebase-mobile/mobile-policy.mjs','tools/firebase-pair/pair-policy.mjs',
  'tools/firebase-pair/pair.css','tools/firebase-pair/pair.mjs'
 ].sort());
 assert(PAIR_HEADERS.some(h=>h.key==='Cache-Control'&&h.value.includes('no-store')));
});
test('packaged static files match byte size and SHA256; approval is explicitly pending',()=>{
 const parent=mkdtempSync(join(tmpdir(),'lifeplan-pair-test-'));
 try{
  const target=join(parent,'candidate'),output=buildPairedCandidate(target);
  assert.equal(output.files,8);assert.equal(output.deployed,false);
  assert.equal(output.approvalStatus,'not-approved');
  const m=JSON.parse(readFileSync(join(target,'bundle-sha256.json'),'utf8'));
  assert.equal(m.files.length,8);
  for(const entry of m.files){
   const contents=readFileSync(join(target,'public',entry.path));
   assert.equal(contents.length,entry.size);
   assert.equal(createHash('sha256').update(contents).digest('hex'),entry.sha256);
  }
  assert.equal(existsSync(join(target,'public','sw.js')),false);
  const approval=JSON.parse(readFileSync(join(target,'APPROVAL_REQUIRED.json'),'utf8'));
  assert.equal(approval.automaticDeploy,false);
  assert.equal(approval.realPersonalDataAllowed,false);
  assert.equal(approval.rulesModificationAllowed,false);
  assert.equal(approval.productionDeploymentAllowed,false);
  const hosting=JSON.parse(readFileSync(join(target,'firebase.json'),'utf8'));
  assert.equal(hosting.hosting.site,PAIR_PROJECT);
  assert.equal(hosting.hosting.public,'public');
  assert.throws(()=>buildPairedCandidate(target));
 }finally{rmSync(parent,{recursive:true,force:true});}
});
