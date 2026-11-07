/** Draft-only and pure conversion for a future explicit, user-approved adoption.
 * No persistence, browser globals, or network. The caller MUST validate an
 * isolated patched resolver and take a compatible backup before any commit.
 */
import {prepareExpenseUnification} from './lifeplan-expense-unification-candidate.mjs';

const clone=x=>structuredClone(x);
const own=(x,k)=>x!==null&&typeof x==='object'&&Object.hasOwn(x,k);
export const ADOPTION_SAFETY='STANDARD_MIGRATED_WITH_COVERAGE_V1';
export const REQUIRED_FEATURE='legacy-expense-unification-v1';
const tracked=c=>({
  standardExists:own(c,'expenseDetail'),
  expenseDetail:own(c,'expenseDetail')?clone(c.expenseDetail):null,
  oldExists:own(c.cashflow,'expenseCategories'),
  legacy:own(c.cashflow,'expenseCategories')?clone(c.cashflow.expenseCategories):null,
  overrideExists:own(c.cashflow,'periodOverrides'),
  overrides:own(c.cashflow,'periodOverrides')?clone(c.cashflow.periodOverrides):null,
  selectedExists:own(c.cashflow,'detailSourceProfile'),
  selected:own(c.cashflow,'detailSourceProfile')?clone(c.cashflow.detailSourceProfile):null,
  candidateExists:own(c,'expenseUnificationCandidate'),
  candidate:own(c,'expenseUnificationCandidate')?clone(c.expenseUnificationCandidate):null,
  recoveryExists:own(c,'recoveryCompatibility'),
  recovery:own(c,'recoveryCompatibility')?clone(c.recoveryCompatibility):null
});
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
/** No test can write or adopt a real browser state by calling this function. */
export function buildExpenseUnificationAdoption(raw){
  const before=clone(raw);
  if(own(before,'expenseUnificationArchive'))return {status:'blocked',reason:'ARCHIVE_EXISTS',config:null};
  const converted=prepareExpenseUnification(before);
  if(converted.status!=='candidate-only')return {status:'blocked',reason:'CANDIDATE_BLOCKED',codes:converted.errors.map(e=>e.code),config:null};
  if(before.cashflow?.detailSourceProfile&&!['public-v0.9','work-v0.9.7'].includes(before.cashflow.detailSourceProfile))return {status:'blocked',reason:'UNKNOWN_SELECTED_SOURCE',config:null};
  const next=converted.candidate;
  const original=tracked(before);
  // The old profile stops being an active reader but remains recoverable in a
  // private, local-only backup section within the configuration.
  delete next.cashflow.expenseCategories;
  next.cashflow.detailSourceProfile='work-v0.9.7';
  next.expenseUnificationCandidate.adopted=true;
  next.expenseUnificationCandidate.safety=ADOPTION_SAFETY;
  // This is deliberately incompatible with old deployed binaries: they must
  // reject a saved proposal rather than silently ignore unknown coverage.
  const existing=before.recoveryCompatibility?.requiredFeatures||[];
  next.recoveryCompatibility={...clone(before.recoveryCompatibility||{}),protocol:1,producerBuild:'draft-legacy-expense-unification-v1',requiredFeatures:[...new Set([...existing,REQUIRED_FEATURE])]};
  // Record only the fields this migration changes: unrelated later settings
  // can remain untouched when an undo is requested.
  const adopted=tracked(next);
  next.expenseUnificationArchive={format:'legacy-expense-unification-undo-v1',original,adopted};
  if(!equal(before,raw))throw Error('SOURCE_MUTATION');
  return {status:'adoption-proposal-only',config:next,
    proof:{legacyItems:converted.summary.items,createdOverrides:converted.summary.periodOverrides,age95:converted.summary[95],age96:converted.summary[96],
      oldSourcePreserved:true,zeroIsNotMissing:true,sourceUnchanged:true,autoSaved:false}};
}
/** Reverses ONLY the migration-owned fields, and refuses after any edits to them. */
export function undoExpenseUnificationAdoption(raw){
  const c=clone(raw),arch=c?.expenseUnificationArchive;
  if(!arch||arch.format!=='legacy-expense-unification-undo-v1'||!arch.original||!arch.adopted)return {status:'blocked',reason:'NO_VALID_ARCHIVE',config:null};
  if(!equal(tracked(c),arch.adopted))return {status:'blocked',reason:'MIGRATED_FIELDS_CHANGED',config:null};
  const orig=arch.original;
  if(orig.standardExists)c.expenseDetail=clone(orig.expenseDetail);else delete c.expenseDetail;
  if(orig.oldExists)c.cashflow.expenseCategories=clone(orig.legacy);else delete c.cashflow.expenseCategories;
  if(orig.overrideExists)c.cashflow.periodOverrides=clone(orig.overrides);else delete c.cashflow.periodOverrides;
  if(orig.selectedExists)c.cashflow.detailSourceProfile=clone(orig.selected);else delete c.cashflow.detailSourceProfile;
  if(orig.candidateExists)c.expenseUnificationCandidate=clone(orig.candidate);else delete c.expenseUnificationCandidate;
  if(orig.recoveryExists)c.recoveryCompatibility=clone(orig.recovery);else delete c.recoveryCompatibility;
  delete c.expenseUnificationArchive;
  return {status:'undo-proposal-only',config:c,autoSaved:false};
}