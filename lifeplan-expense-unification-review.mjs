/** Read-only, browser-compatible review before any legacy expense adoption.
 * No writes, no logging of original money values, no network and no automatic
 * resolution of conflicting old/standard expense profiles.
 */
import {prepareExpenseUnification} from './lifeplan-expense-unification-candidate.mjs';
const invalidCodes={
 STANDARD_EXISTS:'標準形式にも登録済みの内訳があります。費目ごとの対応確認が必要です。',
 CANDIDATE_ALREADY_PRESENT:'移行候補が既に存在します。二重変換を止めました。',
 TRAVEL_SEPARATE_REVIEW:'旅行費は別途、年齢期間と管理予算との関係を確認してください。',
 EXISTING_EXPENSE_OVERRIDES:'既存の期間別内訳変更があります。重複・優先順を確認してください。',
 CROSS_GROUP_ITEM_KEY_COLLISION:'複数の大項目で費目IDが重複しています。自動統合できません。',
 NO_LEGACY_LIST:'旧形式の生活費内訳が確認できません。',
 ENDS_BEFORE_PLAN:'計画終了年齢より前に終了する費目があります。終了後は未確定として保持します。',
 STANDARD_ALREADY_PRESENT:'標準形式にも内訳があります。元の登録を保持して比較してください。',
 SPECIAL_TAX_MODE:'税・社会保険は制度計算の参照先を確認するまで統合しません。',
};
const safeCode=x=>typeof x==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(x)?x:'UNKNOWN';
const explain=code=>invalidCodes[code]||`設定の整合性を確認してください（${code}）。`;
export function reviewExpenseUnification(config){
  if(!config || typeof config!=='object' || Array.isArray(config))return {status:'no-config',adoptable:false,headline:'採用済みの設定がありません。',count:{legacy:0,standard:0,age95:0,age96:0},issues:[]};
  let r;
  try{r=prepareExpenseUnification(config);}catch{return {status:'blocked',adoptable:false,headline:'保存データの形式を確認できません。設定の変更を中止しました。',count:{legacy:0,standard:0,age95:0,age96:0},issues:[{code:'INVALID_SOURCE',message:'元の保存データを維持し、形式を確認してください。'}]};}
  const info=r.inspection||{};
  const count={legacy:info.legacyCount||0,standard:info.standardGroupCount||0,age95:info.referenceAge95||0,age96:info.referenceAge96||0};
  const all=[...(info.diagnostics||[]),...(r.errors||[])];
  const seen=new Set();const issues=[];
  for(const d of all){const code=safeCode(d.code);const identity=code+'|'+String(d.path||'');if(seen.has(identity))continue;seen.add(identity);issues.push({code,message:explain(code),path:/^\/[a-zA-Z0-9/_-]{0,190}$/.test(d.path||'')?d.path:''});}
  return {status:r.status,adoptable:false,
    headline:r.status==='candidate-only'?'変換候補を作れます。ただし設定への採用はまだできません。':'移行前に確認が必要な項目があります。元データは変更していません。',
    count,issues,candidateAvailable:r.status==='candidate-only',
    // Never return the candidate or any of its monetary amounts to the UI.
    unchanged:true};
}
/** Insert a read-only inspection card into 4-1 without touching existing forms. */
export function mountExpenseUnificationReview({doc=globalThis.document,getConfig}={}){
  if(!doc?.createElement||typeof getConfig!=='function')throw Error('Preview panel requires document and configuration source');
  const host=doc.getElementById('expenses');if(!host)throw Error('Missing expenses panel');
  const card=doc.createElement('details');card.className='card';card.id='expenseUnificationReview';
  const summary=doc.createElement('summary');summary.textContent='旧形式から標準形式への移行前確認（参照のみ）';
  const note=doc.createElement('p');note.textContent='移行候補・95歳/96歳の費目参照・両形式の併存を確認します。診断・展開操作では設定の保存や移行は行いません。';
  const button=doc.createElement('button');button.type='button';button.className='secondary';button.textContent='移行前診断を実行（保存しない）';
  const output=doc.createElement('div');output.setAttribute('role','status');output.setAttribute('aria-live','polite');
  card.append(summary,note,button,output);
  const anchor=host.querySelector('.expense-reconcile-grid');if(anchor)host.insertBefore(card,anchor);else host.append(card);
  button.addEventListener('click',()=>{
    const review=reviewExpenseUnification(getConfig());output.replaceChildren();
    const headline=doc.createElement('p');headline.textContent=review.headline;
    const counts=doc.createElement('p');counts.textContent=`旧形式の費目 ${review.count.legacy}件／既存標準形式の大項目 ${review.count.standard}件／95歳に登録がある費目 ${review.count.age95}件／96歳に登録がある費目 ${review.count.age96}件`;
    output.append(headline,counts);
    if(review.issues.length){const list=doc.createElement('ul');for(const item of review.issues){const li=doc.createElement('li');li.textContent=`${item.message} ${item.path}`;list.append(li);}output.append(list);}
    const footer=doc.createElement('p');footer.textContent='診断は参照のみです。旧形式・標準形式・管理予算・死亡比較設定は変更されません。';output.append(footer);
  });
  return {root:card,clear(){output.replaceChildren();}};
}