// In-page task tabs; existing DOM nodes are moved, never duplicated or saved.
const controllers=new Map();
function setup(root,labels,groups){
 if(!root || groups.some(g=>!g.length))return;
 const nav=document.createElement('div');nav.className='workflow-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','この画面の操作');
 const panes=labels.map((_,i)=>{const p=document.createElement('div');p.className='workflow-pane';p.id=root.id+'-workflow-pane-'+i;p.setAttribute('role','tabpanel');return p;});
 const tabs=labels.map((label,i)=>{const b=document.createElement('button');b.type='button';b.className='workflow-tab';b.textContent=label;b.id=root.id+'-workflow-tab-'+i;b.setAttribute('role','tab');b.setAttribute('aria-controls',panes[i].id);panes[i].setAttribute('aria-labelledby',b.id);nav.append(b);return b;});
 const activate=(i,focus=false)=>{tabs.forEach((b,n)=>{b.setAttribute('aria-selected',String(i===n));b.tabIndex=i===n?0:-1;panes[n].hidden=n!==i;});
  // The existing iDeCo tax calculator is inside an older details container.
  // Reveal that container when the separate reference-calculation tab is chosen.
  const visibleTarget=root.id==='ideco'&&i===2?'#idecoBalance':root.id==='unemployment'&&i===1?'#unemploymentToolRun':null;
  if(visibleTarget){const node=panes[i].querySelector(visibleTarget);for(let p=node?.parentElement;p&&p!==panes[i];p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;}
  if(focus)tabs[i].focus();};
 tabs.forEach((b,i)=>{b.addEventListener('click',()=>activate(i));b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;activate(n,true);});});
 root.prepend(nav,...panes);
 groups.forEach((g,i)=>g.forEach(node=>panes[i].append(node)));
 activate(0);controllers.set(root.id,{panes,activate});
}
function directChild(root,node){while(node&&node.parentElement!==root)node=node.parentElement;return node?.parentElement===root?node:null;}
function splitAt(id,labels,selectors){
 const root=document.getElementById(id);if(!root)return;
 const children=[...root.children].filter(e=>!e.classList.contains('family-lite-back'));
 const positions=selectors.map(s=>children.indexOf(directChild(root,root.querySelector(s))));
 if(positions.some((n,i)=>n<0||(i&&n<=positions[i-1])))return;
 const groups=labels.map(()=>[]);
 children.forEach((node,i)=>{groups[positions.filter(p=>i>=p).length].push(node);});
 setup(root,labels,groups);
}
function selectOther(id,labels,selectors){
 const root=document.getElementById(id);if(!root)return;
 const second=new Set(selectors.map(s=>directChild(root,root.querySelector(s))).filter(Boolean));
 if(!second.size)return;
 const groups=[[],[]];for(const node of [...root.children])groups[second.has(node)?1:0].push(node);
 setup(root,labels,groups);
}
export function installWorkflowTabs(){
 splitAt('budget',['年間の生活予算','旅行に使える予算','詳しい設定'],['#budgetTravelCard',':scope > details.card']);
 splitAt('ideco',['現在の条件','受取・積立を変更','税額の参考試算'],['#detail-idecoWithdrawal','article:has(#idecoBalance)']);
 splitAt('retirement',['現在の退職金','条件を変更','税額の参考試算'],['#detail-retirement','article:has(#retirementToolRun)']);
 selectOther('unemployment',['受給予定・入力','制度説明・参考計算'],[':scope > article:nth-of-type(2)','article:has(#unemploymentToolRun)']);
 splitAt('salary',['現在の計画','給与・アルバイトの変更'],['details.salary-optional-labor']);
 selectOther('cashflow',['年齢別の収支表','65歳の収入内訳'],['#age65IncomeAuditCard']);
 const csv=document.querySelector('#allcsv > article');
 if(csv){csv.id='allcsv-workspace';selectOther('allcsv-workspace',['表を確認する','CSV保存・項目選択'],['fieldset.column-selection','#detailCsvIncludeDetails','#detailCsvIncludeStatus','#downloadDetailedCsv','#detailCsvStatus','#detailCsvLimit']);}
}
export function revealWorkflowTarget(target){
 if(!target)return false;
 for(const {panes,activate} of controllers.values())for(let i=0;i<panes.length;i++)if(panes[i].contains(target)){activate(i);return true;}
 return false;
}

export function installMortalityTabs(form){
 if(!form||typeof form.querySelectorAll!=='function'||controllers.has(form.id))return;
 const fieldsets=[...form.querySelectorAll(':scope > fieldset')];
 const review=form.querySelector(':scope > label.check-label');
 const buttons=[...form.querySelectorAll(':scope > button')];
 if(fieldsets.length!==2||!review||buttons.length<1)return;
 setup(form,['1．死亡時期・年金','2．残された人の生活費','3．確認して試算'],[[fieldsets[0]],[fieldsets[1]],[review,...buttons]]);
 const controller=controllers.get(form.id);
 // Read-only, in-page guidance: never changes a setting or skips native validation.
 const guide=document.createElement('div');guide.className='family-step-guide';guide.setAttribute('role','group');guide.setAttribute('aria-label','もしものときの家計：操作案内');
 const status=document.createElement('p');status.className='family-step-status';status.id='mortalityStepStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const note=document.createElement('p');note.className='family-step-hint';note.id='mortalityStepHint';
 const actions=document.createElement('div');actions.className='family-step-actions';
 const back=document.createElement('button');back.type='button';back.className='secondary';back.id='mortalityStepPrevious';back.textContent='前の手順へ';
 const next=document.createElement('button');next.type='button';next.className='primary';next.id='mortalityStepNext';
 actions.append(back,next);guide.append(status,note,actions);navAfter(form,guide);
 const descriptions=[
  '亡くなる方と年月、費用を確認します。年金の仮年額を確認できない場合は、確定額として入力しないでください。',
  '生活費が亡くなった後に何％になるか確認します。1.0倍は変化なし、0.8倍は20％減です。',
  '比較条件を確認して「比較を計算（保存しない）」を押します。この操作では今の計画は変更されません。'
 ];
 let step=0;
 const show=index=>{step=index;status.textContent='手順 '+(index+1)+'／3：'+['亡くなる時期・年金','残された人の生活費','確認して試算'][index];note.textContent=descriptions[index];back.disabled=index===0;next.hidden=index===2;next.textContent=index===0?'次へ：生活費を確認':'次へ：試算前の確認';};
 const move=index=>{if(index<0||index>2)return;controller.activate(index,true);show(index);guide.scrollIntoView?.({block:'nearest',behavior:'auto'});};
 back.addEventListener('click',()=>move(step-1));next.addEventListener('click',()=>move(step+1));
 const tabs=form.querySelectorAll(':scope > .workflow-tabs > .workflow-tab');
 tabs.forEach((tab,index)=>tab.addEventListener('click',()=>show(index)));
 form.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const index=[...tabs].indexOf(event.target);if(index>=0)queueMicrotask(()=>{const active=[...tabs].findIndex(t=>t.getAttribute('aria-selected')==='true');if(active>=0)show(active);});});
 show(0);
 // Native validation must show the tab containing an invalid control.
 form.addEventListener('invalid',event=>{
  const index=controller.panes.findIndex(p=>p.contains(event.target));
  if(index>=0){controller.activate(index);show(index);}
 },true);
}

function navAfter(form,guide){const nav=form.querySelector(':scope > .workflow-tabs');if(nav)nav.after(guide);}
