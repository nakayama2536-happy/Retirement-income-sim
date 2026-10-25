// Verification-only integration into a disposable CI checkout; never deploy or push.
import fs from 'node:fs';
import crypto from 'node:crypto';
const expected={
 'detail-settings.mjs':'5021b8a22e17138203a646b70a5c8a6e68ccf59d',
 'detail-ui.mjs':'4c91976a532ae15c76863c3c1c3e39f492d4a2d2'
};
const blob=b=>crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');
const original={};
for(const [name,sha] of Object.entries(expected)){
 const b=fs.readFileSync(name);if(blob(b)!==sha)throw Error('Base blob changed: '+name);
 original[name]=b.toString('utf8');
}
if(fs.existsSync('retirement-comment.mjs'))throw Error('Refuse an existing runtime module');
const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Integration anchor is not unique');return s.replace(a,b);};
const old="  const r={...(c.retirement||{}),amount:num(d.amount,'退職金額'),serviceYears:num(d.serviceYears,'勤続年数',1,80),receiveDate:date(d.receiveDate,'受取日'),companyStartDate:date(d.companyStartDate,'入社日')};";
const next=old.replace('const r={','const r=withRetirementConceptComment({').slice(0,-2)+'},d);';
const settings="import {withRetirementConceptComment} from './retirement-comment.mjs';\n"+once(original['detail-settings.mjs'],old,next);
const lines=original['detail-ui.mjs'].split('\n');
const matches=lines.flatMap((line,i)=>line.startsWith("  if(kind==='retirement'){const r=")?[i]:[]);
if(matches.length!==1)throw Error('Retirement form not unique');
const i=matches[0];if(!lines[i].endsWith(']);}'))throw Error('Retirement form structure changed');
lines[i]=lines[i].slice(0,-3)+')+retirementConceptCommentField(r);}';
const ui="import {retirementConceptCommentField} from './retirement-comment.mjs';\n"+once(lines.join('\n'),'税の参考条件だけを変更します。退職金収入は追加しません。','退職金の参考条件・構想コメントを更新します。退職金収入は追加しません。');
const module=fs.readFileSync('tools/retirement-comment/retirement-comment.mjs');
const files={'detail-settings.mjs':Buffer.from(settings),'detail-ui.mjs':Buffer.from(ui),'retirement-comment.mjs':module};
for(const [name,data] of Object.entries(files))fs.writeFileSync(name,data);
fs.mkdirSync('stage2-evidence',{recursive:true});
fs.writeFileSync('stage2-evidence/integration.json',JSON.stringify({
 base:'a77a50fa07152a93e3057a5c4a719b16531b9111',baseBlobs:expected,
 status:'staged in disposable checkout only',
 candidateBlobs:Object.fromEntries(Object.entries(files).map(([name,data])=>[name,blob(data)])),
 publication:false,personalData:false,distributionPreparation:'pending Stage 3; do not deploy this archive'
},null,2)+'\n');
console.log('STAGE2_INTEGRATION_OK: exact baseline; 3 runtime paths; no deployment');
