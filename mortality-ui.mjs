/** Read-only, non-adopted mortality comparison UI. No storage/cloud/network calls. */
import {dateWithAge,ageOn,dateParts} from './date-display.mjs';
import {estimateSurvivorReference65,MortalityPreviewError} from './mortality-preview.mjs';
import {MORTALITY_COSTS,blankMortalityAllocation,fictionalMortalityAllocation,
 calculateMortalityComparison,survivorPensionTiming,agePeriodComparisonRows,validateMortalityAllocation,ORIGINAL_BASIS} from './mortality-comparison.mjs';

const escMoney=n=>Number.isFinite(n)?new Intl.NumberFormat('ja-JP',{maximumFractionDigits:1}).format(Math.abs(n)<1e-10?0:n):'未確認';
const requiredNumber=(element,label)=>{
 const raw=element.value.trim();
 if(!raw||!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw))throw new MortalityPreviewError('input-missing',`${label}を入力してください。空欄は0として扱いません`);
 const n=Number(raw);if(!Number.isFinite(n))throw new MortalityPreviewError('input-invalid',`${label}の数値が不正です`);return n;
};
const makeEl=(tag,cls='',text='')=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text)x.textContent=text;return x;};
const heading=(text,explanation)=>{const h=makeEl('h3','',text),p=makeEl('p','muted',explanation);return [h,p];};

function costInputRow(c,initial){
 const row=makeEl('div','mortality-cost-row');row.dataset.costKey=c.key;
 const label=makeEl('span','mortality-cost-name',c.label);
 const shareId=`mortality-share-${c.key}`,factorId=`mortality-factor-${c.key}`;
 const a=makeEl('label');a.append('配分（％）');const input=makeEl('input');input.id=shareId;input.type='number';input.step='any';input.min='0';input.max='100';input.value=String(initial.share);input.setAttribute('data-mortality-share',c.key);a.append(input);
 const b=makeEl('label');b.append('倍率');const mult=makeEl('input');mult.id=factorId;mult.type='number';mult.step='0.01';mult.min='0';mult.max='3';mult.value=String(initial.factor);mult.setAttribute('data-mortality-factor',c.key);if(c.key==='unallocated'){mult.readOnly=true;mult.title='未配分の費用は変更しない';}b.append(mult);
 row.append(label,a,b);return row;
}
function currentAllocation(root){return MORTALITY_COSTS.map(c=>({key:c.key,share:requiredNumber(root.querySelector(`[data-mortality-share="${c.key}"]`),c.label+'の配分'),factor:requiredNumber(root.querySelector(`[data-mortality-factor="${c.key}"]`),c.label+'の倍率')}));}
function setAllocation(root,items){for(const x of items){root.querySelector(`[data-mortality-share="${x.key}"]`).value=String(x.share);root.querySelector(`[data-mortality-factor="${x.key}"]`).value=String(x.factor);}}
function tableCell(tr,text,th=false){const td=makeEl(th?'th':'td');td.textContent=String(text);if(th)td.scope='col';tr.append(td);return td;}
function formatTotal(a){return Number.isFinite(a)?`${escMoney(a)}万円`:'未確認';}

function renderTransition(root,baseline,mortality,allocation){
 const at=mortality.monthly.findIndex(r=>r.month===mortality.firstChangedMonth);
 if(at<0){root.append(makeEl('p','muted','死亡翌月が計画範囲外のため、死亡後の収入差は表示しません。'));return;}
 const b=baseline[at],t=mortality.monthly[at];
 root.append(...heading(`死亡翌月の収支変化（${t.month}）`,'同じ年月の基準案と比較案を比べます。万円／月。年金は仮置き合計で、遺族給付だけの金額ではありません。'));
 const wrap=makeEl('div','table-wrap'),table=makeEl('table');table.id='mortalityMonthlyTransition';
 const head=makeEl('thead'),hr=makeEl('tr');for(const name of ['項目','基準案','死亡想定案','差額'])tableCell(hr,name,true);head.append(hr);table.append(head);
 const body=makeEl('tbody');
 for(const [label,x,y] of [['公的年金',b.primaryPension+b.spousePension,t.publicPension],['その他の収入',b.totalIncome-b.primaryPension-b.spousePension,t.income-t.publicPension],['収入合計',b.totalIncome,t.income],['管理予算支出',b.expense,t.expense],['臨時支出（死亡費用込）',b.extraExpense,t.extraExpense+t.funeralExpense],['収支差額（運用益前）',b.totalIncome-b.expense-b.extraExpense,t.income-t.expense-t.extraExpense-t.funeralExpense]]){
  const tr=makeEl('tr');tableCell(tr,label);for(const v of [x,y,y-x])tableCell(tr,escMoney(v));body.append(tr);
 }
 table.append(body);wrap.append(table);root.append(wrap);
 const detail=makeEl('details');detail.append(makeEl('summary','','死亡翌月の費目別支出（仮配分・倍率の内訳）'));
 const costs=makeEl('div','table-wrap'),ct=makeEl('table');ct.id='mortalityCostBreakdown';
 const ch=makeEl('thead'),cr=makeEl('tr');for(const v of ['費目','配分％','倍率','基準月額','比較月額'])tableCell(cr,v,true);ch.append(cr);ct.append(ch);const cb=makeEl('tbody');
 for(const row of allocation){const tr=makeEl('tr'),name=MORTALITY_COSTS.find(c=>c.key===row.key).label,amount=b.expense*row.share/100;tableCell(tr,name);for(const v of [row.share,row.factor,amount,amount*row.factor])tableCell(tr,escMoney(v));cb.append(tr);}
 ct.append(cb);costs.append(ct);detail.append(costs);root.append(detail);
}

export function mountMortalityComparison(root,{getConfig,getBaseline,runPlan}){
 if(!root||typeof getConfig!=='function'||typeof getBaseline!=='function'||typeof runPlan!=='function')throw Error('missing-mortality-ui-dependency');
 root.innerHTML=`
 <p class="muted">この画面は<strong>死亡時期による仮置き比較専用</strong>です。現在の採用条件・比較案・バックアップ・クラウドは変更しません。二人とも死亡する場合、相続、制度の受給資格、所得税・社会保険の精密な変更は未対応です。</p>
 <form id="mortalityForm" class="mortality-form">
 <fieldset><legend>1．死亡月と遺族年金を含む収入（仮定）</legend>
 <div class="form-grid mortality-grid">
  <label>先に亡くなる方<select name="deceased"><option value="primary">本人</option><option value="spouse">配偶者</option></select></label>
  <label>死亡を想定する月<input name="deathMonth" type="month" required aria-describedby="mortalityAgeHint"><small id="mortalityAgeHint" class="muted" aria-live="polite">年月を入力すると年齢を表示します。</small></label>
  <label>残された方の公的年金合計（老齢年金の受給開始後・万円／年、仮置き）<input name="survivorPension" type="number" step="any" min="0" required placeholder="年額を入力"></label>
  <label id="mortalityPreClaimRow" hidden>老齢年金開始前の公的年金合計（死亡翌月から・万円／年、仮置き）<input name="preClaimPension" type="number" step="any" min="0" placeholder="区間の仮年額を入力"><small id="mortalityPreClaimHint" class="muted">繰下げと受給権は別途確認</small></label>
  <label>死亡月に1度だけ加える費用（万円、仮置き）<input name="funeral" type="number" step="any" min="0" value="0" required></label>
 </div>
 <p class="muted">年金欄は「残された方自身の老齢基礎＋老齢厚生＋遺族厚生の差額」を含む<strong>合計</strong>です。遺族年金だけを入力しません。死亡月は元の年金、翌月から仮年額を12等分する近似です。葬儀費0は「今回の比較に費用を入れない」仮定であり、実費0円の認定ではありません。</p>
 <button id="mortalitySuggestAge" type="button" class="secondary">本人80歳期の開始月を入力（未反映）</button>
 <details><summary>参考：65歳以上の遺族厚生年金の概算を手計算条件から入力</summary>
  <p class="muted">受給権・請求状況・繰下げの影響を資料で確認した場合のみ使用してください。死亡者の老齢厚生年金の繰下げ増額分は含めません。計算結果は本人の確定受給額ではありません。</p>
  <div class="form-grid mortality-grid">
   <label>亡くなる方の老齢厚生年金の報酬比例部分（繰下げ加算なし・万円／年）<input name="deceasedEarnings" type="number" step="any" min="0" placeholder="資料を確認して入力"></label>
   <label>残された方自身の老齢厚生年金（万円／年）<input name="survivorEmployee" type="number" step="any" min="0"></label>
   <label>残された方自身の老齢基礎年金（万円／年）<input name="survivorBasic" type="number" step="any" min="0"></label>
  </div>
  <label class="check-label"><input name="entitlement" type="checkbox">遺族厚生年金の受給権を資料で確認した</label>
  <label class="check-label"><input name="claimed" type="checkbox">残された方の老齢年金請求・受給を確認した</label>
  <label class="check-label"><input name="deferral" type="checkbox">繰下げ待機中の受給権の影響を確認した</label>
  <button id="mortalityEstimatePension" class="secondary" type="button">資料確認済みの内訳から参考年額を入力</button>
  <p id="mortalityEstimateNotice" class="muted" role="status"></p>
 </details>
 </fieldset>
 <fieldset><legend>2．死亡後の費用（管理予算を仮に費目配分）</legend>
 <p class="muted">${ORIGINAL_BASIS}。現在の生活費登録と一致していると判断しません。配分の合計は100％が必要で、未配分の税・社会保険・不明費用は必ず1.0倍にします。</p>
 <div class="mortality-preset-controls"><button type="button" class="secondary" id="mortalityFictionalCosts">架空の費目配分例を入力（660万円モデル）</button><button type="button" class="secondary" id="mortalityResetCosts">全額を未配分へ戻す</button></div>
 <div id="mortalityCostRows" class="mortality-costs"></div>
 <p id="mortalityAllocationTotal" class="muted" role="status"></p>
 </fieldset>
 <label class="check-label"><input type="checkbox" name="reviewed" required> 年金年額・死亡月・費用配分と倍率が<strong>比較用の仮定</strong>で、現在の採用条件ではないことを確認しました。</label>
 <button id="mortalityRun" class="primary" type="submit">死亡後の収入・資産を試算（保存しない）</button>
 <button id="mortalityClear" class="secondary" type="button">試算結果をクリア（保存データ不変）</button>
 </form>
 <p id="mortalityState" role="status" class="muted">まだ比較していません。現在の資産計算や保存データは変わりません。</p>
 <div id="mortalityResults" hidden></div>
 `;
 const form=root.querySelector('#mortalityForm'),state=root.querySelector('#mortalityState'),results=root.querySelector('#mortalityResults'),costBox=root.querySelector('#mortalityCostRows');
 const initial=blankMortalityAllocation();for(const c of MORTALITY_COSTS)costBox.append(costInputRow(c,initial.find(x=>x.key===c.key)));
 let current=null,blockedExternal=false;
 const externalUpdateMessage='別画面で保存済み条件が更新されました。再読み込みしてから死亡時期の比較を試算してください。';
 const requireFreshBaseline=()=>{if(blockedExternal)throw new MortalityPreviewError('external-state-changed',externalUpdateMessage);};
 const values=()=>({deceased:form.elements.deceased.value,deathMonth:form.elements.deathMonth.value,survivorPension:form.elements.survivorPension.value,funeral:form.elements.funeral.value});
 const invalid=msg=>{results.hidden=true;results.replaceChildren();current=null;state.textContent=blockedExternal?externalUpdateMessage:msg;state.className='muted';};
 const allocationInfo=()=>{
  try{const v=validateMortalityAllocation(currentAllocation(root));root.querySelector('#mortalityAllocationTotal').textContent=`仮配分合計 ${v.total.toFixed(2)}％。未配分 ${root.querySelector('[data-mortality-share="unallocated"]').value}％は倍率1.0で維持。`;}
  catch(e){root.querySelector('#mortalityAllocationTotal').textContent=e.message;}
 };
 const ageHint=()=>{
  const c=getConfig(),p=form.elements.deceased.value,val=form.elements.deathMonth.value;
  root.querySelector('#mortalityAgeHint').textContent=val&&c?dateWithAge(val,c,p):'年月を入力すると年齢を表示します。';
  const survivor=p==='primary'?'spouse':'primary';
  const start=c?.income?.pensions?.[survivor]?.startDate ?? c?.income?.pensions?.[survivor]?.startMonth;
  let early=false;try{if(val&&c)early=survivorPensionTiming(c,p,val).needsPreClaim;}catch{/* submission reports invalid/missing dates */}
  root.querySelector('#mortalityPreClaimRow').hidden=!early;
  form.elements.preClaimPension.required=early;
  root.querySelector('#mortalityPreClaimHint').textContent=early?`残された方の年金開始月 ${start.slice(0,7)} の前月まで別の仮額を指定してください。受給資格や繰下げ調整を自動判定しません。`:'繰下げと受給権は別途確認';
 };
 function showResult({mortality,original,allocation},parameters){
  results.replaceChildren();results.hidden=false;
  const warn=makeEl('p','mortality-warning','仮置き・未反映の比較です。年金資格、税社保、二人死亡後の相続・精算は未計算です。');results.append(warn);
  const summary=makeEl('div','mortality-metrics');
  for(const [key,label,value] of [
    ['base','現在条件（終期末）',formatTotal(mortality.baselineFinalAsset)],
    ['trial','死亡時期の仮置き案',formatTotal(mortality.finalAsset)],
    ['delta','現在条件との差',formatTotal(mortality.deltaFromBaseline)],
    ['depletion','最初に残高が負になる月',mortality.firstNegativeMonth||'対象期間内になし']]){
    const card=makeEl('article','mortality-metric');const small=makeEl('span','',label),val=makeEl('strong','',value);card.dataset.metric=key;card.append(small,val);summary.append(card);
  }
  results.append(summary);
  const diff=makeEl('p','muted',`${parameters.deceased==='primary'?'本人':'配偶者'}の死亡想定：${dateWithAge(parameters.deathMonth,getConfig(),parameters.deceased)}／年金合計の仮置き：${escMoney(parameters.survivorPension)}万円／年／死亡一時費用の仮置き：${escMoney(parameters.funeral)}万円。年金・通常費は翌月から変更。一時費用だけ死亡月に計上。`);results.append(diff);
  renderTransition(results,original.monthlyDetails,mortality,allocation);
  const periods=agePeriodComparisonRows(original.monthlyDetails,{mortality});
  const headingBlock=heading('年齢期別の収入・支出・残高の差','万円。収入・支出はその期の合計、資産は期末残高。年金は収入合計の内数です。');results.append(...headingBlock);
  const region=makeEl('div','table-wrap mortality-table-wrap');region.tabIndex=0;region.setAttribute('role','region');region.setAttribute('aria-label','死亡時期の年齢期別比較表');
  const table=makeEl('table','mortality-table'),thead=makeEl('thead'),theadTr=makeEl('tr');
  for(const label of ['本人年齢期','基準：公的年金','比較：公的年金','基準：総収入','比較：総収入','基準：管理予算支出','比較：管理予算支出','基準：臨時支出','比較：臨時支出（死亡費用込）','基準：期末資産','比較：期末資産','残高差'])tableCell(theadTr,label,true);
  thead.append(theadTr);table.append(thead);const tbody=makeEl('tbody');
  for(const p of periods){const tr=makeEl('tr');for(const v of [`${p.age}歳（${p.months}か月）`,p.baselinePension,p.previewPension,p.baselineIncome,p.previewIncome,p.baselineExpense,p.previewExpense,p.baselineExtraExpense,p.previewExtraExpense,p.baselineEndAsset,p.previewEndAsset,p.delta])tableCell(tr,typeof v==='number'?escMoney(v):v);tbody.append(tr);}
  table.append(tbody);region.append(table);results.append(region);
  const foot=makeEl('p','muted','既存の臨時支出はそのまま計上し、死亡月に指定した一時費用だけを追加します。死亡後の未帰属収入がある場合は計算を停止します。負の期末資産は借入や実際の不足額とは断定できません。');results.append(foot);
 }
 form.addEventListener('input',e=>{if(e.target!==form.elements.reviewed)form.elements.reviewed.checked=false;if(e.target.matches('[data-mortality-share],[data-mortality-factor]'))allocationInfo();ageHint();if(current)invalid('入力を変更したため、以前の試算は無効です。もう一度試算してください。');});
 form.addEventListener('change',e=>{if(e.target!==form.elements.reviewed)form.elements.reviewed.checked=false;ageHint();if(['deceased','deathMonth'].includes(e.target.name)){for(const key of ['entitlement','claimed','deferral'])form.elements[key].checked=false;root.querySelector('#mortalityEstimateNotice').textContent='死亡対象・年月が変わったため受給条件の確認を解除しました。';}if(current)invalid('条件が変わりました。再試算してください。');});
 root.querySelector('#mortalityFictionalCosts').addEventListener('click',()=>{setAllocation(root,fictionalMortalityAllocation());allocationInfo();invalid('架空6,500万円世帯の660万円費目配分例を入力しました。本人の登録費用ではありません。');form.elements.reviewed.checked=false;});
 root.querySelector('#mortalityResetCosts').addEventListener('click',()=>{setAllocation(root,blankMortalityAllocation());allocationInfo();invalid('支出は全額を未配分・倍率1.0に戻しました。');form.elements.reviewed.checked=false;});
 root.querySelector('#mortalitySuggestAge').addEventListener('click',()=>{
  try{requireFreshBaseline();const cfg=getConfig();if(!cfg)throw Error('設定を読み込んでください');const plan=runPlan(cfg,{includeMonthlyDetails:true});const row=plan.monthlyDetails.find(r=>r.age===80);if(!row)throw Error('80歳期が現在の計算対象外です');form.elements.deathMonth.value=row.month;form.elements.reviewed.checked=false;for(const key of ['entitlement','claimed','deferral'])form.elements[key].checked=false;ageHint();invalid('本人80歳期の最初の年月を候補にしました。死亡日・年金はまだ確認されていません。');}
  catch(e){invalid(e.message);}
 });
 root.querySelector('#mortalityEstimatePension').addEventListener('click',()=>{
  try{
   requireFreshBaseline();const cfg=getConfig();if(!cfg)throw Error('採用条件を読み込んでください');
   const deceased=values().deceased,survivor=deceased==='primary'?'spouse':'primary';
   const month=values().deathMonth,dt=dateParts(month);if(!dt)throw Error('死亡年月を先に入力してください');
   const start=cfg.income?.pensions?.[survivor]?.startDate;if(!dateParts(start)||start.slice(0,7)>month)throw Error('保存済みの年金開始月ではまだ受給前です。制度概算の自動転記ではなく、区間ごとの仮年額を入力してください');
   const minAge=ageOn(`${month}-01`,cfg.people?.[survivor]?.birthDate),maxAge=ageOn(`${month}-${String(dt.days).padStart(2,'0')}`,cfg.people?.[survivor]?.birthDate);
   if(minAge===null||maxAge===null||minAge<65||maxAge<65)throw Error('残された方の死亡月内年齢が確定しません。誕生日付近は年月だけで65歳要件を判定できません');
   const r=estimateSurvivorReference65({deceasedEmployeeEarningsAnnualBase:requiredNumber(form.elements.deceasedEarnings,'死亡者の報酬比例部分'),survivorOwnEmployeeAnnual:requiredNumber(form.elements.survivorEmployee,'生存者の老齢厚生年金'),survivorOwnBasicAnnual:requiredNumber(form.elements.survivorBasic,'生存者の老齢基礎年金'),survivorAge:minAge,entitlementConfirmed:form.elements.entitlement.checked,ownPensionClaimConfirmed:form.elements.claimed.checked,deferralConflictReviewed:form.elements.deferral.checked});
   form.elements.survivorPension.value=String(Number(r.totalSurvivingPublicPensionAnnual.toFixed(6)));
   root.querySelector('#mortalityEstimateNotice').textContent=`参考：老齢基礎・厚生＋遺族厚生の差額を合わせて年${escMoney(r.totalSurvivingPublicPensionAnnual)}万円。実際の支給額、税社保、改定率は未確認です。`;
   invalid('参考年額を仮入力しました。受給権・資料の適用可否は本人確認が必要です。');form.elements.reviewed.checked=false;
  }catch(e){root.querySelector('#mortalityEstimateNotice').textContent=e.message;invalid('概算を入力できません。未確認を0として置き換えません。');}
 });
 root.querySelector('#mortalityClear').addEventListener('click',()=>invalid('試算結果をクリアしました。保存済みの条件は変更していません。'));
 form.addEventListener('invalid',e=>{let node=e.target.parentElement;while(node&&node!==form){if(node.tagName==='DETAILS')node.open=true;node=node.parentElement;}},true);
 form.addEventListener('submit',e=>{
  e.preventDefault();invalid('架空または仮置き条件を照合しています。');
  try{
   requireFreshBaseline();const c=getConfig(),b=getBaseline();if(!c||!b)throw Error('現在設定を読み込んでください');
   const v=values();const x=calculateMortalityComparison({config:c,baseline:b,deathPerson:v.deceased,deathMonth:v.deathMonth,survivorTotalAnnual:requiredNumber(form.elements.survivorPension,'死亡後の年金年額'),survivorPensionBeforeClaimAnnual:form.elements.preClaimPension.required?requiredNumber(form.elements.preClaimPension,'老齢年金受給開始前の年金仮年額'):null,funeralExpenseMan:requiredNumber(form.elements.funeral,'死亡時一時費用'),allocation:currentAllocation(root),planCalculator:runPlan,acknowledged:form.elements.reviewed.checked});
   current=x;showResult(x,{...v,survivorPension:Number(v.survivorPension),funeral:Number(v.funeral)});
   state.textContent='比較計算が完了しました（採用・保存・クラウド書込みなし）。';
  }catch(error){invalid(`比較できません：${error.message}`);}
 });
 allocationInfo();ageHint();
 return {invalidate({external=false}={}){if(external===true)blockedExternal=true;ageHint();for(const key of ['entitlement','claimed','deferral'])form.elements[key].checked=false;for(const id of ['mortalityRun','mortalityEstimatePension','mortalitySuggestAge'])root.querySelector('#'+id).disabled=blockedExternal;root.querySelector('#mortalityEstimateNotice').textContent=blockedExternal?externalUpdateMessage:'保存済み条件の変更後は受給条件を再確認してください。';invalid('保存済みの条件が更新されたため、死亡時期の試算を無効にしました。必要なら再試算してください。');form.elements.reviewed.checked=false;},getCurrentComparison(){return current;}};
}
