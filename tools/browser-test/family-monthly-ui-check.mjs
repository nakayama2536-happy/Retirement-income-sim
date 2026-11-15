// Isolated browser regression for read-only family monthly display. Fictional data only.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium,webkit} from 'playwright';
const root=resolve('.'),fixture=JSON.parse(await readFile('tools/browser-test/synthetic-full.json','utf8'));
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=='GET')throw Error('method');
  const pathname=new URL(req.url,'http://localhost').pathname;
  const p=resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!p.startsWith(root+sep)||!types[extname(p)])throw Error('invalid path');
  res.writeHead(200,{'Content-Type':types[extname(p)],'Cache-Control':'no-store'});
  res.end(await readFile(p));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin='http://127.0.0.1:'+server.address().port;
let total=0;
try{
 for(const [name,engine] of [['Chromium',chromium],['WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
   const errors=[],external=[];
   await context.addInitScript(({origin,data})=>{if(location.origin===origin&&!localStorage.getItem('lifeplan-sim-state-v1'))localStorage.setItem('lifeplan-sim-state-v1',JSON.stringify(data));},{origin,data:fixture});
   await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(route.request().url());return route.abort();});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin,{waitUntil:'networkidle'});
   await page.locator('#dashboard').waitFor({state:'visible'});
   const before=await page.evaluate(()=>localStorage.getItem('lifeplan-sim-state-v1'));
   await page.locator('[data-group="results"]').click();
   await page.locator('[data-tab="cashflow"]').click();
   const ages=await page.locator('#familyCashflowAge option').evaluateAll(ns=>ns.map(n=>n.value));
   assert.ok(ages.length>=2,'at least two age periods');
   const view=page.locator('#familyIncomeSplit');
   const first=ages[0],second=ages[1];
   await page.locator('#familyCashflowAge').selectOption(first);
   assert.equal(await view.getAttribute('data-readonly-status'),'ready','computed first-age display');
   const text1=await view.innerText();
   assert.match(text1,/月平均/);assert.match(text1,/対象：|計算対象：/);assert.match(text1,/毎月同じ額が振り込まれるという意味ではありません/);
   await page.locator('#familyCashflowAge').selectOption(second);
   const text2=await view.innerText();
   assert.match(text2,new RegExp(second+'歳期'));
   assert.notEqual(text1,text2,'selection must render a distinct age period');
   for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    const dims=await view.evaluate(n=>({client:n.clientWidth,scroll:n.scrollWidth}));
    assert.ok(dims.scroll<=dims.client+3,`panel width ${width}: ${JSON.stringify(dims)}`);
   }
   assert.equal(await page.evaluate(()=>localStorage.getItem('lifeplan-sim-state-v1')),before,'reading must not change persisted plan');
   assert.deepEqual(external,[],'no external requests');
   assert.deepEqual(errors,[],'no uncaught browser errors');
   total++;console.log('FAMILY_MONTHLY_BROWSER_PASS',name,first,second);
   await context.close();
  }finally{await browser.close();}
 }
 assert.equal(total,2);console.log('FAMILY_MONTHLY_BROWSER_TOTAL',total);
}finally{await new Promise(ok=>server.close(ok));}
