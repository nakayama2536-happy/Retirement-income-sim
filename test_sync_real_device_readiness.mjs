import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
// These are blockers, not permissions or live Firestore rule deployments.
test('the app writes owners snapshots, while current sandbox rules permit trial only',()=>{
 const app=source('./sync-firebase.mjs'),sandbox=source('./docs/firebase-sync-sandbox.rules.example');
 assert.match(app,/dbApi\.doc\(db,'owners',user\(\)\.uid,'snapshots','current'\)/);
 assert.match(sandbox,/match \/sandbox\/\{uid\}\/snapshots\/\{documentId\}/);
 assert.doesNotMatch(sandbox,/match \/owners\//);
 assert.match(sandbox,/match \/\{other=\*\*\} \{ allow read, write: if false;/);
});
test('Auth-only resumption preserves explicit enrollment, backup and encryption-unlock gates',()=>{
 const panel=source('./sync-panel.mjs'),controller=source('./sync-controller.mjs');
 assert.match(panel,/if\(!registered\(\)\|\|safeGet\(SYNC_AUTO_RESUME_KEY\)==='stopped'\)return/);
 const start=panel.indexOf('async function restoreAuthentication(){');
 const end=panel.indexOf(' try{values();}',start);
 assert(start>=0&&end>start,'Auth-only startup must be identifiable');
 const bootstrap=panel.slice(start,end);
 assert.match(bootstrap,/getSessionIdentity/);
 assert.doesNotMatch(bootstrap,/\.read\s*\(|\.compareAndSwap\s*\(|createSyncCoordinator\s*\(|\.runAuto\s*\(/);
 assert.match(controller,/if\(!backupConfirmed\)throw Error/);
 assert.match(controller,/if\(getMarker\(\)\)throw Error/);
 assert.match(panel,/SYNC_ROLLBACK_KEY/);
});
test('the synthetic device test has distinct stores, simulated backend and no personal-data ingress',()=>{
 const fixture=source('./tools/browser-test/two-device-sync-app.mjs');
 assert.match(fixture,/pcContext=await context\(pcBrowser/);
 assert.match(fixture,/phoneContext=await context\(phoneBrowser/);
 assert.match(fixture,/const cloud=\{document:null/);
 assert.doesNotMatch(fixture,/lifeplan-private-sync\.firebaseapp\.com|retirement-plan-full[^'"]*json/);
 assert.match(fixture,/complete-settings-scenarios-actuals-reviews-and-unknown-fields-preserved/);
});

// Behavioral checks supplement the static guard: reusing an existing login is
// permitted, but this must not silently unlock or access financial snapshots.
test('new or stopped devices do not initialize the SDK or access cloud snapshots',async()=>{
 const {makeFixture}=await import('./tools/cloud-ui-test/harness.mjs');
 for(const mode of ['fresh','stopped']){
  const h=await makeFixture(mode);
  try{assert.equal(h.counters().providerCalls,0);assert.equal(h.counters().reads,0);assert.equal(h.counters().writes,0);assert.equal(h.ui().getState().connected,false);}
  finally{h.destroy();}
 }
});
test('enrolled device restores only authentication and still waits for explicit unlock',async()=>{
 const {makeFixture}=await import('./tools/cloud-ui-test/harness.mjs');
 const h=await makeFixture();
 try{
  assert.equal(h.counters().providerCalls,1);assert.equal(h.ui().getState().authMode,'signed-in');
  assert.equal(h.counters().reads,0);assert.equal(h.counters().writes,0);assert.equal(h.counters().replaced,0);
  assert.equal(h.counters().timers,0);assert.equal(h.ui().getState().connected,false);
 }finally{h.destroy();}
});
