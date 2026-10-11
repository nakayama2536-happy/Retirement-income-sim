// Only checked-in public application files and a synthetic fixture are used.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'distribution-manifest.json'),'utf8'));
const selected=manifest.files.filter(x=>x.name!=='README.md'&&!x.name.startsWith('docs/'));
const files=[];
for(const item of selected){
 if(!/^[-\w./]+$/.test(item.name)||item.name.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Invalid distribution path');
 let cursor=root;
 for(const part of item.name.split('/')){cursor=path.join(cursor,part);if((await fs.lstat(cursor)).isSymbolicLink())throw Error('Symlink rejected');}
 const bytes=await fs.readFile(cursor);
 const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 if(bytes.length!==item.size||sha256!==item.sha256)throw Error('Distribution mismatch: '+item.name);
 const dest=path.join(here,'app',item.name);
 await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);
 files.push({path:item.name,sha256});
}
if(!files.some(x=>x.path==='sw.js')||!files.some(x=>x.path==='index.html'))throw Error('Missing runtime entry');
await fs.writeFile(path.join(here,'manifest.json'),JSON.stringify({sourceCommit:process.env.GITHUB_SHA??'local-candidate',cacheVersion:manifest.runtime,files},null,2)+'\n');
console.log(JSON.stringify({runtimeFiles:files.length,status:'prepared',browserTestsExecuted:0}));
