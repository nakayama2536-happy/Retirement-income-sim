import {readFileSync} from 'node:fs';
import {inspectLegacyExpenseMigration} from './lifeplan-expense-migration-preflight.mjs';
const path=process.argv[2];
if(!path){console.error('Usage: node lifeplan-expense-migration-preflight-cli.mjs <local-json>');process.exitCode=2;}
else {const r=inspectLegacyExpenseMigration(JSON.parse(readFileSync(path,'utf8')));console.log(JSON.stringify(r,null,2));if(r.status==='blocked')process.exitCode=1;}