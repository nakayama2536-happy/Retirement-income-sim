// Synthetic-only full-app preview builder. Does not deploy, access Firebase or private data.
import {readFileSync,mkdirSync,writeFileSync,lstatSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {collect} from '../package-public.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const digest=b=>createHash('sha256').update(b).digest('hex');
const TARGET='lifeplan-sync-sandbox',CHANNEL='app-sync-check';
const BASE_DOCUMENT="dbApi.doc(db,'owners',user().uid,'snapshots','current')";
const TEST_DOCUMENT="dbApi.doc(db,'sandbox',user().uid,'snapshots','trial')";
function patchOnce(source,find,next){
 if(source.split(find).length!==2)throw Error('Unexpected upstream source or multiple matches: '+find.slice(0,45));
 return source.replace(find,next);
}
export function prepareAppPreview(destination){
 const dest=resolve(destination);
 if(dest===root||dest.startsWith(root+'/')||dest===here)throw Error('Refusing in-repo output');
 const manifest=JSON.parse(readFileSync(join(root,'distribution-manifest.json'),'utf8'));
 const {out}=collect(root);
 const files=new Map();
 for(const entry of manifest.files){
  const name=entry.name;
  if(name==='README.md'||name.startsWith('docs/'))continue;
  const bytes=out.get(name);
  if(!bytes||bytes.length!==entry.size||digest(bytes)!==entry.sha256)throw Error('Distribution identity mismatch: '+name);
  files.set(name,bytes);
 }
 if(files.size<50||!files.has('index.html')||!files.has('sync-firebase.mjs')||!files.has('sw.js'))throw Error('Missing app runtime');
 const adapter=files.get('sync-firebase.mjs').toString('utf8');
 let testAdapter=patchOnce(adapter,BASE_DOCUMENT,TEST_DOCUMENT);
 // Preview-only compatibility: Hosting reserved init.json can omit appId.
 // FirebaseOptions.appId is optional for Email/Password Auth + Firestore here.
 // Do not synthesize an appId or change the app's source module.
 testAdapter=patchOnce(testAdapter,
  "const KEY_FIELDS=['apiKey','authDomain','projectId','appId'];",
  "const KEY_FIELDS=['apiKey','authDomain','projectId'];");
 testAdapter=patchOnce(testAdapter,
  "const config=Object.fromEntries(KEY_FIELDS.map(k=>[k,value[k]]));",
  "const config=Object.fromEntries(KEY_FIELDS.map(k=>[k,value[k]]));\n if(Object.hasOwn(value,'appId')){if(typeof value.appId!=='string'||!value.appId.trim()||value.appId.length>500)throw Error('Firebase appIdの形式が不正です。');config.appId=value.appId;}");

 const boundary=" return config;\n}";
 const guarded=" if(config.projectId!=='lifeplan-sync-sandbox'||config.authDomain!=='lifeplan-sync-sandbox.firebaseapp.com')throw Error('架空データ用Firebase以外は接続できません。');\n return config;\n}";
 testAdapter=patchOnce(testAdapter,boundary,guarded);
 files.set('sync-firebase.mjs',Buffer.from(testAdapter));
 const panel=files.get('sync-panel.mjs').toString('utf8');
 // Match the reviewed cloud UI's single configuration validation entry point.
 // Keep the production module unchanged; only this isolated preview allows
 // Hosting's omitted appId. Unknown upstream text still fails closed.
 const adjustedPanel=patchOnce(panel,
  "function values(){return validateFirebaseConfig(Object.fromEntries(Object.entries(cfg).map(([k,v])=>[k,v.value.trim()])));}",
  "function values(){const values=Object.fromEntries(Object.entries(cfg).map(([k,v])=>[k,v.value.trim()]));\n  if(!values.appId)delete values.appId; // preview only: optional appId if Hosting omitted it\n  return validateFirebaseConfig(values);}");
 files.set('sync-panel.mjs',Buffer.from(adjustedPanel));

 let html=files.get('index.html').toString('utf8');
 html=patchOnce(html,'</head>','<meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="/tools/app-sandbox-preview/guard.css"></head>');
 html=patchOnce(html,'<body class="simulation-only">','<body class="simulation-only"><aside class="sandbox-preview-banner" role="note">検証専用／架空データのみ。PC・iPhoneの普段のライフプランやバックアップを入力・復元しないでください。<a href="/setup.html">架空データの準備・検証終了</a></aside>');
 for(const id of ['importFile','importFile2','recoveryCheckFile']){
  html=patchOnce(html,'id="'+id+'" type="file"','id="'+id+'" type="file" disabled');
 }
 files.set('index.html',Buffer.from(html));
 for(const [name,src] of [
  ['setup.html','tools/app-sandbox-preview/setup.html'],
  ['tools/app-sandbox-preview/setup.mjs','tools/app-sandbox-preview/setup.mjs'],
  ['tools/app-sandbox-preview/cleanup.mjs','tools/app-sandbox-preview/cleanup.mjs'],
  ['tools/app-sandbox-preview/guard.css','tools/app-sandbox-preview/guard.css'],
  ['tools/firebase-emulator/encrypted-sandbox-check.mjs','tools/firebase-emulator/encrypted-sandbox-check.mjs'],
  ['synthetic-fixture.json','tools/browser-test/synthetic-full.json']
 ]){
  const path=resolve(root,src),st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink())throw Error('Unsafe bundled source: '+src);
  files.set(name,readFileSync(path));
 }
 if([...files.keys()].some(n=>n.includes('..')||n.startsWith('/')||!/^[a-zA-Z0-9_.\/-]+$/.test(n)))throw Error('Unsafe entry');
 mkdirSync(dest);mkdirSync(join(dest,'public'));
 const hashes=[];
 for(const [name,bytes] of files){
  const path=resolve(dest,'public',name);
  if(!path.startsWith(join(dest,'public')+'/'))throw Error('Traversal');
  mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes,{flag:'wx'});
  hashes.push({name,size:bytes.length,sha256:digest(bytes),source:'synthetic-app-preview'});
 }
 const headers=[
  {key:'Content-Security-Policy',value:"default-src 'none'; script-src 'self' https://www.gstatic.com/firebasejs/12.19.0/; style-src 'self'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com; img-src 'self' data:; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'"},
  {key:'Cache-Control',value:'no-store, max-age=0'},
  {key:'Referrer-Policy',value:'no-referrer'},
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'X-Frame-Options',value:'DENY'},
  {key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'}
 ];
 writeFileSync(join(dest,'firebase.json'),JSON.stringify({hosting:{site:TARGET,public:'public',headers:[{source:'**',headers}]}},null,2)+'\n');
 writeFileSync(join(dest,'APPROVED_SCOPE.json'),JSON.stringify({
  project:TARGET,site:TARGET,channel:CHANNEL,expires:'7d',noAuthorizedDomains:true,
  type:'separate-synthetic-only-preview',deployed:false,
  sourceRuntime:manifest.runtime,appAdapterOriginalPath:'owners/{uid}/snapshots/current',
  appAdapterTestPath:'sandbox/{uid}/snapshots/trial',requiresFirestoreRuleChange:false,
  requiresRealUserData:false,liveChannelAllowed:false,existingChannelsMustNotBeReplaced:true,
  userApproval:'2026-10-22 scope limited to isolated preview and sandbox synthetic testing'
 },null,2)+'\n');
 writeFileSync(join(dest,'PREVIEW_SHA256.json'),JSON.stringify({project:TARGET,channel:CHANNEL,sourceRuntime:manifest.runtime,files:hashes},null,2)+'\n');
 const publisher=resolve(root,'tools/app-sandbox-preview/deploy-preview.mjs');
 const pubStat=lstatSync(publisher);
 if(!pubStat.isFile()||pubStat.isSymbolicLink())throw Error('Unexpected deploy helper');
 writeFileSync(join(dest,'deploy-preview.mjs'),readFileSync(publisher),{flag:'wx'});
 writeFileSync(join(dest,'READ_ME_FIRST.txt'),[
  'ライフプランシミュレーター／架空データ専用の実アプリ検証プレビュー候補',
  '公開対象はpublic/だけ。個人条件・本人バックアップは一切含めない。',
  '対象 Firebase: lifeplan-sync-sandbox / app-sync-check (新しい別の7日間チャンネル)。',
  '検証用アプリに限り sync-firebase.mjs のFirestore文書を sandbox/{testUid}/snapshots/trial に変更。',
  '既存の検証用Firestore Rules・pair-check・encrypted-mobile・live・本人用プロジェクトを変更しない。',
  'PCとiPhoneは、必ず新URLのsetup.htmlで異なる架空データを生成してから利用。',
  '試験文書が空であることを確認し、最後にPCのsetup.htmlから照合・限定削除を実施。',
  '失敗や中断の場合は勝手に再配信・別文書削除・ルール変更を行わない。',
  '本体のownersパスを使った本番同期は、このsandbox検証だけでは確認できない。',
  ''
 ].join('\n'));
 return {files:hashes.length,originalRuntimeFiles:manifest.files.length,previewAdapterOverride:true,firestoreRuleChanged:false,deployed:false,channel:CHANNEL};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Usage: node tools/app-sandbox-preview/prepare.mjs NEW_DIR');
 console.log(JSON.stringify(prepareAppPreview(process.argv[2])));
}
