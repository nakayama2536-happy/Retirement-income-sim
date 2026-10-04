import {inspectMigration,migrateSelected,MIGRATION_KEYS} from './migration.mjs';

export function mountMigration({document=globalThis.document,storage=globalThis.localStorage,onCommit}){
  const el=id=>document.getElementById(id);
  const panel=el('migrationPanel'),select=el('migrationChoice'),accept=el('migrationConfigOnly'),button=el('migrationApply'),status=el('migrationStatus');
  let inspection,stale=false,busy=false;
  function selection(){
    const candidate=inspection?.candidates.find(c=>c.id===select.value);
    el('migrationConfigOnlyRow').hidden=!candidate?.configOnly;
    button.disabled=busy||stale||inspection?.integrated.status!=='absent'||!candidate?.valid||(candidate.configOnly&&!accept.checked);
  }
  function render(){
    try{inspection=inspectMigration(storage);}catch(e){panel.hidden=false;status.textContent=`保存領域を読み取れません。${e.message}`;button.disabled=true;return;}
    stale=false;accept.checked=false;select.replaceChildren();
    const empty=document.createElement('option');empty.value='';empty.textContent='引き継ぐ保存元を選択';select.append(empty);
    for(const c of inspection.candidates){
      const option=document.createElement('option');option.value=c.id;option.disabled=!c.valid;
      option.textContent=c.valid?`${c.label}：開始資産 ${c.state.config.plan.initialAsset}万円／比較案 ${c.state.scenarios.length}件${c.configOnly?'（設定のみ）':''}`:`${c.label}：利用不可（${c.error}）`;
      select.append(option);
    }
    select.value='';panel.hidden=inspection.integrated.status==='absent'&&!inspection.candidates.length;
    status.textContent=inspection.integrated.status==='valid'?'保存済みの統合状態を保持しています。旧候補は採用しません。':inspection.integrated.status==='invalid'?`統合状態の読込みを停止しました。旧設定には戻しません。${inspection.integrated.error}`:'候補は未採用です。同じ保存元の設定と比較案だけを引き継ぎます。';
    selection();
  }
  select.addEventListener('change',()=>{accept.checked=false;selection();});
  accept.addEventListener('change',selection);
  button.addEventListener('click',()=>{
    if(button.disabled||busy)return;
    busy=true;selection();
    let saved;
    try{saved=migrateSelected(inspection,select.value,{acceptConfigOnly:accept.checked,storage});}
    catch(e){status.textContent=`保存できませんでした。候補と元データを保持しています。${e.message}`;busy=false;selection();return;}
    render();status.textContent='引継ぎを保存しました。元の保存キーも保持しています。';
    try{onCommit(saved.state);}catch{status.textContent+=' 表示更新に失敗しました。再読み込みしてください。';}
    busy=false;selection();
  });
  el('migrationRescan').addEventListener('click',render);
  render();
  return {invalidate(event){if(event.key===null||MIGRATION_KEYS.includes(event.key)){stale=true;status.textContent='別画面で保存内容が変わりました。再読み込みしてから候補を確認してください。';selection();}},render};
}
