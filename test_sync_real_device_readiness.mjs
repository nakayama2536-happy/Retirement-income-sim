import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
// These are blockers, not permissions or live Firestore rule deployments.
test('the unpublished app writes owners snapshots, while current sandbox rules permit trial only',()=>{
 const app=source('./sync-firebase.mjs'),sandbox=source('./docs/firebase-sync-sandbox.rules.example');
 assert.match(app,/dbApi\.doc\(db,'owners',user\(\)\.uid,'snapshots','current'\)/);
 assert.match(sandbox,/match \/sandbox\/\{uid\}\/snapshots\/\{documentId\}/);
 assert.doesNotMatch(sandbox,/match \/owners\//);
 assert.match(sandbox,/match \/\{other=\*\*\} \{ allow read, write: if false;/);
});
test('normal app keeps the optional sync OFF until explicit setup and full backup',()=>{
 const panel=source('./sync-panel.mjs'),controller=source('./sync-controller.mjs');
 assert.match(panel,/No SDK is loaded until user connects/);
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
