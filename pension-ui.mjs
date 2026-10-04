import {CERTAINTY_LABELS,formatMan,runRetirementPlan,expenseDetailSummary,plannedTaxSocialAnnual} from './calc.mjs';
import {PENSION_PEOPLE,pensionDraftFromConfig,pensionDraftContext,pensionDraftMatches,previewPension,applyPensionPreview,pensionUndoAvailable,undoPensionApply} from './pension.mjs';
import {configSignature,saveConfigIfUnchanged,savePensionDraft,loadPensionDraft,clearPensionDraft} from './storage.mjs';

const names={primary:'本人',spouse:'配偶者'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yen=v=>`${formatMan(v,4)}万円`;
const el=id=>document.getElementById(id);
const month=p=>p.startDate?.slice(0,7)||'未設定';
const dateText=s=>new Date(s).toLocaleString('ja-JP');
const taxAnnual=(c,age)=>plannedTaxSocialAnnual(c,age)??0;

export function mountPensionSheet({getConfig,onCommit,showNotice}){
  let draft=null, preview=null;
  const error=message=>{el('pensionError').textContent=message;el('pensionError').hidden=!message;};
  function readDraft(){
    return Object.fromEntries(PENSION_PEOPLE.map(key=>[key,{
      startMonth:el(`${key}PensionMonth`).value,annualAtStart:el(`${key}PensionAmount`).value,
      certainty:el(`${key}PensionCertainty`).value,adoptionSource:el(`${key}PensionSource`).value
    }]));
  }
  function saveDraft(){
    try{savePensionDraft({context:pensionDraftContext(getConfig()),draft});el('pensionDraftNote').textContent='試算中の入力もこの端末に保存します。集計表の採用値は反映操作まで変わりません。';}
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
        <label>${names[key]}の受給開始月<input id="${key}PensionMonth" type="month" min="1000-01" max="9999-12"></label>
        <label>${names[key]}の年金年額（税引前・万円）<input id="${key}PensionAmount" type="number" min="0" step="0.0001" required inputmode="decimal"></label>
        <label>${names[key]}の金額の確度<select id="${key}PensionCertainty">${options}</select></label>
        <label>${names[key]}の出典・メモ<input id="${key}PensionSource" type="text" maxlength="160" placeholder="資料名・確認日など"></label>
      </fieldset>`).join('');
      for(const key of PENSION_PEOPLE){
        el(`${key}PensionMonth`).value=draft[key].startMonth||'';
        el(`${key}PensionAmount`).value=draft[key].annualAtStart??'';
        el(`${key}PensionCertainty`).value=draft[key].certainty||'unknown';
        el(`${key}PensionSource`).value=draft[key].adoptionSource||'';
      }
      el('pensionDraftNote').textContent='試算中の入力もこの端末に保存します。集計表の採用値は反映操作まで変わりません。';
    }
    for(const key of PENSION_PEOPLE){
      const p=c.income.pensions[key];
      el(`${key}PensionAdopted`).textContent=`現在の採用値：${month(p)}から ${yen(p.annualAtStart)}/年（${CERTAINTY_LABELS[p.certainty]||'未確認'}）`;
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
      return `<tr><th>${names[key]}</th><td>${esc(month(a))} → ${esc(month(b))}</td><td>${yen(a.annualAtStart)} → ${yen(b.annualAtStart)}</td><td>${esc(CERTAINTY_LABELS[a.certainty]||'未確認')} → ${esc(CERTAINTY_LABELS[b.certainty]||'未確認')}</td><td>${esc(b.adoptionSource||'未記録')}</td></tr>`;
    }).join('');
    const yearly=after.rows.map((r,i)=>{
      const old=before.rows[i], oldDetail=expenseDetailSummary(c,r.age), newDetail=expenseDetailSummary(next,r.age);
      const oldTax=taxAnnual(c,r.age), newTax=taxAnnual(next,r.age);
      if(Math.abs(r.pension-old.pension)<1e-8&&Math.abs(newTax-oldTax)<1e-8)return '';
      return `<tr><th>${r.age}歳</th><td>${yen(old.primaryPension)} → ${yen(r.primaryPension)}</td><td>${yen(old.spousePension)} → ${yen(r.spousePension)}</td><td>${oldDetail?`${yen(oldTax)} → ${yen(newTax)}`:'内訳未登録'}</td><td>${oldDetail&&newDetail?`${yen(oldDetail.difference)} → ${yen(newDetail.difference)}`:'内訳未登録'}</td></tr>`;
    }).filter(Boolean).join('');
    el('pensionPreviewBody').innerHTML=`<p>対象：${esc(c.meta?.label||'現在の計画')}。${preview.changedPeople.length?'次の変更を集計表へ反映します。':'採用中の設定と同じです。'}</p>
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
    for(const key of PENSION_PEOPLE){
      if([`${key}PensionMonth`,`${key}PensionAmount`].includes(event.target.id)&&['confirmed','official_estimate'].includes(el(`${key}PensionCertainty`).value))
        el(`${key}PensionCertainty`).value='scenario';
    }
    draft=readDraft();invalidate();error('');saveDraft();state();
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
