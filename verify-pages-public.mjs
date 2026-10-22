// Read-only GitHub Pages delivery verification for the published main/root site.
// Never authenticates, never fetches user data, never writes to Firestore or browser storage.
// Expected bytes and SHA256 values come exclusively from this checkout's public manifest.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const BASE='https://nakayama2536-happy.github.io/Retirement-income-sim/';
const SHA=process.env.GITHUB_SHA??'unknown';
const REMOTE=new URL(BASE),digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
const manifestBytes=readFileSync(new URL('./distribution-manifest.json',import.meta.url));
const manifest=JSON.parse(manifestBytes.toString('utf8'));
const files=manifest.files.filter(x=>x.name!=='README.md'&&!x.name.startsWith('docs/'));
if(files.length<50||!files.some(x=>x.name==='index.html')||!files.some(x=>x.name==='sw.js'))
 throw Error('Public manifest is incomplete');
const allowed=/^[a-z0-9_.\/-]+$/i;
if(files.some(x=>!allowed.test(x.name)||x.name.startsWith('/')||x.name.split('/').includes('..')))
 throw Error('Unapproved delivery path in public manifest');
const list=[...files,{name:'distribution-manifest.json',size:manifestBytes.length,sha256:digest(manifestBytes)}];
const important=new Set(['index.html','app.mjs','sw.js','sync-panel.mjs','sync-firebase.mjs','styles.css','manifest.webmanifest','distribution-manifest.json']);
const checked=new Map();
function relative(name){
 const target=new URL(REMOTE.href+name);
 if(target.origin!==REMOTE.origin||!target.pathname.startsWith(REMOTE.pathname))
  throw Error('Delivery origin escape');
 // Avoid a cached outdated response; query parameters do not change static bytes.
 target.searchParams.set('verify_commit',SHA);
 return target;
}
async function check(entry){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),13000);
 try{
  const resp=await fetch(relative(entry.name),{
   method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',signal:controller.signal,
   headers:{'Cache-Control':'no-cache','Pragma':'no-cache'}
  });
  if(resp.status!==200||resp.redirected||resp.headers.get('location'))
   return {name:entry.name,pass:false,status:resp.status,error:'STATUS_OR_REDIRECT'};
  const bytes=Buffer.from(await resp.arrayBuffer());
  if(bytes.length>entry.size+10000)return {name:entry.name,pass:false,status:resp.status,error:'EXCESS_LENGTH'};
  const ok=bytes.length===entry.size&&digest(bytes)===entry.sha256;
  return {name:entry.name,pass:ok,status:resp.status,error:ok?null:'CONTENT_MISMATCH'};
 }catch(e){return {name:entry.name,pass:false,status:null,error:e?.name==='AbortError'?'TIMEOUT':'NETWORK_UNAVAILABLE'};}
 finally{clearTimeout(timer);}
}
const critical=list.filter(x=>important.has(x.name));
let criticalResults=[];
for(let attempt=1;attempt<=12;attempt++){
 criticalResults=await Promise.all(critical.map(check));
 if(criticalResults.every(x=>x.pass))break;
 console.log('PAGES_PUBLISH_PENDING '+JSON.stringify({
  attempt,failed:criticalResults.filter(x=>!x.pass).map(x=>({path:x.name,status:x.status,error:x.error}))
 }));
 if(attempt<12)await wait(15000);
}
if(!criticalResults.every(x=>x.pass))
 throw Error('Page publication verification stopped: critical file mismatch');
for(const x of criticalResults)checked.set(x.name,x);
const other=list.filter(x=>!important.has(x.name));
const failures=[];
for(let i=0;i<other.length;i+=8){
 const batch=await Promise.all(other.slice(i,i+8).map(check));
 for(const item of batch){checked.set(item.name,item);if(!item.pass)failures.push(item);}
}
if(failures.length){
 // Pages may update files slightly apart; re-fetch only failed files, never mutate site.
 await wait(15000);
 const again=await Promise.all(failures.map(f=>check(list.find(x=>x.name===f.name))));
 for(const x of again)checked.set(x.name,x);
}
const failed=[...checked.values()].filter(x=>!x.pass);
if(failed.length){
 console.error('PAGES_DELIVERY_NOT_VERIFIED '+JSON.stringify(failed.map(x=>({path:x.name,status:x.status,error:x.error}))));
 process.exitCode=1;
}else{
 console.log('PAGES_DELIVERY_CONFIRMED '+JSON.stringify({
  expectedCommit:SHA,origin:BASE,checkedFiles:checked.size,hashMatched:checked.size,
  publicRuntime:manifest.runtime,authenticated:false,cloudWrites:0,personalDataAccess:false
 }));
}
