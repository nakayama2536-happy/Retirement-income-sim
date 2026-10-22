// Read-only, unauthenticated probe of the existing disposable preview.
// Never echo server bodies, connection values, SDK errors, cookies or tokens.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {checkedConfig,PROJECT} from './mobile-policy.mjs';
export const PREVIEW='https://lifeplan-sync-sandbox--encrypted-mobile-m6wu7a9n.web.app';
export function inspectConfig(text,contentType){
 const out={json:false,contentTypeAccepted:/application\/json/i.test(contentType??''),projectMatches:false,authDomainMatches:false,appIdPresent:false,appIdUsable:false,acceptedByCandidate:false};
 if(typeof text!=='string'||new TextEncoder().encode(text).length>16384)return out;
 let raw;try{raw=JSON.parse(text);}catch{return out;}
 out.json=!!raw&&typeof raw==='object'&&!Array.isArray(raw);if(!out.json)return out;
 out.projectMatches=raw.projectId===PROJECT;out.authDomainMatches=raw.authDomain===PROJECT+'.firebaseapp.com';
 out.appIdPresent=Object.hasOwn(raw,'appId');out.appIdUsable=typeof raw.appId==='string'&&!!raw.appId.trim()&&raw.appId.length<=256;
 try{checkedConfig(raw);out.acceptedByCandidate=out.contentTypeAccepted;}catch{}
 return out;
}
export async function boundedGet(path,fetcher=fetch){
 const allowed=['/__/firebase/init.json','/index.html','/robots.txt','/sync-crypto.mjs','/tools/firebase-mobile/mobile.mjs','/tools/firebase-mobile/mobile-policy.mjs','/tools/firebase-mobile/mobile.css','/tools/firebase-emulator/encrypted-sandbox-check.mjs'];
 if(!allowed.includes(path))throw Error('Unapproved public probe path');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetcher(PREVIEW+path,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal});
  if(response.redirected)throw Error('Unexpected redirect');
  const limit=path==='/__/firebase/init.json'?16384:131072;
  const reader=response.body?.getReader();if(!reader)throw Error('Missing response body');
  const chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('Response exceeds limit');chunks.push(Buffer.from(value));}}
  finally{await reader.cancel().catch(()=>{});}
  const bytes=Buffer.concat(chunks);
  return {status:response.status,ok:response.ok,headers:response.headers,bytes};
 }finally{clearTimeout(timer);}
}
export function compareSecurityHeaders(headers,expectedHeaders){
 const normalize=(key,value)=>{
  if(value===null)return null;
  if(key==='content-security-policy')return value.split(';').map(x=>x.trim().replace(/\s+/g,' ')).filter(Boolean).sort().join(';');
  if(['cache-control','x-robots-tag','permissions-policy'].includes(key))return value.split(',').map(x=>x.trim()).sort().join(',');
  return value.trim();
 };
 // Emit only fixed header names and comparison booleans, never raw response values.
 return expectedHeaders.map(({key,value})=>{
  const name=key.toLowerCase(),actual=headers.get(key);
  return {name,present:actual!==null,exactMatch:actual===value,equivalent:normalize(name,actual)===normalize(name,value)};
 });
}
// Explain only fixed crawler directives; never log raw/unknown header values.
// This is an observation, not an authentication check or an indexing guarantee.
export function inspectRobotsHeader(value){
 const out={present:value!==null,parseable:false,noindex:false,nofollow:false,noarchive:false,duplicateDirectives:false,conflictingDirectives:false,unknownDirectiveCount:0,allExpectedDirectivesPresent:false};
 if(typeof value!=='string'||!value.trim()||value.length>2048)return out;
 const tokens=value.toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
 if(tokens.length>64)return out;
 const known=new Set(['noindex','nofollow','noarchive','none','index','follow','all','nosnippet','noimageindex','notranslate','nositelinkssearchbox','nocache']);
 const unique=new Set(tokens);out.parseable=true;out.duplicateDirectives=unique.size!==tokens.length;
 out.unknownDirectiveCount=tokens.filter(x=>!known.has(x)).length;
 out.noindex=unique.has('noindex')||unique.has('none');
 out.nofollow=unique.has('nofollow')||unique.has('none');out.noarchive=unique.has('noarchive');
 out.conflictingDirectives=(out.noindex&&(unique.has('index')||unique.has('all')))||(out.nofollow&&(unique.has('follow')||unique.has('all')));
 out.allExpectedDirectivesPresent=out.noindex&&out.nofollow&&out.noarchive;
 return out;
}
export async function probePublicPreview({fetcher=fetch,files,expectedHeaders,readExpected}){
 const report={checkedAt:new Date().toISOString(),scope:'public-static-read-only',authenticated:false,writes:0,requests:0,config:null,files:[]};
 try{
  report.requests++;
  const response=await boundedGet('/__/firebase/init.json',fetcher);
  report.config={status:response.status,...inspectConfig(response.bytes.toString('utf8'),response.headers.get('content-type'))};
  if(!response.ok)report.config.acceptedByCandidate=false;
 }catch{report.config={fetched:false,error:'PUBLIC_READ_UNAVAILABLE'};}
 const previous={
  'tools/firebase-mobile/mobile-policy.mjs':'c9de0c3c1f66b233a55b59c837d0a89a2138dde8182c46a15dc4e41cdd1ac6d1',
  'tools/firebase-mobile/mobile.mjs':'b6a915dcb7aa733a9d00b0288849788c1e027fbf6d6f2141a702b60a2acd83c2'
 };
 for(const [target,source] of Object.entries(files)){
  try{
   report.requests++;
   const response=await boundedGet('/'+target,fetcher);
   const hash=createHash('sha256').update(response.bytes).digest('hex');
   const expectedHash=createHash('sha256').update(readExpected(source)).digest('hex');
   const headerChecks=compareSecurityHeaders(response.headers,expectedHeaders);
   report.files.push({path:target,status:response.status,sha256:hash,matchesCandidate:response.ok&&hash===expectedHash,matchesPreviousRelease:response.ok&&hash===(previous[target]??expectedHash),securityHeadersMatch:headerChecks.every(x=>x.exactMatch),securityHeadersEquivalent:headerChecks.every(x=>x.equivalent),headerChecks,robotsDirectives:inspectRobotsHeader(response.headers.get('x-robots-tag'))});
  }catch{report.files.push({path:target,fetched:false,error:'PUBLIC_READ_UNAVAILABLE'});}
 }
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Expected one output report path');
 const {FILES,HEADERS}=await import('./prepare.mjs');
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
 const report=await probePublicPreview({files:{...FILES,'robots.txt':null},expectedHeaders:HEADERS,readExpected:source=>source?readFileSync(resolve(root,source)):Buffer.from('User-agent: *\nDisallow: /\n')});
 writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
 console.log('PUBLIC_PREVIEW_READONLY '+JSON.stringify(report));
}
