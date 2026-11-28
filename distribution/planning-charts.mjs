/** Read-only graphs. Source: already calculated adopted plan rows, never user drafts. */
const SVG='http://www.w3.org/2000/svg',C=['#cb6a38','#386c94','#60a47e','#8660a4','#a37c31'];
const val=(n,k)=>{if(typeof n!=='number'||!Number.isFinite(n))throw Error(k+'を確認できません');return n;};
const fmt=n=>new Intl.NumberFormat('ja-JP',{maximumFractionDigits:1}).format(n);
export function incomeGraphData(rows){
 if(!Array.isArray(rows)||!rows.length)throw Error('年齢期計算がありません');
 return rows.map(r=>{const sum=val(r.totalIncome,'収入合計'),labor=val(r.labor,'労働収入'),pension=val(r.primaryPension,'本人年金')+val(r.spousePension,'配偶者年金'),ideco=val(r.idecoAnnuity,'iDeCo年金'),other=val(r.unemployment,'雇用保険')+val(r.extraIncome,'その他収入');if(Math.abs(sum-labor-pension-ideco-other)>1e-5*Math.max(1,Math.abs(sum)))throw Error(r.age+'歳期の収入内訳が不一致');return {age:val(r.age,'年齢'),values:[sum,labor,pension,ideco,other]};});
}
export function budgetGraphData(rows,monthly){
 if(!Array.isArray(rows)||!rows.length||!Array.isArray(monthly))throw Error('管理予算の月次計算がありません');
 const groups=rows.map(r=>({age:val(r.age,'年齢'),actual:0,base:0,months:0}));
 for(const m of monthly){const g=groups[m.annualRowIndex];if(!g)throw Error('月次と年齢期の対応が不一致');if(m.budget==null){if(Math.abs(val(m.expense,'管理予算'))>1e-5)throw Error('予算未計上月の支出が不一致');continue;}g.actual+=val(m.expense,'管理予算');g.base+=val(m.budget.baseAnnualAmount,'基準年額')/12;g.months++;}
 return groups.map((g,i)=>{if(Math.abs(g.actual-val(rows[i].expense,'年齢期支出'))>1e-5*Math.max(1,Math.abs(g.actual)))throw Error(g.age+'歳期の管理予算が不一致');return {age:g.age,months:g.months,values:g.months?[g.actual/g.months,g.base/g.months]:[null,null]};});
}
export function expenseGraphData(rows,model){
 if(!Array.isArray(rows)||!rows.length)throw Error('支出の年齢期データがありません');
 const ages=rows.map(r=>({age:val(r.age,'年齢'),values:[val(r.expense,'管理予算'),val(r.extraExpense,'別枠支出')]}));
 if(model?.status!=='ready')return {ages,items:null,message:model?.message||'費目内訳の出典を選択してください'};
 return {ages,age:model.age,items:model.rows.map(r=>({label:String(r.label),amount:r.amount==null?null:val(r.amount,'費目支出')})),message:''};
}
const dom=(d,tag,s)=>{const x=d.createElement(tag);x.textContent=s;return x;};
function svg(d,tag,attrs={},label){const x=d.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))x.setAttribute(k,String(v));if(label!==undefined)x.textContent=label;return x;}
function graph(d,rows,names,unit){
 const W=900,H=304,L=76,R=24,T=17,B=58,values=rows.flatMap(r=>r.values.filter(v=>v!==null));
 if(!values.length)return dom(d,'p','表示可能な確定値がありません');
 const lo=Math.min(0,...values),hi=Math.max(0,...values),span=Math.max(1,hi-lo),min=lo-span*.05,max=hi+span*.12,ages=rows.map(r=>r.age),from=Math.min(...ages),to=Math.max(...ages);
 const x=a=>L+(a-from)/Math.max(1,to-from)*(W-L-R),y=v=>T+(max-v)/(max-min)*(H-T-B);
 const root=svg(d,'svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':names.join('・')+'の推移',style:'width:100%;height:auto;display:block'});
 root.append(svg(d,'title',{},'本人年齢と'+unit+'の推移'));
 for(let i=0;i<=4;i++){const v=min+(max-min)*i/4,yy=y(v);root.append(svg(d,'line',{x1:L,x2:W-R,y1:yy,y2:yy,stroke:'#e1d6cc'}),svg(d,'text',{x:L-9,y:yy+4,'font-size':13,'text-anchor':'end',fill:'#685f5b'},fmt(v)));}
 const step=Math.max(1,Math.ceil(rows.length/8));rows.forEach((r,i)=>{if(i%step===0||i===rows.length-1)root.append(svg(d,'text',{x:x(r.age),y:H-31,'font-size':13,'text-anchor':'middle',fill:'#685f5b'},String(r.age)));});
 names.forEach((name,i)=>{let list=[];const flush=()=>{if(list.length)root.append(svg(d,'polyline',{points:list.join(' '),fill:'none',stroke:C[i], 'stroke-width':i===0?3:2.2}));list=[];};
 for(const r of rows){const v=r.values[i];if(v===null){flush();continue;}list.push(x(r.age)+','+y(v));const c=svg(d,'circle',{cx:x(r.age),cy:y(v),r:3,fill:C[i]});c.append(svg(d,'title',{},r.age+'歳 '+name+' '+fmt(v)+unit));root.append(c);}flush();});
 return root;
}
function show(d,id,description,rows,names,unit){
 const area=d.getElementById(id);if(!area)return;area.replaceChildren(dom(d,'p',description),graph(d,rows,names,unit));
 const legend=dom(d,'p','');names.forEach((n,i)=>{const e=dom(d,'span','● '+n+'　');e.style.color=C[i];legend.append(e);});area.append(legend);
}
export function mountPlanningCharts({documentRef=document,getConfig,getResult,runPlan,getExpenseModel}){
 const d=documentRef,el=id=>d.getElementById(id);
 // View state is intentionally local. Never save or mutate adopted plan data.
 let incomeMode='main',incomeAge=null;
 const incomeNames=['収入合計','労働収入','公的年金','iDeCo年金','その他・雇用保険'];
 function renderIncome(){
  const area=el('planningIncomeChart');if(!area)return;
  try{
   // Replacing a graph during a whole-app refresh must not steal keyboard focus.
   // Focus is preserved for either of the two chart controls only.
   const focusedLabel=d.activeElement?.getAttribute?.('aria-label');
   const restoreFocus=['収入グラフの表示系列','収入グラフの表示年齢期'].includes(focusedLabel)?focusedLabel:null;
   const series=incomeGraphData(getResult().rows);
   if(!series.some(r=>r.age===incomeAge))incomeAge=series[0].age;
   const shown=incomeMode==='all'?incomeNames.length:3;
   const selected=series.map(r=>({age:r.age,values:r.values.slice(0,shown)}));
   show(d,'planningIncomeChart','採用済み資産計上収入。年齢期の合計。振替・参考内訳は重ねて加算しません。',selected,incomeNames.slice(0,shown),'万円／年齢期');
   const controls=dom(d,'div','');controls.setAttribute('role','group');controls.setAttribute('aria-label','収入グラフ表示設定');
   const modeLabel=dom(d,'label','表示系列：');
   const mode=d.createElement('select');mode.setAttribute('aria-label','収入グラフの表示系列');
   for(const [value,title] of [['main','主要3系列'],['all','全5系列']]){
    const opt=dom(d,'option',title);opt.value=value;mode.append(opt);
   }
   mode.value=incomeMode;
   mode.addEventListener?.('change',()=>{if(mode.value!==incomeMode){incomeMode=mode.value==='all'?'all':'main';renderIncome();el('planningIncomeChart')?.querySelector?.('select[aria-label="収入グラフの表示系列"]')?.focus?.();}});
   modeLabel.append(mode);controls.append(modeLabel);
   const ageLabel=dom(d,'label','表示年齢期：');
   const age=d.createElement('select');age.setAttribute('aria-label','収入グラフの表示年齢期');
   for(const r of series){const opt=dom(d,'option',r.age+'歳期');opt.value=String(r.age);age.append(opt);}
   age.value=String(incomeAge);
   const detail=dom(d,'p','');detail.setAttribute('role','status');detail.setAttribute('aria-live','polite');
   function updateDetail(){
    const r=series.find(x=>x.age===incomeAge);
    detail.textContent=r.age+'歳期：'+incomeNames.slice(0,shown).map((name,i)=>name+' '+fmt(r.values[i])+'万円').join('／')+'（年齢期合計）';
   }
   age.addEventListener?.('change',()=>{const n=Number(age.value);if(series.some(r=>r.age===n)){incomeAge=n;updateDetail();}});
   ageLabel.append(age);controls.append(ageLabel);area.append(controls,detail);
   updateDetail();
   if(restoreFocus)area.querySelector?.('select[aria-label="'+restoreFocus+'"]')?.focus?.();
  }catch(e){area.replaceChildren(dom(d,'p',e.message));}
 }
 function renderBudget(){if(!el('planningBudgetChart'))return;try{show(d,'planningBudgetChart','採用済み管理予算の月平均（管理予算計上月のみ）。',budgetGraphData(getResult().rows,runPlan(getConfig(),{includeMonthlyDetails:true}).monthlyDetails),['物価反映後','価格基準額'],'万円／月');}catch(e){el('planningBudgetChart').replaceChildren(dom(d,'p',e.message));}}
 function renderExpense(){const area=el('planningExpenseChart');if(!area)return;try{const cfg=getConfig(),age=Number(el('cashflowViewAge')?.value||cfg.plan?.startAge),source=el('expenseDisplaySource')?.value||'',model=expenseGraphData(getResult().rows,getExpenseModel(age,source));show(d,'planningExpenseChart','年齢期別の採用済み支出。費目内訳は管理予算に重ねて加算しません。',model.ages,['管理予算','臨時・別枠支出'],'万円／年齢期');area.append(dom(d,'p',model.message));if(model.items){area.append(dom(d,'h3',age+'歳期：登録費目の対象月合計'));const top=Math.max(1,...model.items.filter(x=>x.amount!==null).map(x=>x.amount));for(const it of model.items){const row=dom(d,'div',it.label+'：'+(it.amount===null?'未確定':fmt(it.amount)+'万円'));if(it.amount!==null){const bar=dom(d,'div','');bar.style.cssText='height:12px;background:#cb6a38;border-radius:4px;width:'+Math.max(0,100*it.amount/top)+'%';row.append(bar);}area.append(row);}area.append(dom(d,'p','未入力は0円とみなさず、親子費目の二重加算を行いません。'));}}catch(e){area.replaceChildren(dom(d,'p',e.message));}}
 return {render(){if(getConfig()&&getResult()){renderIncome();renderBudget();renderExpense();}},renderExpense};
}
