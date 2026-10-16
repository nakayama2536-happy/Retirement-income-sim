import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const text=fs.readFileSync(new URL('./docs/firebase-sync-firestore.rules.example',import.meta.url),'utf8');
test('Firestore rules template denies everyone until private UID configured',()=>{
 assert.match(text,/__SET_SINGLE_OWNER_UID_PRIVATELY__/);
 assert.match(text,/request\.auth\.uid\s*==\s*uid/);
 assert.match(text,/uid\s*==\s*'__SET_SINGLE_OWNER_UID_PRIVATELY__'/);
 assert.doesNotMatch(text,/allow\s+(?:read|write)\s*:\s*if\s+true/);
});
test('Firestore rules forbid delete and require increasing remote revision',()=>{
 assert.match(text,/allow list, delete: if false/);
 assert.match(text,/request\.resource\.data\.revision\s*==\s*resource\.data\.revision\s*\+\s*1/);
 assert.match(text,/documentId\s*==\s*'current'/);
});
