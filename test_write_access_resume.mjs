import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireWriteAccess,assertWriteAccess} from './write-access.mjs';

class FakeTarget {
 constructor(){this.events=new Map();this.visibilityState='visible';}
 addEventListener(name,fn){if(!this.events.has(name))this.events.set(name,[]);this.events.get(name).push(fn);}
 emit(name){for(const fn of this.events.get(name)||[])fn();}
}
class FakeLocks {
 constructor(){this.owner=false;this.grants=0;this.tries=0;}
 async request(name,opts,callback){
  assert.equal(name,'lifeplan-sim-edit-owner');
  assert.equal(opts.mode,'exclusive');
  assert.equal(opts.ifAvailable,true);
  this.tries++;
  if(this.owner)return callback(null);
  this.owner=true;this.grants++;
  try {return await callback({name,mode:'exclusive'});}
  finally {this.owner=false;}
 }
}
const tick=()=>new Promise(r=>setImmediate(r));
async function settle(){for(let i=0;i<8;i++)await tick();}

test('write lease is revoked on pagehide and safely reacquired on pageshow',async()=>{
 const target=new FakeTarget(),doc=new FakeTarget(),locks=new FakeLocks();
 const lease=await acquireWriteAccess({locks,target,documentRef:doc});
 assert.equal(lease.writable,true);
 assert.doesNotThrow(assertWriteAccess);
 target.emit('pagehide');
 assert.equal(lease.writable,false);
 assert.throws(assertWriteAccess,/読み取り専用/);
 target.emit('pageshow');
 await settle();
 assert.equal(lease.writable,true);
 assert.equal(locks.grants,2);
 assert.doesNotThrow(assertWriteAccess);
 target.emit('pagehide');await settle();
});

test('no takeover when another editor holds Web Lock on return',async()=>{
 const target=new FakeTarget(),doc=new FakeTarget(),locks=new FakeLocks();
 const lease=await acquireWriteAccess({locks,target,documentRef:doc});
 target.emit('pagehide');await settle();
 locks.owner=true;
 target.emit('pageshow');await settle();
 assert.equal(lease.writable,false);
 assert.equal(lease.reason,'other-screen');
 assert.throws(assertWriteAccess,/読み取り専用/);
 locks.owner=false;
 doc.emit('visibilitychange');await settle();
 assert.equal(lease.writable,true);
 target.emit('pagehide');await settle();
});

test('unsupported Web Locks never fallback to unsafe localStorage locking',async()=>{
 const target=new FakeTarget(),doc=new FakeTarget();
 const lease=await acquireWriteAccess({locks:undefined,target,documentRef:doc});
 assert.equal(lease.writable,false);
 assert.equal(lease.reason,'lock-unavailable');
 assert.throws(assertWriteAccess,/読み取り専用/);
 target.emit('pageshow');await settle();
 assert.equal(lease.writable,false);
});

test('pagehide during a pending grant does not retain a hidden editor lock',async()=>{
 const target=new FakeTarget(),doc=new FakeTarget();
 let continueRequest;
 const gate=new Promise(resolve=>{continueRequest=resolve;});
 const activeLocks=new FakeLocks();
 let first=true;
 const locks={request:async(...args)=>{
  if(first){first=false;await gate;}
  return activeLocks.request(...args);
 }};
 const ready=acquireWriteAccess({locks,target,documentRef:doc});
 target.emit('pagehide');continueRequest();
 const lease=await ready;
 assert.equal(lease.writable,false);
 await settle();assert.equal(activeLocks.owner,false);
 target.emit('pageshow');await settle();
 assert.equal(lease.writable,true);
 target.emit('pagehide');await settle();
});

test('lock request rejection leaves read-only state and allows a later safe retry',async()=>{
 const target=new FakeTarget(),doc=new FakeTarget(),good=new FakeLocks();
 let errorOnce=true;
 const locks={request:(...args)=>{
  if(errorOnce){errorOnce=false;return Promise.reject(new Error('Web Lock temporarily unavailable'));}
  return good.request(...args);
 }};
 const lease=await acquireWriteAccess({locks,target,documentRef:doc});
 assert.equal(lease.writable,false);assert.equal(lease.reason,'lock-failed');
 assert.throws(assertWriteAccess,/読み取り専用/);
 target.emit('pageshow');await settle();
 assert.equal(lease.writable,true);
 target.emit('pagehide');await settle();
});

test('backgrounded editor releases lock and only regains it when visible',async()=>{
 const target=new FakeTarget(),doc=new FakeTarget(),locks=new FakeLocks(),observed=[];
 const lease=await acquireWriteAccess({locks,target,documentRef:doc});
 const unsubscribe=lease.subscribe(x=>observed.push(x.writable));
 doc.visibilityState='hidden';doc.emit('visibilitychange');await settle();
 assert.equal(lease.writable,false);assert.equal(locks.owner,false);
 assert.throws(assertWriteAccess,/読み取り専用/);
 target.emit('pageshow');await settle(); // background pageshow is not an edit grant
 assert.equal(lease.writable,false);
 doc.visibilityState='visible';doc.emit('visibilitychange');await settle();
 assert.equal(lease.writable,true);assert.equal(locks.grants,2);
 assert.deepEqual(observed,[false,true]);
 unsubscribe();target.emit('pagehide');await settle();
});
