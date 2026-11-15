// Synthetic-only, isolated real-app browser regression. No production requests or user data.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium,webkit} from 'playwright';

const root=resolve('.'),original=JSON.parse(await readFile('tools/browser-test/mortality-synthetic.json','utf8'));
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=createServer(async(req,res)=>{
  try{
    if(req.method!=='GET')throw Error('method');
    const target=resolve(root,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':decodeURIComponent(new URL(req.url,'http://localhost').pathname)));
    if(!target.startsWith(root+sep)||!types[extname(target)])throw Error('path');
    res.writeHead(200,{'Content-Type':types[extname(target)],'Cache-Control':'no-store'});
    res.end(await readFile(target));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin='http://127.0.0.1:'+server.address().port;
let total=0;
function variant(kind){
  const data=structuredClone(original),c=data.config;
  c.plan.inflation=0;c.plan.afterTaxReturn=0;
  // Distinct, explicitly identified fictional data. Never merge two formats.
  if(kind==='public'){
    delete c.expenseDetail;delete c.cashflow.periodOverrides;
    c.cashflow.expenseCategories=[{key:'food',label:'食費',amount:10}];
    c.cashflow.detailSourceProfile='public-v0.9';
  }else if(kind==='none'){
    delete c.expenseDetail;delete c.cashflow.periodOverrides;
    delete c.cashflow.expenseCategories;delete c.cashflow.detailSourceProfile;
  }else if(kind==='both'){
    c.cashflow.expenseCategories=[{key:'public-food',label:'旧形式の食費',amount:10}];
    delete c.cashflow.detailSourceProfile;
  }
  return data;
}
try{
  for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await launcher.launch({headless:true});
    try{
      for(const kind of ['work','public','both','none']){
        const context=await browser.newContext({serviceWorkers:'block'});
        const errors=[],external=[];
        context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
        await context.addInitScript(({data,allowedOrigin})=>{
          // Playwright also executes init scripts in about:blank and opaque frames.
          if(location.origin!==allowedOrigin)return;
          if(localStorage.getItem('lifeplan-sim-state-v1')===null)
            localStorage.setItem('lifeplan-sim-state-v1',JSON.stringify(data));
        },{data:variant(kind),allowedOrigin:origin});
        await context.route('**/*',route=>{
          if(new URL(route.request().url()).origin===origin)return route.continue();
          external.push(route.request().url());return route.abort();
        });
        const page=await context.newPage();
        await page.goto(origin,{waitUntil:'networkidle'});
        await page.locator('[data-group="results"]').click();
        await page.locator('[data-tab="mortality"]').click();
        await page.locator('#mortalityForm-workflow-tab-1').click();
        const select=page.locator('#mortalityExpenseSource');
        assert.equal(await select.count(),1,'visible source selector '+kind);
        const values=await select.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value));
        if(kind==='work')assert.deepEqual(values,['','work-v0.9.7']);
        if(kind==='public')assert.deepEqual(values,['','public-v0.9']);
        if(kind==='both'){
          assert.deepEqual(values,['','public-v0.9','work-v0.9.7']);
          assert.equal(await select.inputValue(),'');
          assert.match(await page.locator('#mortalityItemState').innerText(),/選択/);
          await select.selectOption('work-v0.9.7');
          assert.equal(await select.inputValue(),'work-v0.9.7');
        }
        if(kind==='none'){
          assert.deepEqual(values,['']);
          assert.match(await page.locator('#mortalityItemState').innerText(),/費目内訳/);
          assert.equal(await page.locator('#mortalityItemHost [data-mortality-itemfactor]').count(),0);
        }
        assert.equal(external.length,0,'unexpected external requests');
        assert.deepEqual(errors,[],'uncaught browser exceptions');
        total++;
        console.log('MORTALITY_SOURCE_BROWSER_PASS',engine,kind);
        await context.close();
      }
    }finally{await browser.close();}
  }
  assert.equal(total,8);
  console.log('MORTALITY_SOURCE_BROWSER_TOTAL',total);
}finally{await new Promise(ok=>server.close(ok));}
