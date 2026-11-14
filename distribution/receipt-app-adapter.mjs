/** Read-only adapter for the live Life Plan Simulator. Draft inputs persist separately; adopted settings remain read-only. */
import {mountReceiptComparison} from './receipt-comparison-ui.mjs';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const display=(v,suffix='')=>v===null||v===undefined||v===''?'未確認':`${esc(v)}${suffix}`;

/** Snapshot is not a validated tax assumption and is deliberately not used to prefill form. */
export function receiptAdoptedSnapshot(config){
  if(!config||typeof config!=='object')return null;
  const company=config.retirement||{};
  const ideco=config.ideco||{};
  const primary=config.people?.primary||{};
  return {
    companyGross:company.amount??null,
    companyReceive:company.receiveDate??null,
    serviceYears:company.serviceYears??null,
    companyStart:company.companyStartDate??null,
    idecoJoin:ideco.joinDate??null,
    idecoReceipt:ideco.lumpDate??null,
    idecoMethod:ideco.withdrawalMode??null,
    birthDate:primary.birthDate??null
  };
}

export function mountReceiptAppAdapter(root,{getConfig}={}){
  if(!root||typeof getConfig!=='function')throw Error('比較画面の接続先が不正です');
  if(root.dataset.receiptMounted==='1')throw Error('比較画面の重複接続はできません');
  root.dataset.receiptMounted='1';
  const intro=document.createElement('div');
  intro.className='card';
  intro.innerHTML='<h2>受取方法の比較（参考・未反映）</h2><p>保存済み条件から参考値を確認できますが、入力欄には自動転記しません。税務上の対象期間・受取方法が一致するか確認して試算してください。</p><button type="button" id="receiptReadAdopted">現在の採用条件を確認</button><div id="receiptAdoptedSummary" role="status" aria-live="polite"></div>';
  root.appendChild(intro);
  const formHost=document.createElement('div');root.appendChild(formHost);
  const compare=mountReceiptComparison(formHost);
  const button=intro.querySelector('#receiptReadAdopted');
  const out=intro.querySelector('#receiptAdoptedSummary');
  const show=()=>{
    const data=receiptAdoptedSnapshot(getConfig());
    if(!data){out.textContent='採用済み条件が読み込まれていません。保存済み設定を読み込んでください。';return;}
    out.innerHTML=`<p>以下はアプリ内の採用値の抜粋であり、比較画面への採用や税務条件の確定ではありません。</p><dl><dt>会社退職金額（万円）</dt><dd>${display(data.companyGross)}</dd><dt>退職金受取日</dt><dd>${display(data.companyReceive)}</dd><dt>勤続年数</dt><dd>${display(data.serviceYears)}</dd><dt>会社勤続開始日</dt><dd>${display(data.companyStart)}</dd><dt>iDeCo加入日</dt><dd>${display(data.idecoJoin)}</dd><dt>iDeCo一時金受取日</dt><dd>${display(data.idecoReceipt)}</dd><dt>iDeCo方式</dt><dd>${display(data.idecoMethod)}</dd><dt>本人の生年月日</dt><dd>${display(data.birthDate)}</dd></dl><p>受取時点の残高や税務上の加入期間は、この一覧だけでは確定しません。</p>`;
  };
  button.addEventListener('click',show);
  return {dispose(){button.removeEventListener('click',show);compare.dispose();root.replaceChildren();delete root.dataset.receiptMounted;}};
}
