// Build ONLY an isolated fictional two-device diagnostic candidate. No deployment.
import {readFileSync,lstatSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {PAIR_CHANNEL,PAIR_PROJECT} from './pair-policy.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
export const PAIR_FILES=Object.freeze({
 'index.html':'tools/firebase-pair/pair.html',
 'tools/firebase-pair/pair.mjs':'tools/firebase-pair/pair.mjs',
 'tools/firebase-pair/pair-policy.mjs':'tools/firebase-pair/pair-policy.mjs',
 'tools/firebase-pair/pair.css':'tools/firebase-pair/pair.css',
 'tools/firebase-mobile/mobile-policy.mjs':'tools/firebase-mobile/mobile-policy.mjs',
 'tools/firebase-emulator/encrypted-sandbox-check.mjs':'tools/firebase-emulator/encrypted-sandbox-check.mjs',
 'sync-crypto.mjs':'sync-crypto.mjs'
});
export const PAIR_CSP="default-src 'none'; script-src 'self' https://www.gstatic.com/firebasejs/12.19.0/; style-src 'self'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; worker-src 'none'";
export const PAIR_HEADERS=Object.freeze([
 {key:'Content-Security-Policy',value:PAIR_CSP},
 {key:'Cache-Control',value:'no-store, max-age=0'},
 {key:'Referrer-Policy',value:'no-referrer'},
 {key:'X-Content-Type-Options',value:'nosniff'},
 {key:'X-Frame-Options',value:'DENY'},
 {key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'},
 {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(), payment=()'}
]);
export function buildPairedCandidate(destination){
 const output=resolve(destination);
 if(output===root||output.startsWith(root+'/')||output===here)throw Error('Output must be outside repository');
 const files=Object.entries(PAIR_FILES).map(([target,source])=>{
  const path=resolve(root,source);
  const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink())throw Error('Non-regular source: '+source);
  if(!/^[a-z0-9._/-]+$/i.test(target)||target.includes('..'))throw Error('Unexpected target');
  return {target,bytes:readFileSync(path)};
 });
 files.push({target:'robots.txt',bytes:Buffer.from('User-agent: *\nDisallow: /\n','utf8')});
 mkdirSync(output); // Refuse accidental overwrite or repeat deployments.
 const dir=join(output,'public');mkdirSync(dir);
 const hashes=[];
 for(const {target,bytes} of files){
  const dest=resolve(dir,target);
  if(!dest.startsWith(dir+'/'))throw Error('Path escaped public directory');
  mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,bytes,{flag:'wx'});
  hashes.push({path:target,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 writeFileSync(join(output,'bundle-sha256.json'),JSON.stringify({purpose:'synthetic-pc-iphone-bridge',project:PAIR_PROJECT,channel:PAIR_CHANNEL,deployed:false,files:hashes},null,2)+'\n',{flag:'wx'});
 writeFileSync(join(output,'firebase.json'),JSON.stringify({hosting:{site:PAIR_PROJECT,public:'public',headers:[{source:'**',headers:PAIR_HEADERS}]}},null,2)+'\n',{flag:'wx'});
 writeFileSync(join(output,'APPROVAL_REQUIRED.json'),JSON.stringify({
  project:PAIR_PROJECT,site:PAIR_PROJECT,channel:PAIR_CHANNEL,
  approvalStatus:'not-approved',published:false,automaticDeploy:false,
  expiryExtensionAllowed:false,realPersonalDataAllowed:false,
  rulesModificationAllowed:false,productionDeploymentAllowed:false,
  scope:'new separate temporary preview channel; synthetic-only two-device ciphertext test',
  previousEncryptedMobilePreviewMustRemainUnchanged:true
 },null,2)+'\n',{flag:'wx'});
 writeFileSync(join(output,'READ_BEFORE_DEPLOY.md'),[
  '# 非公開作業者向け：PC-iPhone架空暗号文の受渡しプレビュー候補',
  '',
  '状態：未承認・未公開。GitHub Actionsの配布候補であってFirebaseへの配信ではありません。',
  '公開先候補：lifeplan-sync-sandbox / pair-check。既存 encrypted-mobile を置換しない。',
  'Firestoreは既存の検証専用 Rules と sandbox/{テストUID}/snapshots/trial のみ。',
  '既存 trial 文書があれば試験を停止。新規作成・確認応答・限定削除の手順。',
  '本番アプリ、本人のブラウザ保存、本人用Firebase、課金、Auth/Rulesは変更しない。',
  '公開する場合は新規チャネル・有効期限・影響・戻し方を具体化し、別途承認を取得すること。',
  '使用する試験ログイン情報・UID・合言葉をGitHub、配布物、チャットに保存しない。',
  '失敗時は同じ trial 文書を盲目的に再試行・削除せず、状態確認を優先する。',
  ''
 ].join('\n'),{flag:'wx'});
 return {files:hashes.length,project:PAIR_PROJECT,channel:PAIR_CHANNEL,deployed:false,approvalStatus:'not-approved'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Usage: node tools/firebase-pair/prepare.mjs NEW_OUTPUT');
 console.log(JSON.stringify(buildPairedCandidate(process.argv[2])));
}
