/** ねんきんネット手入力専用。計画保存・外部送信なし。 */
import {survivorFormula,calculateSurvivor,compareSurvivor,JPS_RULE_URL,MHLW_DEFERRAL_URL} from './survivor-pension-engine.mjs';
const cash=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ja-JP',{maximumFractionDigits:2})+'万円':'未確定';
const cell=(doc,tag,value)=>{const el=doc.createElement(tag);el.textContent=String(value);return el;};
function table(doc,head,rows){const wrap=doc.createElement('div');wrap.className='table-wrap';const t=doc.createElement('table'),h=doc.createElement('thead'),hr=doc.createElement('tr');head.forEach(v=>hr.append(cell(doc,'th',v)));h.append(hr);t.append(h);const body=doc.createElement('tbody');rows.forEach(row=>{const tr=doc.createElement('tr');row.forEach(v=>tr.append(cell(doc,'td',v)));body.append(tr)});t.append(body);wrap.append(t);return wrap;}
const heading=(d,title)=>cell(d,'h3',title);
export function mountSurvivorPensionTab(root){
 if(!root)throw Error('遺族厚生年金タブの設置先がありません');
 const doc=root.ownerDocument;
 root.innerHTML=`<article class="card"><h2>遺族厚生年金シミュレーター</h2><p>ねんきんネット等で確認した年額を入力し、本人が亡くなった後の奥様の年金を試算します。入力も結果も保存されず、資産計算へ自動反映しません。</p>
 <p class="muted">対象は、妻65歳以降の夫死亡、遺族厚生年金の受給権・生計維持要件を確認済みのケースです。すべて税引前年額・万円、同じ価格基準で入力してください。</p>
 <form id="survivorPensionForm" class="form-grid">
 <label>妻の生年月日<input name="wifeBirthDate" type="date" required></label>
 <label>本人の死亡想定日<input name="deathDate" type="date" required></label>
 <label>本人の老齢厚生年金の報酬比例部分（年額・万円、死亡時点の見込額）<input name="deceasedProportional" type="number" min="0" step="any" required></label>
 <label>妻の65歳基準の老齢基礎年金（年額・万円）<input name="ownBasic65" type="number" min="0" step="any" required></label>
 <label>妻の65歳基準の老齢厚生年金（年額・万円）<input name="ownEmployee65" type="number" min="0" step="any" required></label>
 <label>個別案・妻の老齢基礎年金開始<select name="basicAge"><option value="65">65歳</option><option value="70">70歳</option><option value="75">75歳</option></select></label>
 <label>個別案・妻の老齢厚生年金開始<select name="employeeAge"><option value="65">65歳</option><option value="70">70歳</option><option value="75">75歳</option></select></label>
 <label>個別案・遺族厚生年金の請求<select name="claimMode"><option value="immediate">本人死亡翌月からの請求を仮定</option><option value="wait">妻の老齢厚生年金受給まで請求しない</option></select></label>
 <label class="check-label"><input type="checkbox" name="eligibilityConfirmed" required>受給資格・生計維持要件を年金事務所等の資料で確認済み（架空データの場合は仮定）</label>
 <button class="primary" type="submit">65・70・75歳開始を比較（未保存）</button>
 <button class="secondary" type="button" id="survivorPensionClear">入力・結果を消去</button></form>
 <p id="survivorPensionMessage" role="status" aria-live="polite" class="muted">年金記録の年額を入力してください。</p>
 <div id="survivorPensionOutput" aria-live="polite"></div>
 <details><summary>計算の前提と公式資料</summary>
 <p>死亡した本人の老齢基礎年金、繰下げ増額分は報酬比例部分に含めません。妻自身の老齢厚生年金が優先され、遺族厚生年金は調整後の差額です。</p>
 <p>妻の老齢厚生年金の繰下げ中に遺族厚生年金を先に請求する案は計算停止します。両立条件は2028年制度改正と請求状況に依存します。税・社会保険、加算、共済、追加加入、年金改定、支給月の精密計算は未対応です。</p>
 <p><a target="_blank" rel="noopener noreferrer" href="${JPS_RULE_URL}">日本年金機構：遺族厚生年金</a> ／ <a target="_blank" rel="noopener noreferrer" href="${MHLW_DEFERRAL_URL}">厚生労働省：年金の繰下げ</a></p></details></article>`;
 const form=root.querySelector('#survivorPensionForm'),msg=root.querySelector('#survivorPensionMessage'),out=root.querySelector('#survivorPensionOutput');
 function value(key){const field=form.elements.namedItem(key),s=field.value.trim();if(!s||!/^\d+(?:\.\d+)?$/.test(s))throw Error(key+'は年額を入力してください（未入力は0とみなしません）');return Number(s);}
 function input(){return {wifeBirthDate:form.elements.wifeBirthDate.value,deathDate:form.elements.deathDate.value,deceasedProportional:value('deceasedProportional'),ownBasic65:value('ownBasic65'),ownEmployee65:value('ownEmployee65'),eligibilityConfirmed:form.elements.eligibilityConfirmed.checked};}
 form.addEventListener('submit',event=>{
  event.preventDefault();out.replaceChildren();
  try{
   const x=input();if(!x.eligibilityConfirmed)throw Error('遺族厚生年金の資格確認が必要です');
   const base=survivorFormula(x),choices=compareSurvivor(x);
   msg.textContent='未保存・未採用の参考試算です。年金は税引前の固定額で、将来の制度・賃金・物価・税負担の変化は含みません。';
   out.append(heading(doc,'1．65歳基準の遺族厚生年金算定'));
   out.append(table(doc,['項目','年額'],[['本人の報酬比例部分×75%',cash(base.a)],['本人の報酬比例部分×50%＋妻の老齢厚生年金×50%',cash(base.b)],['遺族厚生年金の算定額',cash(base.gross)],['妻自身の老齢厚生年金（先に支給）',cash(base.ownEmployee65)],['遺族厚生年金の差額支給',cash(base.topUp)],['自身の基礎・厚生＋遺族厚生の合計',cash(base.total65)]]));
   out.append(heading(doc,'2．妻65・70・75歳開始の比較'));
   out.append(table(doc,['妻の開始年齢','請求の仮定','妻100歳直前までの累計','両年金受給後の年額'],choices.map(c=>[c.age+'歳',c.status==='unresolved'?'未計算':c.claimMode==='wait'?'老齢厚生年金開始まで遺族年金を請求しない':'死亡翌月から遺族年金を請求',c.status==='unresolved'?'未確定':cash(c.cumulative),c.status==='unresolved'?c.error:cash(c.annualAfterBoth)])));
   out.append(heading(doc,'3．老齢基礎・厚生年金の個別受給案'));
   try{
    const c=calculateSurvivor(x,{basicAge:Number(form.elements.basicAge.value),employeeAge:Number(form.elements.employeeAge.value),claimMode:form.elements.claimMode.value});
    out.append(table(doc,['項目','結果'],[['老齢基礎年金開始',c.basicAge+'歳'],['老齢厚生年金開始',c.employeeAge+'歳'],['遺族年金差額（両年金開始後）',cash(c.survivorTopUp)],['両年金受給後の年額',cash(c.annualAfterBoth)],['妻100歳直前までの累計',cash(c.cumulative)]]));
   }catch(e){out.append(cell(doc,'p','個別案は計算停止しました：'+e.message));}
   const details=doc.createElement('details'),summary=cell(doc,'summary','暦年別の年金内訳を表示');details.append(summary);
   for(const c of choices){if(c.status==='unresolved')continue;details.append(cell(doc,'h4',c.age+'歳開始'));details.append(table(doc,['年','妻の老齢基礎','妻の老齢厚生','遺族厚生','年金合計'],c.annualRows.map(r=>[r.year,cash(r.basic),cash(r.employee),cash(r.survivor),cash(r.total)])));}out.append(details);
   out.append(cell(doc,'p','この結果は参考年金収入であり、資産推移には自動計上しません。死亡後の資格・加算・請求・税・社会保険を年金事務所等で確認してください。'));
  }catch(e){out.replaceChildren();msg.textContent='計算を停止しました：'+e.message;}
 });
 root.querySelector('#survivorPensionClear').addEventListener('click',()=>{form.reset();out.replaceChildren();msg.textContent='入力と結果を消去しました。保存・資産計算への反映はありません。';});
 return {clear:()=>{out.replaceChildren();msg.textContent='未保存の参考試算です。';}};
}
