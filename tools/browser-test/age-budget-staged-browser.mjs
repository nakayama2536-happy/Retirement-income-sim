/** Browser acceptance of a staged release, using only synthetic fixture data. */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {stageAgeBudgetRelease} from '../stage-age-budget-release.mjs';
import {build} from '../package-public.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'lifeplan-age-browser-'));
let server,browser;const evidence={mode:'isolated-staged-candidate',synthetic:true,published:false,cases:[]};
try{
 const stage=path.join(tmp,'stage'),pub=path.join(tmp,'public');
 stageAgeBudgetRelease(root,stage,'v0.9.33-age-budget-preview-20261103');
 build(stage,pub);
 const manifest=JSON.parse(await fs.readFile(path.join(pub,'distribution-manifest.json'),'utf8'));
 const allowed=new Set([...manifest.files.map(f=>f.name),'distribution-manifest.json']);
 const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
 server=createServer(async(req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!allowed.has(name)||name.includes('..')){res.writeHead(404);res.end();return;}
  try{const bytes=await fs.readFile(path.join(pub,name));res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}
  catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
 await page.locator('#importFile').setInputFiles(path.join(here,'synthetic-full.json'));
 await page.locator('#dashboard').waitFor({state:'visible',timeout:30000});
 await page.locator('[data-group="results"]').click();
 await page.locator('[data-tab="cashflow"]').click();
 const panel=page.locator('#ageBudgetReferencePanel');
 await panel.waitFor({state:'attached'});
 await panel.locator('summary').click();
 await panel.locator('button').first().click();
 const message=(await panel.locator('[role="status"]').innerText()).trim();
 assert.match(message,/未反映の参考比較/,'synthetic fixture must support age-80 comparison: '+message);
 const downloadButton=panel.locator('button').nth(1);
 assert.equal(await downloadButton.isDisabled(),false);
 const pending=page.waitForEvent('download');
 await downloadButton.click();
 const download=await pending;
 assert.match(download.suggestedFilename(),/age-budget-preview\.csv$/);
 const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);
 const csv=Buffer.concat(chunks).toString('utf8');
 assert.match(csv,/変更前支出_万円/);assert.match(csv,/未採用・参考比較/);
 assert.deepEqual(errors,[]);
 evidence.cases.push({id:'age-budget-visible-preview-csv',status:'pass',csvBytes:Buffer.byteLength(csv)});
 await context.close();
}finally{
 if(browser)await browser.close();
 if(server)await new Promise(resolve=>server.close(resolve));
 await fs.rm(tmp,{recursive:true,force:true});
 const output=path.join(here,'browser-results');await fs.mkdir(output,{recursive:true});
 await fs.writeFile(path.join(output,'age-budget-staged-acceptance.json'),JSON.stringify(evidence,null,2)+'\n');
}
