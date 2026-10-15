// Draft-only, non-adopting full-plan comparison connected to existing Step 8 inputs.
// Never reads or writes browser storage, scenarios or live personal data.
import {compareFullPlan} from './full-plan-comparison.mjs';
import {annualCsvRows,annualCsvText} from './annual-csv.mjs';
import {comparisonDifferences,savedComparisons,savedComparisonView} from './full-plan-saved.mjs';

const clone=x=>structuredClone(x);
export function mountFullPlanComparisonCard(root,{getConfig,getOpeningDraft,getScenarios=()=>[],onSaveComparison=null}){
 if(!root||typeof getConfig!=='function'||typeof getOpeningDraft!=='function')throw new TypeError('比較画面への接続が不正です。');
 const doc=root.ownerDocument??document;
 const elem=(tag,text=null,attributes={})=>{
  const node=doc.createElement(tag);
  if(text!==null)node.textContent=text;
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);
  return node;
 };
 const formatter=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ja-JP',{maximumFractionDigits:2})+'万円':'未設定・期間外';
 const match=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b));
 let configSignature,budgets,events,sideMonth,lastResult=null,lastRequest=null,nameValue='',status=null,resultBox=null,csvButton=null,saveButton=null;
 function clear(message='入力を変更したため前回の比較は無効です。'){
  lastResult=null;lastRequest=null;
  if(status)status.textContent=message;
  if(resultBox)resultBox.replaceChildren();
  if(csvButton)csvButton.disabled=true;
  if(saveButton)saveButton.disabled=true;
 }
 function field(parent,label,name,value,kind,onValue){
  const row=elem('label',label),input=elem('input',null,{name,type:kind});
  if(kind==='number')input.setAttribute('step','any');
  input.value=value===null||value===undefined?'':String(value);
  input.addEventListener('input',()=>{
   onValue(kind==='number'?(input.value===''?null:Number(input.value)):input.value);clear();
  });
  row.appendChild(input);parent.appendChild(row);
 }
 function choose(parent,label,name,value,choices,onValue){
  const row=elem('label',label),input=elem('select',null,{name});
  choices.forEach(([v,title])=>{const option=elem('option',title);option.value=v;input.appendChild(option);});
  input.value=value;
  input.addEventListener('change',()=>{onValue(input.value);clear();});
  row.appendChild(input);parent.appendChild(row);
 }
 function appendDiff(target,items){
  target.appendChild(elem('h4','現在の採用値と比較案の差分'));
  if(!items.length){target.appendChild(elem('p','表示対象に差分はありません。全設定を照合済みとは限りません。'));return;}
  const wrap=elem('div',null,{class:'table-wrap'}),table=elem('table'),thead=elem('thead'),tr=elem('tr');
  ['項目','現在の採用値','比較案'].forEach(h=>tr.appendChild(elem('th',h)));thead.appendChild(tr);table.appendChild(thead);
  const tbody=elem('tbody');
  for(const item of items){const row=elem('tr');[item.label,item.before,item.after].forEach(v=>row.appendChild(elem('td',v)));tbody.appendChild(row);}
  table.appendChild(tbody);wrap.appendChild(table);target.appendChild(wrap);
 }
 function renderSaved(target){
  target.appendChild(elem('h4','保存済み未採用比較案'));
  const plans=savedComparisons(getScenarios());
  if(!plans.length){target.appendChild(elem('p','保存済みの比較案はありません。'));return;}
  target.appendChild(elem('p','保存された案は「比較案」タブにも表示されます。現在設定を変更せず差分を開けます。'));
  for(const plan of plans){
   const button=elem('button',(plan.name||'比較案')+' の差分を表示',{type:'button',class:'secondary'});
   button.addEventListener('click',()=>{
    clear('保存済みの比較案を表示中です。採用処理はありません。');
    try{
     const view=savedComparisonView(getConfig(),plan);
     resultBox.appendChild(elem('p','保存日 '+(plan.savedAt||'未確認')+'／未採用'));
     if(view.stale)resultBox.appendChild(elem('p','保存時の比較元から現在設定が変更されています。古い差額は現在条件の予測ではありません。再試算して確認してください。'));
     appendDiff(resultBox,view.differences);
    }catch(e){resultBox.appendChild(elem('p','保存済み案を表示できません。'+e.message));}
   });target.appendChild(button);
  }
 }
 function reset(message='未試算。現在設定を参照した入力候補です。'){
  const src=getConfig();configSignature=JSON.stringify(src);
  budgets=clone(src?.budgets??[]).map(b=>({fromAge:b.fromAge,toAge:b.toAge,annualBudget:b.annualBudget}));
  events=[];
  sideMonth=typeof src?.employment?.primary?.sideWork?.startDate==='string'?src.employment.primary.sideWork.startDate.slice(0,7):'';
  lastResult=null;lastRequest=null;nameValue='';render();status.textContent=message;
 }
 function render(){
  root.replaceChildren();
  root.appendChild(elem('h3','全条件の未反映比較'));
  root.appendChild(elem('p','上の「開始月・開始残高・iDeCo受取月」の入力と確認を先に行います。保存済み予算を複製して編集できます。入力・試算だけでは現在設定は変わりません。明示保存した比較案も未採用で、既存案を上書きしません。'));
  field(root,'本人アルバイトの開始月（YYYY-MM）','fullPlanSideMonth',sideMonth,'text',v=>{sideMonth=v;});
  root.appendChild(elem('h4','年齢帯別の年間管理予算（万円／年）'));
  const bands=elem('div');root.appendChild(bands);
  budgets.forEach((b,i)=>{
   const card=elem('fieldset',null,{class:'card'}),grid=elem('div',null,{class:'form-grid'});
   card.appendChild(elem('legend','年齢帯 '+(i+1)));
   field(grid,'開始年齢','fullPlanBudgetFrom'+i,b.fromAge,'number',v=>b.fromAge=v);
   field(grid,'終了年齢','fullPlanBudgetTo'+i,b.toAge,'number',v=>b.toAge=v);
   field(grid,'年間管理予算','fullPlanBudgetAmount'+i,b.annualBudget,'number',v=>b.annualBudget=v);
   card.appendChild(grid);
   const remove=elem('button','この年齢帯を削除',{type:'button',class:'secondary'});
   remove.addEventListener('click',()=>{budgets.splice(i,1);render();clear();});card.appendChild(remove);bands.appendChild(card);
  });
  const add=elem('button','年齢帯を追加',{type:'button',class:'secondary'});
  add.addEventListener('click',()=>{budgets.push({fromAge:Number.isInteger(budgets.at(-1)?.toAge)?budgets.at(-1).toAge+1:null,toAge:null,annualBudget:null});render();clear();});root.appendChild(add);
  root.appendChild(elem('h4','比較のために加える臨時収支（任意）'));
  root.appendChild(elem('p','既存のイベントは残したまま追加します。予算内の支出を別枠に再計上しないよう注意してください。金額は支出・受取時点の名目万円です。'));
  const items=elem('div');root.appendChild(items);
  events.forEach((e,i)=>{
   const card=elem('fieldset',null,{class:'card'}),grid=elem('div',null,{class:'form-grid'});
   card.appendChild(elem('legend','追加の臨時収支 '+(i+1)));
   choose(grid,'種類','fullPlanEventType'+i,e.type,[['expense','支出'],['income','収入']],v=>e.type=v);
   field(grid,'対象日（YYYY-MM-DD）','fullPlanEventDate'+i,e.date,'date',v=>e.date=v);
   field(grid,'内容','fullPlanEventLabel'+i,e.label,'text',v=>e.label=v);
   field(grid,'金額（万円）','fullPlanEventAmount'+i,e.amount,'number',v=>e.amount=v);
   choose(grid,'計上区分','fullPlanEventTreatment'+i,e.fundingTreatment,[['separate','別枠で一度だけ計上'],['budget','管理予算に含む支出'],['net_transfer','給与生活中の純入出金に含む']],v=>e.fundingTreatment=v);
   card.appendChild(grid);
   const remove=elem('button','この臨時収支を削除',{type:'button',class:'secondary'});
   remove.addEventListener('click',()=>{events.splice(i,1);render();clear();});card.appendChild(remove);items.appendChild(card);
  });
  const addEvent=elem('button','臨時収支を追加',{type:'button',class:'secondary'});
  addEvent.addEventListener('click',()=>{events.push({type:'expense',date:'',label:'',amount:null,fundingTreatment:'separate'});render();clear();});root.appendChild(addEvent);
  const actions=elem('div'),calculate=elem('button','全条件を比較（未反映）',{type:'button',class:'primary'}),restore=elem('button','この比較入力を破棄',{type:'button',class:'secondary'});
  actions.append(calculate,restore);root.appendChild(actions);
  status=elem('p','',{role:'status'});root.appendChild(status);
  resultBox=elem('div',null,{role:'region','aria-label':'未反映の全条件比較結果'});root.appendChild(resultBox);
  const saveLabel=elem('label','比較案名（80文字以内）'),nameInput=elem('input',null,{name:'fullPlanSavedName',type:'text',maxlength:'80'});
  nameInput.value=nameValue;nameInput.addEventListener('input',()=>{nameValue=nameInput.value;});saveLabel.appendChild(nameInput);root.appendChild(saveLabel);
  saveButton=elem('button','比較案を保存（採用しない）',{type:'button',class:'secondary'});saveButton.disabled=true;root.appendChild(saveButton);
  const savedPanel=elem('div',null,{role:'region','aria-label':'保存済み全条件比較案'});renderSaved(savedPanel);root.appendChild(savedPanel);
  csvButton=elem('button','未反映比較の年齢期CSVを保存',{type:'button',class:'secondary'});csvButton.disabled=true;root.appendChild(csvButton);
  calculate.addEventListener('click',()=>{
   const current=getConfig();
   if(JSON.stringify(current)!==configSignature){reset('別画面の採用条件が変わりました。新しい現在設定から確認し直してください。');return;}
   const inputs={opening:getOpeningDraft(),budgets:clone(budgets),events:clone(events).map((event,i)=>({...event,id:'comparison-only-'+(i+1),inflationAdjusted:false})),primarySideStartMonth:sideMonth};
   const comparison=compareFullPlan(current,inputs);
   if(!comparison.ok){clear('比較できません。入力・確認項目を見直してください。');resultBox.appendChild(elem('p',comparison.issues.map(x=>x.message).join(' ／ ')));return;}
   let csv;
   try{
    csv=annualCsvRows(comparison.proposal);
    if(!csv.length||!match(csv.at(-1).endAsset,comparison.candidateFinalAsset))throw Error('最終資産');
    for(const row of comparison.ageRows)if(row.endAsset!==null&&!match(csv.find(a=>a.age===row.age)?.endAsset,row.endAsset))throw Error(row.age+'歳期');
   }catch(e){clear('年次CSVとの整合が確認できないため出力を停止しました。');resultBox.appendChild(elem('p',String(e.message)));return;}
   lastResult=comparison;lastRequest=clone(inputs);status.textContent='未反映比較と年齢期CSVの照合が完了。採用済み設定は無変更です。';
   resultBox.appendChild(elem('p','現在設定の最終資産 '+formatter(comparison.baseFinalAsset)+'／比較案 '+formatter(comparison.candidateFinalAsset)+'／差額 '+formatter(comparison.candidateFinalAsset-comparison.baseFinalAsset)));
   resultBox.appendChild(elem('p','月数 '+comparison.monthlyCount+'／最初の残高負値月 '+(comparison.firstNegativeMonth??'なし（この仮定での結果）')));
   const wrap=elem('div',null,{class:'table-wrap'}),table=elem('table'),head=elem('thead'),htr=elem('tr');
   ['本人の年齢期末','比較後の資産','参考目標','差額（予測−目標）'].forEach(h=>htr.appendChild(elem('th',h)));
   head.appendChild(htr);table.appendChild(head);const body=elem('tbody');
   comparison.ageRows.forEach(row=>{
    const tr=elem('tr');[row.age+'歳',formatter(row.endAsset),formatter(row.referenceTarget),formatter(row.endAsset===null||row.referenceTarget===null?null:row.endAsset-row.referenceTarget)].forEach(c=>tr.appendChild(elem('td',c)));body.appendChild(tr);
   });
   table.appendChild(body);wrap.appendChild(table);resultBox.appendChild(wrap);
   appendDiff(resultBox,comparisonDifferences(current,comparison.proposal));
   resultBox.appendChild(elem('p',comparison.notes.join(' ')));
   resultBox.appendChild(elem('p','年次CSVには未反映の比較値を含みます。外部共有前に内容を確認してください。'));
   csvButton.disabled=false;saveButton.disabled=typeof onSaveComparison!=='function';
  });
  restore.addEventListener('click',()=>reset('未反映の入力を破棄しました。採用済み条件は変更していません。'));
  saveButton.addEventListener('click',()=>{
   if(typeof onSaveComparison!=='function'||!lastResult||!lastRequest)return;
   if(JSON.stringify(getConfig())!==configSignature){clear('採用済み条件が変更されました。再試算して保存してください。');return;}
   try{
    const result=onSaveComparison({result:lastResult,request:clone(lastRequest),name:nameValue,sourceConfigSignature:configSignature});
    if(result?.ok)reset('比較案を未採用で保存しました。現在の採用設定は変わりません。');
    else if(result?.duplicate)status.textContent='同じ比較案が保存済みのため、重複登録しませんでした。';
    else status.textContent=result?.message||'保存成功を確認できませんでした。比較候補は保持しています。';
   }catch(e){status.textContent='比較案を保存できませんでした。'+e.message+' 元の設定と比較入力は保持しています。';}
  });
  csvButton.addEventListener('click',()=>{
   if(!lastResult||JSON.stringify(getConfig())!==configSignature){clear('保存済み条件が更新されたためCSV出力を停止しました。再試算してください。');return;}
   const blob=new Blob([annualCsvText(lastResult.proposal)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=doc.createElement('a');
   anchor.href=url;anchor.download='lifeplan-unadopted-comparison-annual.csv';anchor.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
 }
 reset();
 return {invalidate:()=>clear('開始月・残高などが変更されました。全条件比較を再試算してください。'),reset,getState:()=>({hasTrial:lastResult!==null,budgets:clone(budgets),events:clone(events),primarySideStartMonth:sideMonth,savedCount:savedComparisons(getScenarios()).length}),destroy:()=>root.replaceChildren()};
}
