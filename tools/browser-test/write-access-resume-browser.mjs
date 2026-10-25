// Browser regression for Web Locks lifecycle after navigating to iOS Files and back.
// Only one public module is served from local loopback. No Firebase or user data.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
const root=resolve('.');
const dir=resolve('tools/browser-test/mobile-results/write-access');
await mkdir(dir,{recursive:true});
const report={status:'incomplete',cases:[],source:'write-access.mjs',cloudWrites:0,personalDataAccess:false};
const script=await readFile(resolve(root,'write-access.mjs'));
const server=createServer((req,res)=>{
 const p=new URL(req.url,'http://127.0.0.1').pathname;
 if(req.method!=='GET'||(p!=='/'&&p!=='/write-access.mjs')){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':p==='/'?'text/html':'text/javascript','Cache-Control':'no-store'});
 res.end(p==='/'?'<html><head><meta charset="utf-8"></head><body>fictional lock test</body></html>':script);
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const url='http://127.0.0.1:'+server.address().port+'/';
function record(browser,check){report.cases.push({browser,check,pass:true});console.log('WRITE_LOCK_BROWSER_PASS '+browser+' '+check);}
let currentBrowser=null,currentContext=null;
try{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  currentBrowser=await engine.launch({headless:true});
  currentContext=await currentBrowser.newContext({viewport:{width:390,height:844}});
  const first=await currentContext.newPage();await first.goto(url);
  const begin=await first.evaluate(async()=>{
   const m=await import('/write-access.mjs');
   window.__write=m;
   window.__lease=await m.acquireWriteAccess();
   window.__events=[];
   window.__lease.subscribe(lease=>window.__events.push({writable:lease.writable,reason:lease.reason}));
   return {writable:window.__lease.writable,reason:window.__lease.reason};
  });
  assert.equal(begin.writable,true,name+': first page lock');record(name,'initial-owner');
  const second=await currentContext.newPage();await second.goto(url);
  const denied=await second.evaluate(async()=>{
   const m=await import('/write-access.mjs');window.__lease=await m.acquireWriteAccess();
   return {writable:window.__lease.writable,reason:window.__lease.reason};
  });
  assert.equal(denied.writable,false);assert.equal(denied.reason,'other-screen');record(name,'second-editor-blocked');
  await first.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await first.waitForFunction(()=>window.__lease.writable===false);
  record(name,'old-owner-revoked-on-pagehide');
  await second.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await second.waitForFunction(()=>window.__lease.writable===true,{timeout:8000});
  record(name,'second-editor-gains-lock-only-after-release');
  await first.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await first.waitForFunction(()=>window.__lease.reason==='other-screen',{timeout:8000});
  assert.equal(await first.evaluate(()=>window.__lease.writable),false);
  record(name,'resuming-screen-cannot-take-over-active-editor');
  await second.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await second.waitForFunction(()=>window.__lease.writable===false);
  await first.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await first.waitForFunction(()=>window.__lease.writable===true,{timeout:8000});
  assert.equal(await first.evaluate(()=>window.__write.assertWriteAccess()===undefined),true);
  record(name,'resumed-editor-reacquires-after-other-screen-releases');
  await first.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await currentContext.close();await currentBrowser.close();currentContext=null;currentBrowser=null;
 }
 report.status='passed';
}catch(error){report.status='failed';report.error=error.stack||String(error);console.error(error.stack||error);process.exitCode=1;}
finally{
 await writeFile(resolve(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
 await currentContext?.close().catch(()=>{});await currentBrowser?.close().catch(()=>{});
 await new Promise(ok=>server.close(ok));
}
