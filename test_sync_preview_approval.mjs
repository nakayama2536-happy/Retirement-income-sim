import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {prepareBundle,FILES} from './tools/firebase-mobile/prepare.mjs';
const approval=JSON.parse(readFileSync(new URL('./tools/firebase-mobile/preview-approval.json',import.meta.url),'utf8'));
test('explicit approval fixes sandbox preview duration to fourteen days',()=>{
 assert.equal(approval.approvalStatus,'approved');assert.equal(approval.approvedOn,'2026-10-19');
 assert.equal(approval.project,'lifeplan-sync-sandbox');assert.equal(approval.site,approval.project);
 assert.equal(approval.channel,'encrypted-mobile');assert.equal(approval.expires,'14d');
});
test('approval is not deployment and never starts a timer or extends publication automatically',()=>{
 assert.equal(approval.status,'unpublished');assert.equal(approval.deployed,false);assert.equal(approval.automaticDeploy,false);
 assert.equal(approval.expiryBasis,'initial-preview-deployment');assert.equal(approval.allowAutomaticExtension,false);
 assert.ok(!Object.hasOwn(approval,'url'));assert.ok(!Object.hasOwn(approval,'expiresAt'));
});
test('approval preserves production, personal-data, authentication and billing boundaries',()=>{
 assert.deepEqual(approval.notAuthorized,['hosting-live','production-main','github-pages','personal-data','rules-or-auth-changes','billing']);
 assert.ok(approval.requiredPreflight.includes('no implicit Firebase Authentication domain changes'));
 assert.ok(approval.requiredPreflight.includes('authenticated Firebase access to the designated sandbox'));
});
test('generated bundle carries fourteen-day approval outside unchanged public file allowlist',()=>{
 const parent=mkdtempSync(resolve(tmpdir(),'lifeplan-preview-approved-'));
 try{
  const destination=resolve(parent,'candidate'),output=prepareBundle(destination);
  assert.equal(output.expires,'14d');assert.equal(output.approvalStatus,'approved');assert.equal(output.deployed,false);
  const packaged=JSON.parse(readFileSync(resolve(destination,'APPROVAL_REQUIRED.json'),'utf8'));assert.deepEqual(packaged,approval);
  const hashes=JSON.parse(readFileSync(resolve(destination,'bundle-sha256.json'),'utf8'));
  assert.equal(hashes.files.length,7);assert.deepEqual(hashes.files.map(x=>x.path).sort(),[...Object.keys(FILES),'robots.txt'].sort());
  assert.ok(!hashes.files.some(x=>/approval|backup|app\.mjs|sw\.js/i.test(x.path)));
  assert.deepEqual(readdirSync(destination).sort(),['APPROVAL_REQUIRED.json','bundle-sha256.json','firebase.json','public']);
 }finally{rmSync(parent,{recursive:true,force:true});}
});
