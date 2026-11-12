/** Display-only answer component. Never claims a save succeeded on click alone. */
export const ANSWER_META=Object.freeze({success:['✓','完了しました'],info:['i','試算・確認結果（未保存）'],warning:['!','確認が必要です'],error:['×','処理できませんでした'],pending:['…','処理中です']});
export function normalizeAnswer(x){
 if(!x||!Object.hasOwn(ANSWER_META,x.kind)||typeof x.body!=='string'||!x.body.trim())throw TypeError('回答状態と本文が必要です');
 if(x.kind==='success'&&x.confirmed!==true)throw TypeError('成功には実処理の確認が必要です');
 return {kind:x.kind,headline:x.headline||ANSWER_META[x.kind][1],body:x.body,next:x.next||''};
}
export function mountActionAnswer(button){
 if(!button?.parentNode)throw TypeError('回答表示対象のボタンがありません');
 const doc=button.ownerDocument,node=doc.createElement('div');node.className='action-answer';node.hidden=true;node.setAttribute('data-action-answer','');
 button.insertAdjacentElement('afterend',node);
 let last=null;
 function show(x){
  const a=normalizeAnswer(x);last=a;node.replaceChildren();
  node.dataset.kind=a.kind;node.setAttribute('role',a.kind==='error'?'alert':'status');node.setAttribute('aria-live',a.kind==='error'?'assertive':'polite');
  const title=doc.createElement('strong');title.className='action-answer__title';title.textContent=ANSWER_META[a.kind][0]+' '+a.headline;
  const body=doc.createElement('p');body.textContent=a.body;node.append(title,body);
  if(a.next){const hint=doc.createElement('p');hint.className='action-answer__next';hint.textContent='次へ：'+a.next;node.append(hint);}
  node.hidden=false;return a;
 }
 return {node,show,clear(){last=null;node.hidden=true;node.replaceChildren();},invalidate(){if(last&&!['error','pending'].includes(last.kind))show({kind:'warning',body:'操作後に入力または保存状態が変わりました。結果を再確認してください。'});}};
}
