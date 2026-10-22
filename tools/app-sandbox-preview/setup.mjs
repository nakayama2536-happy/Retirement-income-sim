// Synthetic-only fixture installer for separate app-sync-check preview origin.
const STATE_KEY='lifeplan-sim-state-v1';
const PUBLIC_CONFIG='lifeplan-private-sync-config-v1';
const SOURCE_RUN='lifeplan-app-sandbox-source-run-v1';
const SIGNATURE='LIFEPLAN-APP-SANDBOX-SYNTHETIC-ONLY';
const byId=name=>document.getElementById(name);
const status=byId('localStatus'),buttons=['seedPc','seedPhone','cleanup'].map(byId);
const result=byId('result');
const allowedOrigin=()=>{
 const url=new URL(location.href);
 return url.protocol==='https:'&&!url.search&&!url.hash&&!url.username&&!url.password&&!url.port&&
 /^lifeplan-sync-sandbox--app-sync-check-[a-z0-9-]+\.web\.app$/.test(url.hostname)&&url.pathname==='/setup.html'&&window.top===window.self;
};
function safeStatus(message){status.textContent=message;}
function checkLocal(){
 if(!allowedOrigin()){safeStatus('この検証専用プレビューURLで開いてください。接続していません。');return false;}
 const existing=localStorage.getItem(STATE_KEY);
 const marker=localStorage.getItem(SOURCE_RUN);
 const cloudMarker=localStorage.getItem('lifeplan-private-sync-marker-v1');
 if(existing!==null||cloudMarker!==null||marker!==null){
  safeStatus('既にこの検証サイトの端末保存があります。上書きしません。作成済みデータはアプリで確認してください。');
  return false;
 }
 safeStatus('この検証専用オリジンには既存のアプリ保存データがありません。架空データだけを新規作成できます。');
 return true;
}
function update(){
 const canSeed=checkLocal();
 byId('seedPc').disabled=!canSeed;
 byId('seedPhone').disabled=!canSeed;
 byId('cleanup').disabled=!allowedOrigin()||!localStorage.getItem(SOURCE_RUN);
 if(allowedOrigin()&&localStorage.getItem(SOURCE_RUN))
  safeStatus('PCの架空試験IDを保持しています。実機同期完了後は、検証用データだけを照合して削除してください。');
}
async function setPublicConfig(){
 try{
  const response=await fetch('/__/firebase/init.json',{credentials:'omit',cache:'no-store',redirect:'error'});
  if(!response.ok||response.redirected) return;
  const raw=await response.json();
  if(raw.projectId!=='lifeplan-sync-sandbox'||raw.authDomain!=='lifeplan-sync-sandbox.firebaseapp.com')return;
  const fields=['apiKey','authDomain','projectId','appId'];
  if(fields.some(k=>typeof raw[k]!=='string'||raw[k].length===0||raw[k].length>500))return;
  if(localStorage.getItem(PUBLIC_CONFIG)===null)
   localStorage.setItem(PUBLIC_CONFIG,JSON.stringify(Object.fromEntries(fields.map(k=>[k,raw[k]]))));
 }catch{/* Browser-only optional public setting. No login or cloud write. */}
}
async function seed(role){
 if(!checkLocal()){result.textContent='既存データあり。上書きを停止しました。';return;}
 const response=await fetch('/synthetic-fixture.json',{cache:'no-store',credentials:'omit',redirect:'error'});
 if(!response.ok||response.redirected)throw Error('架空データの公開元を確認できません。');
 const fixture=await response.json();
 if(fixture?.config?.meta?.label!=='架空検証専用'||!Array.isArray(fixture.scenarios)||fixture.scenarios.length!==2||
  fixture?.config?.plan?.initialAsset!==1000)throw Error('架空データの形式が一致しません。');
 const runId=crypto.randomUUID();
 if(role==='pc'){
  fixture.config.actuals['70']={endAsset:920,expense:10,taxSocial:1,note:'架空PC実績'};
  fixture.config.reviews['70']={items:{fictional_check:true},note:'架空PC年次点検'};
  fixture.syntheticEvidence={tag:SIGNATURE,origin:'pc',runId};
 }else{
  fixture.config.plan.initialAsset=987;
  fixture.scenarios=fixture.scenarios.slice(0,1);
  fixture.config.actuals['69']={endAsset:777,note:'架空iPhone旧実績'};
  fixture.config.reviews['69']={items:{},note:'架空iPhone旧点検'};
  fixture.syntheticEvidence={tag:SIGNATURE,origin:'phone',runId};
 }
 // Verify compatibility without triggering application startup.
 const {validateSavedState}=await import('/migration.mjs');
 validateSavedState(fixture);
 if(!checkLocal())throw Error('準備中に端末保存の内容が変わりました。');
 localStorage.setItem(STATE_KEY,JSON.stringify(fixture));
 if(role==='pc')localStorage.setItem(SOURCE_RUN,runId);
 await setPublicConfig();
 result.textContent=(role==='pc'?'PC':'iPhone')+'：架空データをこの隔離プレビュー内だけに新規保存しました。アプリを開いて内容を確認してください。';
 update();
}
for(const [name,role] of [['seedPc','pc'],['seedPhone','phone']]){
 byId(name).addEventListener('click',async()=>{
  buttons.forEach(b=>b.disabled=true);
  try{await seed(role);}catch{result.textContent='架空データの準備を停止しました。既存状態を確認してください。';}
  update();
 });
}
byId('cleanup').addEventListener('click',async()=>{
 buttons.forEach(b=>b.disabled=true);
 result.textContent='架空試験文書を照合中です。完了まで操作しないでください。';
 try{
  const client=await import('/tools/app-sandbox-preview/cleanup.mjs');
  result.textContent=await client.cleanupSandboxTrial({
   email:byId('email').value.trim(),password:byId('password').value,
   phrase:byId('phrase').value,confirmed:byId('confirmed').checked,
   runId:localStorage.getItem(SOURCE_RUN)
  });
 }catch{result.textContent='後片付けを確認できません。繰り返さず、試験文書を確認してください。';}
 finally{
  for(const id of ['email','password','phrase'])byId(id).value='';
  byId('confirmed').checked=false;
  update();
 }
});
update();
