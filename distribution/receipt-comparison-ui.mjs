/** Standalone receipt comparison: isolated optional draft storage; never modifies adopted plan. */
import {assessRetirementReceiptPair,comparePensionYear} from './receipt-tax-extension.mjs';
import {referenceRetirementTax2026} from './receipt-tax-amount.mjs';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(value,label)=>{if(String(value??'').trim()==='')throw Error(`${label}が未入力です`);const n=Number(value);if(!Number.isFinite(n)||n<0)throw Error(`${label}は0以上の数値にしてください`);return n;};
const read=(form,key)=>String(form.elements.namedItem(key)?.value??'');
const validCalendarDate=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [year,month,day]=value.split('-').map(Number);if(year<1||month<1||month>12)return false;const days=new Date(Date.UTC(2000,month,0)).getUTCDate();const leap=year%4===0&&(year%100!==0||year%400===0);return day>=1&&day<=(month===2?(leap?29:28):days);};
const yen=v=>v==null?'未算定':`${new Intl.NumberFormat('ja-JP').format(v)}円`;
export function compareReceiptDraft(raw,confirmations={}){
 const company={periodStart:raw.companyStart,periodEnd:raw.companyEnd,receiptDate:raw.companyReceipt,grossMan:number(raw.companyGross,'会社退職金')};
 const ideco={periodStart:raw.idecoStart,periodEnd:raw.idecoEnd,receiptDate:raw.idecoReceipt,grossMan:number(raw.idecoGross,'iDeCo一時金')};
 const retirement=assessRetirementReceiptPair({company,ideco});
 // Pension is an independent optional reference. Missing inputs must not be treated as 0.
 const pensionKeys=['year','birthDate','idecoPension','publicPension','otherIncome'];
 const pensionEntered=pensionKeys.some(k=>String(raw[k]??'').trim()!=='');
 const pension=pensionEntered?comparePensionYear({calendarYear:String(raw.year??'').trim()===''?null:Number(raw.year),birthDate:raw.birthDate,idecoPensionAnnualMan:String(raw.idecoPension??'').trim()===''?null:number(raw.idecoPension,'iDeCo年金'),publicPensionAnnualMan:String(raw.publicPension??'').trim()===''?null:number(raw.publicPension,'公的年金'),otherIncomeMan:String(raw.otherIncome??'').trim()===''?null:number(raw.otherIncome,'年金以外の所得')}):{status:'not-requested',pensionMiscIncomeMan:null,issues:['年金参考計算は未入力のため実施していません']};
 // Do not silently assume that the user qualifies for the ordinary-retirement calculation.
 const verified=['allGeneral','noOtherReceipts','verifiedPeriods','verifiedEligible'].every(k=>confirmations[k]===true);
 const tax=verified?referenceRetirementTax2026({company,ideco,allGeneral:true,noOtherReceipts:true,verifiedPeriods:true,verifiedEligible:true}):{status:'incomplete',issues:['一般退職手当・他の受取の有無・期間・適用条件について全ての確認が必要'],taxYen:null,residentTaxReferenceYen:null};
 // This is only retirement lump-sum net, never total household or pension net.
 const retirementGrossYen=Math.round((company.grossMan+ideco.grossMan)*10000);
 const retirementNetReferenceYen=tax.status==='reference'&&tax.taxYen!=null&&tax.residentTaxReferenceYen!=null?retirementGrossYen-tax.taxYen-tax.residentTaxReferenceYen:null;
 return {retirement,pension,tax,retirementNetReferenceYen,netMan:null,estimatedTaxMan:null,adoptable:false};
}
const fields=[['companyStart','会社勤続開始日','date'],['companyEnd','会社勤続終了日','date'],['companyReceipt','会社退職金受取日','date'],['companyGross','会社退職金・税引前（万円）','number'],['idecoStart','iDeCo加入等開始日','date'],['idecoEnd','iDeCo加入等終了日','date'],['idecoReceipt','iDeCo一時金受取日','date'],['idecoGross','iDeCo一時金・税引前（万円）','number'],['year','年金所得の対象年','number'],['birthDate','受給者生年月日','date'],['idecoPension','iDeCo年金年額（万円）','number'],['publicPension','公的年金年額（万円）','number'],['otherIncome','年金以外の所得（万円）','number']];
const checks=[['allGeneral','両方とも一般退職手当であり、短期・役員退職金等の例外がない'],['noOtherReceipts','他の退職手当や同年・過去の未入力受取がない'],['verifiedPeriods','勤続・加入期間と重複期間は税務上の対象期間として確認済み'],['verifiedEligible','受取区分・申告書・特例の適用条件を確認済み']];
// Local storage is scoped to this origin and browser profile, not the adopted configuration.
// In Edge Guest, it may disappear when the guest session closes. Export is available for that case.
export const RECEIPT_DRAFT_KEY='lifeplan:receipt-comparison:draft:v1';
export function removeReceiptDraftVerified(store){
 if(!store)throw Error('保存領域を使用できません');
 store.removeItem(RECEIPT_DRAFT_KEY);
 if(store.getItem(RECEIPT_DRAFT_KEY)!==null)throw Error('削除結果を確認できません');
 return true;
}
export function normalizeReceiptDraft(payload){
 if(!payload||payload.format!=='lifeplan-receipt-draft'||payload.version!==1||!payload.values||!payload.confirmations)throw Error('比較下書きの形式・版が不正です');
 const values={}, confirmations={};
 for(const [id,,type] of fields){
  const value=payload.values[id];
  if(typeof value!=='string'||value.length>120)throw Error(`${id}の入力が不正です`);
  if(value&&type==='date'&&!validCalendarDate(value))throw Error(`${id}の日付が実在しません`);
  if(value&&id==='year'&&!/^\d{4}$/.test(value))throw Error('年金所得の対象年は西暦4桁で指定してください');
  if(value&&type==='number'&&(!Number.isFinite(Number(value))||Number(value)<0))throw Error(`${id}の金額が不正です`);
  values[id]=value;
 }
 for(const [id] of checks){if(typeof payload.confirmations[id]!=='boolean')throw Error(`${id}の確認値が不正です`);confirmations[id]=payload.confirmations[id];}
 return {format:'lifeplan-receipt-draft',version:1,values,confirmations};
}
export function receiptDraftFromForm(form){return normalizeReceiptDraft({format:'lifeplan-receipt-draft',version:1,values:Object.fromEntries(fields.map(([id])=>[id,read(form,id)])),confirmations:Object.fromEntries(checks.map(([id])=>[id,form.elements.namedItem(id)?.checked===true]))});}
export function applyReceiptDraft(form,payload){
 const draft=normalizeReceiptDraft(payload);
 for(const [id] of fields)form.elements.namedItem(id).value=draft.values[id];
 for(const [id] of checks)form.elements.namedItem(id).checked=draft.confirmations[id];
}
export function mountReceiptComparison(root){
 if(!root)throw Error('表示先要素がありません');
 root.innerHTML=`<section aria-label="iDeCo・退職金の受取比較"><h3>受取順序・年金所得の参考比較（未反映）</h3><p>比較用の入力は、このブラウザ内に下書きとして保存します。採用済み設定・資産計算・CSV・一括バックアップには反映しません。ゲストモード終了後は下書きが消える場合があるため、必要に応じて「下書きをJSON保存」を使用してください。</p><div><button type="button" id="receiptDraftExport">下書きをJSON保存</button> <label>下書きJSONを読み込む <input id="receiptDraftImport" type="file" accept="application/json,.json"></label> <button type="button" id="receiptDraftClear">比較下書きを消去</button></div><p id="receiptDraftStatus" role="status" aria-live="polite"></p><form id="receiptCompareDraft">${fields.map(([id,label,type])=>`<label style="display:block;margin:0.6em 0">${escape(label)} <input ${['year','birthDate','idecoPension','publicPension','otherIncome'].includes(id)?'':'required'} name="${id}" type="${type}" ${type==='number'?'step="any" min="0"':''}></label>`).join('')}<fieldset><legend>退職一時金の税額参考計算に必要な確認</legend>${checks.map(([id,label])=>`<label style="display:block"><input type="checkbox" name="${id}"> ${escape(label)}</label>`).join('')}</fieldset><button type="submit">参考判定</button></form><div id="receiptCompareResult" role="status" aria-live="polite"></div></section>`;
 const form=root.querySelector('form'),out=root.querySelector('#receiptCompareResult'),status=root.querySelector('#receiptDraftStatus');
 let store=null;try{store=globalThis.localStorage;}catch(_){/* Storage may be denied by browser policy. JSON export remains available. */}
 const save=()=>{try{if(!store)throw Error('保存領域を使用できません');const json=JSON.stringify(receiptDraftFromForm(form));store.setItem(RECEIPT_DRAFT_KEY,json);if(store.getItem(RECEIPT_DRAFT_KEY)!==json)throw Error('保存結果を確認できません');status.textContent='比較用下書きをブラウザ内に保存しました（計算結果は保存しません）。';}catch(err){status.textContent='ブラウザ内に保存できません。必要ならJSONへ保存してください。';}};
 try{const raw=store?.getItem(RECEIPT_DRAFT_KEY);if(raw){const draft=normalizeReceiptDraft(JSON.parse(raw));draft.confirmations=Object.fromEntries(checks.map(([id])=>[id,false]));applyReceiptDraft(form,draft);status.textContent='比較用の入力値を復元しました。税務確認は再度チェックしてください。';}}catch(err){status.textContent='保存済み下書きを復元できませんでした。入力値は変更していません。';}
 const submit=e=>{e.preventDefault();try{const raw=Object.fromEntries(fields.map(([key])=>[key,read(form,key)]));const confirmations=Object.fromEntries(checks.map(([key])=>[key,form.elements.namedItem(key)?.checked===true]));const result=compareReceiptDraft(raw,confirmations);const r=result.retirement,p=result.pension,t=result.tax;out.innerHTML=`<p>受取順序判定：${escape(r.status)}${r.status==='same-year' ? '（同年受取：特別な控除調整の確認が必要。表示税額は限定的な参考値です）' : ''}</p><p>退職一時金・所得税等（2026年制度参考）：${yen(t.taxYen)}</p><p>退職一時金・住民税（10％概算）：${yen(t.residentTaxReferenceYen)}</p><p><strong>退職一時金のみの税引後参考：${yen(result.retirementNetReferenceYen)}</strong></p><p>年金雑所得の参考額：${p.pensionMiscIncomeMan==null?'未算定':escape(p.pensionMiscIncomeMan)+'万円'}</p><p>年金分の税・社会保険を含む世帯の最終手取額：未算定</p><p>税額は一般退職手当等の限定的な参考値です。将来の制度、税額控除、円未満端数、医療保険・介護保険料等は別途確認してください。</p>${[...(r.issues||[]),...(p.issues||[]),...(t.issues||[])].map(x=>`<p>${escape(x)}</p>`).join('')}`;}catch(err){out.textContent=`入力確認：${err.message}`;}};
 const invalidate=()=>{out.replaceChildren();out.textContent='条件が変更されました。再度「参考判定」を実行してください。';save();};
 const exportBtn=root.querySelector('#receiptDraftExport');
 const exportDraft=()=>{try{const json=JSON.stringify(receiptDraftFromForm(form),null,2);const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='lifeplan-receipt-comparison-draft.json';a.click();URL.revokeObjectURL(url);status.textContent='比較用下書きJSONを書き出しました。個人情報を入力した場合は非公開で管理してください。';}catch(err){status.textContent=`書出し失敗：${err.message}`;}};
 exportBtn.addEventListener('click',exportDraft);
 const importFile=root.querySelector('#receiptDraftImport');
 const importDraft=async()=>{const file=importFile.files?.[0];if(!file)return;try{if(file.size>20000)throw Error('20KBを超えるファイルは読み込めません');const draft=normalizeReceiptDraft(JSON.parse(await file.text()));draft.confirmations=Object.fromEntries(checks.map(([id])=>[id,false]));applyReceiptDraft(form,draft);invalidate();status.textContent='比較用下書きを読み込みました。税務確認を再度チェックしてください。';}catch(err){status.textContent=`読込み失敗：${err.message}`;}finally{importFile.value='';}};
 importFile.addEventListener('change',importDraft);
 const clearBtn=root.querySelector('#receiptDraftClear');
 const clear=()=>{try{removeReceiptDraftVerified(store);form.reset();out.replaceChildren();status.textContent='比較用下書きのみ消去しました。採用済み設定は変更していません。';}catch(err){status.textContent='ブラウザ内の下書きを消去できませんでした。入力は保持しています。';}};
 clearBtn.addEventListener('click',clear);
 form.addEventListener('input',invalidate);
 form.addEventListener('change',invalidate);
 form.addEventListener('submit',submit);
 return {dispose:()=>{form.removeEventListener('input',invalidate);form.removeEventListener('change',invalidate);form.removeEventListener('submit',submit);exportBtn.removeEventListener('click',exportDraft);importFile.removeEventListener('change',importDraft);clearBtn.removeEventListener('click',clear);}};
}
