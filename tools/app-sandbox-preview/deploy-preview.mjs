// Authorized one-time synthetic-only Hosting publisher. Runs on user's Firebase-authenticated PC.
// Never reads credentials, Firestore records, user's app data or personal backups.
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const home=dirname(fileURLToPath(import.meta.url));
const project='lifeplan-sync-sandbox',channel='app-sync-check';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=s=>{throw Error('停止：'+s)};
const json=name=>JSON.parse(readFileSync(resolve(home,name),'utf8'));
const clean=text=>String(text??'').replace(/\x1b\[[0-9;]*m/g,'');
function audit(){
 const scope=json('APPROVED_SCOPE.json'),list=json('PREVIEW_SHA256.json'),fb=json('firebase.json');
 if(scope.project!==project||scope.site!==project||scope.channel!==channel||scope.expires!=='7d'||
  scope.noAuthorizedDomains!==true||scope.requiresFirestoreRuleChange!==false||
  scope.liveChannelAllowed!==false||scope.existingChannelsMustNotBeReplaced!==true||
  scope.appAdapterTestPath!=='sandbox/{uid}/snapshots/trial')fail('承認済み検証用範囲が一致しません');
 if(Object.keys(fb).join(',')!=='hosting'||fb.hosting?.site!==project||fb.hosting?.public!=='public'||
  !Array.isArray(fb.hosting.headers)||fb.hosting.headers.length!==1)fail('Firebase Hosting以外の配信設定が存在します');
 const headers=fb.hosting.headers[0].headers||[],map=Object.fromEntries(headers.map(x=>[x.key,x.value]));
 if(!String(map['Content-Security-Policy']||'').includes("frame-ancestors 'none'")||
    !String(map['Cache-Control']||'').includes('no-store')||
    !String(map['X-Robots-Tag']||'').includes('noindex'))fail('安全ヘッダーが不足しています');
 if(list.project!==project||list.channel!==channel||!Array.isArray(list.files)||list.files.length<50)fail('公開ファイル一覧が不正です');
 const permitted=new Set(list.files.map(f=>f.name));let seen=0;
 function walk(path){
  for(const n of readdirSync(path)){
   const abs=resolve(path,n),stat=lstatSync(abs);
   if(stat.isSymbolicLink())fail('公開範囲にシンボリックリンクがあります');
   if(stat.isDirectory())walk(abs);
   else if(stat.isFile()){
    const name=relative(resolve(home,'public'),abs).split(sep).join('/');
    if(!permitted.has(name))fail('追加公開ファイルは禁止です：'+name);
    seen++;
   }else fail('不正なファイル形式');
  }
 }
 walk(resolve(home,'public'));if(seen!==permitted.size)fail('公開ファイル数が不一致です');
 for(const file of list.files){
  if(!/^[a-z0-9._/-]+$/i.test(file.name)||file.name.includes('..'))fail('公開パスが不正');
  const abs=resolve(home,'public',file.name),stat=lstatSync(abs);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==file.size||sha(readFileSync(abs))!==file.sha256)
   fail('公開ファイルの内容不一致：'+file.name);
 }
 if(readFileSync(resolve(home,'public','sync-firebase.mjs'),'utf8').includes("dbApi.doc(db,'owners',user().uid,'snapshots','current')"))
  fail('本番用Firestoreパスが検証プレビューに残っています');
 console.log('公開前安全確認：'+permitted.size+'/'+permitted.size+' SHA256一致');
 return list;
}
function cli(args,timeout=100000){
 const cmd=process.platform==='win32'?'firebase.cmd':'firebase';
 const r=spawnSync(cmd,args,{cwd:home,encoding:'utf8',timeout,windowsHide:true,shell:process.platform==='win32'});
 if(r.error||r.status!==0)fail('Firebase CLIの読取り・公開に失敗しました。再実行せず状態を確認してください');
 return clean(r.stdout)+'\n'+clean(r.stderr);
}
function channelRow(table,id){
 const lines=table.split(/\r?\n/);
 return lines.map(s=>s.trim().replace(/^[|│┃║]\s*/, '').trim())
  .find(s=>new RegExp('^'+id+'(?=\\s|[|│┃║]|$)').test(s))??null;
}
async function remoteVerify(url,list){
 if(!/^https:\/\/lifeplan-sync-sandbox--app-sync-check-[a-z0-9-]+\.web\.app\/$/.test(url))
  fail('正しい新規検証プレビューURLを確認できません');
 for(const file of list.files){
  const response=await fetch(new URL('/'+file.name,url),{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(18000)});
  if(!response.ok||response.redirected)fail('公開済みの取得エラー：'+file.name+'。再配信せず確認してください');
  const data=Buffer.from(await response.arrayBuffer());
  if(data.length!==file.size||sha(data)!==file.sha256)
   fail('公開された内容が候補と一致しません：'+file.name);
 }
 const root=await fetch(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(18000)});
 if(!root.ok||sha(Buffer.from(await root.arrayBuffer()))!==list.files.find(f=>f.name==='index.html')?.sha256)
  fail('トップページの公開内容を確認できません');
 const config=await fetch(new URL('/__/firebase/init.json',url),{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(18000)});
 if(!config.ok||!/application\/json/.test(config.headers.get('content-type')||''))fail('Firebase公開設定を確認できません');
 const data=await config.json();
 if(data.projectId!==project||data.authDomain!==project+'.firebaseapp.com'||typeof data.apiKey!=='string'||!data.apiKey)
  fail('Firebase接続先が検証用プロジェクトではありません');
 return {appIdPresent:typeof data.appId==='string'&&Boolean(data.appId)};
}
async function main(){
 const mode=process.argv[2]??'--files-only';
 if(!['--files-only','--publish'].includes(mode))fail('node deploy-preview.mjs --files-only または --publish');
 const list=audit();
 if(mode==='--files-only'){console.log('クラウド書込み・配信なし');return;}
 const help=cli(['hosting:channel:deploy','--help']);
 if(!help.includes('--expires')||!help.includes('--no-authorized-domains'))
  fail('安全なCLIフラグに対応していません');
 const sites=cli(['hosting:sites:list','--project',project]);
 if(!sites.includes(project+'.web.app'))fail('既存の検証用Hostingサイトを確認できません');
 const before=cli(['hosting:channel:list','--project',project,'--site',project]);
 const old=channelRow(before,'encrypted-mobile'),paired=channelRow(before,'pair-check'),live=channelRow(before,'live');
 if(!old||!paired||!live)fail('既存の3チャンネルが確認できません');
 if(channelRow(before,channel))fail('同名のプレビューがすでにあります。再公開しません');
 let deployOutput='';
 try{deployOutput=cli(['hosting:channel:deploy',channel,'--project',project,'--config','firebase.json','--expires','7d','--no-authorized-domains'],240000);}
 catch(e){console.error('公開状態が不明です。再実行・削除せずチャンネル一覧を確認してください');throw e;}
 const correct=deployOutput.match(/https:\/\/lifeplan-sync-sandbox--app-sync-check-[a-z0-9-]+\.web\.app/i)?.[0];
 if(!correct)fail('公開URLが取得できません。再配信しないでください');
 console.log('Firebase公開報告：'+correct+'/');
 const after=cli(['hosting:channel:list','--project',project,'--site',project]);
 if(!channelRow(after,channel)||channelRow(after,'encrypted-mobile')!==old||
   channelRow(after,'pair-check')!==paired||channelRow(after,'live')!==live)
  fail('既存のプレビュー状態の維持を確認できません');
 try{
  const result=await remoteVerify(correct+'/',list);
  console.log('APP_SANDBOX_PREVIEW_PUBLISHED_AND_VERIFIED');
  console.log('検証URL：'+correct+'/setup.html');
  console.log('appId自動入力：'+(result.appIdPresent?'あり':'なし（入力欄で設定が必要）'));
  console.log('公開期限：7日間。Firebase CLIのチャンネル一覧でも確認してください');
 }catch(e){console.error('公開済みの可能性があります。再公開・自動削除は禁止します。');throw e;}
}
main().catch(e=>{console.error(String(e?.message??'安全確認に失敗').slice(0,400));process.exitCode=1;});
