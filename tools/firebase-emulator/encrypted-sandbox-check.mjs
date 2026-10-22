// Test-only. Fixed fictional state; no application storage, personal JSON or credentials.
import {encryptSnapshot,decryptSnapshot,sha256Bytes} from '../../sync-crypto.mjs';
export const LIVE_PROJECT='lifeplan-sync-sandbox';
export const DEMO_PROJECT='demo-lifeplan-encrypted-sync';
const copy=v=>structuredClone(v);
const stop=code=>{const e=new Error(code);e.code=code;throw e;};
const stable=v=>JSON.stringify(sort(v));
function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
export function assertSandboxTarget({projectId,environment='live',host,uid}){
 if(typeof uid!=='string'||!uid||uid.includes('/'))stop('invalid-test-identity');
 if(environment==='live'&&projectId===LIVE_PROJECT)return;
 if(environment==='emulator'&&projectId===DEMO_PROJECT&&host==='127.0.0.1')return;
 stop('wrong-sandbox-target');
}
// Timestamp deliberately excluded: serverTimestamp becomes a resolved Timestamp.
export function sameTestRecord(a,b){
 const value=r=>r&&Object.fromEntries(Object.entries(r).filter(([key])=>key!=='updatedAt'));
 return a===null||b===null?a===b:stable(value(a))===stable(value(b));
}
export function createSandboxStore({sdk,database,projectId,uid,environment='live',host}){
 const identity={projectId,uid,environment,host};assertSandboxTarget(identity);
 if(database?.app?.options?.projectId!==projectId)stop('database-project-mismatch');
 const ref=sdk.doc(database,'sandbox',uid,'snapshots','trial');
 const read=async()=>{const s=await sdk.getDocFromServer(ref);return s.exists()?s.data():null;};
 return {
  identity:Object.freeze(identity),read,
  async compareAndSwap(expected,next){
   if(next?.ownerUid!==uid||next?.formatVersion!==1||next.revision!==(expected?.revision??0)+1)stop('invalid-test-record');
   // No UI/storage side effects in callbacks: Firebase may retry a transaction.
   await sdk.runTransaction(database,async tx=>{
    const s=await tx.get(ref),current=s.exists()?s.data():null;
    if(!sameTestRecord(current,expected))stop('stale-sandbox-record');
    tx.set(ref,{ownerUid:uid,formatVersion:1,revision:next.revision,digest:next.digest,ciphertext:next.ciphertext,updatedAt:sdk.serverTimestamp()});
   });
  },
  async removeOwnedAttempt(attempts){
   return sdk.runTransaction(database,async tx=>{
    const s=await tx.get(ref);if(!s.exists())return 'absent';
    if(!attempts.some(x=>x.ownerUid===uid&&sameTestRecord(s.data(),x)))stop('cleanup-record-changed');
    tx.delete(ref);return 'deleted';
   });
  }
 };
}
export const CHECK_LABELS=Object.freeze([
 '独立した2クライアントで試験文書の不存在を確認',
 '既存アプリのAES-GCMで架空データを暗号化',
 '不存在条件付きトランザクションで暗号文を作成',
 '別クライアントで取得・復号し全項目一致',
 '誤った合言葉による復号を拒否',
 '改ざん暗号文をGCM認証で拒否',
 '未認証クライアントの読取りを拒否',
 'PC役の変更を再暗号化して世代更新',
 '古い世代による上書きを拒否',
 '受信役で最新世代を復号し全項目一致',
 '今回作成した文書だけを条件付きで削除',
 '両クライアントでサーバー上の不存在を確認'
]);
export async function runEncryptedSandboxCheck({writer,reader,unauthenticatedRead,onProgress=()=>{}}){
 const steps=[],attempts=[];let attempted=false,createAcknowledged=false,cleanup='not-needed',errorCode=null;
 const progress=n=>{steps.push(n);try{onProgress(n,CHECK_LABELS[n-1]);}catch{/* logging must not interrupt cleanup */}};
 const assert=(condition,code)=>{if(!condition)stop(code);};
 const rejects=async fn=>{let refused=false;try{await fn();}catch{refused=true;}assert(refused,'unexpected-decryption-success');};
 let passphrase=null;
 try{
  assertSandboxTarget(writer?.identity??{});assertSandboxTarget(reader?.identity??{});
  assert(writer!==reader&&stable(writer.identity)===stable(reader.identity),'independent-clients-required');
  assert(typeof unauthenticatedRead==='function','unauthenticated-probe-required');
  assert(await writer.read()===null&&await reader.read()===null,'trial-already-exists');progress(1);
  const nonce=crypto.randomUUID();
  // Generated only for this run. Never accept/import a personal snapshot or key.
  passphrase='test-only-'+crypto.randomUUID()+'-'+crypto.randomUUID();
  const initial={fixture:'fictional-encrypted-sandbox-v1',run:nonce,config:{plan:{initialAsset:1234},actuals:[{age:70,asset:0}],annualReview:{note:'架空検証'}},scenarios:[{id:'synthetic-original',selected:true},{id:'synthetic-comparison',selected:false}],futureEnvelope:{preserve:[0,null,'日本語']}};
  const original=stable(initial),encrypted=await encryptSnapshot(initial,passphrase),again=await encryptSnapshot(initial,passphrase);
  assert(encrypted.digest!==again.digest&&encrypted.payload.iv!==again.payload.iv&&encrypted.payload.salt!==again.payload.salt,'randomness-not-distinct');
  assert(!stable(encrypted).includes('initialAsset')&&!stable(encrypted).includes(nonce),'plaintext-exposed');progress(2);
  const record=(e,revision)=>({ownerUid:writer.identity.uid,formatVersion:1,revision,digest:e.digest,ciphertext:e.payload});
  const first=record(encrypted,1);attempts.push(first);attempted=true;
  await writer.compareAndSwap(null,first);createAcknowledged=true;progress(3);
  const remote1=await reader.read();assert(sameTestRecord(remote1,first),'first-read-mismatch');
  assert(stable(await decryptSnapshot(remote1.ciphertext,passphrase,remote1.digest))===original,'first-decryption-mismatch');progress(4);
  await rejects(()=>decryptSnapshot(remote1.ciphertext,passphrase+'-wrong',remote1.digest));progress(5);
  // Recompute the outer SHA256 so rejection tests GCM, not only the hash guard.
  const damaged=copy(remote1.ciphertext);damaged.data=(damaged.data[0]==='A'?'B':'A')+damaged.data.slice(1);
  const damagedDigest=await sha256Bytes(new TextEncoder().encode(stable(damaged)));
  await rejects(()=>decryptSnapshot(damaged,passphrase,damagedDigest));progress(6);
  let denied=false;try{await unauthenticatedRead();}catch(e){if(e.code==='permission-denied'||e.code==='firestore/permission-denied')denied=true;else throw e;}
  assert(denied,'unauthenticated-read-not-denied');progress(7);
  const changed=copy(initial);changed.config.plan.initialAsset=1250;changed.futureEnvelope.sequence=2;
  const second=record(await encryptSnapshot(changed,passphrase),2);attempts.push(second);
  await writer.compareAndSwap(remote1,second);progress(8);
  let stale=false;try{await reader.compareAndSwap(remote1,second);}catch(e){if(e.code==='stale-sandbox-record')stale=true;else throw e;}
  assert(stale,'stale-write-not-rejected');progress(9);
  const remote2=await reader.read();assert(sameTestRecord(remote2,second),'second-read-mismatch');
  assert(stable(await decryptSnapshot(remote2.ciphertext,passphrase,remote2.digest))===stable(changed),'second-decryption-mismatch');
  assert(stable(initial)===original,'fixture-mutated');progress(10);
  await writer.removeOwnedAttempt(attempts);progress(11);
  assert(await writer.read()===null&&await reader.read()===null,'cleanup-not-absent');cleanup='confirmed';progress(12);
 }catch(e){
  const safe=new Set(['wrong-sandbox-target','invalid-test-identity','database-project-mismatch','independent-clients-required','unauthenticated-probe-required','trial-already-exists','stale-sandbox-record','cleanup-record-changed','cleanup-not-absent','permission-denied','unavailable','unauthenticated-read-not-denied']);
  errorCode=safe.has(e?.code)?e.code:'verification-stopped';
  if(attempted){
   cleanup='unconfirmed';
   try{
    const outcome=await writer.removeOwnedAttempt(attempts);
    const absent=await writer.read()===null&&await reader.read()===null;
    // Ambiguous initial-write failure + immediate absence is NOT a cleanup proof.
    if(absent&&(createAcknowledged||outcome==='deleted'))cleanup='confirmed';
   }catch{/* changed/unknown record must never be deleted */}
  }
 }finally{passphrase=null;}
 return {ok:steps.length===12&&errorCode===null&&cleanup==='confirmed',steps,cleanup,errorCode,personalDataUsed:false,realDeviceSyncVerified:false};
}
