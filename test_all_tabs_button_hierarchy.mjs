import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
test('all application primary and secondary actions use legible hierarchy',()=>{
 assert.match(css,/Shared action-button clarity for all tabs/);
 assert.match(css,/\.panel button\.primary:not\(:disabled\)/);
 assert.match(css,/\.panel button\.secondary:not\(:disabled\)/);
 assert.match(css,/\.panel button\.primary:disabled/);
 assert.match(css,/\.panel button:focus-visible/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
