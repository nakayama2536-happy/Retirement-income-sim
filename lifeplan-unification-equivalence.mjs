/** Candidate-only, read-only proof of legacy -> staged standard expense meaning.
 * No personal data logging. No persistence, no network, no automatic adoption.
 */
import {prepareExpenseUnification,resolveUnifiedExpenseAtAge} from './lifeplan-expense-unification-candidate.mjs';
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function ageResult(periods,age){
  const matched=periods.filter(p=>p.fromAge<=age&&age<=p.toAge);
  if(matched.length===1)return {status:'resolved',amount:matched[0].amount};
  if(!matched.length)return {status:'missing',amount:null};
  return {status:'conflict',amount:null};
}
export function proveCandidateEquivalence(config,{ages=null}={}){
  const input=structuredClone(config),before=JSON.stringify(input);
  const proposed=prepareExpenseUnification(input);
  if(proposed.status!=='candidate-only')return {status:'blocked',issues:proposed.errors.map(x=>x.code),candidate:null,proof:null};
  const c=proposed.candidate;
  const coverage=c.expenseUnificationCandidate.coverage;
  const ageList=ages??Array.from({length:config.plan.endAge-config.plan.startAge+1},(_,i)=>config.plan.startAge+i);
  if(!Array.isArray(ageList)||!ageList.length||ageList.some(x=>!Number.isInteger(x)||x<config.plan.startAge||x>config.plan.endAge))throw Error('invalid-age-list');
  const issues=[];let checked=0,matched=0,missing=0;
  for(const entry of coverage){
    for(const age of ageList){
      const old=ageResult(entry.periods,age);
      const next=resolveUnifiedExpenseAtAge(c,entry.groupKey,entry.itemKey,age);
      checked++;
      if(old.status==='missing')missing++;
      if(old.status===next.status&&(old.status==='resolved'?old.amount===next.amount:next.amount===null))matched++;
      else issues.push({code:'CANDIDATE_SEMANTIC_DIFFERENCE',age,sourcePath:entry.sourcePath});
    }
  }
  // Ensure the candidate doesn't alter any cashflow other than staged period override additions;
  // budgets, tax/social policy, asset base, pensions and events must remain unchanged.
  for(const key of ['plan','budgets','income','people','events','employment','nisa','ideco','tax']){
    if(JSON.stringify(input[key])!==JSON.stringify(c[key]))issues.push({code:'UNEXPECTED_FIELD_CHANGE',field:key});
  }
  if(JSON.stringify(input.cashflow.expenseCategories)!==JSON.stringify(c.cashflow.expenseCategories))issues.push({code:'LEGACY_CHANGED'});
  if(JSON.stringify(input)!==before)issues.push({code:'INPUT_MUTATED'});
  if(!record(c.expenseUnificationCandidate)||c.expenseUnificationCandidate.adopted!==false)issues.push({code:'ADOPTION_FLAG'});
  // A candidate is never a saved adoption. Runtime/browsers must be tested separately.
  return {status:issues.length?'mismatch':'candidate-equivalent',issues,candidate:c,proof:{items:coverage.length,ages:ageList.length,checks:checked,matched,missingReferenceChecks:missing,amountsExposed:false,adopted:false}};
}