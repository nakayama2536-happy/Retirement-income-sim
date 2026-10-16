// Encrypted browser-side snapshots, no secrets in GitHub, localStorage or cloud config.
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
export const ENCRYPTED_PAYLOAD_LIMIT=725000; // Below Firestore's 1-MiB document ceiling.
export const PBKDF2_ITERATIONS=600000;
const cryptoApi=()=>{const c=globalThis.crypto;if(!c?.subtle||!c?.getRandomValues)throw Error('この端末ではWeb Cryptoを使えません。');return c;};
function encode64(data){
 let str='';for(let i=0;i<data.length;i+=8192)str+=String.fromCharCode(...data.subarray(i,i+8192));
 return btoa(str);
}
function decode64(value){
 if(typeof value!=='string'||!value||value.length>ENCRYPTED_PAYLOAD_LIMIT*2||!/^[A-Za-z0-9+/]+={0,2}$/.test(value)||value.length%4!==0)throw Error('暗号化データの形式が不正です。');
 const bin=atob(value),result=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)result[i]=bin.charCodeAt(i);return result;
}
function hex(b){return [...b].map(c=>c.toString(16).padStart(2,'0')).join('');}
export async function sha256Bytes(data){const c=cryptoApi();return hex(new Uint8Array(await c.subtle.digest('SHA-256',data)));}
export async function snapshotDigest(value){
 const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
 return sha256Bytes(enc.encode(JSON.stringify(sorted(value))));
}
async function derive(passphrase,salt,iterations){
 if(typeof passphrase!=='string'||passphrase.length<16)throw Error('暗号化用の合言葉は16文字以上が必要です。');
 const c=cryptoApi(),key=await c.subtle.importKey('raw',enc.encode(passphrase),'PBKDF2',false,['deriveKey']);
 return c.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},key,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
function validateFormat(p){
 if(!p||p.version!==1||p.algorithm!=='AES-256-GCM/PBKDF2-SHA256'||p.iterations!==PBKDF2_ITERATIONS)throw Error('未対応の暗号化形式です。');
 const salt=decode64(p.salt),iv=decode64(p.iv),ct=decode64(p.data);
 if(salt.length!==16||iv.length!==12||ct.length<17||ct.length>ENCRYPTED_PAYLOAD_LIMIT)throw Error('暗号化データの長さが不正です。');
 return {salt,iv,ct};
}
export async function encryptSnapshot(state,passphrase){
 const c=cryptoApi(),salt=c.getRandomValues(new Uint8Array(16)),iv=c.getRandomValues(new Uint8Array(12));
 const plaintext=enc.encode(JSON.stringify(state));
 if(plaintext.length>500000)throw Error('同期可能容量を超えました。ローカルデータとバックアップは維持します。');
 const key=await derive(passphrase,salt,PBKDF2_ITERATIONS);
 const ct=new Uint8Array(await c.subtle.encrypt({name:'AES-GCM',iv},key,plaintext));
 const payload={version:1,algorithm:'AES-256-GCM/PBKDF2-SHA256',iterations:PBKDF2_ITERATIONS,salt:encode64(salt),iv:encode64(iv),data:encode64(ct)};
 if(enc.encode(JSON.stringify(payload)).length>ENCRYPTED_PAYLOAD_LIMIT)throw Error('暗号化後の同期データが容量制限を超えました。');
 return {payload,digest:await sha256Bytes(enc.encode(JSON.stringify(payload)))};
}
export async function decryptSnapshot(payload,passphrase,expectedDigest){
 try{
  const {salt,iv,ct}=validateFormat(payload);
  const hash=await sha256Bytes(enc.encode(JSON.stringify(payload)));
  if(typeof expectedDigest!=='string'||hash!==expectedDigest)throw Error('hash-mismatch');
  const key=await derive(passphrase,salt,PBKDF2_ITERATIONS);
  const output=await cryptoApi().subtle.decrypt({name:'AES-GCM',iv},key,ct);
  const json=dec.decode(output),state=JSON.parse(json);
  if(!state||typeof state!=='object'||Array.isArray(state))throw Error('invalid-state');
  return state;
 }catch{throw Error('暗号化データを確認できません。合言葉、形式、整合性を確認してください。元データは変更していません。');}
}
