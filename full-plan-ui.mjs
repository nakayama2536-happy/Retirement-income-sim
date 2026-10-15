// Draft-only, non-adopting full-plan comparison connected to existing Step 8 inputs.
// Never reads or writes browser storage, scenarios or live personal data.
import {compareFullPlan} from './full-plan-comparison.mjs';
import {annualCsvRows,annualCsvText} from './annual-csv.mjs';

const clone=x=>structuredClone(x);
export function mountFullPlanComparisonCard(root,{getConfig,getOpeningDraft}){
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
 let configSignature,budgets,events,sideMonth,lastResult=null,status=null,resultBox=null,csvButton=null;
 function clear(message='入力を変更したため前回の比較は無効です。'){
  lastResult=null;
  if(status)status.textContent=message;
  if(resultBox)resultBox.replaceChildren();
  if(csvButton)csvButton.disabled=true;
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
 function reset(message='未試算。現在設定を参照した入力候補です。'){
  const src=getConfig();configSignature=JSON.stringify(src);
  budgets=clone(src?.budgets??[]).map(b=>({fromAge:b.fromAge,toAge:b.toAge,annualBudget:b.annualBudget}));
  events=[];
  sideMonth=typeof src?.employment?.primary?.sideWork?.startDate==='string'?src.employment.primary.sideWork.startDate.slice(0,7):'';
  lastResult=null;render();status.textContent=message;
 }
 function render(){
  root.replaceChildren();
  root.appendChild(elem('h3','全条件の未反映比較'));
  root.appendChild(elem('p','上の「開始月・開始残高・iDeCo受取月」の入力と確認を先に行います。保存済み予算を複製して編集できます。入力や試算では現在設定・既存比較案・バックアップを変更しません。'));
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
   lastResult=comparison;status.textContent='未反映比較と年齢期CSVの照合が完了。現在設定・保存済み比較案は無変更です。';
   resultBox.appendChild(elem('p','現在設定の最終資産 '+formatter(comparison.baseFinalAsset)+'／比較案 '+formatter(comparison.candidateFinalAsset)+'／差額 '+formatter(comparison.candidateFinalAsset-comparison.baseFinalAsset)));
   resultBox.appendChild(elem('p','月数 '+comparison.monthlyCount+'／最初の残高負値月 '+(comparison.firstNegativeMonth??'なし（この仮定での結果）')));
   const wrap=elem('div',null,{class:'table-wrap'}),table=elem('table'),head=elem('thead'),htr=elem('tr');
   ['本人の年齢期末','比較後の資産','参考目標','差額（予測−目標）'].forEach(h=>htr.appendChild(elem('th',h)));
   head.appendChild(htr);table.appendChild(head);const body=elem('tbody');
   comparison.ageRows.forEach(row=>{
    const tr=elem('tr');[row.age+'歳',formatter(row.endAsset),formatter(row.referenceTarget),formatter(row.endAsset===null||row.referenceTarget===null?null:row.endAsset-row.referenceTarget)].forEach(c=>tr.appendChild(elem('td',c)));body.appendChild(tr);
   });
   table.appendChild(body);wrap.appendChild(table);resultBox.appendChild(wrap);
   resultBox.appendChild(elem('p',comparison.notes.join(' ')));
   resultBox.appendChild(elem('p','年次CSVには未反映の比較値を含みます。外部共有前に内容を確認してください。'));
   csvButton.disabled=false;
  });
  restore.addEventListener('click',()=>reset('未反映の入力を破棄しました。採用済み条件は変更していません。'));
  csvButton.addEventListener('click',()=>{
   if(!lastResult||JSON.stringify(getConfig())!==configSignature){clear('保存済み条件が更新されたためCSV出力を停止しました。再試算してください。');return;}
   const blob=new Blob([annualCsvText(lastResult.proposal)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=doc.createElement('a');
   anchor.href=url;anchor.download='lifeplan-unadopted-comparison-annual.csv';anchor.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
 }
 reset();
 return {invalidate:()=>clear('開始月・残高などが変更されました。全条件比較を再試算してください。'),reset,getState:()=>({hasTrial:lastResult!==null,budgets:clone(budgets),events:clone(events),primarySideStartMonth:sideMonth}),destroy:()=>root.replaceChildren()};
}
