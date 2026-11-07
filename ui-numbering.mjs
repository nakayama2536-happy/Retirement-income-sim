/** Navigation reference numbers, presentation only.
 * Never mutates input values, state, calculations, storage or cloud data.
 * Numbering is computed from visible navigation structure and DOM identity.
 */
export const MAIN_SECTIONS=[['results','1'],['income','2'],['budget','3'],['expense','4'],['manage','5']];
export const CHILD_SECTIONS={
 results:['home','cashflow','mortality','scenarios','allcsv','review'],
 income:['salary','nisa','ideco','retirement','pension','unemployment'],
 budget:['budget'],expense:['expenses','events'],
 manage:['rules','settings','backup','actuals']
};
export function navigationNumber(group,tab){
 const main=MAIN_SECTIONS.find(([key])=>key===group)?.[1];
 if(!main)return null;if(tab==null)return main;
 const i=CHILD_SECTIONS[group]?.indexOf(tab)??-1;
 return i>=0?main+'-'+(i+1):null;
}
const isElement=node=>Boolean(node&&node.nodeType===1);
export function assignReferenceNumber(node,number){
 if(!isElement(node)||!number)return;
 node.dataset.stepNo=String(number);
 // Do not print a second number when the actual title already begins with one.
 const first=[...node.childNodes].find(n=>n.nodeType===3&&n.textContent.trim())?.textContent?.trim()||'';
 const already=/^\d+(?:[-－.]\d+)*[.．、]\s*/.test(first);
 node.classList.toggle('step-numbered',!already);
 node.setAttribute('data-navigation-reference',String(number));
}
/** Add stable child references to actual input labels and accordion headings. */
function numberControls(container,prefix,{includeSummaries=true}={}){
 if(!container)return;
 const selectors='label:has(input),label:has(select),label:has(textarea)'+(includeSummaries?',details > summary':'');
 const controls=[...container.querySelectorAll(selectors)].filter(n=>!n.closest('#expenseDetail'));
 controls.forEach((el,i)=>{if(!el.hasAttribute('data-navigation-reference'))assignReferenceNumber(el,prefix+'-'+(i+1));});
}
/** Subcategory identifiers follow the same rows even when their numeric amount is unknown. */
export function numberExpenseDetailTree(host,prefix='4-1-3-3'){
 if(!host)return;
 const visit=(parent,rootNumber)=>{
  const children=[...parent.children].filter(node=>node.matches?.('details'));
  children.forEach((detail,index)=>{
   const number=rootNumber+(rootNumber===prefix?index?'-'+(index+1):'': '-'+(index+1)); // overridden below
   const stable=rootNumber===prefix?rootNumber.slice(0,-1)+(Number(rootNumber.slice(-1))+index):rootNumber+'-'+(index+1);
   assignReferenceNumber(detail.querySelector(':scope > summary'),stable);
   visit(detail,stable);
  });
 };
 // Categories are 4-1-3-3, 4-1-3-4 ... ; children are 4-1-3-3-1, etc.
 visit(host,prefix);
}
function numberExpensePanel(root){
 const panel=root.querySelector('#expenses');if(!panel)return;
 const pick=s=>panel.querySelector(s);
 const map=[
  ['#expenses > article.card:first-child > h2','4-1-1'],
  ['#detail-expense h2, #detail-expense h3','4-1-2'],
  ['.expense-reconcile-grid > article:first-child .section-title > h2','4-1-3'],
  ['.expense-reconcile-grid > article:nth-child(2) > h2','4-1-4'],
  ['#expenses > details.card > summary','4-1-5'],
  ['#periodEditForm','4-1-5-1'],
  ['#expenses > details.card .section-title > h2','4-1-5-1']
 ];
 for(const [selector,number] of map)assignReferenceNumber(pick(selector),number);
 const age=pick('#cashflowViewAge')?.closest('label');
 assignReferenceNumber(age,'4-1-3-1');
 const source=pick('#expenseDisplaySource')?.closest('label');
 const details=source?.closest('details');
 const sourceSummary=details?.querySelector(':scope > summary');
 if(sourceSummary){assignReferenceNumber(sourceSummary,'4-1-3-2');assignReferenceNumber(source,'4-1-3-2-1');}
 else assignReferenceNumber(source,'4-1-3-2');
 numberExpenseDetailTree(pick('#expenseDetail'));
 numberControls(pick('#detail-expense'),'4-1-2');
 numberControls(pick('#periodEditForm'),'4-1-5-1');
 // Cover remaining addressable headings and controls in separate cards, without changing originals.
 for(const [selector,prefix] of [
  ['#expenses > article.card:first-child','4-1-1'],
  ['.expense-reconcile-grid > article:nth-child(2)','4-1-4'],
  ['#expenses > details.card','4-1-5']
 ]){
  const c=pick(selector);
  if(!c)continue;
  const unnumbered=[...c.querySelectorAll('h2,h3,details > summary,label:has(input),label:has(select),label:has(textarea)')]
    .filter(n=>!n.hasAttribute('data-navigation-reference')&&!n.closest('#expenseDetail'));
  unnumbered.forEach((n,i)=>assignReferenceNumber(n,prefix+'-'+(i+1)));
 }
}
/** The other screens use their actual on-screen headings as the numbering authority. */
function numberOtherPanel(root,panel,tabNumber){
 const blocks=[...panel.querySelectorAll('h2,h3,details.card > summary')].filter(n=>!n.closest('#expenseDetail'));
 blocks.forEach((heading,i)=>assignReferenceNumber(heading,tabNumber+'-'+(i+1)));
 // A label is addressable beneath its nearest numbered heading; all labels are
 // numbered, including dynamically rendered and previously unnumbered settings.
 const controls=[...panel.querySelectorAll('label:has(input),label:has(select),label:has(textarea),details > summary')];
 let current=tabNumber+'-0',count=0;
 const nodes=[...new Set([...blocks,...controls])].sort((a,b)=>{
  const pos=a.compareDocumentPosition(b);
  return pos&Node.DOCUMENT_POSITION_FOLLOWING?-1:pos&Node.DOCUMENT_POSITION_PRECEDING?1:0;
 });
 for(const n of nodes){
  if(blocks.includes(n)){current=n.dataset.stepNo;count=0;continue;}
  if(n.hasAttribute('data-navigation-reference'))continue;
  assignReferenceNumber(n,current+'-'+(++count));
 }
}
/** Main page headings, dynamic forms and hierarchical expense details. */
export function applyUiNumbering(root=document){
 for(const [group] of MAIN_SECTIONS){
  assignReferenceNumber(root.querySelector('[data-group="'+group+'"]'),navigationNumber(group));
  for(const tab of CHILD_SECTIONS[group]){
   const prefix=navigationNumber(group,tab);
   assignReferenceNumber(root.querySelector('[data-group-item="'+group+'"][data-tab="'+tab+'"]'),prefix);
   const panel=root.querySelector('#'+tab);
   if(!panel)continue;
   if(tab==='expenses')numberExpensePanel(root);
   else numberOtherPanel(root,panel,prefix);
  }
 }
}
export function mountUiNumbering(root=document){
 applyUiNumbering(root);const main=root.querySelector('main');
 if(!main||typeof MutationObserver==='undefined')return ()=>{};
 const observer=new MutationObserver(()=>applyUiNumbering(root));
 observer.observe(main,{childList:true,subtree:true});
 return ()=>observer.disconnect();
}
if(typeof document!=='undefined'){
 const init=()=>mountUiNumbering(document);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
}
