/** Repositions existing sync controls. Does not create any new persistence or cloud operation. */
export function organiseSyncTwoFlows({root,connection,checkActions,actions,safety,manualCard,first,initial,conflict,session,daily,automatic,registered}){
 const mandatory=[root,connection,checkActions,safety,manualCard,first,initial,conflict,actions?.[2],actions?.[3],actions?.[4],actions?.[6],actions?.[7]];
 if(mandatory.some(x=>!x)||typeof registered!=='function')throw TypeError('同期画面の構成が変わりました');
 const doc=root.ownerDocument,make=(tag,text,cls='')=>{const x=doc.createElement(tag);x.className=cls;if(text)x.textContent=text;return x;};
 const shell=make('section','','sync-two-flows'),selector=make('div','','sync-two-flows__selector');
 const choices={};
 for(const [mode,label] of [['upload','パソコンからクラウドへ保存'],['download','スマホでクラウドから読み込む']]){
  const b=make('button',label,'sync-two-flows__choice');b.type='button';b.dataset.flow=mode;b.setAttribute('aria-pressed','false');selector.append(b);choices[mode]=b;
 }
 const flows={};
 for(const [mode,label,description] of [
  ['upload','パソコンからクラウドへ保存','この端末の採用済み計画をクラウドへ送ります。'],
  ['download','スマホでクラウドから読み込む','クラウドの計画をこの端末へ取り込みます。端末の保存内容を置き換える場合があります。']]){
  const panel=make('section','','sync-two-flows__path');panel.dataset.flowPanel=mode;
  panel.append(make('h4',label),make('p',description,'cloud-help'));
  const steps={};
  for(const [key,title] of [['connect','1. 接続・暗号化解除'],['compare','2. 保存内容の差分を確認'],['backup','3. バックアップを確認'],['action','4. 保存・読込を実行'],['answer','5. 操作結果を確認']]){
   const s=make('section','','sync-two-flows__step');s.dataset.flowStep=key;s.append(make('h5',title));panel.append(s);steps[key]=s;
  }
  steps.answer.append(make('p','上の実行ボタン直下に結果が表示されます。保存済みかどうかを確認してください。','cloud-help'));
  flows[mode]={panel,steps};shell.append(panel);
 }
 // Existing buttons are moved with their original listeners and answer nodes, never cloned.
 const wrappers={};
 for(const n of [2,3,6,7]){wrappers[n]=actions[n].closest('.cloud-action');if(!wrappers[n])throw TypeError('操作ボタンが見つかりません');}
 actions[4].textContent='保存内容の差分を確認する';
 actions[2].textContent='クラウドに保存する';
 actions[3].textContent='スマホに読み込む';
 actions[6].textContent='クラウドを初期登録する';
 actions[7].textContent='クラウドから利用開始する';
 flows.upload.steps.action.append(wrappers[2],wrappers[6]);
 flows.download.steps.action.append(wrappers[3],wrappers[7]);
 if(first.parentNode===initial)initial.removeChild(first);
 const advanced=make('details','','sync-two-flows__advanced');
 advanced.append(make('summary','詳細設定・競合時の対処（通常は操作不要）'),initial,manualCard);
 if(session)advanced.append(session);
 if(automatic)advanced.append(automatic);
 advanced.append(conflict);
 if(daily?.parentNode)daily.remove();
 shell.prepend(selector);root.append(shell,advanced);
 let active='upload';
 function renderVisibility(){
  const enrolled=registered();
  wrappers[2].hidden=!enrolled;wrappers[3].hidden=!enrolled;
  wrappers[6].hidden=enrolled;wrappers[7].hidden=enrolled;
 }
 function activate(mode){
  active=mode;
  for(const [k,f] of Object.entries(flows))f.panel.hidden=k!==mode;
  for(const [k,b] of Object.entries(choices))b.setAttribute('aria-pressed',String(k===mode));
  const step=flows[mode].steps;
  step.connect.append(connection);
  step.compare.append(checkActions);
  step.backup.append(safety);
  renderVisibility();
 }
 choices.upload.addEventListener('click',()=>activate('upload'));
 choices.download.addEventListener('click',()=>activate('download'));
 activate('upload');
 return {activate,renderVisibility,get active(){return active;}};
}
