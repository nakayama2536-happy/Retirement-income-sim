import {formatMan} from './calc.mjs';
import {configSignature,downloadJson} from './storage.mjs';
import {salaryDraftFromConfig,previewSalary,applySalaryPreview,undoSalaryApply,salaryUndoAvailable,salaryDraftMatches,saveSalaryScenario,saveSalaryDraft,loadSalaryDraft,clearSalaryDraft} from './salary-workflow.mjs';
import {parseMonth} from './salary-life.mjs';
const el=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>`${formatMan(n,2)}万円`;
const nextMonth=value=>{const n=parseMonth(value);return n===null?'未設定':`${Math.floor((n+1)/12)}-${String((n+1)%12+1).padStart(2,'0')}`;};
const option=(value,label)=>`<option value="${esc(value)}">${esc(label)}</option>`;
const receiptOptions=()=>option('','未確認')+option('separate','別枠で資産に計上')+option('net_transfer','追加・取崩しに含む');
const fundingValue=v=>v?.source?`${v.source}${v.accounting?':'+v.accounting:''}`:'';
const fundingObject=value=>{if(!value)return undefined;const [source,accounting]=value.split(':');return accounting?{source,accounting}:{source};};

export function mountSalarySheet({getState,onCommit,showNotice}){
  let draft=null,preview=null,busy=false;
  const error=message=>{el('salaryError').textContent=message;el('salaryError').hidden=!message;};
  function invalidate(){preview=null;el('salaryPreview').hidden=true;el('salaryApply').disabled=true;el('salarySaveScenario').disabled=true;}
  function persist(){try{saveSalaryDraft(getState().config,draft);el('salaryDraftNote').textContent='入力中の条件をこの端末に保存しました。集計表は反映するまで変わりません。';}catch{el('salaryDraftNote').textContent='入力を保存できませんでした。画面を閉じると入力が失われます。採用済み設定は変更していません。';}}
  function read(){
    const d=structuredClone(draft),s=d.settings;
    for(const k of ['lastSalaryMonth','monthlyAddition','monthlyWithdrawal','pre65MonthlyBudget'])s[k]=el('salary_'+k).value;
    s.postSalaryLabor={mode:el('salary_laborMode').value};
    if(s.postSalaryLabor.mode==='monthly')Object.assign(s.postSalaryLabor,{monthlyAmount:el('salary_laborAmount').value,lastMonth:el('salary_laborLastMonth').value});
    s.idecoFunding={};for(const phase of ['before','after']){const v=fundingObject(el('salary_funding_'+phase).value);if(v)s.idecoFunding[phase]=v;}
    s.receiptTreatment={};for(const key of ['pension','ideco','unemployment']){const v=el('salary_receipt_'+key).value;if(v)s.receiptTreatment[key]=v;}
    d.monthsConfirmed=el('salary_monthsConfirmed').value;
    for(const [kind,list] of [['event',d.eventTreatments],['period',d.periodTreatments]])list.forEach((v,i)=>{const node=el(`salary_${kind}_${i}`);if(node)list[i]=node.value;});
    return d;
  }
  function state(){
    const c=getState().config;if(!c||!draft)return;
    const matches=salaryDraftMatches(c,draft);
    el('salaryState').textContent=matches?'反映済み':c.cashflow?.salaryLife?'未反映の変更あり':'旧方式を使用中・新方式は未反映';
    el('salaryState').dataset.dirty=String(!matches);
    el('salaryUndo').disabled=busy||!salaryUndoAvailable(c);
    el('salary_switchMonth').textContent=nextMonth(draft.settings.lastSalaryMonth);
    el('salary_laborDetail').hidden=el('salary_laborMode').value!=='monthly';
  }
  function buildInputs(c){
    const s=draft.settings;
    el('salaryInputs').innerHTML=`<fieldset class="pension-person"><legend>1. 試す条件</legend>
      <p>65歳基準案：給与生活は <strong>${esc(draft.baselineMonth)}</strong> まで、資産からの生活費負担は <strong>${esc(nextMonth(draft.baselineMonth))}</strong> から。</p>
      <label>試す案の給与生活最終月（その月を含む）<input id="salary_lastSalaryMonth" type="month" required></label>
      <p>資産からの生活費負担開始月：<strong id="salary_switchMonth"></strong></p>
      <label>月の切替の確認<select id="salary_monthsConfirmed">${option('','未確認')+option('yes','上記の最終月・負担開始月で試算する')}</select></label>
      <label>給与生活中の追加投資（万円／月）<input id="salary_monthlyAddition" type="number" min="0" step="any" inputmode="decimal" required></label>
      <label>給与生活中の取崩し（万円／月）<input id="salary_monthlyWithdrawal" type="number" min="0" step="any" inputmode="decimal" required></label>
      <button id="salaryZero" type="button" class="secondary">追加・取崩しなし（両方0）</button>
      <label>前倒し終了後～65歳の管理予算（万円／月）<input id="salary_pre65MonthlyBudget" type="number" min="0" step="any" inputmode="decimal"></label>
      <p class="muted">前倒し期間がある場合は必須です。税・社保を含む管理予算を、元の計画開始日時点の価格で入力します。生活費内訳を別に加算しません。</p>
      <label>終了後の就労収入<select id="salary_laborMode">${option('','未確認')+option('none','就労収入なし')+option('existing_confirmed','現在登録されている夫婦の就労条件を使う')+option('monthly','夫婦合計の月額と最終月を指定')}</select></label>
      <div id="salary_laborDetail"><label>夫婦合計の就労収入（税引前・万円／月）<input id="salary_laborAmount" type="number" min="0" step="any" inputmode="decimal"></label><label>就労収入の最終月（その月を含む）<input id="salary_laborLastMonth" type="month"></label></div>
      <p id="salaryExistingLabor" class="muted"></p>
    </fieldset>
    <fieldset class="pension-person"><legend>2. iDeCo・受取・臨時収支</legend>
      <p id="salaryRelated" class="muted"></p>
      <label>給与生活中のiDeCo掛金原資<select id="salary_funding_before">${option('','未確認／掛金なし')+option('salary','給与から支払う')+option('plan_asset:separate','投資資産から別枠で支払う')+option('plan_asset:withdrawal','上の取崩し額に含める')}</select></label>
      <label>終了後も掛金が続く場合の原資<select id="salary_funding_after">${option('','未確認／終了後の掛金なし')+option('household','終了後の家計資金から支払う（別途確認済み）')+option('plan_asset:separate','投資資産から別枠で支払う')+option('plan_asset:budget','管理予算に含める')}</select></label>
      <p class="muted">掛金終了月・受取月は変えません。前倒し後の加入資格や支払原資は別途確認が必要です。</p>
      <details><summary>給与生活中の受取・臨時収支の計上先</summary>
      ${[['pension','公的年金'],['ideco','iDeCo受取'],['unemployment','失業給付']].map(([key,label])=>`<label>給与生活中の${label}<select id="salary_receipt_${key}">${receiptOptions()}</select></label>`).join('')}
      <p class="muted">該当の受取がある場合に選択します。「追加・取崩しに含む」は上の月額に織り込み済みという指定です。</p>
      ${(c.events||[]).map((x,i)=>`<label>${esc(x.date)} ${esc(x.label||'臨時収支')} ${money(x.amount)}<select id="salary_event_${i}">${receiptOptions()+ (x.type==='expense'?option('budget','終了後の管理予算に含む'):'')}</select></label>`).join('')}
      ${(c.cashflow?.periodOverrides||[]).map((x,i)=>x.kind==='income'?`<label>${esc(x.label||x.key)}（${esc(x.fromAge)}～${esc(x.toAge)}歳）<select id="salary_period_${i}">${receiptOptions()}</select></label>`:'').join('')}
      </details>
    </fieldset>`;
    for(const k of ['lastSalaryMonth','monthlyAddition','monthlyWithdrawal','pre65MonthlyBudget'])el('salary_'+k).value=s[k]??'';
    el('salary_monthsConfirmed').value=draft.monthsConfirmed||'';
    el('salary_laborMode').value=s.postSalaryLabor?.mode||'';
    el('salary_laborAmount').value=s.postSalaryLabor?.monthlyAmount??'';el('salary_laborLastMonth').value=s.postSalaryLabor?.lastMonth||'';
    for(const phase of ['before','after'])el('salary_funding_'+phase).value=fundingValue(s.idecoFunding?.[phase]);
    for(const key of ['pension','ideco','unemployment'])el('salary_receipt_'+key).value=s.receiptTreatment?.[key]||'';
    for(const [kind,values] of [['event',draft.eventTreatments],['period',draft.periodTreatments]])values.forEach((v,i)=>{const node=el(`salary_${kind}_${i}`);if(node)node.value=v;});
    el('salaryZero').addEventListener('click',()=>{el('salary_monthlyAddition').value='0';el('salary_monthlyWithdrawal').value='0';changed();});
  }
  function render(){
    const c=getState().config;if(!c)return;
    if(!draft){draft=loadSalaryDraft(c)||salaryDraftFromConfig(c);buildInputs(c);el('salaryDraftNote').textContent='入力は集計表と別に保存します。まだ反映していません。';}
    const adopted=c.cashflow?.salaryLife;
    el('salaryAdopted').textContent=adopted?`採用中：給与生活 ${adopted.lastSalaryMonth}まで、生活費負担 ${nextMonth(adopted.lastSalaryMonth)}から。追加 ${money(adopted.monthlyAddition)}/月、取崩し ${money(adopted.monthlyWithdrawal)}/月。`:'採用中：旧方式。新方式の試算・比較だけでは現在の計画を変更しません。';
    const p=c.employment?.primary?.sideWork||{},sp=c.employment?.spouse?.sideWork||{};
    el('salaryExistingLabor').textContent=`登録済み就労収入：本人 ${money(p.monthlyGross)}/月（${p.startDate||'退職日などから算出'}～${p.endDate||'既定終了日'}）、配偶者 ${money(sp.monthlyGross)}/月（${sp.startDate||'開始指定なし'}～${sp.endDate||'終了指定なし'}）。選んだモードで採用します。`;
    el('salaryRelated').textContent=`iDeCo掛金 ${money(c.ideco?.monthlyContribution)}/月、拠出終了 ${c.ideco?.contributionEndDate||'未設定'}。年金開始：本人 ${c.income?.pensions?.primary?.startDate||'未設定'}、配偶者 ${c.income?.pensions?.spouse?.startDate||'未設定'}。`;
    if(preview&&preview.baseSignature!==configSignature(getState())){invalidate();error('前提または比較案が変わりました。もう一度試算してください。');}
    const last=c.salaryWorkflow?.history?.at(-1);
    el('salaryHistory').textContent=last?`${new Date(last.at).toLocaleString('ja-JP')}：給与生活の設定を${last.action==='undo'?'取消':'反映'}。`:'反映履歴はありません。';
    state();
  }
  function renderPreview(){
    const p=preview,dates=p.candidate.cashflow.salaryLife;
    const tableRows=p.result.rows.map(r=>{const a=p.before.rows.find(x=>x.age===r.age),b=p.baselineResult.rows.find(x=>x.age===r.age);return `<tr><th>${r.age}歳末</th><td>${a?money(a.endAsset):'—'}</td><td>${b?money(b.endAsset):'—'}</td><td>${money(r.endAsset)}</td></tr>`;}).join('');
    el('salaryPreviewBody').innerHTML=`<p><strong>試す案：${esc(dates.lastSalaryMonth)}まで給与生活、${esc(nextMonth(dates.lastSalaryMonth))}から資産で生活費を負担。</strong></p>
      <div class="salary-comparison">${[['現在の計画',p.before],['新方式・65歳基準',p.baselineResult],['新方式・試す案',p.result]].map(([label,r])=>`<div><span>${label}</span><strong>${money(r.finalAsset)}</strong><small>${r.endAge}歳末資産</small></div>`).join('')}</div>
      <p>現在計画 → 新方式65歳基準：${money(p.baselineResult.finalAsset-p.before.finalAsset)}<br>新方式65歳基準 → 試す案：${money(p.result.finalAsset-p.baselineResult.finalAsset)}</p>
      <p class="muted">初回は方式変更の影響を分けて確認してください。前倒し比較は同じ新方式の65歳基準との差です。新方式採用後の「現在→基準」は条件差も含みます。</p>
      <details><summary>年齢別の資産を確認</summary><div class="table-wrap"><table><thead><tr><th>年齢</th><th>現在の計画</th><th>新方式65歳基準</th><th>試す案</th></tr></thead><tbody>${tableRows}</tbody></table></div></details>
      <p>更新対象：給与生活の条件と、変更した臨時収支・期間別収入の計上先${p.owned.patches.length}件。</p>
      <p class="muted">${p.result.limitations.map(esc).join('<br>')}<br>新方式の増減要因分解は未対応です。管理予算内の税社保・内訳を別加算しません。精密な税引後比較ではありません。</p>`;
    el('salaryApply').disabled=!p.changed;el('salarySaveScenario').disabled=false;el('salaryPreview').hidden=false;
    el('salaryPreview').scrollIntoView?.({block:'start',behavior:'smooth'});
  }
  function changed(){draft=read();invalidate();error('');persist();state();}
  function reset({forget=true}={}){invalidate();draft=null;error('');if(forget){try{clearSalaryDraft();}catch{}}}
  el('salaryForm').addEventListener('input',event=>{if(event.target.id==='salary_lastSalaryMonth')el('salary_monthsConfirmed').value='';changed();});
  el('salaryForm').addEventListener('submit',event=>{event.preventDefault();error('');draft=read();persist();try{preview=previewSalary(getState(),draft);renderPreview();}catch(e){invalidate();error(e.message);}});
  el('salaryReset').addEventListener('click',()=>{reset();render();});
  function action(kind){
    if(busy)return;busy=true;error('');for(const id of ['salaryApply','salaryUndo','salarySaveScenario'])el(id).disabled=true;
    try{
      const previewId=preview?.id;
      const keepDraft=draft&&!salaryDraftMatches(getState().config,draft);
      const updated=kind==='apply'?applySalaryPreview(getState(),preview):kind==='undo'?undoSalaryApply(getState()):saveSalaryScenario(getState(),preview,el('salaryScenarioName').value);
      if(kind==='apply'||(kind==='undo'&&!keepDraft))reset();else invalidate();
      onCommit(updated);render();
      if(kind==='save'){preview=previewSalary(getState(),draft);preview.id=previewId;renderPreview();}
      if(draft)persist();
      showNotice(kind==='save'?'試算条件を新しい比較案として保存しました。現在の採用値は保持しています。':kind==='undo'?'直前の給与生活の反映を取り消しました。':'給与生活の条件を集計表に反映しました。');
    }catch(e){error(`操作を完了できませんでした。${e.message}`);}
    finally{busy=false;state();el('salaryApply').disabled=!preview?.changed;el('salarySaveScenario').disabled=!preview;}
  }
  el('salaryApply').addEventListener('click',()=>action('apply'));
  el('salaryUndo').addEventListener('click',()=>action('undo'));
  el('salarySaveScenario').addEventListener('click',()=>action('save'));
  el('salaryBackup').addEventListener('click',()=>{const s=getState();downloadJson({schemaVersion:'0.9',exportedAt:new Date().toISOString(),config:s.config,scenarios:s.scenarios},'lifeplan-before-salary-change.json');showNotice('バックアップの保存先を確認してください。');});
  return {render,reset,invalidate};
}
