import {detailProposal,verifyDetailProposal,expenseEntries,EXPENSE_GROUPS,EXPENSE_EXAMPLES,changedPaths,undoDetail} from './detail-settings.mjs';
import {detailedReport,detailedCsv,esc,DETAIL_COLUMNS,groupedYearHtml} from './detailed-report.mjs';
import {configSignature} from './storage.mjs';
import {dateWithAge} from './date-display.mjs';
import {expenseDisplayProfile} from './expense-display.mjs';
import {runRetirementPlan,projectIdeco} from './calc.mjs';
import {reviewPrompt} from './review-prompt.mjs';
const opt=rows=>rows.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('');
const input=(name,label,type='number',value='',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value??'')}" ${type==='number'?'step="any" min="0"':''} ${extra}></label>`;
const select=(name,label,rows)=>`<label>${label}<select name="${name}">${opt(rows)}</select></label>`;
const num=(name,label,v='')=>input(name,label,'number',v,'required');
const amount=()=>num('amount','金額（万円）')+select('unit','金額の単位',[['monthly','月額'],['annual','年額']]);
const dates=(c)=>num('fromAge','本人の開始年齢',c.plan.startAge)+num('toAge','本人の終了年齢',c.plan.endAge);
const treatment=()=>select('fundingTreatment','給与生活中の扱い',[['separate','資産へ別枠計上'],['net_transfer','家計の入出金に含む（重ねて計上しない）']]);
const profile=()=>select('profile','編集・集計する内訳',[['','保存元を選択'],['work-v0.9.7','標準の生活費内訳'],['public-v0.9','旧形式の生活費内訳']]);
const fname={nisa:'NISAの内訳・利用枠',labor:'本人・配偶者の労働収入',ideco:'iDeCoの積立・受取',retirement:'退職金の条件と受取',expense:'生活費・保険を項目ごとに設定',budget:'内訳合計を年間予算にする',event:'臨時収入・追加請求を設定',extra:'継続する追加収入を設定'};
export function mountDetailUI({getState,commit,notice}){
 const forms=new Map();let undo=null,report=null,renderedSignature='';
 const el=id=>document.getElementById(id);
 function fields(kind,c){
  if(kind==='nisa'){const n=c.nisa||{};return num('usageYear','利用枠を確認する年（西暦）',n.usageYear??new Date().getFullYear())+num('marketValue','開始資産のうちNISA評価額（万円）',n.marketValue)+num('tsumitateUsed','確認年のつみたて投資枠使用額（万円）',n.tsumitateUsed)+num('growthUsed','確認年の成長投資枠使用額（万円）',n.growthUsed)+num('lifetimeBookUsed','保有分の取得価額・簿価（万円）',n.lifetimeBookUsed);}
  if(kind==='labor')return select('person','対象者',[['primary','本人'],['spouse','配偶者']])+num('monthlyGross','税引前の月額収入（万円）')+input('startDate','開始日（この月から）','date','','required')+input('endDate','終了日（この月は含まない）','date','','required');
  if(kind==='ideco'){const i=c.ideco||{};return [['asOfDate','残高の基準日'],['contributionEndDate','掛金終了日'],['joinDate','加入日'],['lumpDate','受取開始日']].map(([k,l])=>input(k,l,'date',i[k],'required')).join('')+[['currentBalance','基準日の残高（万円）'],['monthlyContribution','毎月の掛金（万円）'],['accumulationReturn','積立中の利回り（%）'],['lumpPercent','一時金で受け取る割合（%）'],['annuityYears','残りを年金で受け取る年数'],['annuityReturn','年金受取中の利回り（%）']].map(([k,l])=>num(k,l,i[k])).join('');}
  if(kind==='retirement'){const r=c.retirement||{},e=(c.events||[]).find(x=>x.id===r.receiptEventId);return num('amount','退職金の税引前額（万円）',r.amount)+num('serviceYears','勤続年数（端数切上げ）',r.serviceYears)+input('receiveDate','受取日','date',r.receiveDate,'required')+input('companyStartDate','入社日','date',r.companyStartDate,'required')+`<label><input type="checkbox" name="postReceipt" ${e?'checked':''}>計画期間内の受取を資産へ計上する</label>`+input('receipt','資産に加える受取額（税引後・万円）','number',e?.amount)+select('eventTarget','既存の受取行がある場合は選択',[['','新しい受取行（同月の重複は停止）'],...(c.events||[]).map((x,i)=>({x,i})).filter(({x})=>x.type==='income').map(({x,i})=>[String(i),`${x.label} / ${dateWithAge(x.date,c)} / ${x.amount}万円`])]);}
  if(kind==='expense')return profile()+select('target','変更する項目',[['','新しい項目を追加']])+select('group','大項目',EXPENSE_GROUPS)+input('label','項目名（保険は商品名等）','text','','list="expenseNames" maxlength="100" required')+`<datalist id="expenseNames">${Object.values(EXPENSE_EXAMPLES).flat().map(x=>`<option value="${x}">`).join('')}</datalist>`+dates(c)+amount();
  if(kind==='budget')return profile()+dates(c);
  if(kind==='event')return select('target','変更する予定',[['','新しい予定を追加'],...(c.events||[]).map((x,i)=>[String(i),`${x.label} / ${dateWithAge(x.date,c)} / ${x.amount}万円`])])+input('label','項目名','text','','maxlength="100" required')+select('type','種類',[['expense','支出・追加請求'],['income','臨時収入']])+input('date','対象年月日','date','','required')+num('amount','金額（万円）')+treatment()+`<label><input type="checkbox" name="inflationAdjusted">支出に物価上昇を適用（開始時点の価格で入力）</label>`;
  if(kind==='extra')return select('target','変更する追加収入',[['','新しい追加収入を登録'],...[...new Map((c.cashflow?.periodOverrides||[]).filter(x=>x.kind==='income').map(x=>[x.key,x])).values()].map(x=>[x.key,x.label||x.key])])+input('label','項目名','text','','maxlength="100" required')+dates(c)+amount()+treatment();
 }
 function values(form){const data=Object.fromEntries(new FormData(form));for(const input of form.querySelectorAll('input[type=checkbox]'))data[input.name]=input.checked;return data;}
 function fill(form,obj){for(const [key,v] of Object.entries(obj||{})){const i=form.elements.namedItem(key);if(!i)continue;if(i.type==='checkbox')i.checked=Boolean(v);else i.value=v??'';}}
 function hint(form,c){let span=form.querySelector('.date-hints');if(!span){span=document.createElement('p');span.className='date-hints muted';form.append(span);}span.textContent=[...form.querySelectorAll('input[type=date]')].filter(i=>i.value).map(i=>dateWithAge(i.value,c,form.elements.person?.value||'primary')).join(' / ');}
 function populate(kind,form,c){
  if(['expense','budget'].includes(kind)){form.elements.profile.value=expenseDisplayProfile(c)||'';}
  if(kind==='expense')refreshTargets(form,c);
  if(kind==='labor')fill(form,c.employment?.[form.elements.person.value]?.sideWork);
  if(kind==='ideco')for(const k of ['accumulationReturn','annuityReturn'])form.elements[k].min='-99';
  hint(form,c);
 }
 function refreshTargets(form,c){const source=form.elements.profile.value;form.elements.target.innerHTML=opt([['','新しい項目を追加'],...expenseEntries(c,source).map(x=>[x.path,`${x.group} / ${x.label}`])]);}
 function initForm(kind,c){
  const host=el(`detail-${kind}`);if(!host)return;
  host.innerHTML=`<h2>${fname[kind]}</h2><form class="detail-form"><div class="form-grid">${fields(kind,c)}</div><div class="pension-actions"><button type="submit" class="primary">変更後を試算</button><button type="button" class="secondary" data-reset>入力を現在の設定に戻す</button></div><p class="muted">入力・試算だけでは保存しません。反映するまでは、ホーム・CSVは現在の設定で表示します。</p></form><div class="detail-preview" hidden></div><p class="inline-error" role="alert" hidden></p>`;
  const form=host.querySelector('form'),box=host.querySelector('.detail-preview'),error=host.querySelector('[role=alert]');const ctx={kind,form,box,error,proposal:null};forms.set(kind,ctx);populate(kind,form,c);
  const invalidate=()=>{ctx.proposal=null;box.hidden=true;error.hidden=true;};
  form.addEventListener('input',()=>{invalidate();hint(form,getState().config);});
  form.addEventListener('change',e=>{
   invalidate();const c=getState().config;
   if(kind==='labor'&&e.target.name==='person')fill(form,c.employment?.[e.target.value]?.sideWork||{monthlyGross:'',startDate:'',endDate:''});
   if(kind==='expense'&&e.target.name==='profile')refreshTargets(form,c);
   if(kind==='expense'&&e.target.name==='target'){
    const row=expenseEntries(c,form.elements.profile.value).find(x=>x.path===e.target.value);if(row){fill(form,{label:row.label,amount:row.row.amount??'',unit:'monthly'});}
   }
   if(kind==='expense'&&e.target.name==='group')form.elements.label.placeholder=EXPENSE_EXAMPLES[e.target.value].join('、');
   if(kind==='event'&&e.target.name==='target'&&e.target.value!=='')fill(form,c.events[Number(e.target.value)]);
   if(kind==='extra'&&e.target.name==='target'&&e.target.value)fill(form,c.cashflow?.periodOverrides.find(x=>x.kind==='income'&&x.key===e.target.value));
   hint(form,c);
  });
  form.querySelector('[data-reset]').addEventListener('click',()=>initForm(kind,getState().config));
  form.addEventListener('submit',event=>{event.preventDefault();try{
   const state=getState(),p=detailProposal(state,kind,values(form));ctx.proposal=p;box.hidden=false;error.hidden=true;
   box.innerHTML=`<h3>反映前の確認</h3><p>${esc(fname[kind])}：${p.changed?'変更あり':'変更なし'}。最終資産 ${p.before.toLocaleString('ja-JP',{maximumFractionDigits:2})} → ${p.after.toLocaleString('ja-JP',{maximumFractionDigits:2})}万円</p><details><summary>変更する入力値・期間を確認</summary><dl>${Object.entries(values(form)).filter(([k])=>!['target','eventTarget'].includes(k)).map(([k,v])=>`<dt>${esc(form.elements[k]?.closest('label')?.childNodes[0]?.textContent||k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></details><p>${kind==='expense'?'内訳のみの変更です。資産推移を変えるには、内訳を確認した後「内訳合計を年間予算にする」を試算してください。':kind==='nisa'?'NISAは開始資産の内数です。合計資産・運用利回りは変えません。':kind==='retirement'&&!p.values.postReceipt?'税の参考条件だけを変更します。退職金収入は追加しません。':'既存の計算方法・期間方式を使って全期間を再計算します。'}</p><button type="button" class="primary" data-apply ${p.changed?'':'disabled'}>この条件をシミュレーションに反映</button>`;
   box.querySelector('[data-apply]').addEventListener('click',()=>{try{
    const current=getState(),next=verifyDetailProposal(current,ctx.proposal),patches=changedPaths(current.config,next);
    if(!commit(next))return;undo=patches;ctx.proposal=null;initForm(kind,getState().config);el('detailUndo').disabled=false;notice('保存しました。年次表・CSVを現在の設定で更新しました。');
   }catch(e){error.textContent=e.message;error.hidden=false;}});
  }catch(e){invalidate();error.textContent=e.message;error.hidden=false;}});
 }
 function renderReport(){const c=getState().config;if(!c)return;const source=el('detailCsvSource').value,period=el('detailCsvPeriod').value;report=detailedReport(c,{sourceProfile:source,period});const group=el('detailCsvGroup').value,age=el('detailCsvAge').value;
  const filtered=report.rows.filter(r=>(!group||r.group===group)&&(!age||r.period===age));
  el('detailCsvStatus').textContent=`全${report.rows.length}行 / 表示対象${filtered.length}行。未確定は空欄。合計・内数・参考内訳は区別し、重ねて合計しません。`;
  el('detailCsvTable').innerHTML=`<thead><tr>${DETAIL_COLUMNS.map(([,label])=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${filtered.slice(0,400).map(r=>`<tr>${DETAIL_COLUMNS.map(([key])=>`<td>${esc(key==='amount'&&r[key]!==null?Number(r[key]).toLocaleString('ja-JP',{maximumFractionDigits:4}):r[key]??(['amount','primaryAge','spouseAge'].includes(key)?'未確定':'—'))}</td>`).join('')}</tr>`).join('')}</tbody>`;
  el('detailCsvLimit').textContent=filtered.length>400?'画面は先頭400行です。CSVには絞込み前の全期間・全項目を出力します。':'CSVは絞込みに関係なく全期間・全項目を出力します。';
 }
 function renderAnnual(){const c=getState().config;if(!c)return;const table=groupedYearHtml(runRetirementPlan(c),el('yearViewMode').value);el('yearHead').innerHTML=table.head;el('yearRows').innerHTML=table.body;}
 function download(content,filename,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 el('detailUndo').addEventListener('click',()=>{try{if(!undo)return;if(commit(undoDetail(getState().config,undo))){undo=null;el('detailUndo').disabled=true;notice('今回の対象設定だけを元に戻しました。');}}catch(e){notice(e.message,'error');}});
 for(const id of ['detailCsvSource','detailCsvPeriod','detailCsvGroup'])el(id).addEventListener('change',()=>{const current=el('detailCsvAge').value;el('detailCsvAge').innerHTML='<option value="">全期間</option>';renderReport();el('detailCsvAge').innerHTML=opt([['','全期間'],...[...new Set(report.rows.map(r=>r.period))].map(x=>[x,x])]);if([...el('detailCsvAge').options].some(o=>o.value===current))el('detailCsvAge').value=current;renderReport();});
 el('detailCsvAge').addEventListener('change',renderReport);el('yearViewMode').addEventListener('change',renderAnnual);
 el('downloadDetailedCsv').addEventListener('click',()=>{renderReport();download(detailedCsv(report),'lifeplan-all-items.csv','text/csv;charset=utf-8');});
 el('makeReviewPrompt').addEventListener('click',()=>{try{el('reviewPromptText').value=reviewPrompt(getState(),{sourceProfile:el('detailCsvSource').value});el('reviewPromptText').hidden=false;el('downloadReviewPrompt').disabled=false;notice('確認依頼文を作成しました。内容を確認してからChatGPTへ貼り付けてください。');}catch(e){notice(e.message,'error');}});
 el('downloadReviewPrompt').addEventListener('click',()=>download(el('reviewPromptText').value,'lifeplan-review-prompt.txt'));
 return {render(){const c=getState().config;if(!c)return;for(const kind of Object.keys(fname))if(!forms.has(kind))initForm(kind,c);const signature=configSignature(getState());if(renderedSignature!==signature){for(const ctx of forms.values()){ctx.proposal=null;ctx.box.hidden=true;}renderedSignature=signature;el('reviewPromptText').value='';el('reviewPromptText').hidden=true;el('downloadReviewPrompt').disabled=true;}
  el('detailCsvSource').value=expenseDisplayProfile(c,el('detailCsvSource').value)||'';renderAnnual();renderReport();el('detailCsvAge').innerHTML=opt([['','全期間'],...[...new Set(report.rows.map(r=>r.period))].map(x=>[x,x])]);
  el('nisaCurrentSummary').textContent=c.nisa?.marketValue==null?'NISAの開始時評価額は未設定です。':`現在の開始資産 ${c.plan.initialAsset}万円のうちNISA ${c.nisa.marketValue}万円、その他 ${Number(c.plan.initialAsset)-Number(c.nisa.marketValue)}万円。${Number(c.nisa.marketValue)>Number(c.plan.initialAsset)?'NISA内訳が合計資産を超えています。確認してください。':''}利用枠の確認年：${c.nisa.usageYear??'未設定'}。`;
  const p=projectIdeco(c);el('idecoCurrentSummary').textContent=p?`現在の設定：受取時の試算残高 ${p.balance.toLocaleString('ja-JP',{maximumFractionDigits:1})}万円、一時金 ${p.lumpGross.toLocaleString('ja-JP',{maximumFractionDigits:1})}万円、年金 年${p.annuityAnnual.toLocaleString('ja-JP',{maximumFractionDigits:1})}万円。`:'iDeCoの条件は未登録です。';
 },invalidate(){for(const ctx of forms.values()){ctx.proposal=null;ctx.box.hidden=true;}},reset(){forms.clear();undo=null;el('detailUndo').disabled=true;}};
}
