import fs from 'node:fs';
import path from 'node:path';
import {makeFixture} from './harness.mjs';
const dir=process.argv[2];if(!dir)throw Error('output directory required');fs.mkdirSync(dir,{recursive:true});
const h=await makeFixture();
try{fs.writeFileSync(path.join(dir,'unlock.html'),h.html());await h.unlock();await h.click(4);fs.writeFileSync(path.join(dir,'ready.html'),h.html());}finally{h.destroy();}
