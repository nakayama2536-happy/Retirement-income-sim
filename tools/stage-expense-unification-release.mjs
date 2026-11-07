/** Unpublished stage: copies only tracked files from pinned main to a new temp directory. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {applyReadOnlyExpenseReviewOverlay} from '../apply-expense-unification-review.mjs';
import {patchIsolatedAdoption} from '../apply-expense-unification-adoption-ui.mjs';
const BASE='3de8df5465b1484028bd7d1b1d9db7ddbf9df81a';
const OLD='v0.9.38-complete-numbering-20261107';
export const CANDIDATE_BUILD='v0.9.39-legacy-expense-unification-20261107';
const MODULES=['expense-unification-coverage.mjs','lifeplan-expense-migration-preflight.mjs','lifeplan-expense-unification-candidate.mjs','lifeplan-expense-unification-review.mjs','lifeplan-expense-unification-adoption-ui.mjs','lifeplan-expense-unification-transaction.mjs','lifeplan-expense-unification-adoption.mjs'];
const read=(root,file)=>fs.readFileSync(path.join(root,file),'utf8');
const write=(root,file,value)=>fs.writeFileSync(path.join(root,file),value,'utf8');
function once(text,from,to,name){
 const parts=text.split(from);
 if(parts.length!==2)throw Error('ANCHOR_DRIFT '+name+' count='+String(parts.length-1));
 return parts.join(to);
}
function copyTracked(src,dest){
 const files=execFileSync('git',['ls-files','-z'],{cwd:src}).toString('utf8').split('\0').filter(Boolean);
 if(!files.includes('sw.js')||!files.includes('tools/package-public.mjs'))throw Error('MISSING_TRACKED_FILES');
 for(const f of files){
  if(f.startsWith('/')||f.includes('\\')||f.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('UNSAFE_PATH');
  const from=path.join(src,f),to=path.join(dest,f);
  if(!fs.statSync(from,{throwIfNoEntry:false})?.isFile()||fs.lstatSync(from).isSymbolicLink())throw Error('NOT_REGULAR_FILE');
  fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);
 }
 return files.length;
}
export async function stageUnificationBuild(sourceDir,targetDir){
 const src=path.resolve(sourceDir),dest=path.resolve(targetDir);
 if(src===dest||dest.startsWith(src+path.sep)||fs.existsSync(dest))throw Error('OUTPUT_MUST_BE_NEW_OUTSIDE_SOURCE');
 if(execFileSync('git',['rev-parse','HEAD'],{cwd:src}).toString('utf8').trim()!==BASE)throw Error('UNEXPECTED_SOURCE_COMMIT');
 if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:src}).toString('utf8').trim())throw Error('DIRTY_SOURCE');
 fs.mkdirSync(dest,{recursive:false});
 try{
  const tracked=copyTracked(src,dest);
  applyReadOnlyExpenseReviewOverlay(dest);
  patchIsolatedAdoption(dest);
  let sw=read(dest,'sw.js');
  if(MODULES.some(m=>sw.includes("'./"+m+"'")||sw.includes('"./'+m+'"')))throw Error('ALREADY_PACKAGED');
  sw=once(sw,'const URLS=ASSETS.map','ASSETS.push('+MODULES.map(m=>JSON.stringify('./'+m)).join(',')+');\nconst URLS=ASSETS.map','sw-assets');
  sw=once(sw,OLD,CANDIDATE_BUILD,'sw-build');write(dest,'sw.js',sw);
  for(const name of ['app.mjs','backup-compatibility.mjs','tools/package-public.mjs'])write(dest,name,once(read(dest,name),OLD,CANDIDATE_BUILD,name));
  const info=JSON.parse(read(dest,'release-info.json'));
  if(info.appBuild!==OLD)throw Error('RELEASE_INFO_MISMATCH');
  info.appBuild=CANDIDATE_BUILD;info.purpose='unpublished-legacy-expense-unification-acceptance';delete info.releasedAt;
  write(dest,'release-info.json',JSON.stringify(info,null,2)+'\n');
  write(dest,'test_release_identity.mjs',read(dest,'test_release_identity.mjs').replaceAll(OLD,CANDIDATE_BUILD));
  const pkg=await import(pathToFileURL(path.join(dest,'tools/package-public.mjs')).href);
  const bundle=pkg.collect(dest),manifest=JSON.parse(bundle.out.get('distribution-manifest.json').toString('utf8'));
  if(manifest.runtime!==CANDIDATE_BUILD)throw Error('WRONG_MANIFEST_BUILD');
  for(const mod of MODULES)if(!manifest.files.some(f=>f.name===mod))throw Error('MISSING_MODULE '+mod);
  if(manifest.files.some(f=>f.name.startsWith('test_')||f.name.startsWith('tools/')||/private|personal|backup.*\.json/i.test(f.name)))throw Error('UNSAFE_ASSET');
  write(dest,'distribution-manifest.json',JSON.stringify(manifest,null,2)+'\n');
  return {status:'staged-only',published:false,sourceCommit:BASE,build:CANDIDATE_BUILD,trackedFilesCopied:tracked,runtimeFiles:bundle.runtime.length,manifestFiles:manifest.files.length,requiredModules:MODULES};
 }catch(e){fs.rmSync(dest,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(!process.argv[2]||!process.argv[3])throw Error('Clean pinned source and new isolated destination required');console.log(JSON.stringify(await stageUnificationBuild(process.argv[2],process.argv[3])));}
 catch(e){console.error('開発配布候補の作成停止: '+e.message);process.exitCode=1;}
}
