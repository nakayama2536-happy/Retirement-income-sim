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

// Input assistance only. Birthday-based age is distinct from legal attainment.
export function dateAgeHint(value,config,person='primary'){
  const name=person==='spouse'?'配偶者':'本人';
  if(value==null||String(value).trim()==='')return `${name}の年齢：日付を入力すると表示します。`;
  const year=/^[1-9]\d{3}$/.test(String(value));
  const d=dateParts(year?`${value}-01`:value),b=dateParts(config?.people?.[person]?.birthDate);
  if(!d)return `${name}の年齢：有効な年月日を入力してください。`;
  if(!b?.day)return `${name}の年齢：生年月日未設定・不正のため確認できません。`;
  const first=d.day?String(value):`${d.y}-${String(d.month).padStart(2,'0')}-01`;
  const last=year?`${value}-12-31`:d.day?first:`${value}-${String(d.days).padStart(2,'0')}`;
  const label=v=>{
    const p=dateParts(v),age=ageOn(v,config.people[person].birthDate);
    if(age===null)return null;
    const months=(p.y-b.y)*12+p.month-b.month-(p.day<b.day?1:0);
    return `${age}歳${months-age*12}か月`;
  };
  const a=label(first),z=label(last);
  if(a===null||z===null)return `${name}の年齢：生年月日より前を含むため確認できません。`;
  return `${name}${a===z?a:`${a} → ${z}`}（${year?'年内の年齢・':d.day?'':'月内の年齢・'}誕生日基準）`;
}

export function previousMonth(value){
  const d=dateParts(value);if(!d)return null;
  const n=d.y*12+d.month-2;
  return `${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;
}

export function updateDateInputHints(form,config,person='primary'){
  for(const input of form.querySelectorAll('input[type=date],input[type=month],input[name=usageYear]')){
    const label=input.closest('label');
    let hint=label.querySelector('.date-age-hint');
    if(!hint){hint=document.createElement('small');hint.className='date-age-hint muted';hint.id=`${form.id}-${input.name}-age`;hint.setAttribute('aria-live','polite');label.append(hint);input.setAttribute('aria-describedby',hint.id);}
    hint.hidden=input.disabled;
    hint.textContent=dateAgeHint(input.value,config,person);
    if(input.name==='endDate'&&previousMonth(input.value))hint.textContent+=`。収入の最終月：${dateWithAge(previousMonth(input.value),config,person)}。`;
  }
}
