import {calculateSurvivor65Reference,calculateDeferredBasicReference} from './survivor-pension-calculator.mjs';
const add=(p,t,txt)=>{const e=p.ownerDocument.createElement(t);if(txt!==undefined)e.textContent=txt;p.append(e);return e;};
const input=(p,label)=>{const l=add(p,'label',label+'（万円／年） '),e=add(l,'input');e.type='number';e.step='any';e.min='0';e.required=true;return e;};
const read=(e,label)=>{if(e.value.trim()==='')throw Error(label+'は未入力です。未入力を0円とみなしません');const v=Number(e.value);if(!Number.isFinite(v)||v<0)throw Error(label+'は0以上の金額で入力してください');return v;};
const show=(p,k,v)=>add(p,'p',k+'：'+v.toLocaleString('ja-JP',{maximumFractionDigits:4})+'万円／年（'+(v/12).toLocaleString('ja-JP',{maximumFractionDigits:4})+'万円／月）');
export function mountSurvivorPensionScreen(root){
 if(!root)throw Error('専用画面の配置先がありません');
 root.replaceChildren();add(root,'h2','遺族年金の独立参考試算');
 add(root,'p','65歳以上の方の遺族厚生年金を参考計算します。入力値・結果は保存しません。既存の「もしものときの家計」や採用済み年金額には反映しません。');
 const form=add(root,'form');form.noValidate=true;
 const dec=input(form,'死亡した方の報酬比例部分（繰下げ加算除外）'),own=input(form,'残された方の老齢厚生年金'),basic=input(form,'残された方の老齢基礎年金');
 const btn=add(form,'button','65歳基準で試算');btn.type='submit';
 const out=add(root,'div');out.setAttribute('role','status');out.setAttribute('aria-live','polite');
 form.addEventListener('input',()=>out.replaceChildren());
 form.addEventListener('submit',e=>{e.preventDefault();out.replaceChildren();try{const v=calculateSurvivor65Reference({deceasedEarningsBaseAnnual:read(dec,'死亡者の報酬比例部分'),ownEmployeeAnnual:read(own,'本人厚生年金'),ownBasicAnnual:read(basic,'本人基礎年金')});show(out,'方式A（死亡者×75％）',v.formulaA);show(out,'方式B（死亡者×50％＋本人厚生×50％）',v.formulaB);show(out,'遺族厚生年金の算定基準額',v.survivorPensionNominal);show(out,'本人厚生年金との差額相当',v.survivorPensionPayable);show(out,'本人基礎・厚生年金を含む参考合計',v.referenceTotal);add(out,'p','未採用・参考値。'+v.limitations);}catch(err){add(out,'p',err.message);}});
 const details=add(root,'details');add(details,'summary','老齢基礎年金の繰下げだけを別途試算');
 add(details,'p','遺族年金との合算ではありません。受給権の発生時期や生年月日で繰下げ可能期間が変わります。');
 const df=add(details,'form');df.noValidate=true;const dbasic=input(df,'65歳時点の老齢基礎年金'),ml=add(df,'label','繰下げ月数（0～120） '),months=add(ml,'input');months.type='number';months.min='0';months.max='120';months.step='1';months.required=true;
 const run=add(df,'button','繰下げ基礎年金だけを試算');run.type='submit';const dout=add(details,'div');dout.setAttribute('role','status');
 df.addEventListener('input',()=>dout.replaceChildren());
 df.addEventListener('submit',e=>{e.preventDefault();dout.replaceChildren();try{const v=calculateDeferredBasicReference({basicAt65Annual:read(dbasic,'65歳基礎年金'),monthsDeferred:read(months,'繰下げ月数')});show(dout,'繰下げ後の老齢基礎年金参考額',v.amount);add(dout,'p',v.limitations);}catch(err){add(dout,'p',err.message);}});
 return {invalidate(){out.replaceChildren();dout.replaceChildren();}};
}
