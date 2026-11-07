/** UI-only numbering. Never reads or persists personal settings. */
export const MAIN_SECTIONS=[['results','1'],['income','2'],['budget','3'],['expense','4'],['manage','5']];
export const CHILD_SECTIONS={results:['home','cashflow','mortality','scenarios','allcsv','review'],income:['salary','nisa','ideco','retirement','pension','unemployment'],budget:['budget'],expense:['expenses','events'],manage:['rules','settings','backup','actuals']};
export function navigationNumber(group,tab){
 const main=MAIN_SECTIONS.find(([key])=>key===group)?.[1];
 if(!main)return null;if(tab==null)return main;
 const n=CHILD_SECTIONS[group]?.indexOf(tab)??-1;
 return n<0?null:main+'-'+(n+1);
}
function numberNodes(nodes,prefix){[...nodes].forEach((node,i)=>{node.dataset.stepNo=prefix+'-'+(i+1);node.classList.add('step-numbered');});}
export function applyUiNumbering(root=document){
 for(const [group] of MAIN_SECTIONS){
  const main=root.querySelector('[data-group="'+group+'"]');
  if(main){main.dataset.stepNo=navigationNumber(group);main.classList.add('step-numbered');}
  for(const tab of CHILD_SECTIONS[group]){
   const node=root.querySelector('[data-group-item="'+group+'"][data-tab="'+tab+'"]');
   if(node){node.dataset.stepNo=navigationNumber(group,tab);node.classList.add('step-numbered');}
  }
 }
 const mortality=root.querySelector('#mortalityForm fieldset');
 if(mortality){
  numberNodes(mortality.querySelectorAll(':scope > .form-grid > label'),'1');
  numberNodes(mortality.querySelectorAll('#mortalityPensionSettings > .form-grid > label'),'1-4');
 }
 const expense=root.querySelector('#expenses');
 if(expense)numberNodes(expense.querySelectorAll(':scope > article.card > h2, :scope > article.card > .section-title > h2'),'4-1');
}
export function mountUiNumbering(root=document){
 applyUiNumbering(root);const main=root.querySelector('main');
 if(!main||typeof MutationObserver==='undefined')return ()=>{};
 const observer=new MutationObserver(()=>applyUiNumbering(root));
 observer.observe(main,{childList:true,subtree:true});return ()=>observer.disconnect();
}
if(typeof document!=='undefined'){
 const init=()=>mountUiNumbering(document);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
}
