/**
 * ライフプランシミュレーター: 死亡時期を変える非採用・読取り専用の比較計算候補。
 * No changes to the current app, personal data, pension claims, or monthly engine.
 * Units: 万円. Months: YYYY-MM. Finance: earn effective monthly return on opening,
 * then post month flows. Death-month pension remains accrued; change is NEXT month.
 */
const VALID_PERSON = new Set(['primary', 'spouse']);
const MONTH = /^(\d{4})-(\d{2})$/;
const TOLERANCE = 1e-5;

export class MortalityPreviewError extends Error {
  constructor(code, message){ super(message); this.name='MortalityPreviewError'; this.code=code; }
}
const invalid = (code, message) => { throw new MortalityPreviewError(code,message); };
const finite = (v,code)=>typeof v==='number' && Number.isFinite(v) ? v : invalid(code,`${code}: 金額/比率の確定入力が必要です（未入力を0にしません）`);
export const monthlyIndex = (m) => {
  const match=MONTH.exec(String(m||''));
  if(!match || Number(match[2])<1 || Number(match[2])>12) return invalid('month-format','年月はYYYY-MMの実在する月を指定してください');
  return Number(match[1])*12+Number(match[2])-1;
};
const nextMonth = (m) => {
  const i=monthlyIndex(m)+1;
  return `${Math.floor(i/12).toString().padStart(4,'0')}-${String(i%12+1).padStart(2,'0')}`;
};

/** 2026-10-25 consulted: Japan Pension Service survivor employees' pension.
 * This is NOT an entitlement check, nor a complete statutory amount calculation.
 * Only for confirmed survivor >=65 already receiving their own old-age pension.
 * Values must EXCLUDE deceased's old-age pension deferral increment.
 * No automatic survivor eligibility / future law/child/supplement/tax evaluation.
 */
export function estimateSurvivorReference65({
  deceasedEmployeeEarningsAnnualBase, survivorOwnEmployeeAnnual,
  survivorOwnBasicAnnual, survivorAge, entitlementConfirmed,
  ownPensionClaimConfirmed, deferralConflictReviewed
}){
  if(entitlementConfirmed!==true || ownPensionClaimConfirmed!==true || deferralConflictReviewed!==true)invalid('survivor-eligibility-unconfirmed','遺族厚生年金の受給権・本人年金の請求・繰下げ影響が未確認です');
  if(!Number.isInteger(survivorAge)||survivorAge<65)invalid('survivor-age','この概算は65歳以上かつ老齢年金受給中のケース専用です');
  const dec=finite(deceasedEmployeeEarningsAnnualBase,'deceased-employee-base');
  const own=finite(survivorOwnEmployeeAnnual,'survivor-own-employee');
  const basic=finite(survivorOwnBasicAnnual,'survivor-own-basic');
  if(Math.min(dec,own,basic)<0)invalid('negative-pension','年金構成額に負値は指定できません');
  const entitlement=Math.max(dec*.75,dec*.5+own*.5);
  const survivorTopUp=Math.max(0,entitlement-own);
  return {
    type:'2026-reference-not-adoption',
    survivorEntitlementAnnual:entitlement,
    ownBasicAnnual:basic,ownEmployeeAnnual:own,
    survivorTopUpAnnual:survivorTopUp,
    totalSurvivingPublicPensionAnnual:basic+own+survivorTopUp,
    source:'https://www.nenkin.go.jp/service/jukyu/seido/izokunenkin/jukyu-yoken/20150424.html',
    limitations:['死亡者の老齢厚生年金繰下げ加算は計算対象に含まれない','税・保険・加給・遺族基礎・年金の振込期日・将来改正は別確認']
  };
}

/** User-editable MODEL assumptions, not official observed spending ratios.
 * A real scenario must show and review EACH factor; no global auto-0.7.
 */
export const PROPOSAL_FACTORS = Object.freeze({
  food:.70, utilities:.80, housing:1.00, transport:.75,
  insurance:1.00, medical:1.00, care:1.20, travel:.60,
  misc:.80, taxSocial:1.00, unallocated:1.00
});

/**
 * monthlyRows: read-only results from runRetirementPlan(config,{includeMonthlyDetails:true})
 * each row needs expenseComponents: {key: amount in PRESENT month's nominal yen/10,000}
 * whose total MUST equal this row's expense (management budget).
 * Single-death comparison only. Compare both individual scenarios separately;
 * after both deaths, family cashflow/inheritance require a different specification.
 * survivorPublicPensionAnnual = survivor's FULL public pension from the month AFTER
 * death, including own basic/employee + survivor employees' top-up. Never a delta.
 * Non-pension other/extra income from unknown owner requires explicit retain approval.
 */
export function simulateMortalityPreview({
  monthlyRows, deceased, deathMonth, survivorPublicPensionAnnual,
  pensionEvidence, costFactors, funeralExpenseMan, annualAfterTaxReturnPct,
  survivorPublicPensionStages=null,
  continueUnattributedIncome=false, keepOneOffExpenses=true
}){
  if(!VALID_PERSON.has(deceased))invalid('deceased-person','本人または配偶者を選択してください');
  const deathIdx=monthlyIndex(deathMonth);
  const pension=finite(survivorPublicPensionAnnual,'post-death-total-public-pension');
  let stages=null;
  if(survivorPublicPensionStages!==null){
    if(!Array.isArray(survivorPublicPensionStages)||survivorPublicPensionStages.length<1)invalid('pension-stages','死亡後の年金段階が未設定です');
    stages=survivorPublicPensionStages.map(x=>({index:monthlyIndex(x.fromMonth),annual:finite(x.annual,'stage-annual')}));
    if(stages.some(x=>x.annual<0)||stages[0].index!==monthlyIndex(deathMonth)+1||stages.some((x,i)=>i>0&&x.index<=stages[i-1].index))invalid('pension-stages','年金段階は死亡翌月から昇順で、各年額が0以上である必要があります');
  }
  const annualRate=finite(annualAfterTaxReturnPct,'annual-after-tax-return-percent');
  if(annualRate<=-100)invalid('invalid-return-rate','年率は-100%を超えて指定してください');
  const monthlyRate=Math.pow(1+annualRate/100,1/12)-1;
  const funeral=finite(funeralExpenseMan,'death-one-off-expense');
  if(pension<0||funeral<0)invalid('negative-input','年金/一時支出に負値を指定できません');
  if(!['confirmed','assumption'].includes(pensionEvidence))invalid('pension-status','遺族年金の金額は確認済み・仮置きのどちらかを明示してください');
  if(!costFactors||typeof costFactors!=='object')invalid('missing-factor','費目別倍率を明示してください');
  if(!Array.isArray(monthlyRows)||!monthlyRows.length)invalid('no-monthly-ledger','比較対象の月次計算出力がありません');
  const copy=structuredClone(monthlyRows);
  const indices=copy.map(m=>monthlyIndex(m.month));
  if(deathIdx<indices[0]||deathIdx>indices.at(-1))invalid('death-outside-plan','計画範囲外の死亡月は、この対象版では比較できません');
  for(let i=1;i<indices.length;i++)if(indices[i]!==indices[i-1]+1)invalid('nonconsecutive-month','既存計算の月次列に欠落または重複があります');
  let asset=finite(copy[0].startAsset,'opening-asset');
  const output=[];let changeMonth=null,deathPaid=0;
  const personLabel=deceased==='primary'?'本人':'配偶者';
  for(let i=0;i<copy.length;i++){
    const r=copy[i],index=indices[i],post=index>deathIdx;
    for(const key of ['startAsset','investmentGain','endAsset','totalIncome','expense','extraExpense','primaryPension','spousePension','primaryLabor','spouseLabor','idecoAnnuity','idecoLumpReceipt','extraIncome','labor','combinedLabor','unemployment'])finite(r[key],`base-month-${key}`);
    if(!r.expenseComponents||typeof r.expenseComponents!=='object')invalid('unreconciled-breakdown',`費目別内訳が未確認: ${r.month}`);
    let expTotal=0,factoredExpense=0;
    for(const [key,amount] of Object.entries(r.expenseComponents)){
      finite(amount,`expense-${key}`);if(amount<0)invalid('negative-expense',`${key}: 内訳は非負額で指定してください`);
      expTotal+=amount;
      if(!Object.hasOwn(costFactors,key))invalid('missing-expense-factor',`${key}の生存者1人暮らし倍率が未指定です`);
      const fac=finite(costFactors[key],`factor-${key}`);
      if(fac<0||fac>3)invalid('factor-out-of-range',`${key} の倍率は0～3倍の範囲で入力してください`);
      factoredExpense+=amount*(post?fac:1);
    }
    if(r.expense<0)invalid('negative-budget',`${r.month}: 管理予算の負値は対応していません`);
    const knownIncome=r.labor+r.primaryPension+r.spousePension+r.idecoAnnuity+r.unemployment+r.extraIncome;
    if(Number.isFinite(r.labor)&&Number.isFinite(r.unemployment)&&Math.abs(knownIncome-r.totalIncome)>TOLERANCE)invalid('income-breakdown-mismatch',`${r.month}: 基準案の収入内訳と合計が一致しません`);
    if(Math.abs(expTotal-r.expense)>TOLERANCE)invalid('budget-not-reconciled',`${r.month}: 月次内訳${expTotal}万円と管理予算${r.expense}万円が一致しません`);
    // The management budget remains the source amount. Subtract the signed
    // reduction once; a negative reduction increases cost. No change in death month.
    const expenseReduction=post?r.expense-factoredExpense:0;
    const newExpense=r.expense-expenseReduction;
    // If original ledger is not self-consistent, do not guess or reconstruct.
    if(i>0&&Math.abs(r.startAsset-copy[i-1].endAsset)>TOLERANCE)invalid('base-continuity',`${r.month}: 基準案の残高が連続していません`);
    const expectedBase=r.startAsset+r.investmentGain+r.totalIncome-r.expense-r.extraExpense;
    if(Math.abs(expectedBase-r.endAsset)>TOLERANCE)invalid('base-ledger-identity',`${r.month}: 基準案の運用と収支が一致しません`);
    if(Math.abs(r.investmentGain-r.startAsset*monthlyRate)>TOLERANCE)invalid('base-return-rate',`${r.month}: 基準案の運用率が指定年率と一致しません`);
    const gain=asset*monthlyRate;
    let newIncome=r.totalIncome,previewPension=r.primaryPension+r.spousePension;
    if(post){
      if(!['salary','legacy-before-retirement','asset-funded','legacy-after-retirement'].includes(r.phase))invalid('unknown-phase',`家計の入出金方式を確認できません: ${r.month}`);
      if(Math.abs(r.primaryLabor+r.spouseLabor+r.combinedLabor-r.labor)>TOLERANCE)invalid('labor-components-mismatch',`労働収入の本人別内訳が一致しません: ${r.month}`);
      if(r.phase==='salary'||r.phase==='legacy-before-retirement')invalid('household-phase-unmodeled',`給与生活中の死亡後は家計の純入出金方式が変わる可能性があります。計画資産へ年金を直接加算する比較は停止します: ${r.month}`);
      if(Math.abs(r.unemployment)>TOLERANCE)invalid('unemployment-owner-unclear',`死亡後の失業給付が誰に帰属するか未確認です: ${r.month}`);
      const ceasedPension=deceased==='primary'?r.primaryPension:r.spousePension;
      const survivorOriginal=deceased==='primary'?r.spousePension:r.primaryPension;
      const ceasedLabor=deceased==='primary'?r.primaryLabor:r.spouseLabor;
      if(Math.abs(r.combinedLabor)>TOLERANCE)invalid('labor-owner-unclear',`夫婦合算労働収入は死亡後の帰属未確認: ${r.month}`);
      let ceasedIdec=0;
      if(deceased==='primary')ceasedIdec=r.idecoAnnuity+r.idecoLumpReceipt;
      const knownOther=r.extraIncome-r.idecoLumpReceipt;
      if(Math.abs(knownOther)>TOLERANCE&&!continueUnattributedIncome)invalid('other-income-owner-unclear',`臨時収入等の帰属未確認: ${r.month}`);
      const ratePension=stages?stages.findLast(x=>index>=x.index)?.annual:pension;
      if(ratePension===undefined)invalid('pension-stage-missing',`年金の段階別年額が未指定です: ${r.month}`);
      newIncome=r.totalIncome-ceasedPension-survivorOriginal-ceasedLabor-ceasedIdec+ratePension/12;
      previewPension=ratePension/12;
      if(changeMonth===null)changeMonth=r.month;
    }
    let oneOff=0;
    if(index===deathIdx){oneOff=funeral;deathPaid++;}
    if(!keepOneOffExpenses&&post&&Math.abs(r.extraExpense)>TOLERANCE)invalid('one-off-expense','既存臨時支出の削除先が未確認です');
    const end=asset+gain+newIncome-newExpense-r.extraExpense-oneOff;
    if(!Number.isFinite(end))invalid('nonfinite-result','比較計算が有限範囲を超えました');
    output.push({month:r.month,age:r.age,startAsset:asset,investmentGain:gain,income:newIncome,publicPension:previewPension,baselinePension:r.primaryPension+r.spousePension,baselineIncome:r.totalIncome,baselineExpense:r.expense,expenseReduction,expense:newExpense,extraExpense:r.extraExpense,funeralExpense:oneOff,endAsset:end,deltaFromBaseline:end-r.endAsset,postDeath:post});
    asset=end;
  }
  return {kind:'read-only-synthetic-or-unadopted-comparison',deceased:personLabel,deathMonth,
    firstChangedMonth:changeMonth,deathOneOffCount:deathPaid,
    pensionStatus:pensionEvidence,baselineFinalAsset:copy.at(-1).endAsset,
    finalAsset:asset,deltaFromBaseline:asset-copy.at(-1).endAsset,
    firstNegativeMonth:output.find(x=>x.endAsset<0)?.month??null,
    monthly:output,
    warnings:['月次の入金見込であり年金実際の隔月振込日ではない','税・社会保険、遺族年金の資格、遺産相続・相続税・各資産の口座移転は未計算','負の資産残高は借入額の確定値ではない','死亡した月の年金計上は維持し翌月から切替','費目別倍率は利用者が確認する仮定であり公的統計の推定値ではない']};
}
