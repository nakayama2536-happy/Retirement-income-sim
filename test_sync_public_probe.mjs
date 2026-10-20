import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectConfig,boundedGet,probePublicPreview,compareSecurityHeaders,PREVIEW} from './tools/firebase-mobile/probe-public-config.mjs';
const cfg={projectId:'lifeplan-sync-sandbox',authDomain:'lifeplan-sync-sandbox.firebaseapp.com',apiKey:'SYNTHETIC_NOT_TO_ECHO'};
test('probe reports legacy config shape without values',()=>{
 const report=inspectConfig(JSON.stringify(cfg),'application/json');
 assert.deepEqual(report,{json:true,contentTypeAccepted:true,projectMatches:true,authDomainMatches:true,appIdPresent:false,appIdUsable:false,acceptedByCandidate:true});
 assert.ok(!JSON.stringify(report).includes('SYNTHETIC_NOT_TO_ECHO'));
});
test('probe never confuses JSON text with valid project config',()=>{
 for(const text of ['null','[]','<html>',JSON.stringify({...cfg,projectId:'other'}),JSON.stringify({...cfg,appId:null}),'x'.repeat(16385)])assert.equal(inspectConfig(text,'application/json').acceptedByCandidate,false);
 assert.equal(inspectConfig(JSON.stringify(cfg),'text/html').acceptedByCandidate,false);
});
test('probe GET is allowlisted, unauthenticated and redirect-disabled',async()=>{
 let calls=0;
 const result=await boundedGet('/__/firebase/init.json',async(url,options)=>{
  calls++;assert.equal(url,PREVIEW+'/__/firebase/init.json');assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.headers,undefined);
  return new Response(JSON.stringify(cfg),{headers:{'Content-Type':'application/json'}});
 });
 assert.equal(result.ok,true);assert.equal(calls,1);
 await assert.rejects(boundedGet('/owners/private',async()=>{calls++;}),/Unapproved/);assert.equal(calls,1);
});
test('probe refuses oversized response and never follows a redirect',async()=>{
 await assert.rejects(boundedGet('/__/firebase/init.json',async()=>new Response('x'.repeat(16385))),/limit/);
 await assert.rejects(boundedGet('/__/firebase/init.json',async()=>({redirected:true})),/redirect/);
});
test('probe failure output does not echo network/SDK error bodies',async()=>{
 const report=await probePublicPreview({fetcher:async()=>{throw Error('SYNTHETIC_NOT_TO_ECHO');},files:{'index.html':'fixture'},expectedHeaders:[],readExpected:()=>Buffer.from('')});
 assert.equal(report.authenticated,false);assert.equal(report.writes,0);assert.equal(report.config.fetched,false);assert.equal(report.files[0].fetched,false);assert.ok(!JSON.stringify(report).includes('SYNTHETIC_NOT_TO_ECHO'));
});
test('probe returns only sanitized config facts and static file hashes',async()=>{
 const report=await probePublicPreview({fetcher:async url=>new Response(url.endsWith('init.json')?JSON.stringify(cfg):'fictional-static',{headers:{'Content-Type':'application/json'}}),files:{'index.html':'fixture'},expectedHeaders:[],readExpected:()=>Buffer.from('fictional-static')});
 assert.equal(report.config.acceptedByCandidate,true);assert.equal(report.files[0].matchesCandidate,true);assert.equal(report.requests,2);assert.ok(!JSON.stringify(report).includes('SYNTHETIC_NOT_TO_ECHO'));
});

test('public security-header comparison distinguishes harmless separator whitespace',()=>{
 const expected=[{key:'Cache-Control',value:'no-store, max-age=0'},{key:'Content-Security-Policy',value:"default-src 'none'; script-src 'self'"}];
 const report=compareSecurityHeaders(new Headers({'Cache-Control':'max-age=0,no-store','Content-Security-Policy':"script-src 'self'; default-src   'none';"}),expected);
 assert.ok(report.every(x=>x.present&&x.equivalent));assert.ok(report.every(x=>!x.exactMatch));
});
test('missing or materially different security headers are never normalized to success',()=>{
 const expected=[{key:'Cache-Control',value:'no-store, max-age=0'},{key:'Content-Security-Policy',value:"default-src 'none'; script-src 'self'"}];
 const report=compareSecurityHeaders(new Headers({'Cache-Control':'max-age=3600','Content-Security-Policy':"default-src 'none'; script-src *"}),expected);
 assert.ok(report.every(x=>!x.equivalent));assert.ok(compareSecurityHeaders(new Headers(),expected).every(x=>!x.present&&!x.equivalent));
 assert.ok(report.every(x=>Object.keys(x).sort().join(',')==='equivalent,exactMatch,name,present'));
});
