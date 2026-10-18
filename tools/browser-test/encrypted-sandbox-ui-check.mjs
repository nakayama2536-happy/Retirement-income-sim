// Isolated browser/UI test. Real WebCrypto, mocked Firebase SDK, no cloud access.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..'),out=resolve(here,'browser-results/encrypted');
await mkdir(out,{recursive:true});
const allowed=new Set(['/tools/firebase-emulator/live-encrypted.html','/tools/firebase-emulator/encrypted-sandbox-check.mjs','/sync-crypto.mjs']);
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(req.method!=='GET'||!allowed.has(path)){res.writeHead(404);res.end();return;}
  const body=await readFile(resolve(root,'.'+path));
  res.writeHead(200,{'Content-Type':path.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(body);
 }catch{res.writeHead(500);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const core=`
export function initializeApp(options,name){globalThis.__testCloud??={doc:null,writes:0,deletes:0,closed:0,tail:Promise.resolve()};return {options,name};}
export async function deleteApp(){globalThis.__testCloud.closed++;}
`;
const auth=`
export const inMemoryPersistence='in-memory';
export function getAuth(app){return {app};}
export async function setPersistence(_auth,p){if(p!=='in-memory')throw Error('unsafe-persistence');}
export async function signInWithEmailAndPassword(auth,email,password){if(!email||!password)throw Error('missing');auth.app.signedIn=true;return {user:{uid:'synthetic-browser-user'}};}
export async function getIdTokenResult(user){return {claims:{aud:'lifeplan-sync-sandbox',sub:user.uid}};}
export async function signOut(auth){auth.app.signedIn=false;}
`;
const database=`
export function getFirestore(app){return {app};}
export function doc(database,...parts){if(parts.join('/')!=='sandbox/synthetic-browser-user/snapshots/trial')throw Error('wrong-path');return {database};}
const snapshot=()=>{const v=structuredClone(globalThis.__testCloud.doc);return {exists:()=>v!==null,data:()=>v};};
export async function getDocFromServer(ref){if(!ref.database.app.signedIn)throw Object.assign(new Error('denied'),{code:'permission-denied'});return snapshot();}
export function serverTimestamp(){return {syntheticTimestamp:true};}
export function runTransaction(db,fn){const c=globalThis.__testCloud;const task=c.tail.then(async()=>{if(!db.app.signedIn)throw Object.assign(new Error('denied'),{code:'permission-denied'});let pending;const result=await fn({get:async()=>snapshot(),set(_ref,v){pending=structuredClone(v);},delete(){pending=null;}});if(pending!==undefined){c.doc=pending;if(pending===null)c.deletes++;else c.writes++;}return result;});c.tail=task.catch(()=>{});return task;}
export async function terminate(){}
`;
const mocks={'firebase-app.js':core,'firebase-auth.js':auth,'firebase-firestore.js':database};
const report={environment:'Chromium; real WebCrypto; mock Firebase SDK; no real cloud or personal data',cases:[]};
let browser;
try{
 browser=await chromium.launch({headless:true});report.browser=browser.version();
 const context=await browser.newContext({viewport:{width:390,height:844}}),requested=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1'){await route.continue();return;}
  const module=url.pathname.split('/').at(-1);
  if(url.origin==='https://www.gstatic.com'&&url.pathname.startsWith('/firebasejs/12.19.0/')&&mocks[module]){
   requested.push(module);await route.fulfill({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:mocks[module]});return;
  }
  await route.abort(); // No other external requests may escape this test.
 });
 const page=await context.newPage(),url=`http://127.0.0.1:${server.address().port}/tools/firebase-emulator/live-encrypted.html`;
 await page.goto(url);await page.waitForTimeout(100);
 assert.equal(requested.length,0);assert.equal(await page.locator('#run').isEnabled(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:resolve(out,'initial-390.png'),fullPage:true});
 report.cases.push({name:'initial layout, no eager SDK connection',pass:true});
 const fill=async(project='lifeplan-sync-sandbox')=>{
  for(const [name,value] of [['apiKey','synthetic-api-key'],['appId','synthetic-app'],['projectId',project],['email','synthetic@example.invalid'],['password','synthetic-only-password']])await page.locator(`[name=${name}]`).fill(value);
  await page.locator('[name=confirm]').check();
 };
 await fill('not-the-sandbox');await page.locator('#run').click();await page.waitForTimeout(100);
 assert.equal(requested.length,0);assert.equal(await page.locator('#run').isDisabled(),true);
 report.cases.push({name:'wrong project denied before any SDK connection',pass:true});
 await page.reload();await page.evaluate(()=>localStorage.setItem('lifeplan-sim-state-v1','SYNTHETIC-PRESERVE-ME'));
 await fill();await page.locator('#run').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('12/12 完了')&&globalThis.__testCloud?.closed===3,{},{timeout:30000});
 assert.equal(requested.length,3);
 const state=await page.evaluate(()=>({document:__testCloud.doc,writes:__testCloud.writes,deletes:__testCloud.deletes,closed:__testCloud.closed,marker:localStorage.getItem('lifeplan-sandbox-encrypted-test-incomplete-v1'),saved:localStorage.getItem('lifeplan-sim-state-v1')}));
 assert.deepEqual(state,{document:null,writes:2,deletes:1,closed:3,marker:null,saved:'SYNTHETIC-PRESERVE-ME'});
 assert.equal(await page.locator('[name=email]').inputValue(),'');assert.equal(await page.locator('[name=password]').inputValue(),'');
 assert.equal(await page.locator('#run').isDisabled(),true);
 report.cases.push({name:'12-step encrypted mock-cloud UI, cleanup, logout and unrelated saved state retained',pass:true,state});
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:resolve(out,`result-${width}.png`),fullPage:true});
 }
 await page.evaluate(()=>localStorage.setItem('lifeplan-sandbox-encrypted-test-incomplete-v1','1'));await page.reload();
 assert.equal(await page.locator('#run').isDisabled(),true);assert.match(await page.locator('#status').innerText(),/未確認/);assert.equal(requested.length,3);
 report.cases.push({name:'unfinished marker blocks repeated diagnostic without reconnecting',pass:true});
 console.log('ENCRYPTED_BROWSER_OK 4 cases; real crypto, mocked Firebase, no personal data.');
}catch(e){report.error=e.message;process.exitCode=1;console.error(e);}finally{
 report.passed=report.cases.filter(x=>x.pass).length;
 await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}
