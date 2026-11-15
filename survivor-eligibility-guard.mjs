/** Read-only screening for a 65+ survivor pension reference. Never authorizes adoption. */
const valid=(s)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export function screenSurvivorReference({survivorBirthDate=null,deathDate=null,rightDate=null,entitlementConfirmed=false,claimConfirmed=false,deferralReviewed=false,reformReviewed=false}={}){
 const reasons=[];
 if(!valid(survivorBirthDate)||!valid(deathDate))reasons.push('生年月日・死亡日の正確な日付を確認してください（死亡月から日を補完しません）');
 let attained65=null;
 if(valid(survivorBirthDate)&&valid(deathDate)){
   const b=new Date(survivorBirthDate+'T00:00:00Z');
   const year=b.getUTCFullYear()+65,m=b.getUTCMonth(),day=b.getUTCDate();
   const ann=new Date(Date.UTC(year,m,day));
   if(ann.getUTCMonth()!==m)reasons.push('閏日生まれの65歳到達日を個別確認してください');
   else {attained65=new Date(deathDate+'T00:00:00Z')>=new Date(ann.getTime()-86400000);if(!attained65)reasons.push('65歳未満：この参考式の対象外');}
 }
 if(!valid(rightDate))reasons.push('遺族年金の受給権発生日が未確認');
 if(!entitlementConfirmed)reasons.push('受給資格が未確認');
 if(!claimConfirmed)reasons.push('本人老齢年金の請求状態が未確認');
 if(!deferralReviewed)reasons.push('繰下げとの競合が未確認');
 if(!reformReviewed)reasons.push('2028年改正・経過措置の適用が未確認');
 return Object.freeze({status:reasons.length?'needs-review':'reference-only',canShowAge65Formula:attained65===true,canAdopt:false,basicDeferral:'not-determined',employeeDeferral:'not-determined',reasons:Object.freeze(reasons)});
}
