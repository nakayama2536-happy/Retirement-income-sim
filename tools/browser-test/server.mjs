// Isolated localhost test fixture. Never serves arbitrary workspace files.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import readline from 'node:readline';
const here=path.dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
export async function createTestServer(){
 const manifest=JSON.parse(await fs.readFile(path.join(here,'manifest.json'),'utf8'));
 const files=new Map(await Promise.all(manifest.files.map(async item=>[item.path,await fs.readFile(path.join(here,'app',item.path))])));
 const sw=files.get('sw.js').toString();
 if(!sw.includes(manifest.cacheVersion))throw Error('Cache version mismatch');
 let mode='old';const log=[];
 const modes=['old','new','asset-failure','worker-failure','offline'];
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=pathname==='/'?'index.html':pathname.slice(1);
  let status=200,body=files.get(file);
  if(!['GET','HEAD'].includes(req.method)){status=405;body='method rejected';}
  else if(!body){status=404;body='not found';}
  else if(mode==='offline'||(mode==='asset-failure'&&file==='calc.mjs')||(mode==='worker-failure'&&file==='sw.js')){status=503;body='synthetic failure';}
  else if(file==='sw.js')body=sw.replace(manifest.cacheVersion,mode==='old'?'isolated-test-old':'isolated-test-new')+"\nself.addEventListener('message',e=>{if(e.data==='TEST_CACHE_ID')e.ports[0]?.postMessage(CACHE);});";
  log.push({method:req.method,path:pathname,status,mode});
  res.writeHead(status,{'Content-Type':mime[path.extname(file)]||'text/plain','Cache-Control':'no-store'});
  res.end(req.method==='HEAD'?undefined:body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {url:`http://127.0.0.1:${server.address().port}/`,setMode(value){if(!modes.includes(value))throw Error('Unknown mode');mode=value;},log,close:()=>new Promise(resolve=>server.close(resolve))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const test=await createTestServer();
 console.log(JSON.stringify({url:test.url,mode:'old',commands:'old | new | asset-failure | worker-failure | offline | status | exit'}));
 const input=readline.createInterface({input:process.stdin});
 input.on('line',async line=>{try{if(line==='exit'){input.close();await test.close();return;}if(line==='status')console.log(JSON.stringify(test.log));else{test.setMode(line.trim());console.log(JSON.stringify({mode:line.trim()}));}}catch(e){console.error(e.message);}});
}
