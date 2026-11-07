/** Isolated Chromium acceptance of the draft-only 4-1-6 expense migration review. Fictional data only. */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(process.argv[2]||'');
assert.ok(process.argv[2]&&root!==path.resolve(here,'../..'),'Explicit isolated checkout required');
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'lifeplan-legacy-browser-'));
const evidence={suite:'PR100-isolated-legacy-expense-review',synthetic:true,published:false,cases:[]};
let server,browser;
try{
 const full=JSON.parse(await fs.readFile(path.join(here,'synthetic-full.json'),'utf8'));
 const makeFixture=withStandard=>{
   const data=structuredClone(full);
   data.config.plan.endAge=99;
   data.config.budgets=data.config.budgets.map(b=>({...b,toAge:99}));
   data.config.cashflow.expenseCategories=[{key:'food',label:'食費',items:[{key:'grocery',label:'食料品',periods:[{fromAge:64,toAge:95,amount:2}]}]}];
   data.config.cashflow.detailSourceProfile='public-v0.9';
   if(withStandard)data.config.expenseDetail={monthlyCategories:[{key:'other',label:'別形式',amount:3}],travelAnnualBase:0};
   return data;
 };
 const fixtures=[{id:'legacy-95-96-gap',standard:false},{id:'standard-coexistence',standard:true}];
 for(const c of fixtures)await fs.writeFile(path.join(scratch,c.id+'.json'),JSON.stringify(makeFixture(c.standard)));
 server=createServer(async(req,res)=>{
   const relative=new URL(req.url,'http://127.0.0.1').pathname.slice(1)||'index.html';
   if(!/^[a-zA-Z0-9_./-]+$/.test(relative)||relative.startsWith('.')||relative.split('/').includes('..')||relative.startsWith('tools/')||relative.startsWith('.git/')){
     res.writeHead(404);res.end();return;
   }
   const file=path.resolve(root,relative);
   if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
   const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
   try{const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}
   catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true});
 for(const c of fixtures){
   const context=await browser.newContext({serviceWorkers:'block'});
   const page=await context.newPage();
   const errors=[];page.on('pageerror',err=>errors.push(String(err.message)));
   await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
   await page.locator('#importFile').setInputFiles(path.join(scratch,c.id+'.json'));
   await page.locator('#dashboard').waitFor({state:'visible',timeout:30000});
   await page.locator('[data-group="expense"]').click();
   await page.locator('[data-tab="expenses"]').click();
   const card=page.locator('#expenseUnificationReview');
   await card.waitFor({state:'attached'});
   assert.equal(await card.locator('summary').getAttribute('data-navigation-reference'),'4-1-6');
   await card.locator('summary').click();
   const before=await page.evaluate(()=>JSON.stringify(Object.fromEntries([...Object.keys(localStorage)].sort().map(k=>[k,localStorage.getItem(k)]))));
   await card.locator('button').click();
   const status=(await card.locator('[role="status"]').innerText()).trim();
   assert.match(status,/95歳に登録がある費目 1件／96歳に登録がある費目 0件/,c.id+': '+status);
   if(c.standard)assert.match(status,/標準形式にも登録済みの内訳/);
   else assert.match(status,/変換候補を作れます/);
   assert.match(await card.locator('button').innerText(),/4-1-6-1/);
   const after=await page.evaluate(()=>JSON.stringify(Object.fromEntries([...Object.keys(localStorage)].sort().map(k=>[k,localStorage.getItem(k)]))));
   assert.equal(after,before,'No browser storage change: '+c.id);
   assert.deepEqual(errors,[],'No browser JS exception: '+c.id);
   evidence.cases.push({id:c.id,result:'pass',savedUnchanged:true});
   await context.close();
 }
}finally{
 if(browser)await browser.close();
 if(server)await new Promise(resolve=>server.close(resolve));
 await fs.rm(scratch,{recursive:true,force:true});
 await fs.mkdir(path.join(here,'browser-results'),{recursive:true});
 await fs.writeFile(path.join(here,'browser-results','legacy-expense-review.json'),JSON.stringify(evidence,null,2)+'\n');
}
