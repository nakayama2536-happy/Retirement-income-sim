// Unmounted candidate component for a read-only trial UI. Parent provides active config.
// No writes, no reading browser storage, no automatic adoption.
import {step8DraftFromConfig,step8ExistingView,step8SetField,step8Trial} from './step8-trial-workflow.mjs';
const fields=[
 ['startMonth','計算開始月（YYYY-MM）','text'],
 ['salaryLastMonth','給与生活の最終月（YYYY-MM／計算開始月の前月）','text'],
 ['priceBaseMonth','物価基準月（YYYY-MM）','text'],
 ['openingAsOfMonth','開始残高の評価月（YYYY-MM／前月末）','text'],
 ['openingAmount','評価月末の開始残高（万円）','number'],
 ['annuityStartMonth','iDeCo年金の初回受取月（YYYY-MM）','text']
];
export function mountStep8TrialCard(container,getConfig){
 if(!container||typeof getConfig!=='function')throw new TypeError('表示先と現在設定の読取り関数が必要です。');
 let lastSource=getConfig(),draft=step8DraftFromConfig(lastSource),lastTrial=null;
 const doc=container.ownerDocument??document;
 function node(tag,txt,attrs={}){const el=doc.createElement(tag);if(txt!=null)el.textContent=txt;for(const [k,v] of Object.entries(attrs)){el.setAttribute(k,v);}return el;}
 function line(txt){container.appendChild(node('p',txt));}
 function render(){
   container.replaceChildren();
   container.appendChild(node('h3','65歳開始にも対応する月次入力（未反映の比較用）'));
   line('現在の保存条件と今回の試算入力は別です。試算だけでは設定・比較案を変更しません。');
   const view=step8ExistingView(lastSource);
   line(`現在の設定：計算開始月 ${view.startMonth??'未確認'}／給与生活最終月 ${view.salaryLastMonth??'未設定'}／物価基準月 ${view.priceBaseMonth??'未設定'}／開始残高 ${view.startAsset??'未設定'} 万円`);
   line(`受取済み一時金の含有区分 ${view.assetScope??'旧形式または未設定'}／年金初回月 ${view.annuityStartMonth??'一時金月連動（旧形式）'}`);
   line('開始残高は評価月末の保有資産です。期末目標額とは違います。税・社会保険を反映したiDeCo年金の手取額は未検証です。');
   for(const [key,label,type] of fields){
     const wrap=node('label',label);const inp=node('input',null,{name:key,type,...(type==='number'?{step:'any',min:'0'}:{pattern:'[0-9]{4}-(0[1-9]|1[0-2])'})});
     inp.value=draft[key]??'';inp.addEventListener('input',()=>{let v=inp.value;if(key==='openingAmount')v=v===''?null:Number(v);draft=step8SetField(draft,key,v);lastTrial=null;out.textContent='';status.textContent='入力が変更されたため、前回の確認・試算は無効です。';confirmed.checked=false;});
     wrap.appendChild(inp);container.appendChild(wrap);
   }
   const scope=node('label','iDeCo資産の範囲');const s=node('select',null,{name:'idecoAssetScope'});
   for(const [v,t] of [['','未確認（選択が必要）'],['received-lump-only-v1','受取済み一時金を含む／未受取年金原資を含まない']]){
     const o=node('option',t);o.value=v;s.appendChild(o);
   }s.value=draft.idecoAssetScope;
   s.addEventListener('change',()=>{draft=step8SetField(draft,'idecoAssetScope',s.value);lastTrial=null;out.textContent='';confirmed.checked=false;status.textContent='資産範囲の変更により確認・試算は無効です。';});scope.appendChild(s);container.appendChild(scope);
   const legacy=node('label');const repl=node('input',null,{type:'checkbox'});repl.checked=draft.replaceLegacyScope;
   repl.addEventListener('change',()=>{draft=step8SetField(draft,'replaceLegacyScope',repl.checked);lastTrial=null;out.textContent='';confirmed.checked=false;status.textContent='旧区分の置換選択を変更したため再確認が必要です。';});
   legacy.append(repl,doc.createTextNode('旧iDeCo包含フラグを新しい明示範囲に置き換える（比較案内のみ）'));container.appendChild(legacy);
   const check=node('label');const confirmed=node('input',null,{type:'checkbox'});confirmed.checked=false;
   confirmed.addEventListener('change',()=>{draft=step8SetField(draft,'openingConfirmed',confirmed.checked);lastTrial=null;out.textContent='';status.textContent=confirmed.checked?'評価月と資産範囲を確認しました。試算はまだ未実行です。':'確認を取り消しました。';});
   check.append(confirmed,doc.createTextNode('開始資産の評価月・一時金含有・年金原資除外を確認した'));container.appendChild(check);
   const trial=node('button','変更後の資産を試算（未反映）',{type:'button'});container.appendChild(trial);
   const reset=node('button','入力を現在の保存設定に戻す',{type:'button'});container.appendChild(reset);
   const status=node('p','未試算。入力・確認が必要です。',{role:'status'});container.appendChild(status);
   const out=node('pre','',{role:'region','aria-label':'試算内容と結果'});container.appendChild(out);
   trial.addEventListener('click',()=>{
     const current=getConfig();if(JSON.stringify(current)!==JSON.stringify(lastSource)){lastSource=current;draft=step8DraftFromConfig(current);lastTrial=null;render();return;}
     lastTrial=step8Trial(lastSource,draft);
     if(!lastTrial.ok){status.textContent='試算できません。入力と関連する保存条件を確認してください。';out.textContent=lastTrial.issues.map(x=>`・${x.message}`).join('\n');return;}
     status.textContent='比較試算のみ完了。保存・採用はしていません。';
     out.textContent=[`計算開始月 ${lastTrial.changes.startMonth}（残高評価 ${lastTrial.changes.openingAsOfMonth}）`,`給与生活最終月 ${lastTrial.changes.salaryLastMonth}（翌月から資産負担）`,`物価基準 ${lastTrial.changes.priceBaseMonth}`,`開始残高 ${lastTrial.changes.confirmedAmount} 万円（期末目標とは別）`,`iDeCo年金 初回 ${lastTrial.changes.annuityFirst}`,`最終資産 ${lastTrial.projection.finalAsset} 万円`,lastTrial.notice].join('\n');
   });
   reset.addEventListener('click',()=>{lastSource=getConfig();draft=step8DraftFromConfig(lastSource);lastTrial=null;render();});
 }
 render();
 return {reset:()=>{lastSource=getConfig();draft=step8DraftFromConfig(lastSource);lastTrial=null;render();},getState:()=>({draft:structuredClone(draft),hasTrial:lastTrial?.ok===true}),destroy:()=>container.replaceChildren()};
}
