/** Read-only, non-adopted mortality comparison UI. No storage/cloud/network calls. */
import {dateWithAge,ageOn,dateParts} from './date-display.mjs';
import {estimateSurvivorReference65,MortalityPreviewError} from './mortality-preview.mjs';
import {mountMortalityItemizedControls} from './mortality-itemized-ui.mjs';
import {readMortalityDraft,saveMortalityDraft,clearMortalityDraft} from './mortality-draft.mjs';
import {MORTALITY_COSTS,blankMortalityAllocation,fictionalMortalityAllocation,
 calculateMortalityComparison,survivorPensionTiming,agePeriodComparisonRows,validateMortalityAllocation,ORIGINAL_BASIS} from './mortality-comparison.mjs';

const escMoney=n=>Number.isFinite(n)?new Intl.NumberFormat('ja-JP',{maximumFractionDigits:1}).format(Math.abs(n)<1e-10?0:n):'未確認';
const percent=n=>new Intl.NumberFormat('ja-JP',{maximumFractionDigits:6}).format(Math.abs(n)<1e-10?0:n);
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
 const a=makeEl('label');a.append('管理予算の配分（％）');const input=makeEl('input');input.id=shareId;input.type='number';input.step='any';input.min='0';input.max='100';input.value=String(initial.share);input.setAttribute('data-mortality-share',c.key);a.append(input);
 const b=makeEl('label');b.append('倍率');const mult=makeEl('input');mult.id=factorId;mult.type='number';mult.step='0.01';mult.min='0';mult.max='3';mult.value=String(initial.factor);mult.setAttribute('data-mortality-factor',c.key);if(c.key==='unallocated'){mult.readOnly=true;mult.title='未配分の費用は変更しない';}b.append(mult);
 const effect=makeEl('small','muted');effect.setAttribute('data-mortality-effect',c.key);b.append(effect);
 row.append(label,a,b);return row;
}
function currentAllocation(root){return MORTALITY_COSTS.map(c=>({key:c.key,share:requiredNumber(root.querySelector(`[data-mortality-share="${c.key}"]`),c.label+'の配分'),factor:requiredNumber(root.querySelector(`[data-mortality-factor="${c.key}"]`),c.label+'の倍率')}));}
function setAllocation(root,items){for(const x of items){root.querySelector(`[data-mortality-share="${x.key}"]`).value=String(x.share);root.querySelector(`[data-mortality-factor="${x.key}"]`).value=String(x.factor);}}
function tableCell(tr,text,th=false){const td=makeEl(th?'th':'td');td.textContent=String(text);if(th)td.scope='col';tr.append(td);return td;}
function formatTotal(a){return Number.isFinite(a)?`${escMoney(a)}万円`:'未確認';}

function renderPensionBreakdown(target,reference){
 target.replaceChildren();target.dataset.pensionState=reference?'reference':'unknown';
 if(!reference){target.append(makeEl('p','muted','内訳未確認：入力した公的年金合計をそのまま試算に使います。自身の年金・遺族年金の内訳は推定せず、遺族年金を別途自動加算しません。'));return;}
 const own=reference.ownBasicAnnual+reference.ownEmployeeAnnual;
 target.append(makeEl('p','',`参考計算の内訳：自身の年金 ${formatTotal(own)} ＋ 遺族厚生年金の差額 ${formatTotal(reference.survivorTopUpAnnual)} ＝ 公的年金合計 ${formatTotal(reference.totalSurvivingPublicPensionAnnual)}／年。受給額の確定ではありません。`));
 const wrap=makeEl('div','table-wrap'),table=makeEl('table'),head=makeEl('thead'),hr=makeEl('tr'),body=makeEl('tbody');
 for(const label of ['残された方の年金内訳','参考年額（万円）'])tableCell(hr,label,true);head.append(hr);table.append(head);
 for(const [key,label,value] of [
  ['own-basic','自身の老齢基礎年金',reference.ownBasicAnnual],
  ['own-employee','自身の老齢厚生年金',reference.ownEmployeeAnnual],
  ['own-total','自身の年金小計（上の2項目）',own],
  ['survivor-topup','追加される遺族厚生年金の差額',reference.survivorTopUpAnnual],
  ['total','試算に使う公的年金合計',reference.totalSurvivingPublicPensionAnnual]]){
  const row=makeEl('tr');tableCell(row,label);tableCell(row,escMoney(value)).setAttribute('data-pension-component',key);body.append(row);
 }
 table.append(body);wrap.append(table);target.append(wrap);
}

function renderTransition(root,baseline,mortality,allocation,itemized=null,itemFactors=null){
 const at=mortality.monthly.findIndex(r=>r.month===mortality.firstChangedMonth);
 if(at<0){root.append(makeEl('p','muted','死亡翌月が計画範囲外のため、死亡後の収入差は表示しません。'));return;}
 const b=baseline[at],t=mortality.monthly[at];
 root.append(...heading(`死亡翌月の収支変化（${t.month}）`,'同じ年月の基準案と比較案を比べます。万円／月。年金は仮置き合計で、遺族給付だけの金額ではありません。'));
 const equation=makeEl('article','mortality-metric');equation.id='mortalityBudgetEquation';
 equation.append(makeEl('span','',`管理予算支出：基準額 ${t.expenseReduction<0?'＋ 増額':'− 減額'} ＝ 死亡後の支出`));
 const formula=makeEl('strong');
 for(const [i,key,value] of [[0,'baseline',b.expense],[1,'reduction',Math.abs(t.expenseReduction)],[2,'result',t.expense]]){
  if(i)formula.append(i===1?(t.expenseReduction<0?' ＋ ':' − '):' ＝ ');
  const amount=makeEl('span','',formatTotal(value));amount.setAttribute('data-budget-term',key);formula.append(amount);
 }
 equation.append(formula,makeEl('span','',t.expenseReduction===0?'支出変更なし。配分と倍率による増減は0です。':'同じ月の管理予算から、配分と倍率で求めた減額を差し引いた月額です。負の減額は増額になります。'));root.append(equation);
 const wrap=makeEl('div','table-wrap'),table=makeEl('table');table.id='mortalityMonthlyTransition';
 const head=makeEl('thead'),hr=makeEl('tr');for(const name of ['項目','基準案','死亡想定案','差額'])tableCell(hr,name,true);head.append(hr);table.append(head);
 const body=makeEl('tbody');
 for(const [label,x,y] of [['公的年金',b.primaryPension+b.spousePension,t.publicPension],['その他の収入',b.totalIncome-b.primaryPension-b.spousePension,t.income-t.publicPension],['収入合計',b.totalIncome,t.income],['管理予算支出',b.expense,t.expense],['臨時支出（死亡費用込）',b.extraExpense,t.extraExpense+t.funeralExpense],['収支差額（運用益前）',b.totalIncome-b.expense-b.extraExpense,t.income-t.expense-t.extraExpense-t.funeralExpense]]){
  const tr=makeEl('tr');tableCell(tr,label);for(const v of [x,y,y-x])tableCell(tr,escMoney(v));body.append(tr);
 }
 table.append(body);wrap.append(table);root.append(wrap);
 const detail=makeEl('details');detail.append(makeEl('summary','','死亡翌月の費目別支出（登録内訳・未照合残額の倍率）'));
 const costs=makeEl('div','table-wrap'),ct=makeEl('table');ct.id='mortalityCostBreakdown';
 const ch=makeEl('thead'),cr=makeEl('tr');for(const v of ['費目','管理予算の配分％','倍率','基準月額','比較月額','減額（−は増額）'])tableCell(cr,v,true);ch.append(cr);ct.append(ch);const cb=makeEl('tbody');
 if(itemized){
  const basis=itemized.months[at];
  const rows=[
    ...itemized.items.map(item=>({id:item.id,label:item.label,amount:basis.amounts[item.id]||0,factor:itemFactors[item.id]})),
    {id:'unallocated',label:'未照合の管理予算残額',amount:basis.unallocated,factor:itemFactors.unallocated}
  ];
  for(const row of rows){
    const tr=makeEl('tr');tr.dataset.costKey=row.id;
    tableCell(tr,row.label);tableCell(tr,'登録額');tableCell(tr,percent(row.factor));
    for(const v of [row.amount,row.amount*row.factor,row.amount-row.amount*row.factor])tableCell(tr,escMoney(v));
    cb.append(tr);
  }
 }else{
  for(const row of allocation){
    const tr=makeEl('tr'),name=MORTALITY_COSTS.find(c=>c.key===row.key).label,amount=b.expense*row.share/100;
    tr.dataset.costKey=row.key;tableCell(tr,name);tableCell(tr,percent(row.share));tableCell(tr,percent(row.factor));
    for(const v of [amount,amount*row.factor,amount-amount*row.factor])tableCell(tr,escMoney(v));cb.append(tr);
  }
 }
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
  <label>残された方の公的年金合計（自身の年金＋遺族年金の差額・万円／年、老齢年金受給開始後の仮置き）<input name="survivorPension" type="number" step="any" min="0" required placeholder="遺族年金を含む合計年額"></label>
  <label id="mortalityPreClaimRow" hidden>老齢年金開始前の公的年金合計（死亡翌月から・万円／年、仮置き）<input name="preClaimPension" type="number" step="any" min="0" placeholder="区間の仮年額を入力"><small id="mortalityPreClaimHint" class="muted">繰下げと受給権は別途確認</small></label>
  <label>死亡月に1度だけ加える費用（万円、仮置き）<input name="funeral" type="number" step="any" min="0" value="0" required></label>
 </div>
 <p class="mortality-warning">試算に使う年金は<strong>自身の老齢基礎＋自身の老齢厚生＋追加される遺族厚生年金の差額の合計</strong>です。入力した合計に遺族年金を自動で上乗せしません。内訳を確認して参考計算する場合は、下の「遺族厚生年金の差額と合計を参考計算する」を開いてください。</p>
 <div id="mortalityPensionBreakdown" role="status" aria-live="polite"></div>
 <p class="muted">死亡月は元の年金、翌月から仮年額を12等分する近似です。葬儀費0は「今回の比較に費用を入れない」仮定であり、実費0円の認定ではありません。</p>
 <button id="mortalitySuggestAge" type="button" class="secondary">本人80歳期の開始月を入力（未反映）</button>
 <details><summary>遺族厚生年金の差額と合計を参考計算する（65歳以上・資料確認が必要）</summary>
  <p class="muted">受給権・請求状況・繰下げの影響を資料で確認した場合のみ使用してください。死亡者の老齢厚生年金の繰下げ増額分は含めません。計算結果は本人の確定受給額ではありません。</p>
  <div class="form-grid mortality-grid">
   <label>亡くなる方の老齢厚生年金の報酬比例部分（繰下げ加算なし・万円／年）<input name="deceasedEarnings" type="number" step="any" min="0" placeholder="資料を確認して入力"></label>
   <label>残された方自身の老齢厚生年金（万円／年）<input name="survivorEmployee" type="number" step="any" min="0"></label>
   <label>残された方自身の老齢基礎年金（万円／年）<input name="survivorBasic" type="number" step="any" min="0"></label>
  </div>
  <label class="check-label"><input name="entitlement" type="checkbox">遺族厚生年金の受給権を資料で確認した</label>
  <label class="check-label"><input name="claimed" type="checkbox">残された方の老齢年金請求・受給を確認した</label>
  <label class="check-label"><input name="deferral" type="checkbox">繰下げ待機中の受給権の影響を確認した</label>
  <button id="mortalityUseRegisteredPension" class="secondary" type="button">年金シートの登録済み内訳を引用</button>
  <button id="mortalityEstimatePension" class="secondary" type="button">自身の年金＋遺族厚生の差額を参考計算し、合計欄へ入力</button>
  <p id="mortalityEstimateNotice" class="muted" role="status"></p>
 </details>
 </fieldset>
 <fieldset><legend>2．死亡後の支出（登録費目ごと・管理予算残額も倍率変更）</legend>
 <p class="muted">夫婦健在時の登録費目の月額に、項目別の倍率を掛けます。<strong>配分％の入力は不要です。</strong>管理予算と確認済み費目の差額は「未照合の予算残額」とし、税社保・不明費用も含めて独立した倍率を指定できます。元の物価係数を二重適用しません。</p>
 <label>登録費目の参照先<select id="mortalityExpenseSource"><option value="">現在の採用済み出典／唯一の出典を使用</option><option value="public-v0.9">旧形式の費目内訳</option><option value="work-v0.9.7">標準形式の費目内訳</option></select></label>
 <p id="mortalityItemSourceNote" class="muted"></p>
 <div id="mortalityItemHost" class="mortality-item-rows"></div>
 <div class="mortality-item-row mortality-remainder-row"><strong>未照合の予算残額（税社保・不明費用を含む）</strong><span id="mortalityRemainderAmount">未計算</span><input id="mortalityRemainderFactor" type="number" min="0" max="3" step="0.05" value="1" aria-label="未照合の予算残額の倍率"><span>倍率を指定できます</span></div>
 <p id="mortalityItemState" class="muted" role="status"></p>
 <div hidden aria-hidden="true"><p>旧・未配分の仮配分方式は使用しません。</p>
 <div class="mortality-preset-controls"><button type="button" class="secondary" id="mortalityFictionalCosts">旧・架空配分</button><button type="button" class="secondary" id="mortalityResetCosts">旧・未配分へ戻す</button></div>
 <div id="mortalityCostRows" class="mortality-costs"></div>
 <p id="mortalityAllocationTotal" class="muted" role="status"></p></div>
 </fieldset>
 <label class="check-label"><input type="checkbox" name="reviewed" required> 年金年額・死亡月・費目別倍率と残額倍率が<strong>比較用の仮定</strong>で、現在の採用条件ではないことを確認しました。</label>
 <button id="mortalityRun" class="primary" type="submit">死亡後の収入・資産を試算（保存しない）</button>
 <button id="mortalityClear" class="secondary" type="button">試算結果をクリア（保存データ不変）</button>
 <button id="mortalityClearInputs" class="secondary" type="button">前回の比較入力をクリア（採用値は不変）</button>
 </form>
 <p id="mortalityState" role="status" class="muted">まだ比較していません。現在の資産計算や保存データは変わりません。</p>
 <div id="mortalityResults" hidden></div>
 `;
 const form=root.querySelector('#mortalityForm'),state=root.querySelector('#mortalityState'),results=root.querySelector('#mortalityResults'),costBox=root.querySelector('#mortalityCostRows');
 const initial=blankMortalityAllocation();for(const c of MORTALITY_COSTS)costBox.append(costInputRow(c,initial.find(x=>x.key===c.key)));
 let current=null,blockedExternal=false,pensionReference=null;
 const externalUpdateMessage='別画面で保存済み条件が更新されました。再読み込みしてから死亡時期の比較を試算してください。';
 const requireFreshBaseline=()=>{if(blockedExternal)throw new MortalityPreviewError('external-state-changed',externalUpdateMessage);};
 const values=()=>({deceased:form.elements.deceased.value,deathMonth:form.elements.deathMonth.value,survivorPension:form.elements.survivorPension.value,funeral:form.elements.funeral.value});
 const invalid=msg=>{results.hidden=true;results.replaceChildren();current=null;state.textContent=blockedExternal?externalUpdateMessage:msg;state.className='muted';};
 const pensionFields=['deceased','deathMonth','survivorPension','preClaimPension','deceasedEarnings','survivorEmployee','survivorBasic','entitlement','claimed','deferral'];
 const pensionSignature=()=>JSON.stringify({config:getConfig(),fields:pensionFields.map(key=>[key,form.elements[key].value,form.elements[key].checked])});
 const clearPensionReference=()=>{pensionReference=null;renderPensionBreakdown(root.querySelector('#mortalityPensionBreakdown'),null);root.querySelector('#mortalityEstimateNotice').textContent='';};
 const validPensionReference=()=>{if(pensionReference&&pensionReference.signature!==pensionSignature())clearPensionReference();return pensionReference?.value??null;};
 const pensionInputChanged=target=>{
  if(pensionFields.includes(target.name))clearPensionReference();else validPensionReference();
  // A month edit may emit input before change/blur. Old eligibility checks must
  // already be cleared while the edited month is still focused.
  if(['deceased','deathMonth'].includes(target.name)){
   for(const key of ['entitlement','claimed','deferral'])form.elements[key].checked=false;
   root.querySelector('#mortalityEstimateNotice').textContent='死亡対象・年月が変わったため受給条件の確認を解除しました。';
  }
 };
 const previous=readMortalityDraft(getConfig());
  if(previous?.values)for(const [key,value] of Object.entries(previous.values)){
    if(form.elements[key]&&typeof value==='string')form.elements[key].value=value;
  }
  let itemizedControls=null;
  const saveInputs=()=>{
    if(!itemizedControls)return; // simulated legacy harness lacks a DOM HTML parser
    const fields=['deceased','deathMonth','survivorPension','preClaimPension','funeral','deceasedEarnings','survivorEmployee','survivorBasic'];
    const values=Object.fromEntries(fields.map(k=>[k,form.elements[k]?.value||'']));
    values.sourceProfile=root.querySelector('#mortalityExpenseSource').value;
    values.residualFactor=root.querySelector('#mortalityRemainderFactor').value;
    saveMortalityDraft(getConfig(),values,itemizedControls.factorDraft());
  };
  itemizedControls=mountMortalityItemizedControls(root,{getConfig,runPlan,onChange:()=>{
    form.elements.reviewed.checked=false;
    if(current)invalid('死亡後の倍率が変わりました。もう一度試算してください。');
    saveInputs();
  }});
  if(itemizedControls)itemizedControls.restore(previous);
  const allocationInfo=()=>{
  for(const c of MORTALITY_COSTS){
   const effect=root.querySelector(`[data-mortality-effect="${c.key}"]`);
   try{
    const share=requiredNumber(root.querySelector(`[data-mortality-share="${c.key}"]`),c.label+'の配分'),factor=requiredNumber(root.querySelector(`[data-mortality-factor="${c.key}"]`),c.label+'の倍率');
    if(share<0||share>100||factor<0||factor>3||(c.key==='unallocated'&&factor!==1))throw Error('入力を確認してください');
    const reduction=share*(1-factor);
    effect.textContent=share===0?'配分0％：支出への影響0':Math.abs(reduction)<1e-10?'この費目の支出変更なし':`管理予算全体の ${percent(Math.abs(reduction))}％を${reduction>0?'減額':'増額'}`;
   }catch{effect.textContent='支出への影響は未計算：入力を確認';}
  }
  try{
   const allocation=currentAllocation(root),v=validateMortalityAllocation(allocation),effective=allocation.reduce((total,row)=>total+row.share*row.factor,0),reduction=100-effective;
   const change=Math.abs(reduction)<1e-10?'支出変更なし（減額0％）':`管理予算全体から ${percent(Math.abs(reduction))}％${reduction>0?'減額':'増額'}`;
   root.querySelector('#mortalityAllocationTotal').textContent=`仮配分合計 ${v.total.toFixed(2)}％。${change}。死亡翌月からの支出は基準管理予算の ${percent(effective)}％。未配分 ${percent(v.weights.unallocated*100)}％は倍率1.0で維持。`;
  }catch(e){root.querySelector('#mortalityAllocationTotal').textContent=`支出への影響は未計算：${e.message}`;}
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
 function showResult({mortality,original,allocation,itemized,itemFactors},parameters){
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
  const reference=validPensionReference();
  results.append(makeEl('p','muted',reference?`試算に使った年金の参考内訳：自身の基礎 ${formatTotal(reference.ownBasicAnnual)} ＋ 自身の厚生 ${formatTotal(reference.ownEmployeeAnnual)} ＋ 遺族厚生の差額 ${formatTotal(reference.survivorTopUpAnnual)} ＝ 合計 ${formatTotal(parameters.survivorPension)}／年。`:'試算に使った年金合計の内訳は未確認です。手入力の合計に遺族年金を自動加算していません。'));
  renderTransition(results,original.monthlyDetails,mortality,allocation,itemized,itemFactors);
  const periods=agePeriodComparisonRows(original.monthlyDetails,{mortality});
  const headingBlock=heading('年齢期別の収入・支出・残高の差','万円。収入・支出はその期の合計、資産は期末残高。年金は収入合計の内数です。「管理予算の減額」は基準支出から差し引いた額で、負の値は増額です。');results.append(...headingBlock);
  const region=makeEl('div','table-wrap mortality-table-wrap');region.tabIndex=0;region.setAttribute('role','region');region.setAttribute('aria-label','死亡時期の年齢期別比較表');
  const table=makeEl('table','mortality-table'),thead=makeEl('thead'),theadTr=makeEl('tr');table.id='mortalityAnnualComparison';
  for(const label of ['本人年齢期','基準：公的年金','比較：公的年金','基準：総収入','比較：総収入','基準：管理予算支出','比較：管理予算支出','管理予算の減額（−は増額）','基準：臨時支出','比較：臨時支出（死亡費用込）','基準：期末資産','比較：期末資産','残高差'])tableCell(theadTr,label,true);
  thead.append(theadTr);table.append(thead);const tbody=makeEl('tbody');
  for(const p of periods){const tr=makeEl('tr');tr.dataset.age=String(p.age);tableCell(tr,`${p.age}歳（${p.months}か月）`);for(const key of ['baselinePension','previewPension','baselineIncome','previewIncome','baselineExpense','previewExpense','expenseReduction','baselineExtraExpense','previewExtraExpense','baselineEndAsset','previewEndAsset','delta'])tableCell(tr,escMoney(p[key])).setAttribute('data-field',key);tbody.append(tr);}
  table.append(tbody);region.append(table);results.append(region);
  const foot=makeEl('p','muted','既存の臨時支出はそのまま計上し、死亡月に指定した一時費用だけを追加します。死亡後の未帰属収入がある場合は計算を停止します。負の期末資産は借入や実際の不足額とは断定できません。');results.append(foot);
 }
 form.addEventListener('input',e=>{if(e.target!==form.elements.reviewed)form.elements.reviewed.checked=false;pensionInputChanged(e.target);if(e.target.matches('[data-mortality-share],[data-mortality-factor]'))allocationInfo();ageHint();saveInputs();if(current)invalid('入力を変更したため、以前の試算は無効です。もう一度試算してください。');});
 form.addEventListener('change',e=>{if(e.target!==form.elements.reviewed)form.elements.reviewed.checked=false;pensionInputChanged(e.target);ageHint();if(itemizedControls&&['deathMonth','deceased'].includes(e.target.name))itemizedControls.refresh();saveInputs();if(current)invalid('条件が変わりました。再試算してください。');});
 root.querySelector('#mortalityFictionalCosts').addEventListener('click',()=>{setAllocation(root,fictionalMortalityAllocation());allocationInfo();invalid('架空6,500万円世帯の660万円費目配分例を入力しました。本人の登録費用ではありません。');form.elements.reviewed.checked=false;});
 root.querySelector('#mortalityResetCosts').addEventListener('click',()=>{setAllocation(root,blankMortalityAllocation());allocationInfo();invalid('支出は全額を未配分・倍率1.0に戻しました。');form.elements.reviewed.checked=false;});
 root.querySelector('#mortalitySuggestAge').addEventListener('click',()=>{
  try{requireFreshBaseline();const cfg=getConfig();if(!cfg)throw Error('設定を読み込んでください');const plan=runPlan(cfg,{includeMonthlyDetails:true});const row=plan.monthlyDetails.find(r=>r.age===80);if(!row)throw Error('80歳期が現在の計算対象外です');form.elements.deathMonth.value=row.month;form.elements.reviewed.checked=false;for(const key of ['entitlement','claimed','deferral'])form.elements[key].checked=false;clearPensionReference();ageHint();itemizedControls?.refresh();saveInputs();invalid('本人80歳期の最初の年月を候補にしました。死亡日・年金はまだ確認されていません。');}
  catch(e){invalid(e.message);}
 });
 root.querySelector('#mortalityUseRegisteredPension')?.addEventListener('click',()=>{
  try{
    requireFreshBaseline();
    const cfg=getConfig(),who=values().deceased==='primary'?'primary':'spouse',survivor=who==='primary'?'spouse':'primary';
    const own=cfg.income?.pensions?.[survivor],dead=cfg.income?.pensions?.[who],b=own?.breakdownAtStart,ref=dead?.survivorReference;
    if(!b||!ref||!b.source||!ref.source)throw Error('年金シートに内訳と出典を登録し、受給開始時点を確認してください');
    const parts=[b.basicAnnual,b.employeeAnnual,b.otherAnnual];
    if(!parts.every(x=>typeof x==='number'&&Number.isFinite(x))||Math.abs(parts.reduce((a,b)=>a+b,0)-Number(own.annualAtStart))>.01)
      throw Error('自身の基礎・厚生・その他の年金合計が登録済み年額と一致しません');
    if(!Number.isFinite(ref.earningsBeforeDeferralAnnual)||ref.earningsBeforeDeferralAnnual<0)
      throw Error('死亡者の報酬比例部分（繰下げ前）を資料で確認してください');
    form.elements.deceasedEarnings.value=String(ref.earningsBeforeDeferralAnnual);
    form.elements.survivorEmployee.value=String(b.employeeAnnual);
    form.elements.survivorBasic.value=String(b.basicAnnual);
    for(const k of ['entitlement','claimed','deferral'])form.elements[k].checked=false;
    clearPensionReference();invalid('保存済み内訳を参考欄へ引用しました。受給権・請求・繰下げ影響は改めて確認してください。');
    root.querySelector('#mortalityEstimateNotice').textContent='年金シートの出典付き内訳を引用しました。制度の受給資格まで自動認定したものではありません。';
    saveInputs();
  }catch(e){root.querySelector('#mortalityEstimateNotice').textContent=e.message;}
});
root.querySelector('#mortalityEstimatePension').addEventListener('click',()=>{
  clearPensionReference();
  try{
   requireFreshBaseline();const cfg=getConfig();if(!cfg)throw Error('採用条件を読み込んでください');
   const deceased=values().deceased,survivor=deceased==='primary'?'spouse':'primary';
   const month=values().deathMonth,dt=dateParts(month);if(!dt)throw Error('死亡年月を先に入力してください');
   const start=cfg.income?.pensions?.[survivor]?.startDate;if(!dateParts(start)||start.slice(0,7)>month)throw Error('保存済みの年金開始月ではまだ受給前です。制度概算の自動転記ではなく、区間ごとの仮年額を入力してください');
   const minAge=ageOn(`${month}-01`,cfg.people?.[survivor]?.birthDate),maxAge=ageOn(`${month}-${String(dt.days).padStart(2,'0')}`,cfg.people?.[survivor]?.birthDate);
   if(minAge===null||maxAge===null||minAge<65||maxAge<65)throw Error('残された方の死亡月内年齢が確定しません。誕生日付近は年月だけで65歳要件を判定できません');
   const r=estimateSurvivorReference65({deceasedEmployeeEarningsAnnualBase:requiredNumber(form.elements.deceasedEarnings,'死亡者の報酬比例部分'),survivorOwnEmployeeAnnual:requiredNumber(form.elements.survivorEmployee,'生存者の老齢厚生年金'),survivorOwnBasicAnnual:requiredNumber(form.elements.survivorBasic,'生存者の老齢基礎年金'),survivorAge:minAge,entitlementConfirmed:form.elements.entitlement.checked,ownPensionClaimConfirmed:form.elements.claimed.checked,deferralConflictReviewed:form.elements.deferral.checked});
   form.elements.survivorPension.value=String(Number(r.totalSurvivingPublicPensionAnnual.toFixed(6)));
   pensionReference={value:r,signature:pensionSignature()};renderPensionBreakdown(root.querySelector('#mortalityPensionBreakdown'),r);
   root.querySelector('#mortalityEstimateNotice').textContent=`自身の年金と遺族厚生の差額の参考内訳を表示し、合計年${escMoney(r.totalSurvivingPublicPensionAnnual)}万円を仮入力しました。実際の支給額、税社保、改定率は未確認です。`;
   invalid('参考年額を仮入力しました。受給権・資料の適用可否は本人確認が必要です。');form.elements.reviewed.checked=false;saveInputs();
  }catch(e){root.querySelector('#mortalityEstimateNotice').textContent=e.message;invalid('概算を入力できません。未確認を0として置き換えません。');}
 });
 root.querySelector('#mortalityClear').addEventListener('click',()=>invalid('試算結果をクリアしました。保存済みの条件は変更していません。'));
root.querySelector('#mortalityClearInputs')?.addEventListener('click',()=>{
  clearMortalityDraft();
  for(const key of ['deathMonth','survivorPension','preClaimPension','deceasedEarnings','survivorEmployee','survivorBasic'])form.elements[key].value='';
  form.elements.deceased.value='primary';form.elements.funeral.value='0';
  for(const k of ['reviewed','entitlement','claimed','deferral'])form.elements[k].checked=false;
  itemizedControls?.clear();clearPensionReference();ageHint();
  invalid('前回の比較入力のみを初期化しました。元の計画・年金・比較案・クラウドは変更していません。');
});
 form.addEventListener('invalid',e=>{let node=e.target.parentElement;while(node&&node!==form){if(node.tagName==='DETAILS')node.open=true;node=node.parentElement;}},true);
 form.addEventListener('submit',e=>{
  e.preventDefault();invalid('架空または仮置き条件を照合しています。');
  try{
   requireFreshBaseline();validPensionReference();const c=getConfig(),b=getBaseline();if(!c||!b)throw Error('現在設定を読み込んでください');
   const v=values();const x=calculateMortalityComparison({config:c,baseline:b,deathPerson:v.deceased,deathMonth:v.deathMonth,survivorTotalAnnual:requiredNumber(form.elements.survivorPension,'死亡後の年金年額'),survivorPensionBeforeClaimAnnual:form.elements.preClaimPension.required?requiredNumber(form.elements.preClaimPension,'老齢年金受給開始前の年金仮年額'):null,funeralExpenseMan:requiredNumber(form.elements.funeral,'死亡時一時費用'),
    allocation:itemizedControls?null:currentAllocation(root),
    ...(itemizedControls?{itemFactors:itemizedControls.read().factors,
      unallocatedFactor:itemizedControls.read().unallocatedFactor,
      expenseSourceProfile:itemizedControls.read().expenseSourceProfile}:{}),
    planCalculator:runPlan,acknowledged:form.elements.reviewed.checked});
   current=x;showResult(x,{...v,survivorPension:Number(v.survivorPension),funeral:Number(v.funeral)});saveInputs();
   state.textContent='比較計算が完了しました（採用・保存・クラウド書込みなし）。';
  }catch(error){invalid(`比較できません：${error.message}`);}
 });
 allocationInfo();ageHint();clearPensionReference();
 return {invalidate({external=false}={}){if(external===true)blockedExternal=true;ageHint();clearPensionReference();for(const key of ['entitlement','claimed','deferral'])form.elements[key].checked=false;for(const id of ['mortalityRun','mortalityEstimatePension','mortalitySuggestAge'])root.querySelector('#'+id).disabled=blockedExternal;root.querySelector('#mortalityEstimateNotice').textContent=blockedExternal?externalUpdateMessage:'保存済み条件の変更後は受給条件を再確認してください。';invalid('保存済みの条件が更新されたため、死亡時期の試算を無効にしました。必要なら再試算してください。');form.elements.reviewed.checked=false;},getCurrentComparison(){return current;}};
}
