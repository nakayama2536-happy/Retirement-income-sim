import {unemploymentPlan,laborDateRecommendation,UNEMPLOYMENT_MODES} from './unemployment-plan.mjs';
import {renderCurrentSummaries,currentSummaryHtml} from './current-summary.mjs';
import {projectNisaWithdrawal,idecoMode,NISA_MODES,IDECO_MODES} from './withdrawal-plan.mjs';
import {detailProposal,verifyDetailProposal,expenseEntries,EXPENSE_GROUPS,EXPENSE_EXAMPLES,changedPaths,undoDetail} from './detail-settings.mjs';
import {wideDetailedReport,trendPickerItemsHtml,visibleTrendColumns,trendCsv,TREND_KEYS,esc,groupedYearHtml} from './detailed-report.mjs';
import {configSignature} from './storage.mjs';
import {dateWithAge,updateDateInputHints} from './date-display.mjs';
import {expenseDisplayProfile} from './expense-display.mjs';
import {runRetirementPlan} from './calc.mjs';
import {reviewPrompt} from './review-prompt.mjs';
const opt=rows=>rows.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('');
const input=(name,label,type='number',value='',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value??'')}" ${type==='number'?'step="any" min="0"':''} ${extra}></label>`;
const select=(name,label,rows)=>`<label>${label}<select name="${name}">${opt(rows)}</select></label>`;
const num=(name,label,v='')=>input(name,label,'number',v,'required');
const amount=()=>num('amount','金額（万円）')+select('unit','金額の単位',[['monthly','月額'],['annual','年額']]);
const dates=(c)=>num('fromAge','本人の開始年齢',c.plan.startAge)+num('toAge','本人の終了年齢',c.plan.endAge);
const treatment=()=>select('fundingTreatment','給与生活中の扱い',[['separate','資産へ別枠計上'],['net_transfer','家計の入出金に含む（重ねて計上しない）']]);
const profile=()=>select('profile','編集・集計する内訳',[['','保存元を選択'],['work-v0.9.7','標準の生活費内訳'],['public-v0.9','旧形式の生活費内訳']]);
const laborEditors={laborPrimaryRegular:['primary','regularWork'],laborPrimarySide:['primary','sideWork'],laborSpouseRegular:['spouse','regularWork'],laborSpouseSide:['spouse','sideWork']};
const fname={unemployment:'失業給付の受取予定を設定',goal:'年齢別の目標資産額を再設定',laborPrimaryRegular:'本人：正社員収入',laborPrimarySide:'本人：アルバイト収入',laborSpouseRegular:'配偶者：正社員収入',laborSpouseSide:'配偶者：アルバイト収入',nisa:'1. 開始時点のNISA残高',nisaWithdrawal:'2. 毎月の取り崩し設定',ideco:'iDeCoの残高・積立と基本条件',idecoWithdrawal:'iDeCoの取り崩し・受取プラン',retirement:'退職金の条件と受取',expense:'生活費・保険を項目ごとに設定',budget:'内訳合計を年間予算にする',event:'臨時収入・追加請求を設定',extra:'継続する追加収入を設定'};
// Only data that supplies this editor's inputs/options. Other settings still
// invalidate previews, but do not discard an unrelated draft.
export function detailFormSourceSignature(kind,c){
 let source;
 if(laborEditors[kind]){const [person,job]=laborEditors[kind];source=[c.employment?.[person]?.[job],c.cashflow?.salaryLife?.postSalaryLabor];}
 else if(['ideco','idecoWithdrawal'].includes(kind))source=c.ideco;
 else if(kind==='nisaWithdrawal')source=c;
 else if(kind==='nisa')source=c.nisa;
 else if(kind==='unemployment')source=[c.unemployment,c.employment?.primary?.mainRetirement];
 else if(kind==='goal')source=c.management?.thresholds;
 else if(kind==='event')source=c.events;
 else if(kind==='retirement')source=[c.retirement,c.events];
 else if(kind==='extra')source=c.cashflow?.periodOverrides;
 else source=[c.expenseDetail,c.cashflow?.expenseCategories,c.cashflow?.periodOverrides,c.cashflow?.travel,c.budgets];
 return configSignature([source,c.plan?.startAge,c.plan?.endAge]);
}
export function detailEditorRefresh(sourceBefore,sourceAfter,valuesBefore,valuesNow){
 return sourceBefore===sourceAfter?'unchanged':valuesBefore===valuesNow?'reload':'stale';
}
export function mountDetailUI({getState,commit,notice}){
 const forms=new Map();let undo=null,report=null,renderedSignature='',reportSignature='';const excluded=new Set();
 const el=id=>document.getElementById(id);
 function fields(kind,c){
  if(kind==='unemployment'){const p=c.unemployment?.receiptPlan||{};return select('mode','給付種類',[['','選択してください'],...Object.entries(UNEMPLOYMENT_MODES)])+input('retirementDate','離職日（本業退職の保存日と一致）','date',p.retirementDate||c.employment?.primary?.mainRetirement?.baseDate)+num('dailyYen','給付日額（円／日・確認額または仮置き）',p.dailyYen)+num('days','支給予定日数（高年齢は30日または50日）',p.days)+input('startMonth','受取開始月（離職月の翌月以降）','month',p.startMonth)+input('endMonth','受取終了月（この月を含む・一時金は開始月と同じ）','month',p.endMonth)+select('amountStatus','日額・日数の確度',[['','選択してください'],['estimate','仮置き'],['confirmed','確認済み']])+input('basis','根拠・確認日（例：確認した資料・窓口回答、仮置きの理由）','text',p.basis,'maxlength="300"')+'<label class="check-label"><input type="checkbox" name="seekingWork">退職後に就職する意思・能力があり、求職する予定</label><label class="check-label"><input type="checkbox" name="eligibilityChecked">加入期間・離職理由等の条件を確認した（仮置きなら上の根拠に記載）</label><p class="muted">基本手当は日数を指定月数で均等配分し、端数日を最終月に配分します。実際の認定・振込日とは異なります。待期7日・該当する給付制限・認定後の振込を見込んだ月を入力してください。</p>';}

  if(kind==='goal')return select('age','目標を設定する本人年齢（年齢期末）',Array.from({length:c.plan.endAge-c.plan.startAge+1},(_,i)=>{const a=Number(c.plan.startAge)+i;return [a,a+'歳末'];}))+num('amount','残したい資産額（万円）')+'<label class="check-label"><input type="checkbox" name="clearGoal">この年齢の目標を未設定にする</label><p class="muted">目標は各年齢期末の名目額です。空欄は0円として保存しません。参考目標の変更で、収支・資産予測や保存済み比較案は変わりません。</p>';

  if(kind==='nisa'){return num('marketValue','開始資産のうちNISA評価額（万円）',c.nisa?.marketValue);}
  if(kind==='nisaWithdrawal'){const w=c.nisa?.withdrawal||{};return select('mode','取り崩し方法',[['','選択してください'],...Object.entries(NISA_MODES)])+input('startMonth','開始月（この月から）','month',w.startMonth)+input('endMonth','終了月（この月を含む）','month',w.endMonth)+num('monthlyAmount','毎月の取り崩し額（万円）',w.monthlyAmount)+num('monthlyRate','毎月の取り崩し率（運用後残高に対する%・年率ではありません）',w.monthlyRate);}
  if(kind==='idecoWithdrawal'){const i=c.ideco||{};return select('receiptMode','受取方法',[['','選択してください'],...Object.entries(IDECO_MODES)])+input('lumpDate','受取開始日（一時金と年金の共通開始）','date',i.lumpDate||i.contributionEndDate,'required')+num('lumpPercent','一時金で受け取る割合（%）',i.lumpPercent)+num('annuityYears','年金で受け取る期間（5～20年）',i.annuityYears)+num('annuityReturn','年金受取中の利回り（年率%）',i.annuityReturn);}
  if(laborEditors[kind])return (kind==='laborPrimarySide'?'<div class="labor-date-recommendation current-setting-summary"></div>':'')+num('monthlyGross','税引前の月額収入（万円・賞与は月割りで含める）')+input('startDate','開始日（この月から）','date','','required')+input('endDate','終了日（この月は含まない）','date','','required')+(c.cashflow?.salaryLife&&c.cashflow.salaryLife.postSalaryLabor?.mode!=='existing_confirmed'?'<label class="check-label"><input type="checkbox" name="useIndividualLabor">反映時に、給与生活終了後の収入を夫婦合計・収入なしから本人と配偶者の個別設定へ切り替える</label>':'');
  if(kind==='ideco'){const i=c.ideco||{};return [['asOfDate','残高の基準日'],['contributionEndDate','掛金終了日（この月は含まない）'],['joinDate','加入日'],['lumpDate','受取開始日']].map(([k,l])=>input(k,l,'date',i[k],'required')).join('')+[['currentBalance','基準日の残高（万円）'],['monthlyContribution','毎月の掛金（万円）'],['accumulationReturn','積立中の利回り（%）'],['lumpPercent','一時金で受け取る割合（%）'],['annuityYears','残りを年金で受け取る年数'],['annuityReturn','年金受取中の利回り（%）']].map(([k,l])=>num(k,l,i[k])).join('');}
  if(kind==='retirement'){const r=c.retirement||{},e=(c.events||[]).find(x=>x.id===r.receiptEventId);return num('amount','退職金の税引前額（万円）',r.amount)+num('serviceYears','勤続年数（端数切上げ）',r.serviceYears)+input('receiveDate','受取日','date',r.receiveDate,'required')+input('companyStartDate','入社日','date',r.companyStartDate,'required')+`<label><input type="checkbox" name="postReceipt" ${e?'checked':''}>計画期間内の受取を資産へ計上する</label>`+input('receipt','資産に加える受取額（税引後・万円）','number',e?.amount)+select('eventTarget','既存の受取行がある場合は選択',[['','新しい受取行（同月の重複は停止）'],...(c.events||[]).map((x,i)=>({x,i})).filter(({x})=>x.type==='income').map(({x,i})=>[String(i),`${x.label} / ${dateWithAge(x.date,c)} / ${x.amount}万円`])]);}
  if(kind==='expense')return profile()+select('target','変更する項目',[['','新しい項目を追加']])+select('group','大項目',EXPENSE_GROUPS)+input('label','項目名（保険は商品名等）','text','','list="expenseNames" maxlength="100" required')+`<datalist id="expenseNames">${Object.values(EXPENSE_EXAMPLES).flat().map(x=>`<option value="${x}">`).join('')}</datalist>`+dates(c)+amount();
  if(kind==='budget')return profile()+dates(c);
  if(kind==='event')return select('target','変更する予定',[['','新しい予定を追加'],...(c.events||[]).map((x,i)=>[String(i),`${x.label} / ${dateWithAge(x.date,c)} / ${x.amount}万円`])])+input('label','項目名','text','','maxlength="100" required')+select('type','種類',[['expense','支出・追加請求'],['income','臨時収入']])+input('date','対象年月日','date','','required')+num('amount','金額（万円）')+treatment()+`<label><input type="checkbox" name="inflationAdjusted">支出に物価上昇を適用（開始時点の価格で入力）</label>`;
  if(kind==='extra')return select('target','変更する追加収入',[['','新しい追加収入を登録'],...[...new Map((c.cashflow?.periodOverrides||[]).filter(x=>x.kind==='income').map(x=>[x.key,x])).values()].map(x=>[x.key,x.label||x.key])])+input('label','項目名','text','','maxlength="100" required')+dates(c)+amount()+treatment();
 }
 function values(form){const data=Object.fromEntries(new FormData(form));for(const input of form.querySelectorAll('input[type=checkbox]'))data[input.name]=input.checked;return data;}
 function fill(form,obj){for(const [key,v] of Object.entries(obj||{})){const i=form.elements.namedItem(key);if(!i)continue;if(i.type==='checkbox')i.checked=Boolean(v);else i.value=v??'';}}
 function hint(form,c){updateDateInputHints(form,c,form.dataset.person||'primary');}

 function renderLaborRecommendation(c){
  const host=el('detail-laborPrimarySide')?.querySelector('.labor-date-recommendation');if(!host)return;
  const r=laborDateRecommendation(c);
  host.innerHTML='<h3>開始・終了の推奨値（資金計画上の参考）</h3><p>開始月：'+esc(r.startMonth?dateWithAge(r.startMonth,c):'未確定')+'。'+esc(r.reason)+'</p><p>終了月：'+esc(r.endMonth?dateWithAge(r.endMonth,c):'生年月日未設定')+'（76歳の誕生月を含む）。終了日の入力値：'+esc(r.endDate?dateWithAge(r.endDate,c):'未確定')+'。</p><p class="muted">終了日はその月を含まないため、誕生月の翌月1日を入力します。参考表示だけでは設定は変わりません。高年齢給付の50日分は受給期間ではありません。就労開始の制度上の許可日ではなく、求職・就労状況はハローワークへ申告してください。</p>';
 }
 function populate(kind,form,c){
  if(kind==='unemployment')fill(form,c.unemployment?.receiptPlan||{});
  if(kind==='goal'){form.elements.age.value=String(c.plan.endAge);fill(form,{amount:c.management?.thresholds?.[c.plan.endAge]??''});}

  if(['expense','budget'].includes(kind)){form.elements.profile.value=expenseDisplayProfile(c)||'';}
  if(kind==='expense')refreshTargets(form,c);
  if(laborEditors[kind]){const [person,job]=laborEditors[kind];form.dataset.person=person;fill(form,c.employment?.[person]?.[job]);}
  if(kind==='ideco')for(const k of ['accumulationReturn','annuityReturn'])form.elements[k].min='-99';
  if(kind==='nisaWithdrawal')fill(form,c.nisa?.withdrawal||{});
  if(kind==='idecoWithdrawal'){fill(form,{receiptMode:idecoMode(c)});form.elements.annuityReturn.min='-99';}
  updateWithdrawalFields(kind,form);hint(form,c);renderLaborRecommendation(c);
 }
 function refreshTargets(form,c){const source=form.elements.profile.value;form.elements.target.innerHTML=opt([['','新しい項目を追加'],...expenseEntries(c,source).map(x=>[x.path,`${x.group} / ${x.label}`])]);}
 function updateWithdrawalFields(kind,form){
  if(kind==='goal'){form.elements.amount.disabled=form.elements.clearGoal.checked;form.elements.amount.required=!form.elements.clearGoal.checked;}

  const toggle=(name,show)=>{const node=form.elements.namedItem(name);node.disabled=!show;node.required=show;node.closest('label').hidden=!show;};
  if(kind==='unemployment'){const active=!!form.elements.mode.value&&form.elements.mode.value!=='none';for(const name of ['retirementDate','dailyYen','days','startMonth','endMonth','amountStatus','basis','seekingWork','eligibilityChecked'])toggle(name,active);form.elements.mode.required=true;}
  if(kind==='nisaWithdrawal'){const mode=form.elements.mode.value;toggle('startMonth',!!mode&&mode!=='none');toggle('endMonth',['fixed','rate','budget'].includes(mode));toggle('monthlyAmount',mode==='fixed');toggle('monthlyRate',mode==='rate');form.elements.mode.required=true;form.elements.monthlyRate.max='100';}
  if(kind==='idecoWithdrawal'){const mode=form.elements.receiptMode.value;toggle('lumpPercent',mode==='combined');toggle('annuityYears',['annuity','combined'].includes(mode));toggle('annuityReturn',['annuity','combined'].includes(mode));form.elements.receiptMode.required=true;form.elements.annuityYears.min='5';form.elements.annuityYears.max='20';form.elements.annuityYears.step='1';form.elements.lumpPercent.max='100';}
 }
 function withdrawalPreview(c,kind){
  if(kind==='unemployment'){const p=unemploymentPlan(c);return currentSummaryHtml(c,'unemployment').replace('現在の設定の概要','今回の試算プラン').replace('保存済みの条件です。入力途中・未反映の試算は含みません。','まだ保存していない候補です。')+'<ul>'+p.rows.map(r=>'<li>'+esc(r.month)+'：'+r.days+'日分 / '+r.amount.toLocaleString('ja-JP')+'万円</li>').join('')+'</ul><p>給付額は非課税収入として扱い、旧自動計上を置き換えます。受取予定と実際の振込は異なり得ます。就労・年金との調整は別途確認してください。</p>';}

  if(kind==='goal'){const old=getState().config.management?.thresholds||{},next=c.management?.thresholds||{},r=runRetirementPlan(c);
   const ages=[...new Set([...Object.keys(old),...Object.keys(next)])].map(Number).sort((a,b)=>a-b);
   const fmt=v=>v==null?'未設定':v.toLocaleString('ja-JP',{maximumFractionDigits:2})+'万円';
   return '<p>年齢別の変更前後です。予測資産は変わりません。</p><div class="table-wrap"><table><thead><tr><th>年齢期末</th><th>現在の目標</th><th>変更後の目標</th><th>予測資産</th><th>変更後の差額</th></tr></thead><tbody>'+ages.map(a=>{const row=r.rows.find(x=>x.age===a);return '<tr><td>'+a+'歳末</td><td>'+fmt(old[a])+'</td><td>'+fmt(next[a])+'</td><td>'+fmt(row?.endAsset)+'</td><td>'+ (next[a]==null||!row?'—':fmt(row.endAsset-next[a]))+'</td></tr>';}).join('')+'</tbody></table></div>';
  }

  if(kind==='nisaWithdrawal'){const p=projectNisaWithdrawal(c);if(p.status!=='configured')return '<p>取り崩しプランを停止します。NISAの評価額は保持します。</p>';
   return currentSummaryHtml(c,'nisa').replace('現在の設定の概要','今回の試算プラン').replace('保存済みの条件です。入力途中・未反映の試算は含みません。','まだ保存していない候補です。')+`<details><summary>月別の取り崩し予定を確認</summary><div class="table-wrap"><table><thead><tr><th>対象月</th><th>NISA期首残高</th><th>運用益</th><th>取崩し指定額</th><th>取崩し可能額</th><th>指定額に対する不足</th><th>NISA期末残高</th></tr></thead><tbody>${p.rows.map(r=>`<tr><td>${esc(dateWithAge(r.month,c))}</td>${['startBalance','gain','requested','withdrawal','unmet','endBalance'].map(k=>`<td>${r[k].toLocaleString('ja-JP',{maximumFractionDigits:2})}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p>金額は万円。計画上の参考値で、実際の口座残高・売却注文ではありません。</p></details>`;
  }
  if(kind==='idecoWithdrawal')return currentSummaryHtml(c,'ideco').replace('現在の設定の概要','今回の試算プラン').replace('保存済みの条件です。入力途中・未反映の試算は含みません。','まだ保存していない候補です。');
  return '';
 }
 function initForm(kind,c){
  const host=el(`detail-${kind}`);if(!host)return;
  host.innerHTML=`<h2>${fname[kind]}</h2><form id="detail-form-${kind}" class="detail-form"><div class="form-grid">${fields(kind,c)}</div><div class="pension-actions"><button type="submit" class="primary">変更後の結果を確認（未反映）</button><button type="button" class="secondary" data-reset>未反映の入力を取り消す</button></div><p class="muted">試算結果は、この入力欄のすぐ下に表示します。入力・試算だけでは保存しません。「全体シミュレーションに反映」で保存し、ホーム・収支表・CSVを更新します。「未反映の入力を取り消す」は入力欄だけを保存済みの値に戻します。</p></form><div class="detail-preview" hidden></div><p class="inline-error" role="alert" hidden></p>`;
  const form=host.querySelector('form'),box=host.querySelector('.detail-preview'),error=host.querySelector('[role=alert]');const ctx={kind,form,box,error,proposal:null,sourceSignature:detailFormSourceSignature(kind,c),stale:false};forms.set(kind,ctx);populate(kind,form,c);ctx.initialValuesSignature=configSignature(values(form));
  const invalidate=()=>{ctx.proposal=null;box.hidden=true;error.hidden=!ctx.stale;};
  form.addEventListener('input',()=>{invalidate();hint(form,getState().config);});
  form.addEventListener('change',e=>{
   invalidate();const c=getState().config;
   if(kind==='nisaWithdrawal'&&e.target.name==='mode'&&e.target.value==='budget'){const ms=runRetirementPlan(c,{includeMonthlyDetails:true}).monthlyDetails;if(ms.length){if(!form.elements.startMonth.value)form.elements.startMonth.value=ms[0].month;if(!form.elements.endMonth.value)form.elements.endMonth.value=ms.at(-1).month;}}
   if(kind==='goal'&&e.target.name==='age'){fill(form,{amount:c.management?.thresholds?.[form.elements.age.value]??'',clearGoal:false});}

   if(kind==='labor'&&e.target.name==='person')fill(form,c.employment?.[e.target.value]?.sideWork||{monthlyGross:'',startDate:'',endDate:''});
   if(kind==='expense'&&e.target.name==='profile')refreshTargets(form,c);
   if(kind==='expense'&&e.target.name==='target'){
    const row=expenseEntries(c,form.elements.profile.value).find(x=>x.path===e.target.value);if(row){fill(form,{label:row.label,amount:row.row.amount??'',unit:'monthly'});}
   }
   if(kind==='expense'&&e.target.name==='group')form.elements.label.placeholder=EXPENSE_EXAMPLES[e.target.value].join('、');
   if(kind==='event'&&e.target.name==='target'&&e.target.value!=='')fill(form,c.events[Number(e.target.value)]);
   if(kind==='extra'&&e.target.name==='target'&&e.target.value)fill(form,c.cashflow?.periodOverrides.find(x=>x.kind==='income'&&x.key===e.target.value));
   updateWithdrawalFields(kind,form);hint(form,c);
  });
  form.querySelector('[data-reset]').addEventListener('click',()=>initForm(kind,getState().config));
  form.addEventListener('submit',event=>{event.preventDefault();try{
   if(ctx.stale)throw Error('この入力の元になった設定が別の操作で更新されています。未反映の入力を控え、「未反映の入力を取り消す」で最新の設定を読み直してください。');
   const state=getState(),p=detailProposal(state,laborEditors[kind]?'labor':kind,laborEditors[kind]?{...values(form),person:laborEditors[kind][0],job:laborEditors[kind][1]}:values(form));ctx.proposal=p;box.hidden=false;error.hidden=true;
   box.innerHTML=`<h3 tabindex="-1">試算結果（まだ反映していません）</h3>${withdrawalPreview(p.candidate,kind)}<p>${esc(fname[kind])}：${p.changed?'変更あり':'変更なし'}。最終資産 ${p.before.toLocaleString('ja-JP',{maximumFractionDigits:2})} → ${p.after.toLocaleString('ja-JP',{maximumFractionDigits:2})}万円</p><details><summary>変更する入力値・期間を確認</summary><dl>${Object.entries(values(form)).filter(([k])=>!['target','eventTarget'].includes(k)).map(([k,v])=>`<dt>${esc(form.elements[k]?.closest('label')?.childNodes[0]?.textContent||k)}</dt><dd>${esc(['date','month'].includes(form.elements[k]?.type)?dateWithAge(v,p.candidate,form.dataset.person||'primary'):form.elements[k]?.tagName==='SELECT'?form.elements[k].selectedOptions[0]?.textContent:v)}</dd>`).join('')}</dl></details><p>${p.values.useIndividualLabor?'給与生活終了後の収入方式を本人・配偶者の個別設定へ置き換えます。従来の夫婦合計額は重ねて計上しません。':kind==='expense'?'内訳のみの変更です。資産推移を変えるには、内訳を確認した後「内訳合計を年間予算にする」を試算してください。':['nisa','nisaWithdrawal'].includes(kind)?'NISAは開始資産の内数です。合計資産・運用利回りは変えません。':kind==='retirement'&&!p.values.postReceipt?'税の参考条件だけを変更します。退職金収入は追加しません。':'既存の計算方法・期間方式を使って全期間を再計算します。'}</p><button type="button" class="primary" data-apply ${p.changed?'':'disabled'}>全体シミュレーションに反映</button>`;
   box.querySelector('h3').focus({preventScroll:true});box.scrollIntoView({block:'nearest'});
   box.querySelector('[data-apply]').addEventListener('click',()=>{try{
    const current=getState(),next=verifyDetailProposal(current,ctx.proposal),patches=changedPaths(current.config,next);
    if(!commit(next))return;undo=patches;ctx.proposal=null;initForm(kind,getState().config);el('detailUndo').disabled=false;notice('保存しました。年次表・CSVを現在の設定で更新しました。');
   }catch(e){error.textContent=e.message;error.hidden=false;}});
  }catch(e){invalidate();error.textContent=e.message;error.hidden=false;}});
 }
 function availableColumns(){return report?visibleTrendColumns(report,el('detailCsvIncludeDetails').checked):[];}
 function selectedColumns(){return report?availableColumns().filter(c=>!excluded.has(c.id)):[];}
 function renderColumnPicker(){
  const groups=[...new Set(availableColumns().map(c=>c.section))];
  el('detailColumnPicker').innerHTML=groups.map(section=>{const cols=availableColumns().filter(c=>c.section===section),checked=cols.filter(c=>!excluded.has(c.id)).length;return `<details><summary>${esc(section)}（${checked}/${cols.length}項目）</summary><label class="check-label"><input type="checkbox" data-column-section="${esc(section)}" ${checked===cols.length?'checked':''}>${esc(section)}をまとめて選択</label>${trendPickerItemsHtml(cols,excluded)}</details>`;}).join('');
  for(const box of el('detailColumnPicker').querySelectorAll('[data-column-section]')){const cols=availableColumns().filter(c=>c.section===box.dataset.columnSection),n=cols.filter(c=>!excluded.has(c.id)).length;box.indeterminate=n>0&&n<cols.length;}
  const all=el('detailSelectAll');all.checked=selectedColumns().length===availableColumns().length;all.indeterminate=selectedColumns().length>0&&!all.checked;
 }
 function renderReport(){const c=getState().config;if(!c)return;const source=el('detailCsvSource').value,period=el('detailCsvPeriod').value;
  const sig=configSignature([c,source,period]);if(sig!==reportSignature){report=wideDetailedReport(c,{sourceProfile:source,period});reportSignature=sig;const selected=el('detailCsvAge').value;el('detailCsvAge').innerHTML=opt([['','全期間'],...report.rows.map(r=>[r.period,r.period])]);if(report.rows.some(r=>r.period===selected))el('detailCsvAge').value=selected;renderColumnPicker();}
  const age=el('detailCsvAge').value,filtered=report.rows.filter(r=>!age||r.period===age),columns=selectedColumns();
  el('detailCsvStatus').textContent=`全${report.rows.length}期間 / 画面${filtered.length}期間、選択${columns.length}/${availableColumns().length}項目。未確定は空欄で出力します。合計・内数・参考内訳は重ねて合計しません。`;
  el('detailCsvTable').innerHTML=`<thead><tr>${TREND_KEYS.map(([,label])=>`<th scope="col">${label}</th>`).join('')}${columns.map(c=>`<th scope="col" title="${esc(c.note)}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${filtered.map(r=>`<tr>${TREND_KEYS.map(([key])=>`<td>${esc(r[key]??'未確定')}</td>`).join('')}${columns.map(c=>`<td title="${esc(r.statuses[c.id])}">${r.values[c.id]===null?'未確定':esc(Number(r.values[c.id]).toLocaleString('ja-JP',{maximumFractionDigits:4}))}</td>`).join('')}</tr>`).join('')}</tbody>`;
  el('detailCsvLimit').textContent='縦に期間、横に項目を確認できます。CSVは画面の期間絞込みに関係なく、チェックした項目の全期間を出力します。年次は収支を合計し、期首・期末残高は最初・最後の値を使います。';
  el('downloadDetailedCsv').disabled=!columns.length;
 }
 function renderAnnual(){const c=getState().config;if(!c)return;const table=groupedYearHtml(runRetirementPlan(c,{includeMonthlyDetails:true}),el('yearViewMode').value);el('yearHead').innerHTML=table.head;el('yearRows').innerHTML=table.body;}
 function download(content,filename,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 el('detailUndo').addEventListener('click',()=>{try{if(!undo)return;if(commit(undoDetail(getState().config,undo))){undo=null;el('detailUndo').disabled=true;notice('今回の対象設定だけを元に戻しました。');}}catch(e){notice(e.message,'error');}});
 for(const id of ['detailCsvSource','detailCsvPeriod','detailCsvAge'])el(id).addEventListener('change',()=>{renderReport();if(id==='detailCsvSource'){el('reviewPromptText').value='';el('reviewPromptText').hidden=true;el('downloadReviewPrompt').disabled=true;}});
 el('yearViewMode').addEventListener('change',renderAnnual);
 el('detailCsvIncludeDetails').addEventListener('change',()=>{renderColumnPicker();renderReport();});
 el('detailSelectAll').addEventListener('change',e=>{if(!report)return;for(const c of availableColumns()){if(e.target.checked)excluded.delete(c.id);else excluded.add(c.id);}renderColumnPicker();renderReport();});
 el('detailColumnPicker').addEventListener('change',e=>{const {columnId,columnSection}=e.target.dataset;const cols=columnId?availableColumns().filter(c=>c.id===columnId):availableColumns().filter(c=>c.section===columnSection);for(const c of cols){if(e.target.checked)excluded.delete(c.id);else excluded.add(c.id);}const open=[...el('detailColumnPicker').querySelectorAll('details[open]')].map(d=>d.querySelector('[data-column-section]').dataset.columnSection);renderColumnPicker();for(const d of el('detailColumnPicker').querySelectorAll('details'))if(open.includes(d.querySelector('[data-column-section]').dataset.columnSection))d.open=true;renderReport();});
 el('downloadDetailedCsv').addEventListener('click',()=>{renderReport();if(!report)return;download(trendCsv(report,selectedColumns().map(c=>c.id),{includeStatus:el('detailCsvIncludeStatus').checked}),`lifeplan-items-${report.period}.csv`,'text/csv;charset=utf-8');});
 el('makeReviewPrompt').addEventListener('click',()=>{try{el('reviewPromptText').value=reviewPrompt(getState(),{sourceProfile:el('detailCsvSource').value});el('reviewPromptText').hidden=false;el('downloadReviewPrompt').disabled=false;notice('確認依頼文を作成しました。内容を確認してからChatGPTへ貼り付けてください。');}catch(e){notice(e.message,'error');}});
 el('downloadReviewPrompt').addEventListener('click',()=>download(el('reviewPromptText').value,'lifeplan-review-prompt.txt'));
 return {render(){const c=getState().config;if(!c)return;for(const kind of Object.keys(fname))if(!forms.has(kind))initForm(kind,c);const signature=configSignature(getState());if(renderedSignature!==signature){for(const ctx of forms.values()){ctx.proposal=null;ctx.box.hidden=true;}renderedSignature=signature;el('reviewPromptText').value='';el('reviewPromptText').hidden=true;el('downloadReviewPrompt').disabled=true;}
  el('detailCsvSource').value=expenseDisplayProfile(c,el('detailCsvSource').value)||'';renderAnnual();renderReport();
  for(const ctx of [...forms.values()]){
   const action=detailEditorRefresh(ctx.sourceSignature,detailFormSourceSignature(ctx.kind,c),ctx.initialValuesSignature,configSignature(values(ctx.form)));
   if(action==='reload'){initForm(ctx.kind,c);continue;}
   const wasStale=ctx.stale;ctx.stale=action==='stale';if(wasStale&&!ctx.stale)ctx.error.hidden=true;
   if(ctx.stale){ctx.error.textContent='この入力の元になった設定が別の操作で更新されています。未反映の入力は保持しています。入力を控えてから「未反映の入力を取り消す」で最新の設定を読み直してください。';ctx.error.hidden=false;}
   hint(ctx.form,c);
  }
  renderCurrentSummaries(c);renderLaborRecommendation(c);
  el('goalCurrentSummary').innerHTML='<h3>現在の目標設定</h3><p>保存済みの参考目標です。予測やiDeCo受取条件から自動変更されません。</p><ul>'+Object.entries(c.management?.thresholds||{}).sort((a,b)=>Number(a[0])-Number(b[0])).map(([a,v])=>'<li>'+esc(a)+'歳末：'+Number(v).toLocaleString('ja-JP')+'万円</li>').join('')+'</ul>';

 },invalidate(){for(const ctx of forms.values()){ctx.proposal=null;ctx.box.hidden=true;}},reset(){forms.clear();undo=null;reportSignature='';excluded.clear();el('detailUndo').disabled=true;}};
}
