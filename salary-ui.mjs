import {dateWithAge,dateAgeHint,previousMonth} from './date-display.mjs';
import {formatMan,defaultPrimarySideWorkStart} from './calc.mjs';
import {configSignature,downloadJson} from './storage.mjs';
import {salaryDraftFromConfig,previewSalary,applySalaryPreview,undoSalaryApply,salaryUndoAvailable,salaryDraftMatches,saveSalaryScenario,saveSalaryDraft,loadSalaryDraft,clearSalaryDraft} from './salary-workflow.mjs';
import {parseMonth} from './salary-life.mjs';
const el=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>`${formatMan(n,2)}万円`;
const fallbackStartLabel=config=>{\n  const start=defaultPrimarySideWorkStart(config);\n  if(!(start instanceof Date)||!Number.isFinite(+start))return '計算時の開始月：確認不能';\n  const day=[start.getFullYear(),String(start.getMonth()+1).padStart(2,'0'),String(start.getDate()).padStart(2,'0')].join('-');\n  const mode=config?.employment?.primary?.sideWork?.startMode || 'after_high_age_benefit';\n  const delay=config?.unemployment?.baselineSideWorkDelayMonths??2;\n  return '開始日未入力（計算上の既定開始：'+dateWithAge(day,config)+'／'+(mode==='at_retirement'?'退職月から':'退職日から設定月数 '+String(delay)+'か月後')+'。採用済み開始日ではありません）';\n};\nconst nextMonth=value=>{const n=parseMonth(value);return n===null?'未設定':`${Math.floor((n+1)/12)}-${String((n+1)%12+1).padStart(2,'0')}`;};
const option=(value,label)=>`<option value="${esc(value)}">${esc(label)}</option>`;
const receiptOptions=()=>option('','未確認')+option('separate','別枠で資産に計上')+option('net_transfer','追加・取崩しに含む');
const fundingValue=v=>v?.source?`${v.source}${v.accounting?':'+v.accounting:''}`:'';
const fundingObject=value=>{if(!value)return undefined;const [source,accounting]=value.split(':');return accounting?{source,accounting}:{source};};
// Used only for cloud-import safety. The displayed "legacy mode not yet adopted"
// does not itself mean there is a pending user edit. Never adopt a new mode here.
export function salaryDraftNeedsProtection(config,draft,hasUserDraft=false){
 if(!config||!draft)return false;
 return !salaryDraftMatches(config,draft) && (Boolean(config.cashflow?.salaryLife)||Boolean(hasUserDraft));
}


export function mountSalarySheet({getState,onCommit,showNotice}){
  let draft=null,preview=null,busy=false,hasUserSalaryDraft=false;
  const error=message=>{el('salaryError').textContent=message;el('salaryError').hidden=!message;};
  function invalidate(){preview=null;el('salaryPreview').hidden=true;el('salaryApply').disabled=true;el('salarySaveScenario').disabled=true;}
  function persist(){hasUserSalaryDraft=true;try{saveSalaryDraft(getState().config,draft);el('salaryDraftNote').textContent='入力中の条件をこの端末に保存しました。集計表は反映するまで変わりません。';}catch{el('salaryDraftNote').textContent='入力を保存できませんでした。画面を閉じると入力が失われます。採用済み設定は変更していません。';}}
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
  function renderAdoptedOverview(c){
    const adopted=c.cashflow?.salaryLife;
    const flow=el('salaryAdoptedTimeline');
    if(!adopted){
      flow.innerHTML='<p class="muted">現在は従来方式を使用中です。下の切替月は比較用の仮設定であり、採用済みの条件ではありません。</p>';
      return;
    }
    flow.innerHTML='<div class="salary-time-part"><span>給与で生活費を賄う最終月</span><strong>'+esc(dateWithAge(adopted.lastSalaryMonth,c))+'</strong></div>'
      +'<span class="salary-time-arrow" aria-hidden="true">→</span>'
      +'<div class="salary-time-part"><span>資産から生活費を負担する開始月</span><strong>'+esc(dateWithAge(nextMonth(adopted.lastSalaryMonth),c))+'</strong></div>';
  }
  function state(){
    const c=getState().config;if(!c||!draft)return;
    const matches=salaryDraftMatches(c,draft);
    el('salaryState').textContent=matches?'反映済み':c.cashflow?.salaryLife?'未反映の変更あり':'旧方式を使用中・新方式は未反映';
    // The legacy-mode default is only a proposal, not a user-edited draft.
    // An explicitly saved/edited draft still blocks cloud import even in legacy mode.
    el('salaryState').dataset.dirty=String(salaryDraftNeedsProtection(c,draft,hasUserSalaryDraft));
    const status=el('salaryEditStatus');
    const hasAdopted=Boolean(c.cashflow?.salaryLife);
    if(preview){
      status.innerHTML='<strong>試算済み・未反映</strong><span>結果は「反映前の差分確認」に表示されます。「全体シミュレーションに反映」するまでは計画は変わりません。</span>';
    }else if(matches){
      status.innerHTML='<strong>現在の設定と一致</strong><span>採用済みの計画と同じ条件です。</span>';
    }else if(hasAdopted||hasUserSalaryDraft){
      status.innerHTML='<strong>変更中・未反映</strong><span>入力中の条件です。現在の計画とは別で、試算・反映するまで集計結果は変わりません。</span>';
    }else{
      status.innerHTML='<strong>比較用の仮設定・未採用</strong><span>現在は従来方式です。切替案を試算しても自動採用されません。</span>';
    }
    status.dataset.status=preview?'preview':matches?'adopted':'draft';
    el('salaryUndo').disabled=busy||!salaryUndoAvailable(c);
    el('salary_switchMonth').textContent=dateWithAge(nextMonth(draft.settings.lastSalaryMonth),c);
    el('salary_lastSalaryMonthAge').textContent=dateAgeHint(draft.settings.lastSalaryMonth,c);
    el('salary_laborLastMonthAge').textContent=dateAgeHint(el('salary_laborLastMonth').value,c);
    el('salary_laborDetail').hidden=el('salary_laborMode').value!=='monthly';
  }
  function buildInputs(c){
    const s=draft.settings;
    const salaryFieldsHtml=`<fieldset class="pension-person"><legend>1. 生活費の負担を切り替える月</legend>
      <p class="muted">比較専用の65歳基準（65歳到達月の前月まで給与生活）： <strong>${esc(dateWithAge(draft.baselineMonth,c))}</strong> まで、資産からの生活費負担は <strong>${esc(dateWithAge(nextMonth(draft.baselineMonth),c))}</strong> から。</p>
      <label>給与で生活費を賄う最終月（その月を含む）<input id="salary_lastSalaryMonth" type="month" required aria-describedby="salary_lastSalaryMonthAge"></label><p id="salary_lastSalaryMonthAge" class="muted" aria-live="polite"></p>
      <p>入力中の案：この月までは給与で生活費を賄い、翌月から資産で負担します。</p><p>資産からの生活費負担開始月：<strong id="salary_switchMonth"></strong></p>
      <label>月の切替の確認<select id="salary_monthsConfirmed">${option('','未確認')+option('yes','上記の最終月・負担開始月で試算する')}</select></label>
      </fieldset><fieldset class="pension-person"><legend>2. 給与生活中の家計と資産の入出金</legend><p>給与と生活費を家計側で賄い、計画資産へ実際に追加する額・引き出す額だけを入力します。給与全額やNISA口座内の売買額ではありません。</p><p class="salary-transfer-direction">家計 → 計画資産：追加　／　計画資産 → 家計：引出し</p><label>家計から計画資産へ追加する額（万円／月）<input id="salary_monthlyAddition" type="number" min="0" step="any" inputmode="decimal" required></label>
      <label>計画資産から家計へ引き出す額（万円／月）<input id="salary_monthlyWithdrawal" type="number" min="0" step="any" inputmode="decimal" required></label>
      <button id="salaryZero" type="button" class="secondary">追加・取崩しなし（両方0）</button>
      </fieldset><fieldset class="pension-person"><legend>3. 切替後の生活費・労働収入</legend><p>65歳以降の生活費は「支出」の管理予算を使います。下の予算欄は65歳より前に切り替える場合だけ必要です。</p><label>65歳より前の資産負担期間の管理予算（万円／月）<input id="salary_pre65MonthlyBudget" type="number" min="0" step="any" inputmode="decimal"></label>
      <p class="muted">前倒し期間がある場合は必須です。税・社保を含む管理予算を、元の計画開始日時点の価格で入力します。生活費内訳を別に加算しません。</p>
      <label>切替後に資産へ計上する労働収入<select id="salary_laborMode">${option('','未確認')+option('none','就労収入なし')+option('existing_confirmed','現在登録されている夫婦の就労条件を使う')+option('monthly','夫婦合計の月額と最終月を指定')}</select></label>
      <div id="salary_laborDetail"><label>夫婦合計の就労収入（税引前・万円／月）<input id="salary_laborAmount" type="number" min="0" step="any" inputmode="decimal"></label><label>就労収入の最終月（その月を含む）<input id="salary_laborLastMonth" type="month" aria-describedby="salary_laborLastMonthAge"></label><p id="salary_laborLastMonthAge" class="muted" aria-live="polite"></p></div>
      <p class="muted">個別条件を使う場合は、下の「本人・配偶者の給与・アルバイト」で金額と期間を登録・反映してください。夫婦合計の指定とは重ねて計上しません。</p><div id="salaryExistingLabor" class="salary-labor-reference"></div>
    </fieldset>
    <fieldset class="pension-person"><legend>4. 年金・iDeCo・臨時収支の扱い</legend>
      <p id="salaryRelated" class="muted"></p>
      <p>iDeCoの掛金原資・給与生活中の受取は、iDeCoタブで入力します。</p><button type="button" class="link-btn" data-open-tab="ideco" data-focus-target="salaryIdecoInputs">iDeCoの計上方法を入力</button>
      <details><summary>給与生活中の受取・臨時収支の計上先</summary>
      ${[['pension','公的年金'],['unemployment','失業給付']].map(([key,label])=>`<label>給与生活中の${label}<select id="salary_receipt_${key}">${receiptOptions()}</select></label>`).join('')}
      <p class="muted">該当の受取がある場合に選択します。「追加・取崩しに含む」は上の月額に織り込み済みという指定です。</p>
      ${(c.events||[]).map((x,i)=>`<label>${esc(dateWithAge(x.date,c))} ${esc(x.label||'臨時収支')} ${money(x.amount)}<select id="salary_event_${i}">${receiptOptions()+ (x.type==='expense'?option('budget','終了後の管理予算に含む'):'')}</select></label>`).join('')}
      ${(c.cashflow?.periodOverrides||[]).map((x,i)=>x.kind==='income'?`<label>${esc(x.label||x.key)}（${esc(x.fromAge)}～${esc(x.toAge)}歳）<select id="salary_period_${i}">${receiptOptions()}</select></label>`:'').join('')}
      </details>
    </fieldset>`;
    let step=0;
    el('salaryInputs').innerHTML=salaryFieldsHtml
      .replace(/<fieldset class="pension-person"><legend>(.*?)<\/legend>/g,(_,title)=>{
        step++;
        return `<details class="salary-step" ${step===1?'open':''}><summary>${title}</summary><fieldset class="pension-person"><legend class="visually-hidden">${title}</legend>`;
      })
      .replace(/<\/fieldset>/g,'</fieldset></details>');
    el('salaryIdecoInputs').innerHTML=`<h2>掛金原資・給与生活中の受取</h2><p class="muted">この欄は給与生活シートと共通の試算条件です。入力後は「給与生活の条件と合わせて試算」へ進み、差分を確認して反映してください。</p>      <label>給与生活中のiDeCo掛金原資<select form="salaryForm" id="salary_funding_before">${option('','未確認／掛金なし')+option('salary','給与から支払う')+option('plan_asset:separate','投資資産から別枠で支払う')+option('plan_asset:withdrawal','給与生活シートの引出額に含める')}</select></label>
      <label>終了後も掛金が続く場合の原資<select form="salaryForm" id="salary_funding_after">${option('','未確認／終了後の掛金なし')+option('household','終了後の家計資金から支払う（別途確認済み）')+option('plan_asset:separate','投資資産から別枠で支払う')+option('plan_asset:budget','管理予算に含める')}</select></label>
      <p class="muted">掛金終了月・受取月は変えません。前倒し後の加入資格や支払原資は別途確認が必要です。</p>
<label>給与生活中のiDeCo受取<select form="salaryForm" id="salary_receipt_ideco">${receiptOptions()}</select></label><p class="muted">「追加・取崩しに含む」は家計と資産の入出金に織り込み済みという指定です。別枠で再加算しません。</p><button type="submit" form="salaryForm" class="primary" data-open-tab="salary">給与生活の条件と合わせて試算</button><button type="button" class="link-btn" data-open-tab="salary" data-focus-target="salaryForm">給与生活の入力条件を確認</button>`;
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
    if(!draft){const savedDraft=loadSalaryDraft(c);draft=savedDraft||salaryDraftFromConfig(c);hasUserSalaryDraft=!!savedDraft;buildInputs(c);el('salaryDraftNote').textContent='入力は集計表と別に保存します。まだ反映していません。';}
    const adopted=c.cashflow?.salaryLife;
    el('salaryAdopted').textContent=adopted?`資産への追加 ${money(adopted.monthlyAddition)}/月・家計への引出し ${money(adopted.monthlyWithdrawal)}/月（給与総額とは別です）。`:'従来方式で計算中。新方式はまだ採用していません。';
    renderAdoptedOverview(c);
    el('salaryExistingLabor').innerHTML='<strong>登録済みの個別条件（採用中）</strong><ul>'+[['primary','本人'],['spouse','配偶者']].flatMap(([person,label])=>[['regularWork','正社員'],['sideWork','アルバイト']].map(([job,title])=>{const v=c.employment?.[person]?.[job];return `<li>${label}${title}：${v?esc(money(v.monthlyGross))+'/月 ／ 開始 '+esc(person==='primary'&&job==='sideWork'&&!v.startDate?fallbackStartLabel(c):dateWithAge(v.startDate,c,person))+' ／ 終了日 '+esc(dateWithAge(v.endDate,c,person))+' ／ 最終計上月 '+esc(dateWithAge(previousMonth(v.endDate),c,person)):'未設定'}</li>`;})).join('')+'</ul><p class="muted">開始月を含み、終了月を含みません。給与生活中は上の家計と資産の入出金で扱います。</p>';
    el('salaryRelated').textContent=`iDeCo掛金 ${money(c.ideco?.monthlyContribution)}/月、拠出終了 ${dateWithAge(c.ideco?.contributionEndDate,c)}。年金開始：本人 ${dateWithAge(c.income?.pensions?.primary?.startDate,c)}、配偶者 ${dateWithAge(c.income?.pensions?.spouse?.startDate,c,'spouse')}。`;
    if(preview&&preview.baseSignature!==configSignature(getState())){invalidate();error('前提または比較案が変わりました。もう一度試算してください。');}
    const last=c.salaryWorkflow?.history?.at(-1);
    el('salaryHistory').textContent=last?`${new Date(last.at).toLocaleString('ja-JP')}：給与生活の設定を${last.action==='undo'?'取消':'反映'}。`:'反映履歴はありません。';
    state();
  }
  function renderPreview(){
    const p=preview,dates=p.candidate.cashflow.salaryLife;
    const tableRows=p.result.rows.map(r=>{const a=p.before.rows.find(x=>x.age===r.age),b=p.baselineResult.rows.find(x=>x.age===r.age);return `<tr><th>${r.age}歳末</th><td>${a?money(a.endAsset):'—'}</td><td>${b?money(b.endAsset):'—'}</td><td>${money(r.endAsset)}</td></tr>`;}).join('');
    el('salaryPreviewBody').innerHTML=`<p><strong>試す案：${esc(dateWithAge(dates.lastSalaryMonth,p.candidate))}まで給与生活、${esc(dateWithAge(nextMonth(dates.lastSalaryMonth),p.candidate))}から資産で生活費を負担。</strong></p>
      <div class="salary-comparison">${[['現在の計画',p.before],['比較専用・65歳到達月から資産負担',p.baselineResult],['入力中の案（未反映）',p.result]].map(([label,r])=>`<div><span>${label}</span><strong>${money(r.finalAsset)}</strong><small>${r.endAge}歳末資産</small></div>`).join('')}</div>
      <p>現在計画 → 比較専用の65歳基準：${money(p.baselineResult.finalAsset-p.before.finalAsset)}<br>比較専用の65歳基準 → 試す案：${money(p.result.finalAsset-p.baselineResult.finalAsset)}</p>
      <p class="muted">比較用の65歳基準は、採用中の設定や実際の退職日とは別です。初回は方式変更の影響を分けて確認してください。前倒し比較は同じ新方式の65歳基準との差です。新方式採用後の「現在→基準」は条件差も含みます。</p>
      <details><summary>年齢別の資産を確認</summary><div class="table-wrap"><table><thead><tr><th>年齢</th><th>現在の計画</th><th>比較専用の65歳基準</th><th>試す案</th></tr></thead><tbody>${tableRows}</tbody></table></div></details>
      <p>更新対象：給与生活の条件と、変更した臨時収支・期間別収入の計上先${p.owned.patches.length}件。</p>
      <p class="muted">${p.result.limitations.map(esc).join('<br>')}<br>新方式の増減要因分解は未対応です。管理予算内の税社保・内訳を別加算しません。精密な税引後比較ではありません。</p>`;
    el('salaryApply').disabled=!p.changed;el('salarySaveScenario').disabled=false;el('salaryPreview').hidden=false;
    state();
    el('salaryPreview').scrollIntoView?.({block:'start',behavior:'smooth'});
  }
  function changed(){draft=read();invalidate();error('');persist();state();}
  function reset({forget=true}={}){invalidate();draft=null;hasUserSalaryDraft=false;error('');if(forget){try{clearSalaryDraft();}catch{}}}
  // A required field inside a collapsed section must be revealed on validation.
  el('salaryForm').addEventListener('invalid',event=>{
    const section=event.target?.closest?.('details.salary-step');
    if(section)section.open=true;
  },true);
  el('salaryForm').addEventListener('input',event=>{if(event.target.id==='salary_lastSalaryMonth')el('salary_monthsConfirmed').value='';changed();});
  el('salaryIdecoInputs').addEventListener('input',()=>changed());
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
