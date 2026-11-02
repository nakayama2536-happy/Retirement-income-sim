/**
 * Preview-only release staging in an isolated directory.
 * No branch mutation, deployment, storage access, or cache cleanup.
 *
 * Usage: node tools/stage-age-budget-release.mjs SOURCE_DIR DEST_DIR BUILD_ID
 * The destination must not exist. Review the generated candidate and diff
 * before replacing any committed release files.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collect} from './package-public.mjs';

const expected=['age-budget-ui.mjs','age-budget-candidate.mjs','age-budget-preview-export.mjs','discretionary-travel.mjs'];
function once(source,before,after,file){
 if(!source.includes(before))throw Error('release-anchor-missing:'+file);
 return source.replace(before,after);
}
function write(root,name,transform){
 const loc=path.join(root,name);
 fs.writeFileSync(loc,transform(fs.readFileSync(loc,'utf8')));
}
export function stageAgeBudgetRelease(sourceDir,targetDir,buildId){
 const source=path.resolve(sourceDir),dest=path.resolve(targetDir);
 if(!/^v\d+\.\d+\.\d+-[a-z0-9-]+$/.test(buildId)||/draft|dev|rc/.test(buildId))throw Error('invalid-build-id');
 if(fs.existsSync(dest))throw Error('destination-exists');
 if(dest===source||dest.startsWith(source+path.sep))throw Error('destination-within-source');
 fs.cpSync(source,dest,{recursive:true,errorOnExist:true,force:false});
 try{
  const old=JSON.parse(fs.readFileSync(path.join(dest,'release-info.json'),'utf8')).appBuild;
  if(buildId===old)throw Error('build-id-unchanged');
  write(dest,'app.mjs',s=>{
   s=once(s,"import {unemploymentEvents} from './unemployment-plan.mjs';","import {mountAgeBudgetComparison} from './age-budget-ui.mjs';\nimport {unemploymentEvents} from './unemployment-plan.mjs';",'app.mjs');
   s=once(s,"const detailUI=mountDetailUI({getState:()=>({config,scenarios}),commit:next=>commitState(next),notice:showNotice});","const detailUI=mountDetailUI({getState:()=>({config,scenarios}),commit:next=>commitState(next),notice:showNotice});\nconst ageBudgetComparison=mountAgeBudgetComparison({container:el('cashflow'),getConfig:()=>config,notice:showNotice});",'app.mjs');
   s=once(s,"  detailUI.render();","  detailUI.render();\n  ageBudgetComparison.reset();",'app.mjs');
   return once(s,old,buildId,'app.mjs');
  });
  write(dest,'sw.js',s=>{
   s=once(s,"const URLS=ASSETS.map","ASSETS.push("+expected.map(x=>JSON.stringify('./'+x)).join(',')+");\nconst URLS=ASSETS.map",'sw.js');
   return once(s,old,buildId,'sw.js');
  });
  write(dest,'backup-compatibility.mjs',s=>once(s,old,buildId,'backup-compatibility.mjs'));
  write(dest,'tools/package-public.mjs',s=>once(s,old,buildId,'tools/package-public.mjs'));
  write(dest,'release-info.json',s=>{const info=JSON.parse(s);if(info.appBuild!==old)throw Error('release-id-mismatch');info.appBuild=buildId;info.purpose='age-budget-preview-candidate';return JSON.stringify(info,null,2)+'\n';});
  write(dest,'test_distribution_audit.mjs',s=>s.replace("x.runtime.length,67","x.runtime.length,71").replace("x.out.size,70","x.out.size,74").replace("m.files.length,69","m.files.length,73"));
  write(dest,'test_release_identity.mjs',s=>s.replaceAll(old,buildId));
  const staged=collect(dest);
  if(staged.runtime.length!==71||staged.out.size!==74)throw Error('unexpected-release-file-count');
  fs.writeFileSync(path.join(dest,'distribution-manifest.json'),staged.out.get('distribution-manifest.json'));
  if(!fs.readFileSync(path.join(dest,'distribution-manifest.json')).equals(collect(dest).out.get('distribution-manifest.json')))throw Error('manifest-not-reproducible');
  return {status:'staged-only',releaseId:buildId,runtimeFiles:staged.runtime.length,manifestFiles:staged.out.size-1,published:false};
 }catch(error){fs.rmSync(dest,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{console.log(JSON.stringify(stageAgeBudgetRelease(process.argv[2],process.argv[3],process.argv[4])));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
