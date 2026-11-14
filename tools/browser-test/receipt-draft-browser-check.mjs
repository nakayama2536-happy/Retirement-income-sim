// Isolated Chromium test: actual file chooser for receipt draft, fictional values only.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';

const root=resolve('.'), blocked=[],errors=[];
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/receipt-test'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end('<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body></body></html>');return;}
  const target=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(req.method!=='GET'||!target.startsWith(root+sep)||target.includes('/.git/')||!['.html','.mjs','.js','.css','.json','.png','.svg'].includes(extname(target))){res.writeHead(404).end();return;}
  const bytes=await readFile(target);
  res.writeHead(200,{'Content-Type':extname(target)==='.mjs'||extname(target)==='.js'?'text/javascript':extname(target)==='.html'?'text/html':extname(target)==='.css'?'text/css':'text/plain','Cache-Control':'no-store'});res.end(bytes);
 }catch{res.writeHead(404).end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'});
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();blocked.push(route.request().url());return route.abort();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/receipt-test',{waitUntil:'domcontentloaded'});
 // Mount the real, shipping comparison UI without touching the adopted application form.
 await page.evaluate(async()=>{const {mountReceiptComparison}=await import('/receipt-comparison-ui.mjs');const host=document.createElement('div');host.id='isolatedReceiptDraftTest';document.body.append(host);mountReceiptComparison(host);});
 const scope=page.locator('#isolatedReceiptDraftTest');
 await scope.locator('[name="companyGross"]').fill('1500');
 await scope.locator('[name="companyReceipt"]').fill('2040-08-15');
 await scope.locator('[name="idecoGross"]').fill('850');
 await scope.locator('[name="allGeneral"]').check();
 const downloaded=page.waitForEvent('download');
 await scope.locator('#receiptDraftExport').click();
 const file=await downloaded;assert.match(file.suggestedFilename(),/receipt-comparison-draft\.json/);
 const stream=await file.createReadStream();const chunks=[];for await(const part of stream)chunks.push(part);
 const buffer=Buffer.concat(chunks),payload=JSON.parse(buffer.toString());
 assert.equal(payload.values.companyGross,'1500');
 await scope.locator('[name="companyGross"]').fill('900');
 await scope.locator('#receiptDraftImport').setInputFiles({name:'restored.json',mimeType:'application/json',buffer});
 await assert.doesNotReject(()=>scope.locator('#receiptDraftStatus').getByText('比較用下書きを読み込みました。税務確認を再度チェックしてください。').waitFor());
 assert.equal(await scope.locator('[name="companyGross"]').inputValue(),'1500');
 assert.equal(await scope.locator('[name="companyReceipt"]').inputValue(),'2040-08-15');
 assert.equal(await scope.locator('[name="allGeneral"]').isChecked(),false,'tax confirmations require reconfirmation');
 // A bad file must not partially overwrite the form.
 await scope.locator('#receiptDraftImport').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":99}')});
 await scope.locator('#receiptDraftStatus').getByText(/読込み失敗/).waitFor();
 assert.equal(await scope.locator('[name="companyGross"]').inputValue(),'1500');
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
 console.log('RECEIPT_DRAFT_BROWSER_PASS export/import/validation/reconfirmation');
 await context.close();
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
