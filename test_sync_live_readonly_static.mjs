import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('./tools/firebase-emulator/live-readonly.html',import.meta.url),'utf8');
test('live Firebase diagnostic is read-only and uses memory-only authentication',()=>{
 assert.match(html,/getDocFromServer/);
 assert.match(html,/inMemoryPersistence/);
 assert.match(html,/signOut/);
 assert.match(html,/snapshots','current'/);
 assert.doesNotMatch(html,/setDoc\s*\(|updateDoc\s*\(|deleteDoc\s*\(|addDoc\s*\(|runTransaction\s*\(|compareAndSwap\s*\(/);
 assert.doesNotMatch(html,/localStorage|sessionStorage|sendBeacon|fetch\s*\(/);
 assert.doesNotMatch(html,/console\.log|JSON\.stringify\s*\(snap\.data/);
});
