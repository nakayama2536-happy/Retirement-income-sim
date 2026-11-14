import {calculateSurvivor65Reference,calculateDeferredBasicReference,registeredSurvivorInputs} from './survivor-pension-calculator.mjs';
const add=(p,t,txt)=>{const e=p.ownerDocument.createElement(t);if(txt!==undefined)e.textContent=txt;p.append(e);return e;};
const numberInput=(p,name)=>{const label=add(p,'label',name+'（万円／年） '),node=add(label,'input');node.type='number';node.min='0';node.step='0.0001';node.inputMode='decimal';node.required=true;return node;};
const val=(e,label)=>{if(!e.value.trim())throw Error(label+'が未入力です');const n=Number(e.value);if(!Number.isFinite(n)||n<0||n>1000)throw Error(label+'は万円／年で入力してください。円の数値をそのまま入力していませんか');return n;};
const show=(p,k,v)=>add(p,'p',k+'：'+v.toLocaleString('ja-JP',{maximumFractionDigits:4})+'万円／年');
export function mountSurvivorPensionScreen(root,{getConfig=()=>null,onTransfer=null}={}){
 if(!root)throw Error('遺族年金画面がありません');
 root.replaceChildren();add(root,'h2','65歳基準の遺族年金参考試算（未採用）');
 add(root,'p','本人・妻の65歳基準データを年金設定から読み込みます。登録済みの受給開始額や繰下げ設定は変更しません。');
 const form=add(root,'form');form.noValidate=true;
 const choose=add(form,'label','死亡を想定する方 ');
 const deceased=add(choose,'select');for(const [v,t] of [['primary','本人'],['spouse','妻']]){const o=add(deceased,'option',t);o.value=v;}
 const source=add(form,'p','資料：未参照');source.setAttribute('role','status');
 const fetch=add(form,'button','登録済みの65歳基準内訳を読み込む');fetch.type='button';
 const d=numberInput(form,'死亡した方の報酬比例部分（繰下げ加算除外）');
 const o=numberInput(form,'残された方の老齢厚生年金・報酬比例部分');
 const b=numberInput(form,'残された方の老齢基礎年金');
 add(form,'p','単位は万円／年です。例：123万4567円 → 123.4567。円単位の整数をそのまま入力すると誤計算になります。');
 const run=add(form,'button','65歳基準で試算');run.type='submit';
 const out=add(root,'div');out.setAttribute('role','status');out.setAttribute('aria-live','polite');
 const transfer=add(root,'button','「もしものときの家計」へ仮入力を渡す');transfer.type='button';transfer.disabled=true;
 const note=add(root,'p','参考結果は現在の年金設定・資産計画を変更しません。転記先で死亡月・受給資格・繰下げの影響を確認してください。年金合計は自動的に確定採用しません。');
 let last=null;
 const invalidate=()=>{last=null;transfer.disabled=true;out.replaceChildren();};
 const load=()=>{
  invalidate();
  try{
   const p=registeredSurvivorInputs(getConfig(),deceased.value);
   d.value=String(p.deceasedEarnings);o.value=String(p.ownEmployee);b.value=String(p.ownBasic);
   source.textContent='登録済み資料：死亡する方「'+p.sources.deceased+'」、残された方「'+p.sources.survivor+'」。年度・確認日は資料記載を確認してください。';
  }catch(e){source.textContent=e.message;}
 };
 deceased.addEventListener('change',()=>{d.value='';o.value='';b.value='';source.textContent='死亡想定を変更しました。年金情報を再参照してください。';invalidate();load();});
 fetch.addEventListener('click',load);
 for(const e of [d,o,b])e.addEventListener('input',()=>{source.textContent='手入力（出典・年度は転記先で確認）';invalidate();});
 form.addEventListener('submit',e=>{
  e.preventDefault();invalidate();
  try{
   const inputs={deceased:deceased.value,deceasedEarnings:val(d,'報酬比例部分'),ownEmployee:val(o,'自身の厚生年金'),ownBasic:val(b,'自身の基礎年金')};
   const r=calculateSurvivor65Reference({deceasedEarningsBaseAnnual:inputs.deceasedEarnings,ownEmployeeAnnual:inputs.ownEmployee,ownBasicAnnual:inputs.ownBasic});
   show(out,'方式A（死亡者×75％）',r.formulaA);show(out,'方式B（死亡者×50％＋本人厚生×50％）',r.formulaB);
   show(out,'遺族厚生年金の差額相当',r.survivorPensionPayable);show(out,'残された方の参考合計',r.referenceTotal);
   add(out,'p','未採用の65歳基準額です。'+r.limitations);
   last={...inputs,total:r.referenceTotal};
   transfer.disabled=typeof onTransfer!=='function';
  }catch(err){add(out,'p',err.message);}
 });
 transfer.addEventListener('click',()=>{
  if(!last||typeof onTransfer!=='function')return;
  try{onTransfer({...last});note.textContent='比較画面へ入力項目を引き継ぎました。年金合計は受給資格確認後に転記するため空欄です。';}
  catch(e){note.textContent='転記できません：'+e.message;}
 });
 const details=add(root,'details');add(details,'summary','老齢基礎年金の繰下げを別途試算');
 add(details,'p','遺族年金との合算ではありません。受給権発生時期により繰下げできない場合があります。');
 const df=add(details,'form');df.noValidate=true;const db=numberInput(df,'65歳時点の老齢基礎年金');
 const ml=add(df,'label','繰下げ月数（0～120） '),months=add(ml,'input');months.type='number';months.min='0';months.max='120';months.step='1';months.required=true;
 const button=add(df,'button','基礎年金のみ試算');button.type='submit';const dout=add(details,'div');dout.setAttribute('role','status');
 df.addEventListener('input',()=>dout.replaceChildren());df.addEventListener('submit',e=>{e.preventDefault();dout.replaceChildren();try{const v=calculateDeferredBasicReference({basicAt65Annual:val(db,'基礎年金'),monthsDeferred:Number(months.value)});if(!months.value.trim())throw Error('繰下げ月数が未入力です');show(dout,'繰下げ後の基礎年金',v.amount);add(dout,'p',v.limitations);}catch(err){add(dout,'p',err.message);}});
 load();
 return {invalidate(){invalidate();}};
}
