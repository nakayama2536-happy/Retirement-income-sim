import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const fixture=path.join(here,'app'),scratch=await fs.mkdtemp(path.join(os.tmpdir(),'lifeplan-p1-'));
let server,browser;const evidence={test:'P1 browser candidate',synthetic:true,production:false,cases:[]};
try{
 const html=await fs.readFile(path.join(repo,'index.html'),'utf8');
 const css=await fs.readFile(path.join(repo,'styles.css'),'utf8');
 assert.match(html,/もしものときの家計を比較/);
 assert.match(css,/P1 UI display improvements/);
 await fs.writeFile(path.join(scratch,'index.html'),html);
 await fs.writeFile(path.join(scratch,'styles.css'),css);
 const files=new Set((await fs.readdir(fixture,{recursive:true})).map(f=>f.replaceAll('\\','/')));
 files.add('index.html');files.add('styles.css');
 server=createServer(async(req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';
  if(name.includes('..')||!files.has(name)){res.writeHead(404);res.end();return;}
  const root=['index.html','styles.css'].includes(name)?scratch:fixture;
  try{const data=await fs.readFile(path.join(root,name));const ext=path.extname(name);res.writeHead(200,{'Content-Type':({'.html':'text/html;charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json'})[ext]||'application/octet-stream','Cache-Control':'no-store'});res.end(data)}catch{res.writeHead(404);res.end()}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
 await page.locator('#importFile').setInputFiles(path.join(here,'synthetic-full.json'));
 await page.locator('#dashboard').waitFor({state:'visible',timeout:30000});
 const snapshot=()=>page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))));
 const before=await snapshot();
 assert.equal((await page.locator('[data-tab="mortality"]').innerText()).trim(),'もしものときの家計を比較');
 assert.match((await page.locator('[data-tab="allcsv"]').innerText()).trim(),/CSV出力/,'Runtime navigation may use its own display label; verify the action remains identifiable');
 assert.equal((await page.locator('[data-group="budget"]').innerText()).trim(),'予算を設定');
 evidence.cases.push('navigation labels');
 const options=await page.locator('#detailCsvSource option').evaluateAll(ns=>ns.map(n=>n.value));
 assert.deepEqual(options,['','work-v0.9.7','public-v0.9']);
 assert.equal(await page.locator('#detailCsvSource').getAttribute('aria-describedby'),'detailCsvSourceHelp');
 evidence.cases.push('CSV value compatibility');
 await page.locator('[data-group="results"]').click();await page.locator('[data-tab="cashflow"]').click();
 const link=page.locator('#cashflow [data-open-tab="pension"]');
 assert.match(await link.evaluate(n=>getComputedStyle(n).textDecorationLine),/underline/);
 await page.locator('#cashflow [data-open-tab="budget"]').click();assert.equal(await page.locator('#budget').isVisible(),true);
 await page.locator('[data-group="results"]').click();await page.locator('[data-tab="cashflow"]').click();
 await page.locator('#cashflow [data-open-tab="expenses"]').click();assert.equal(await page.locator('#expenses').isVisible(),true);
 evidence.cases.push('navigation and underline');
 assert.equal(await snapshot(),before);assert.deepEqual(errors,[]);
 evidence.cases.push('saved data unchanged and no runtime error');
 console.log(JSON.stringify({...evidence,result:'pass'},null,2));
}catch(err){console.error(JSON.stringify({...evidence,result:'fail',reason:String(err)},null,2));process.exitCode=1}
finally{if(browser)await browser.close().catch(()=>{});if(server)await new Promise(ok=>server.close(ok));await fs.rm(scratch,{recursive:true,force:true})}
