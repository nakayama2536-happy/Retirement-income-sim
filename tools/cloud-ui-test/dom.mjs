// Minimal deterministic DOM for Node interaction tests. This is NOT a browser.
const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export class Element {
 constructor(tag,doc){this.tagName=tag.toLowerCase();this.ownerDocument=doc;this.children=[];this.listeners=new Map();this.attributes={};this._text='';this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.open=false;this.dataset={};this.parentNode=null;this.classList={add:(...names)=>{this.attributes.class=[...new Set([...(this.attributes.class||'').split(/\s+/).filter(Boolean),...names])].join(' ');}};}
 set textContent(v){this._text=String(v??'');this.children=[];}
 get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
 setAttribute(k,v){this.attributes[k]=String(v);if(k==='name'||k==='id'||k==='type')this[k]=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,s)=>s.toUpperCase())]=String(v);}
 getAttribute(k){return this.attributes[k]??null;}
 appendChild(n){if(n.parentNode)n.parentNode.children=n.parentNode.children.filter(x=>x!==n);n.parentNode=this;this.children.push(n);return n;}
 replaceChildren(...ns){for(const n of this.children)n.parentNode=null;this.children=[];this._text='';for(const n of ns)this.appendChild(n);}
 addEventListener(type,f){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(f);}
 removeEventListener(type,f){this.listeners.get(type)?.delete(f);}
 async emit(type,opts={}){const e={type,target:this,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...opts};for(const f of this.listeners.get(type)||[])await f(e);return e;}
 closest(selector){for(let n=this;n;n=n.parentNode){if(selector.startsWith('#')&&!selector.includes(' ')&&!selector.includes(',')){if(n.id===selector.slice(1))return n;}
  if(selector==='#dashboard input, #dashboard select, #dashboard textarea'&&['input','select','textarea'].includes(this.tagName)&&n.id==='dashboard')return this;}
  return null;}
 get form(){for(let n=this.parentNode;n;n=n.parentNode)if(n.tagName==='form')return n;return null;}
 get outerHTML(){const attrs={...this.attributes};for(const key of ['hidden','disabled','checked','open'])if(this[key])attrs[key]='';else delete attrs[key];if(this.tagName==='input')attrs.value=this.value;
  const at=Object.entries(attrs).map(([k,v])=>` ${k}="${escape(v)}"`).join('');
  if(['input','meta','link','br','hr'].includes(this.tagName))return `<${this.tagName}${at}>`;
  return `<${this.tagName}${at}>${this.tagName==='style'?this._text:escape(this._text)}${this.children.map(n=>n.outerHTML).join('')}</${this.tagName}>`;}
}
export const walk=n=>[n,...n.children.flatMap(walk)];
export class Document {
 constructor(){this.listeners=new Map();this.activeElement=null;this.visibilityState='visible';this.body=new Element('body',this);}
 createElement(tag){return new Element(tag,this);}
 getElementById(id){return walk(this.body).find(n=>n.id===id)||null;}
 querySelector(sel){return sel.startsWith('#')?this.getElementById(sel.slice(1)):null;}
 addEventListener(type,f){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(f);}
 removeEventListener(type,f){this.listeners.get(type)?.delete(f);}
 emit(type,event={}){for(const f of this.listeners.get(type)||[])f(event);}
}
