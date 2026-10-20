import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedConfig,loadHostingConfig,assertIdentity,assertMobileLocation,summary,PROJECT} from './tools/firebase-mobile/mobile-policy.mjs';
const legacy=()=>({projectId:PROJECT,authDomain:PROJECT+'.firebaseapp.com',apiKey:'fictional-key-no-real-access',messagingSenderId:'000000000000',storageBucket:'ignored.invalid'});
const response=value=>({ok:true,redirected:false,headers:{get:()=> 'application/json; charset=utf-8'},text:async()=>JSON.stringify(value)});

test('reported init.json shape without appId is accepted without synthesizing an ID',()=>{
 const input=legacy(),original=structuredClone(input),result=checkedConfig(input);
 assert.deepEqual(result,{projectId:PROJECT,authDomain:PROJECT+'.firebaseapp.com',apiKey:input.apiKey});
 assert.equal(Object.hasOwn(result,'appId'),false);assert.equal(Object.isFrozen(result),true);assert.deepEqual(input,original);
});
test('valid supplied appId is retained byte for byte',()=>{
 const input={...legacy(),appId:'synthetic-registered-app'},result=checkedConfig(input);
 assert.equal(result.appId,input.appId);assert.equal(Object.keys(result).length,4);
});
for(const [label,value] of [['empty',''],['whitespace','  '],['null',null],['number',1],['object',{}],['array',[]],['undefined',undefined],['oversized','a'.repeat(257)]]){
 test('explicit malformed appId is rejected: '+label,()=>assert.throws(()=>checkedConfig({...legacy(),appId:value}),{code:'config-invalid'}));
}
test('absent appId does not relax project and auth-domain checks',()=>{
 for(const bad of [{projectId:'another-project'},{authDomain:'another-project.firebaseapp.com'},{authDomain:'https://'+PROJECT+'.firebaseapp.com'},{projectId:null}])assert.throws(()=>checkedConfig({...legacy(),...bad}),{code:'wrong-project'});
});
test('required API key still rejects missing, empty and non-string values',()=>{
 for(const apiKey of [undefined,null,'','  ',0,{},'x'.repeat(257)])assert.throws(()=>checkedConfig({...legacy(),apiKey}),{code:'config-invalid'});
});
test('unknown endpoints, keys and personal-looking fields are discarded, not persisted',()=>{
 const value=checkedConfig({...legacy(),databaseURL:'https://evil.invalid',credential:'SYNTHETIC_IGNORE',financialBackup:{fake:true},emulator:'remote.invalid'});
 assert.deepEqual(Object.keys(value).sort(),['apiKey','authDomain','projectId']);
});
test('same-origin config fetch accepts legacy response and performs exactly one read',async()=>{
 let reads=0;const signal=new AbortController().signal;
 const value=await loadHostingConfig(async(path,options)=>{
  reads++;assert.equal(path,'/__/firebase/init.json');assert.deepEqual(options,{cache:'no-store',credentials:'omit',redirect:'error',signal});return response(legacy());
 },{signal});assert.equal(reads,1);assert.equal(Object.hasOwn(value,'appId'),false);
});
test('HTTP, redirects, non-JSON and invalid JSON are never treated as legacy success',async()=>{
 for(const r of [{...response(legacy()),ok:false},{...response(legacy()),redirected:true},{...response(legacy()),headers:{get:()=> 'text/html'}},{...response(legacy()),text:async()=>'{malformed'},{...response(legacy()),text:async()=> ' '.repeat(16385)}])await assert.rejects(loadHostingConfig(async()=>r));
});
test('identity audience, issuer, subject and UID checks remain mandatory',()=>{
 const u={uid:'synthetic-user'},c={aud:PROJECT,iss:'https://securetoken.google.com/'+PROJECT,sub:u.uid};
 assert.equal(assertIdentity(u,c),u.uid);
 for(const change of [{aud:'other'},{iss:'https://securetoken.google.com/other'},{sub:'other'}])assert.throws(()=>assertIdentity(u,{...c,...change}),{code:'wrong-identity'});
 assert.throws(()=>assertIdentity({uid:'bad/path'},c),{code:'wrong-identity'});
});
test('preview-only origin restriction is unchanged',()=>{
 assert.doesNotThrow(()=>assertMobileLocation({href:'https://lifeplan-sync-sandbox--encrypted-mobile-fictional.web.app/'}));
 for(const href of ['https://lifeplan-sync-sandbox.web.app/','https://lifeplan-private-sync.web.app/','http://lifeplan-sync-sandbox--encrypted-mobile-fictional.web.app/','https://lifeplan-sync-sandbox--encrypted-mobile-fictional.web.app/?appId=override'])assert.throws(()=>assertMobileLocation({href}),{code:'wrong-origin'});
});
test('sanitized result states compatibility mode without an identifier or credential',()=>{
 const result={ok:false,steps:[],cleanup:'not-needed',apiKey:'SYNTHETIC_SECRET'};
 const report=summary(result,true,'without-app-id');assert.match(report,/appId未提供・認証\/Firestore限定/);assert.ok(!report.includes('SYNTHETIC_SECRET'));
 assert.match(summary(result,true,'untrusted-SYNTHETIC_SECRET'),/接続設定：未確認/);
});
