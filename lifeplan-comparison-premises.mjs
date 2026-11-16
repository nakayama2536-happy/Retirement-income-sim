// Read-only disclosure of key comparison premises. This is not a complete equivalence audit.
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o??{},k);
const show=(v)=>v===null||v===undefined||v===''?'未確認':typeof v==='string'||typeof v==='number'||typeof v==='boolean'?String(v):'形式未確認';
const month=(v)=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$/.test(v)?v.slice(0,7):'未確認';
const value=(config,kind)=>{
 const p=config?.plan??{};
 switch(kind){
 case 'start':return month(p.startDate);
 case 'startAsset':return typeof p.initialAsset==='number'&&Number.isFinite(p.initialAsset)?`${p.initialAsset}万円`:'未確認';
 case 'opening':return month(p.openingBalance?.asOfMonth);
 case 'price':return month(p.priceBaseMonth);
 case 'interest':return has(p,'afterTaxReturn')?show(p.afterTaxReturn):'未確認';
 case 'inflation':return has(p,'inflation')?show(p.inflation):'未確認';
 case 'scope':return has(p,'idecoAssetScope')?show(p.idecoAssetScope):has(p,'initialAssetIncludesIdeco')?`旧包含フラグ=${show(p.initialAssetIncludesIdeco)}`:'未確認';
 default:return '未確認';
 }
};
export function comparisonPremises(baseConfig,candidateConfig,baseResult,candidateResult){
 const fields=[['start','計算開始月'],['opening','開始残高の評価月'],['startAsset','開始資産'],['price','物価基準月'],['interest','運用利回り（設定値）'],['inflation','インフレ率（設定値）'],['scope','iDeCo開始資産範囲']];
 const rows=fields.map(([kind,label])=>({label,base:value(baseConfig,kind),candidate:value(candidateConfig,kind)}));
 for(const [label,br,cr] of [['最終評価月',baseResult?.monthlyDetails?.at(-1)?.month,candidateResult?.monthlyDetails?.at(-1)?.month],['評価月数',baseResult?.monthlyDetails?.length,candidateResult?.monthlyDetails?.length]]){
  rows.push({label,base:show(br),candidate:show(cr)});
 }
 const different=rows.some(r=>r.base!=='未確認'&&r.candidate!=='未確認'&&r.base!==r.candidate);
 const unknown=rows.some(r=>r.base==='未確認'||r.candidate==='未確認'||r.base==='形式未確認'||r.candidate==='形式未確認');
 return {rows,different,unknown,notice:'表示しているのは主要な比較前提のみです。予算・就労収入・年金・イベント等の全項目一致を保証しません。',warning:different?'主要前提が異なります。最終資産の差額を単一条件の効果と解釈しないでください。':unknown?'未確認の前提があります。差額を単一条件の効果と断定できません。':'主要前提の表示項目は一致していますが、全条件一致を意味しません。'};
}
