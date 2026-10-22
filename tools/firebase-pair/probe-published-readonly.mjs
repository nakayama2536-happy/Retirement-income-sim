// Independent post-publication HTTP observation. NO Firebase auth or writes.
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const site='https://lifeplan-sync-sandbox--pair-check-o9qjlshx.web.app/';
const old='https://lifeplan-sync-sandbox--encrypted-mobile-m6wu7a9n.web.app/';
const expected=[
 ['index.html',4165,'3c6424ce67e916c50258cad60d5720e44862d2e47311fd5df63a55f85c8e050c'],
 ['tools/firebase-pair/pair.mjs',9450,'78a4f66f55aa9d3107e1ed39f5698910b71aab2819da01714e772d2300af3438'],
 ['tools/firebase-pair/pair-policy.mjs',5145,'d933410f2797ed7dda4806f599bd5afa3d579f3517066af87a8027cefa6b09c2'],
 ['tools/firebase-pair/pair.css',1320,'77a3a6d5f89324821dd84f38b6db979575ebe1e272de491cb559ae8501f580ee'],
 ['tools/firebase-mobile/mobile-policy.mjs',5448,'4d414be2508ee903e10df1d2ffa15d683792291799aefb1c4344a9b07109af5b'],
 ['tools/firebase-emulator/encrypted-sandbox-check.mjs',8233,'182f7851e69a5b3d5b391f286a7d249dda8d0bb54a1e4782ba98a45f6cd5a2d4'],
 ['sync-crypto.mjs',4017,'2fa56ca0d4da521851298788d870e77f8b3df27c1fb4e0e2880281f519821c69'],
 ['robots.txt',26,'331ea9090db0c9f6f597bd9840fd5b171830f6e0b3ba1cb24dfa91f0c95aedc1']
];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={checkedAt:new Date().toISOString(),scope:'UNAUTHENTICATED_READ_ONLY_PUBLIC_HOSTING_GET',url:site,authenticated:false,postCount:0,firebaseWrites:0,deployments:0,files:[],root:null,config:null,oldPreview:null,result:'not-verified'};
async function read(target,cap=100000){
 try{
  const response=await fetch(target,{method:'GET',cache:'no-store',credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(13000)});
  const data=Buffer.from(await response.arrayBuffer());
  if(data.length>cap)return {status:response.status,tooLarge:true,size:data.length,bytes:null,headers:response.headers};
  return {status:response.status,size:data.length,bytes:data,headers:response.headers,location:response.headers.get('location')??''};
 }catch(e){return {error:e?.name==='TimeoutError'?'timeout':'network-unavailable'};}
}
for(const [path,size,sha] of expected){
 const r=await read(new URL('/'+path,site));
 const same=r.status===200&&r.bytes?.length===size&&digest(r.bytes)===sha;
 report.files.push({path,status:r.status??null,error:r.error??null,bytes:r.size??null,match:same,redirect:!!r.location});
}
const root=await read(site);
report.root={status:root.status??null,bytes:root.size??null,match:root.status===200&&root.bytes?.length===expected[0][1]&&digest(root.bytes)===expected[0][2],error:root.error??null,redirect:!!root.location};
const config=await read(new URL('/__/firebase/init.json',site),16384);
let matches=false;
try{
 if(config.status===200&&/application\/json/i.test(config.headers.get('content-type')??'')){
  const parsed=JSON.parse(config.bytes.toString('utf8'));
  matches=parsed.projectId==='lifeplan-sync-sandbox'&&parsed.authDomain==='lifeplan-sync-sandbox.firebaseapp.com'&&typeof parsed.apiKey==='string'&&parsed.apiKey.length>0;
 }
}catch{}
report.config={status:config.status??null,projectMatched:matches,error:config.error??null};
const control=await read(old);
report.oldPreview={status:control.status??null,error:control.error??null};
report.result=report.files.every(f=>f.match)&&report.root.match&&report.config.projectMatched?'verified':'NOT_VERIFIED';
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log('PAIR_HOSTING_READONLY '+JSON.stringify(report));
