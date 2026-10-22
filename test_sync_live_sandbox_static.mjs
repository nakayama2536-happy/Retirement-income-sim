import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const h=readFileSync(new URL('./tools/firebase-emulator/live-sandbox.html',import.meta.url),'utf8');
test('sandbox-only diagnostic refuses the actual user project and uses a disposable path',()=>{
 assert.match(h,/config\.projectId!=='lifeplan-sync-sandbox'/);
 assert.match(h,/config\.authDomain!=='lifeplan-sync-sandbox\.firebaseapp\.com'/);
 assert.match(h,/doc\(database,'sandbox',uid,'snapshots','trial'\)/);
 assert.doesNotMatch(h,/doc\(database,'owners'/);
 assert.match(h,/before\.exists\(\)/);
});
test('sandbox-only diagnostic uses Firebase CAS and verifies cleanup without persistence',()=>{
 assert.match(h,/runTransaction/);
 assert.match(h,/getDocFromServer/);
 assert.match(h,/deleteDoc\(ref\)/);
 assert.match(h,/inMemoryPersistence/);
 assert.match(h,/signOut\(auth\)/);
 assert.doesNotMatch(h,/localStorage|sessionStorage|sendBeacon|fetch\s*\(/);
});
