/** 遺族厚生年金の独立した参考計算。純粋関数、非保存、万円/年、税引前。 */
export const JPS_RULE_URL='https://www.nenkin.go.jp/service/jukyu/seido/izokunenkin/jukyu-yoken/20150424.html';
export const MHLW_DEFERRAL_URL='https://www.mhlw.go.jp/stf/nenkin_shikumi_011.html';
const fail=m=>{throw Error(m);};
const num=(n,k)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0)fail(k+'：0以上の数値が必要です。未入力を0と扱いません');return n;};
const date=(s,k)=>{if(!/^\d{4}-\d\d-\d\d$/.test(s||''))fail(k+'を年月日で入力してください');let [y,m,d]=s.split('-').map(Number),x=new Date(Date.UTC(y,m-1,d));if(x.getUTCFullYear()!==y||x.getUTCMonth()!==m-1||x.getUTCDate()!==d)fail(k+'の日付が不正です');return x;};
const month=d=>d.getUTCFullYear()*12+d.getUTCMonth();
const label=i=>String(Math.floor(i/12)).padStart(4,'0')+'-'+String(i%12+1).padStart(2,'0');
const nextMonth=d=>month(d)+1;
export function pensionStartIndex(birth,age){if(!Number.isInteger(age)||age<65||age>100)fail('年齢が不正です');const b=date(birth,'妻の生年月日');const day=new Date(Date.UTC(b.getUTCFullYear()+age,b.getUTCMonth(),b.getUTCDate())-86400000);return nextMonth(day);}
export function survivorFormula({deceasedProportional,ownBasic65,ownEmployee65}){
 const d=num(deceasedProportional,'本人の報酬比例部分'),basic=num(ownBasic65,'妻の老齢基礎年金'),employee=num(ownEmployee65,'妻の老齢厚生年金');
 const a=d*.75,b=d*.5+employee*.5,gross=Math.max(a,b),topUp=Math.max(0,gross-employee);
 return {a,b,gross,topUp,ownBasic65:basic,ownEmployee65:employee,total65:basic+employee+topUp};
}
export const defer=(annual,age)=>num(annual,'65歳基準年額')*(1+(age-65)*12*.007);
export function calculateSurvivor(input,{basicAge=65,employeeAge=65,claimMode='immediate',endAge=100}={}){
 const f=survivorFormula(input||{});
 if(input?.eligibilityConfirmed!==true)fail('遺族厚生年金の受給権・生計維持等の確認が必要です');
 for(const a of [basicAge,employeeAge])if(![65,70,75].includes(a))fail('年金開始は65・70・75歳から選択してください');
 if(!['immediate','wait'].includes(claimMode))fail('遺族厚生年金の請求方法が不正です');
 const birth=date(input.wifeBirthDate,'妻の生年月日'),death=date(input.deathDate,'本人の死亡想定日');
 const age=death.getUTCFullYear()-birth.getUTCFullYear()-(month(death)<month(birth)||month(death)===month(birth)&&death.getUTCDate()<birth.getUTCDate()?1:0);
 if(age<65)fail('妻65歳未満の死亡ケースは、この計算対象外です');
 const from=nextMonth(death),end=pensionStartIndex(input.wifeBirthDate,endAge),bFrom=pensionStartIndex(input.wifeBirthDate,basicAge),eFrom=pensionStartIndex(input.wifeBirthDate,employeeAge);
 if(end<=from)fail('死亡翌月から評価終了時点までの期間がありません');
 if(eFrom>from&&claimMode==='immediate')fail('老齢厚生年金の繰下げ待機中に遺族年金を先に請求する場合は自動計算しません。老齢厚生開始まで遺族年金を請求しない案を選択してください');
 if(eFrom<=from&&claimMode==='wait')fail('妻の老齢厚生年金が死亡時点ですでに開始しています');
 const ownBasic=defer(f.ownBasic65,basicAge),ownEmployee=defer(f.ownEmployee65,employeeAge);
 const survivorGross=Math.max(f.a,input.deceasedProportional*.5+ownEmployee*.5),topUp=Math.max(0,survivorGross-ownEmployee);
 const monthlyRows=[];let total=0;
 for(let m=from;m<end;m++){
  const basic=m>=bFrom?ownBasic/12:0,employee=m>=eFrom?ownEmployee/12:0;
  const survivor=(claimMode==='immediate'||m>=eFrom)?(m>=eFrom?topUp:f.a)/12:0;
  const amount=basic+employee+survivor;total+=amount;
  monthlyRows.push({month:label(m),basic,employee,survivor,total:amount,cumulative:total});
 }
 const byYear=new Map();for(const m of monthlyRows){const y=m.month.slice(0,4),a=byYear.get(y)||{year:y,basic:0,employee:0,survivor:0,total:0};for(const k of ['basic','employee','survivor','total'])a[k]+=m[k];byYear.set(y,a);}
 return {status:'reference',claimMode,basicAge,employeeAge,deathMonth:label(from-1),firstMonth:label(from),lastMonth:label(end-1),annualAfterBoth:ownBasic+ownEmployee+topUp,cumulative:total,annualRows:[...byYear.values()],monthlyRows,formula:f,ownBasic,ownEmployee,survivorTopUp:topUp,limitations:['妻65歳以上かつ受給資格を資料で確認する前提','2028年改正後の繰下げ・遺族年金の請求制約を単純化','年金の権利発生月ベースの参考計算であり実際の振込月と異なる','加算・共済・税社会保険・年金改定・賃金・追加加入を未計算']};
}
export function compareSurvivor(input){return [65,70,75].map(age=>{try{const death=date(input.deathDate,'死亡想定日'),mode=pensionStartIndex(input.wifeBirthDate,age)>nextMonth(death)?'wait':'immediate';return {age,...calculateSurvivor(input,{basicAge:age,employeeAge:age,claimMode:mode})};}catch(e){return {age,status:'unresolved',error:e.message};}});}
