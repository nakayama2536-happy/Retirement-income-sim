import {CERTAINTY_LABELS,formatMan,runRetirementPlan,expenseDetailSummary,plannedTaxSocialAnnual} from './calc.mjs';
import {PENSION_PEOPLE,pensionDraftFromConfig,pensionDraftContext,pensionDraftMatches,previewPension,applyPensionPreview,pensionUndoAvailable,undoPensionApply} from './pension.mjs';
import {configSignature,saveConfigIfUnchanged,savePensionDraft,loadPensionDraft,clearPensionDraft} from './storage.mjs';
import {dateWithAge,dateAgeHint} from './date-display.mjs';
import {estimatePensionAtMonth} from './pension-estimate.mjs';

const names={primary:'本人',spouse:'配偶者'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yen=v=>`${formatMan(v,4)}万円`;
const el=id=>document.getElementById(id);
const month=(p,c,key)=>dateWithAge(p.startDate?.slice(0,7),c,key);
const dateText=s=>new Date(s).toLocaleString('ja-JP');
const taxAnnual=(c,age)=>plannedTaxSocialAnnual(c,age)??0;

export function mountPensionSheet({getConfig,onCommit,showNotice}){
  let draft=null, preview=null;
  function estimate(key){return estimatePensionAtMonth({birthDate:getConfig().people?.[key]?.birthDate,startMonth:el(`${key}PensionMonth`).value,base65:el(`${key}PensionBase65`).value});}
  function renderEstimate(key){
    const c=getConfig(),r=estimate(key);
    el(`${key}PensionMonthAge`).textContent=dateAgeHint(el(`${key}PensionMonth`).value,c,key);
    el(`${key}PensionUseEstimate`).disabled=!r.ok;
    el(`${key}PensionEstimate`).textContent=r.ok?`修正見込額：${yen(r.annual)}/年（65歳基準額から${r.factor>=1?'+':''}${((r.factor-1)*100).toFixed(1)}%）。請求想定月：${dateWithAge(r.claimMonth,c,key)}。年額欄への入力は下のボタンで行います。`:r.message;
    const changed=el(`${key}PensionMonth`).value!==(c.income.pensions[key].startDate?.slice(0,7)||'');
    if(changed)el(`${key}PensionEstimateDetails`).open=true;
    el(`${key}PensionAmountNote`).textContent=changed?'開始月を変更しています。見込額を年額欄へ入れるか、公式資料の金額を直接入力してください。':'年額は公式資料の金額を直接入力することもできます。';
  }
  function renderBreakdown(key){
    const p=getConfig().income.pensions[key];
    if(!el(key+'PensionBasic'))return;
    const fields=['Basic','Employee','Other'].map(k=>el(key+'Pension'+k).value.trim());
    const amounts=fields.map(v=>v===''?null:Number(v));
    const total=Number(el(key+'PensionAmount').value);
    const hint=el(key+'PensionBreakdownHint');
    if(amounts.every(x=>x===null)){hint.textContent='内訳未入力です。従来の年金合計額から推定分割しません。';return;}
    const sum=amounts.filter(x=>x!==null&&Number.isFinite(x)).reduce((a,b)=>a+b,0);
    const full=amounts.every(x=>x!==null&&Number.isFinite(x));
    hint.textContent=full?(Math.abs(sum-total)<=.01?'内訳合計と年金合計が一致しています。':'内訳合計 '+yen(sum)+'／年と年金合計 '+yen(total)+'／年が一致しません。反映できません。'):'入力済み内訳の小計 '+yen(sum)+'／年。未入力項目は0円とみなさず、年金合計は現在の値を維持します。';
    if(p.startDate?.slice(0,7)!==el(key+'PensionMonth').value)hint.textContent+=' 受給開始月の変更後は内訳の対象時点も確認してください。';
  }
  const error=message=>{el('pensionError').textContent=message;el('pensionError').hidden=!message;};
  function readDraft(){
    const c=getConfig();
    return Object.fromEntries(PENSION_PEOPLE.map(key=>{
      const old=c.income.pensions[key],d={
        startMonth:el(key+'PensionMonth').value,annualAtStart:el(key+'PensionAmount').value,
        certainty:el(key+'PensionCertainty').value,adoptionSource:el(key+'PensionSource').value
      };
      const v=['Basic','Employee','Other'].map(k=>el(key+'Pension'+k).value.trim());
      const source=el(key+'PensionBreakdownSource').value.trim();
      if(v.some(x=>x!=='')||source)d.breakdownAtStart={...(old.breakdownAtStart||{}),basicAnnual:v[0],employeeAnnual:v[1],otherAnnual:v[2],source};
      else if(old.breakdownAtStart)d.breakdownAtStart=null;
      const earnings=el(key+'PensionPreDeferral').value.trim(),referenceSource=el(key+'PensionPreDeferralSource').value.trim();
      if(earnings!==''||referenceSource)d.survivorReference={...(old.survivorReference||{}),earningsBeforeDeferralAnnual:earnings,source:referenceSource};
      else if(old.survivorReference)d.survivorReference=null;
      const referenceValues=['65Basic','65Earnings','65Transitional','65Total'].map(k=>el(key+'Pension'+k).value.trim());
      const referenceSource=el(key+'Pension65Source').value.trim();
      if(referenceValues.some(v=>v!=='')||referenceSource)d.reference65={
        ...(old.reference65||{}),
        basicAnnual:referenceValues[0],employeeEarningsAnnual:referenceValues[1],
        transitionalAnnual:referenceValues[2],totalAnnual:referenceValues[3],source:referenceSource
      };
      else if(old.reference65)d.reference65=null;
      return [key,d];
    }));
  }
  function saveDraft(){
    try{savePensionDraft({context:pensionDraftContext(getConfig()),draft});el('pensionDraftNote').textContent='開始月・年額などの入力途中の内容は、このブラウザに下書き保存します。「全体シミュレーションに反映」を押すまで、ホームや年間収支は変わりません。';}
    catch{el('pensionDraftNote').textContent='試算中の入力を端末に保存できませんでした。画面を閉じると入力が失われます。';}
  }
  function invalidate(){preview=null;el('pensionPreview').hidden=true;}
  function state(){
    const c=getConfig();if(!c||!draft)return;
    el('pensionState').textContent=pensionDraftMatches(c,draft)?'反映済み':'未反映の変更あり';
    el('pensionState').dataset.dirty=String(!pensionDraftMatches(c,draft));
    el('pensionUndo').disabled=!pensionUndoAvailable(c);
  }
  function render(){
    const c=getConfig();if(!c)return;
    if(!draft){
      const stored=loadPensionDraft();
      draft=stored?.context===pensionDraftContext(c)&&PENSION_PEOPLE.every(k=>stored?.draft?.[k])?stored.draft:pensionDraftFromConfig(c);
      const options=Object.entries(CERTAINTY_LABELS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
      el('pensionInputs').innerHTML=PENSION_PEOPLE.map(key=>`<fieldset class="pension-person"><legend>${names[key]}</legend>
        <p id="${key}PensionAdopted" class="muted"></p><div id="${key}PensionReferences"></div>
        <label>${names[key]}の受給開始月<input id="${key}PensionMonth" type="month" min="1000-01" max="9999-12" aria-describedby="${key}PensionMonthAge"></label>
        <p id="${key}PensionMonthAge" class="muted" aria-live="polite"></p>
        <details id="${key}PensionEstimateDetails"><summary>開始月に合わせて年金見込額を計算</summary>
        <label>65歳から受け取る場合の年額（税引前・万円）<input id="${key}PensionBase65" type="number" min="0" step="0.0001" inputmode="decimal" placeholder="公式見込額などを入力"></label>
        <p class="muted">登録済みの65歳比較値があれば表示します。金額と根拠を確認してください。この基準欄の編集は画面を閉じると失われ、登録済みの比較値も変更しません。</p>
        <p id="${key}PensionEstimate" role="status"></p><button id="${key}PensionUseEstimate" class="secondary" type="button">修正見込額を年額欄に入力</button>
        <p class="muted">65歳に受給権があり、基礎・厚生年金を同じ月から受け取る場合の概算です。受給開始月の前月に請求する想定。加給年金・振替加算・在職による支給停止・障害／遺族年金との調整・加入継続による増額・将来改定・税社保は含みません。該当する場合は公式見込額を直接入力してください。</p>
        </details>
        <label>${names[key]}の年金年額（税引前・万円）<input id="${key}PensionAmount" type="number" min="0" step="0.0001" required inputmode="decimal"></label>
        <p id="${key}PensionAmountNote" class="muted"></p>
        <details class="pension-components" id="${key}PensionComponents"><summary>基礎年金・厚生年金を分けて入力（遺族年金計算の参考資料）</summary>
        <p class="muted">未入力は未確認のまま保持します。既存の合計額を自動分割せず、内訳を入力しても合計年金や資産計算を自動変更しません。全額入力した場合は元の合計年額と照合します。</p>
        <div class="form-grid pension-component-grid">
        <label><span>老齢基礎年金（万円／年）</span><input id="${key}PensionBasic" type="number" min="0" step="0.0001" inputmode="decimal"></label>
        <label><span>老齢厚生年金（万円／年）</span><input id="${key}PensionEmployee" type="number" min="0" step="0.0001" inputmode="decimal"></label>
        <label><span>その他加算・調整（万円／年）</span><input id="${key}PensionOther" type="number" min="0" step="0.0001" inputmode="decimal"></label>
        <label><span>内訳の資料名・確認日</span><input id="${key}PensionBreakdownSource" type="text" maxlength="160" placeholder="ねんきんネットなど"></label>
        <label><span>報酬比例部分・繰下げ加算前（万円／年）</span><input id="${key}PensionPreDeferral" type="number" min="0" step="0.0001" inputmode="decimal"></label>
        <label><span>報酬比例部分の資料名・確認日</span><input id="${key}PensionPreDeferralSource" type="text" maxlength="160"></label>
        </div>
        <p id="${key}PensionBreakdownHint" class="muted" role="status"></p>
        <p class="muted">遺族厚生年金は報酬比例部分をもとに条件付きで試算します。老齢厚生年金総額を報酬比例部分として自動転用しません。</p>
        </details>
        <details class="pension-components" id="${key}Pension65Reference">
         <summary>65歳基準の年金内訳（70歳・75歳開始額とは別）</summary>
         <p class="muted">65歳時点のねんきん定期便などの数値を入力します。受給開始を70歳にした場合も、65歳の内訳を70歳年金へ上書きしません。死亡者の報酬比例部分を確認する参考情報です。</p>
         <div class="form-grid pension-component-grid">
          <label><span>65歳：老齢基礎年金（万円／年）</span><input id="${key}Pension65Basic" type="number" min="0" step="0.0001"></label>
          <label><span>65歳：老齢厚生年金の報酬比例（万円／年）</span><input id="${key}Pension65Earnings" type="number" min="0" step="0.0001"></label>
          <label><span>65歳：経過的加算等（万円／年）</span><input id="${key}Pension65Transitional" type="number" min="0" step="0.0001"></label>
          <label><span>65歳：合計年額（万円／年）</span><input id="${key}Pension65Total" type="number" min="0" step="0.0001"></label>
          <label><span>資料名・確認日</span><input id="${key}Pension65Source" type="text" maxlength="160"></label>
         </div>
         <p class="muted">65歳時点の基礎＋報酬比例＋経過的加算等＝65歳合計を照合します。未入力を0円として補いません。</p>
        </details>
        <label>${names[key]}の金額の確度<select id="${key}PensionCertainty">${options}</select></label>
        <label>${names[key]}の出典・メモ<input id="${key}PensionSource" type="text" maxlength="160" placeholder="資料名・確認日など"></label>
      </fieldset>`).join('');
      for(const key of PENSION_PEOPLE){
        el(`${key}PensionMonth`).value=draft[key].startMonth||'';
        el(`${key}PensionAmount`).value=draft[key].annualAtStart??'';
        el(`${key}PensionCertainty`).value=draft[key].certainty||'unknown';
        el(`${key}PensionSource`).value=draft[key].adoptionSource||'';
        const b=draft[key].breakdownAtStart||{},v=draft[key].survivorReference||{};
        for(const [suffix,field] of [['Basic','basicAnnual'],['Employee','employeeAnnual'],['Other','otherAnnual']])el(key+'Pension'+suffix).value=b[field]??'';
        el(key+'PensionBreakdownSource').value=b.source||'';
        el(key+'PensionPreDeferral').value=v.earningsBeforeDeferralAnnual??'';
        el(key+'PensionPreDeferralSource').value=v.source||'';
        const ref65=draft[key].reference65||{};
        for(const [suffix,field] of [['65Basic','basicAnnual'],['65Earnings','employeeEarningsAnnual'],['65Transitional','transitionalAnnual'],['65Total','totalAnnual']])
          el(key+'Pension'+suffix).value=ref65[field]??'';
        el(key+'Pension65Source').value=ref65.source||'';
        const base=c.income.pensions[key].alternatives?.['65'];
        el(`${key}PensionBase65`).value=typeof base==='number'&&Number.isFinite(base)&&base>=0?base:'';
        el(`${key}PensionUseEstimate`).addEventListener('click',()=>{
          const r=estimate(key);if(!r.ok)return;
          el(`${key}PensionAmount`).value=String(r.annual);
          el(`${key}PensionCertainty`).value='scenario';
          el(`${key}PensionSource`).value=`開始月連動の概算：65歳年額${r.base65}万円、請求想定${r.claimMonth}、増減率${((r.factor-1)*100).toFixed(1)}%。制度確認2026-10-11`;
          draft=readDraft();invalidate();error('');saveDraft();state();renderEstimate(key);
          showNotice(`${names[key]}の修正見込額を入力しました。次に「変更後の結果を確認（未反映）」を押してください。`);
        });
      }
      el('pensionDraftNote').textContent='入力途中の内容はこのブラウザに下書き保存します。ホームや年間収支への反映は、試算結果を確認した後に行います。';
    }
    for(const key of PENSION_PEOPLE){
      const p=c.income.pensions[key];
      el(`${key}PensionAdopted`).textContent=`現在のシミュレーションで使用中：${month(p,c,key)}から ${yen(p.annualAtStart)}/年（${CERTAINTY_LABELS[p.certainty]||'未確認'}）`;
      renderEstimate(key);renderBreakdown(key);
      const refs=Object.entries(p.alternatives||{}).filter(([age,value])=>/^\d+$/.test(age)&&typeof value==='number'&&Number.isFinite(value));
      el(`${key}PensionReferences`).innerHTML=refs.length?`<details><summary>登録済みの比較値を見る</summary><ul class="pension-reference">${refs.map(([age,value])=>`<li>${esc(age)}歳：${yen(value)}/年</li>`).join('')}</ul><p class="muted">${esc(p.note||'出典・受給条件は元の資料で確認してください。')}<br>比較値は今回の反映では変更しません。</p></details>`:'<p class="muted">比較用の見込額は未登録です。</p>';
    }
    if(preview&&preview.baseSignature!==configSignature(c)){invalidate();error('前提が更新されました。入力を確認して、もう一度試算してください。');}
    const latest=c.pensionWorkflow?.history?.at(-1);
    el('pensionLastApplied').textContent=latest?`${dateText(latest.at)}：${(latest.people||[]).map(k=>names[k]||k).join('・')}の年金を${latest.action==='undo'?'取消':'反映'}。${latest.planLabel?`対象：${latest.planLabel}。`:''}更新元：年金シート。`:'反映履歴はまだありません。現在の採用値は読み込んだ設定に基づきます。';
    state();
  }
  function reset({forget=true}={}){
    invalidate();draft=null;error('');
    if(forget){try{clearPensionDraft();}catch{}}
  }
  function renderPreview(){
    const c=getConfig(), next=preview.candidate, before=runRetirementPlan(c), after=preview.result;
    const diff=after.finalAsset-before.finalAsset;
    const changes=preview.changedPeople.map(key=>{
      const a=c.income.pensions[key], b=next.income.pensions[key];
      return `<tr><th>${names[key]}</th><td>${esc(month(a,c,key))} → ${esc(month(b,next,key))}</td><td>${yen(a.annualAtStart)} → ${yen(b.annualAtStart)}</td><td>${esc(CERTAINTY_LABELS[a.certainty]||'未確認')} → ${esc(CERTAINTY_LABELS[b.certainty]||'未確認')}</td><td>${esc(b.adoptionSource||'未記録')}</td></tr>`;
    }).join('');
    const yearly=after.rows.map((r,i)=>{
      const old=before.rows[i], oldDetail=expenseDetailSummary(c,r.age), newDetail=expenseDetailSummary(next,r.age);
      const oldTax=taxAnnual(c,r.age), newTax=taxAnnual(next,r.age);
      if(Math.abs(r.pension-old.pension)<1e-8&&Math.abs(newTax-oldTax)<1e-8)return '';
      return `<tr><th>${r.age}歳</th><td>${yen(old.primaryPension)} → ${yen(r.primaryPension)}</td><td>${yen(old.spousePension)} → ${yen(r.spousePension)}</td><td>${oldDetail?`${yen(oldTax)} → ${yen(newTax)}`:'内訳未登録'}</td><td>${oldDetail&&newDetail?`${yen(oldDetail.difference)} → ${yen(newDetail.difference)}`:'内訳未登録'}</td></tr>`;
    }).filter(Boolean).join('');
    el('pensionPreviewBody').innerHTML=`<p>対象：${esc(c.meta?.label||'現在の計画')}。${preview.changedPeople.length?'試算結果です。下の反映ボタンを押すと、この条件を使用します。':'現在使用中の設定と同じです。'}</p>
      ${changes?`<div class="table-wrap"><table><thead><tr><th>対象</th><th>開始月</th><th>年額（税引前）</th><th>確度</th><th>反映する出典・メモ</th></tr></thead><tbody>${changes}</tbody></table></div>`:''}
      <div class="pension-impact"><span>${c.plan.endAge}歳末の計画資産</span><strong>${yen(before.finalAsset)} → ${yen(after.finalAsset)}</strong><span>差額 ${diff>=0?'+':''}${yen(diff)}</span></div>
      <details><summary>年齢別の影響を確認</summary><p class="muted">本人の年齢期ごとの年額。税・社保は予定原価に採用する概算額、バッファは管理予算との差です。内訳の期間指定・インフレ設定も反映します。</p>${yearly?`<div class="table-wrap"><table><thead><tr><th>本人年齢</th><th>本人年金</th><th>配偶者年金</th><th>税・社保（概算）</th><th>バッファ</th></tr></thead><tbody>${yearly}</tbody></table></div>`:'<p>期間内の年金収入・税社保に金額の差はありません。</p>'}</details>
      <p class="muted">年金は税引前収入として計上します。税・社保は管理予算に含まれ、予定原価・バッファの確認に使います。管理予算を変えない限り、税・社保内訳の増減だけでは資産推移は変わりません。</p>
      <p class="muted">税・社保は既存制度による簡略概算です。暦年課税・前年所得・年度途中の保険切替・個別控除・iDeCo年金との合算は未反映です。</p>`;
    el('pensionApply').disabled=!preview.changedPeople.length;
    el('pensionPreview').hidden=false;
    el('pensionPreview').scrollIntoView({block:'start',behavior:'smooth'});
  }
  el('pensionForm').addEventListener('input',event=>{
    const baseKey=PENSION_PEOPLE.find(k=>event.target.id===`${k}PensionBase65`);
    if(baseKey){invalidate();error('');renderEstimate(baseKey);return;}
    for(const key of PENSION_PEOPLE){
      if([`${key}PensionMonth`,`${key}PensionAmount`].includes(event.target.id)&&['confirmed','official_estimate'].includes(el(`${key}PensionCertainty`).value))
        el(`${key}PensionCertainty`).value='scenario';
    }
    draft=readDraft();invalidate();error('');saveDraft();state();PENSION_PEOPLE.forEach(k=>{renderEstimate(k);renderBreakdown(k);});
  });
  el('pensionForm').addEventListener('submit',event=>{
    event.preventDefault();error('');draft=readDraft();saveDraft();
    try{preview=previewPension(getConfig(),draft);renderPreview();}catch(e){invalidate();error(e.message);}
  });
  el('pensionReset').addEventListener('click',()=>{reset();render();});
  el('pensionApply').addEventListener('click',()=>{
    error('');
    let applied;
    try{applied=applyPensionPreview(getConfig(),preview,saveConfigIfUnchanged);}
    catch(e){error(`反映できませんでした。${e.message}`);return;}
    reset();onCommit(applied);render();
    showNotice(applied.changed?'年金を集計表に反映し、全期間を再計算しました。':'採用中の設定と同じため、更新はありません。');
  });
  el('pensionUndo').addEventListener('click',()=>{
    error('');const keepDraft=draft&&!pensionDraftMatches(getConfig(),draft);
    let undone;
    try{undone=undoPensionApply(getConfig(),saveConfigIfUnchanged);}
    catch(e){error(`取消できませんでした。${e.message}`);return;}
    if(keepDraft)invalidate();else reset();
    onCommit(undone);render();if(keepDraft)saveDraft();
    showNotice('直前の年金反映を取り消しました。');
  });
  return {render,reset,invalidate};
}
