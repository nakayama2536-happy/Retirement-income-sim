import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export function validatePath(p){if(!p||p.includes('\\')||p.startsWith('/')||p.split('/').some(x=>!x||x==='.'||x==='..')||!/^[-\w./]+$/.test(p))throw Error('invalid-path');return p;}
export function inspect(bytes,markers=[]){const s=bytes.toString('utf8');if(markers.some(m=>m&&s.includes(m)))throw Error('private-marker');if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{24,}|libfile_[0-9a-f]{20,}|file_00000000[0-9a-f]+/.test(s))throw Error('restricted-token');}
function read(root,p){validatePath(p);let cursor=root;for(const piece of p.split('/')){cursor=path.join(cursor,piece);if(fs.lstatSync(cursor).isSymbolicLink())throw Error('symlink');}if(!fs.statSync(cursor).isFile())throw Error('not-file');return fs.readFileSync(cursor);}
export function collect(root,markers=[]){
 const sw=read(root,'sw.js').toString();const part=sw.slice(sw.indexOf('const ASSETS='),sw.indexOf('const URLS='));if(!part.startsWith('const ASSETS=')||!part.endsWith('\n'))throw Error('asset-format');
 const lists=[...part.matchAll(/\[(.*?)\]/gs),...part.matchAll(/ASSETS\.push\((.*?)\)/gs)].map(x=>['['+x[1]+']']);if(!lists.length)throw Error('asset-format');const urls=lists.flatMap(x=>{const a=JSON.parse(x[0].replaceAll("'",'"'));if(a.some(p=>typeof p!=='string'||!p.startsWith('./')))throw Error('asset-format');return a;});
 const runtime=[...new Set(urls.map(p=>p==='./'?'index.html':validatePath(p.slice(2)))),'sw.js'].sort();
 const out=new Map();for(const p of runtime){const b=read(root,p);inspect(b,markers);out.set(p,b);}
 for(const p of runtime.filter(p=>p.endsWith('.mjs'))){const s=out.get(p).toString();for(const m of s.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g)){if(!m[1].startsWith('./'))throw Error('external-import');const target=path.posix.normalize(path.posix.join(path.posix.dirname(p),m[1]));if(!out.has(target))throw Error('missing-import:'+p+':'+target);}}
 const html=out.get('index.html').toString();for(const m of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)){let p=m[1];if(p.startsWith('#'))continue;if(p.startsWith('./'))p=p.slice(2);if(!out.has(p))throw Error('missing-html-asset');}
 const manifest=JSON.parse(out.get('manifest.webmanifest'));for(const icon of manifest.icons??[])if(!out.has(icon.src))throw Error('missing-icon');
 for(const [src,dest] of [['public-docs/README.md','README.md'],['public-docs/USER_GUIDE.md','docs/USER_GUIDE.md']]){const b=read(root,src);inspect(b,markers);out.set(dest,b);}
 const files=[...out].sort(([a],[b])=>a.localeCompare(b)).map(([name,b])=>({name,size:b.length,sha256:sha(b)}));out.set('distribution-manifest.json',Buffer.from(JSON.stringify({kind:'public-release',runtime:'v0.9.7-i08-home-branding-20261007',files},null,2)+'\n'));return {out,runtime};
}
export function build(root,dest,markers=[]){if(fs.existsSync(dest))throw Error('destination-exists');const {out,runtime}=collect(root,markers);fs.mkdirSync(dest,{recursive:true});for(const [p,b] of out){fs.mkdirSync(path.dirname(path.join(dest,p)),{recursive:true});fs.writeFileSync(path.join(dest,p),b);}return {files:out.size,runtimeFiles:runtime.length,status:'pass',published:false};}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){try{let markers=[];if(process.argv[4]){const backup=JSON.parse(fs.readFileSync(process.argv[4]));for(const p of Object.values(backup.config.people))for(const [k,v] of Object.entries(p))if(/name|birth/i.test(k)&&typeof v==='string'&&v.length>=2)markers.push(v);}console.log(JSON.stringify(build(path.resolve(process.argv[2]),path.resolve(process.argv[3]),markers)));}catch(e){console.error('梱包停止: '+e.message);process.exitCode=1;}}
