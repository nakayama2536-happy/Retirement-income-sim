// Build the exact approved Stage-3 candidate in a DISPOSABLE checkout only.
// Never deploy, push, read personal data, call Firebase or change permissions.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const payloads={
 'sync-firebase.mjs':'4c52895ae1cde9961fab348d21ecfa7674d6b762c2b500099d74b6de593b8553',
 'sync-controller.mjs':'3d7138be156a25b619e31e9a600b1b5125b541d8b58a0f7d99cdc65d2559f61e',
 'sync-panel.mjs':'2fb6b0e7435b62974e3668577711d13927023ead41bea5407068530837679a4b',
 'backup-compatibility.mjs':'6e11056418920173132a8597a9f92e5415bd532081723f27ffe224fa639c1671',
 'sw.js':'551d3c3d8137402370912dc9cfca3b488f44f6d51965b141d8f197fca95c178f',
 'tools/package-public.mjs':'3d4143bcc626c1184770dd7beb98af8e0eb6b863fe85029aed3493af7badea5d'
};
const dir='tools/cloud-ui-candidate';
const edits=JSON.parse(fs.readFileSync(path.join(dir,'transforms.json'),'utf8'));
const changes=new Map();
for(const entry of edits){
 if(!/^[A-Za-z0-9_./-]+$/.test(entry.path)||entry.path.startsWith('/')||entry.path.split('/').includes('..'))throw Error('Unsafe source path');
 const original=fs.readFileSync(entry.path);
 if(sha(original)!==entry.before)throw Error('Baseline changed: '+entry.path);
 const lines=original.toString('utf8').match(/[^\n]*\n|[^\n]+$/g)||[];
 let boundary=lines.length;
 for(const e of [...entry.edits].reverse()){
  if(!Number.isInteger(e.line)||!Number.isInteger(e.remove)||e.line<0||e.remove<0||e.line+e.remove>boundary||typeof e.insert!=='string')throw Error('Invalid splice: '+entry.path);
  lines.splice(e.line,e.remove,e.insert);boundary=e.line;
 }
 const candidate=Buffer.from(lines.join(''));
 if(sha(candidate)!==entry.after)throw Error('Candidate hash mismatch: '+entry.path);
 changes.set(entry.path,candidate);
}
for(const [target,expected] of Object.entries(payloads)){
 const bytes=fs.readFileSync(path.join(dir,path.basename(target)));
 if(sha(bytes)!==expected)throw Error('Payload hash mismatch: '+target);
 changes.set(target,bytes);
}
// Existing exact-baseline transformer was verified in Stage 2. Run once only.
execFileSync(process.execPath,['tools/retirement-comment/stage2.mjs'],{stdio:'inherit'});
for(const [name,bytes] of changes)fs.writeFileSync(name,bytes);
const {collect,build}=await import(pathToFileURL(path.resolve('tools/package-public.mjs')).href);
const packaged=collect(process.cwd()),manifest=packaged.out.get('distribution-manifest.json');
const expected='12e3183a734a667baef9ac25fce132da414450f44243344fa103c0e754b9d0b6';
if(sha(manifest)!==expected)throw Error('Not the approved Stage-3 runtime package');
fs.writeFileSync('distribution-manifest.json',manifest);
fs.mkdirSync('stage4-evidence',{recursive:true});
const result=build(process.cwd(),path.resolve('stage4-evidence/public-candidate-NOT-DEPLOYED'));
fs.writeFileSync('stage4-evidence/integration.json',JSON.stringify({
 scope:'Stage 4A: exact combined candidate in disposable CI; committed root still not release-ready',
 sourceBaseline:'933e2e12165474927f1a0e217cc4240752196e55',
 build:'v0.9.7-cloud-ui-comment-20261024',manifestSha256:sha(manifest),
 exactStage3Package:true,...result,personalData:false,firebaseAccess:false,permissions:'contents:read'
},null,2)+'\n');
console.log('STAGE4_EXACT_CANDIDATE_OK '+JSON.stringify(result));
