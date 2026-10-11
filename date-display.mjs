// Display only: never changes plan dates, age periods or persisted values.
export function dateParts(value){
  const m=/^([1-9]\d{3})-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.exec(String(value??''));
  if(!m)return null;
  const y=Number(m[1]),month=Number(m[2]),day=m[3]?Number(m[3]):null;
  const days=new Date(Date.UTC(y,month,0)).getUTCDate();
  return day&&day>days?null:{y,month,day,days};
}
export function ageOn(value,birthDate){
  const d=dateParts(value),b=dateParts(birthDate);
  if(!d?.day||!b?.day)return null;
  const age=d.y-b.y-(d.month<b.month||(d.month===b.month&&d.day<b.day)?1:0);
  return age<0?null:age;
}
export function dateWithAge(value,config,person='primary'){
  if(!value)return '未設定';
  const d=dateParts(value);if(!d)return String(value);
  const name=person==='spouse'?'配偶者':'本人',birth=config?.people?.[person]?.birthDate;
  const first=ageOn(d.day?value:`${value}-01`,birth);
  const last=d.day?first:ageOn(`${value}-${String(d.days).padStart(2,'0')}`,birth);
  const age=first===null||last===null?'年齢未確認':first===last?`${first}歳`:`${first}→${last}歳`;
  return `${d.y}年${d.month}月${d.day?`${d.day}日`:''}（${name}${age}）`;
}
