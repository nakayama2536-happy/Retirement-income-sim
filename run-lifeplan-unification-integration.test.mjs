import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {inspectCheckout,prepareIsolatedCheckout,requiredIntegrationTests} from './run-lifeplan-unification-integration.mjs';
function repoFixture(fn){
 const dir=mkdtempSync(join(tmpdir(),'lifeplan-checkout-fixture-'));
 try{
  execFileSync('git',['init','-q',dir]);
  writeFileSync(join(dir,'cashflow-sources.mjs'),`// Synthetic contract with the two upstream v0.9.38 anchors.\nconst PUBLIC = 'public-v0.9', WORK = 'work-v0.9.7';\nfunction resolveProfile(view,itemId,age,profile){\n  const v={profile,kind:'expense',parentId:'group'};\n  const all=view.rules.filter(r=>r.itemId === itemId && r.profile === profile);\n  return all;\n}\n`);
  execFileSync('git',['-C',dir,'add','cashflow-sources.mjs']);
  execFileSync('git',['-C',dir,'-c','user.email=synthetic@example.invalid','-c','user.name=Test','commit','-qm','fixture']);
  const sha=execFileSync('git',['-C',dir,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  fn({dir,sha});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('wrong upstream version prevents read and staging',()=>repoFixture(({dir})=>{
 assert.throws(()=>inspectCheckout(dir),/WRONG_COMMIT/);
}));
test('read-only pinned staging creates patch only in temporary checkout',()=>repoFixture(({dir,sha})=>{
 const before=readFileSync(join(dir,'cashflow-sources.mjs'),'utf8');
 const temp=prepareIsolatedCheckout(dir,{expected:sha});
 try{
  assert.equal(temp.sha,sha);
  assert.match(readFileSync(join(temp.stage,'cashflow-sources.mjs'),'utf8'),/stagedExpenseCoverageGuard/);
  assert.equal(readFileSync(join(dir,'cashflow-sources.mjs'),'utf8'),before);
 }finally{rmSync(temp.stage,{recursive:true,force:true});}
}));
test('dirty tracked source refuses integration',()=>repoFixture(({dir,sha})=>{
 writeFileSync(join(dir,'cashflow-sources.mjs'),'altered');
 assert.throws(()=>prepareIsolatedCheckout(dir,{expected:sha}),/DIRTY_TRACKED_FILES/);
}));
test('untracked personal-like file is never copied',()=>repoFixture(({dir,sha})=>{
 writeFileSync(join(dir,'private-example.json'),'SYNTHETIC_DO_NOT_COPY');
 const temp=prepareIsolatedCheckout(dir,{expected:sha});
 try{assert.equal(temp.trackedCount,1);assert.equal(readFileSync(join(temp.stage,'cashflow-sources.mjs'),'utf8').includes('SYNTHETIC_DO_NOT_COPY'),false);}
 finally{rmSync(temp.stage,{recursive:true,force:true});}
}));
test('tracked symlink is rejected, not followed into staging',()=>repoFixture(({dir,sha})=>{
 symlinkSync('cashflow-sources.mjs',join(dir,'pointer.mjs'));
 execFileSync('git',['-C',dir,'add','pointer.mjs']);
 execFileSync('git',['-C',dir,'-c','user.email=synthetic@example.invalid','-c','user.name=Test','commit','-qm','symlink fixture']);
 const pinned=execFileSync('git',['-C',dir,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 assert.throws(()=>prepareIsolatedCheckout(dir,{expected:pinned}),/NON_REGULAR_TRACKED_FILE/);
}));

test('mandatory actual-engine test must never be omitted by name filter',()=>{
 const tests=requiredIntegrationTests();
 assert.ok(tests.includes('test_unification_actual_engine.mjs'));
 assert.ok(tests.includes('lifeplan-unification-equivalence.test.mjs'));
 assert.ok(tests.includes('test_mortality_comparison.mjs'));
 assert.ok(tests.includes('test_release_identity.mjs'));
 assert.equal(new Set(tests).size,tests.length);
});