// Optional draft estimate, separate from the existing asset/pension engine.
// Sources checked 2026-10-11: Japan Pension Service 20140421-01 / -02.
import {dateParts} from './date-display.mjs';
const ym=n=>`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;
export function estimatePensionAtMonth({birthDate,startMonth,base65}){
  const b=dateParts(birthDate),s=dateParts(startMonth);
  if(!b?.day)return {ok:false,message:'生年月日が未確認のため、見込額を計算できません。'};
  // Exclude generations potentially subject to special old-age pension rules.
  if(birthDate<'1966-04-02')return {ok:false,message:'この生年月日は個別制度の確認が必要です。公式の見込額を年額欄へ直接入力してください。'};
  if(!s||s.day)return {ok:false,message:'受給開始月を入力してください。'};
  if(base65===''||base65==null||!Number.isFinite(Number(base65))||Number(base65)<0)
    return {ok:false,message:'65歳から受け取る場合の年額を入力してください。'};
  // Legal attainment is the day before the birthday. A first-of-month
  // birthday therefore reaches the age in the previous calendar month.
  const attained65=(b.y+65)*12+b.month-1-(b.day===1?1:0);
  const claimMonth=s.y*12+s.month-2; // first benefit month is after claim
  const months=claimMonth-attained65;
  if(months < -60 || months > 120)return {ok:false,message:'概算の対応範囲は60歳での請求から75歳での請求までです。公式見込額は年額欄へ直接入力できます。'};
  if(months>0&&months<12)return {ok:false,message:'66歳到達前は繰下げ増額の対象外です。65歳からの通常受給か、66歳以後の繰下げをご確認ください。'};
  const factor=months<0?1+months*0.004:1+months*0.007;
  const annual=Math.round(Number(base65)*factor*10000)/10000;
  if(!Number.isFinite(annual))return {ok:false,message:'金額が大きすぎます。基準年額を確認してください。'};
  return {ok:true,base65:Number(base65),annual,factor,months,claimMonth:ym(claimMonth),normalStartMonth:ym(attained65+1)};
}
