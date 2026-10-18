// Create a fresh, allowlisted preview bundle ONLY. No Firebase CLI/API or deployment.
import {readFileSync,mkdirSync,writeFileSync,lstatSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {BUILD,PROJECT,CHANNEL} from './mobile-policy.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
export const FILES=Object.freeze({
 'index.html':'tools/firebase-mobile/mobile.html',
 'tools/firebase-mobile/mobile.mjs':'tools/firebase-mobile/mobile.mjs',
 'tools/firebase-mobile/mobile-policy.mjs':'tools/firebase-mobile/mobile-policy.mjs',
 'tools/firebase-mobile/mobile.css':'tools/firebase-mobile/mobile.css',
 'tools/firebase-emulator/encrypted-sandbox-check.mjs':'tools/firebase-emulator/encrypted-sandbox-check.mjs',
 'sync-crypto.mjs':'sync-crypto.mjs'
});
export const CSP="default-src 'none'; script-src 'self' https://www.gstatic.com/firebasejs/12.19.0/; style-src 'self'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; worker-src 'none'";
export const HEADERS=Object.freeze([
 {key:'Content-Security-Policy',value:CSP},
 {key:'Cache-Control',value:'no-store, max-age=0'},
 {key:'Referrer-Policy',value:'no-referrer'},
 {key:'X-Content-Type-Options',value:'nosniff'},
 {key:'X-Frame-Options',value:'DENY'},
 {key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'},
 {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(), payment=()'}
]);
export function prepareBundle(destination){
 const output=resolve(destination);
 // Do not overwrite any existing output or write inside the source tree.
 if(output===root||output.startsWith(root+'/'))throw Error('Choose a fresh destination outside the repository');
 const entries=Object.entries(FILES).map(([target,source])=>{
  const path=resolve(root,source);if(!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink())throw Error('Non-regular source');
  return [target,readFileSync(path)];
 });
 mkdirSync(output); // EEXIST is intentional: no silent replacement/removal.
 mkdirSync(resolve(output,'public'));
 const hashes=[];
 for(const [target,bytes] of [...entries,['robots.txt',Buffer.from('User-agent: *\nDisallow: /\n')]]){
  const path=resolve(output,'public',target);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes,{flag:'wx'});
  hashes.push({path:target,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 const configuration={hosting:{site:PROJECT,public:'public',ignore:['firebase.json','**/.*'],headers:[{source:'**',headers:HEADERS}]}};
 writeFileSync(resolve(output,'firebase.json'),JSON.stringify(configuration,null,2)+'\n',{flag:'wx'});
 writeFileSync(resolve(output,'bundle-sha256.json'),JSON.stringify({build:BUILD,files:hashes},null,2)+'\n',{flag:'wx'});
 writeFileSync(resolve(output,'APPROVAL_REQUIRED.json'),JSON.stringify({status:'unpublished',project:PROJECT,channel:CHANNEL,expires:'7d',scope:'sandbox Hosting preview static files only',notAuthorized:['hosting-live','production-main','github-pages','personal-data','rules-or-auth-changes','billing'],automaticDeploy:false},null,2)+'\n',{flag:'wx'});
 return {build:BUILD,destination:output,publicFileCount:hashes.length,bytes:hashes.reduce((s,f)=>s+f.bytes,0),deployed:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Usage: node tools/firebase-mobile/prepare.mjs NEW_DIRECTORY_OUTSIDE_REPO');
 console.log(JSON.stringify(prepareBundle(process.argv[2])));
}
