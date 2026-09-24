const CONFIG_KEY = 'retirement-sim-config-v0.9';
const LEGACY_CONFIG_KEYS = ['retirement-sim-config-v0.8','retirement-sim-config-v0.7','retirement-sim-config-v0.6','retirement-sim-config-v0.5','retirement-sim-config-v0.4','retirement-sim-config-v0.3','retirement-sim-config-v0.2'];
const SCENARIO_KEY = 'retirement-sim-scenarios-v0.9';
const LEGACY_SCENARIO_KEYS = ['retirement-sim-scenarios-v0.8','retirement-sim-scenarios-v0.7','retirement-sim-scenarios-v0.6','retirement-sim-scenarios-v0.5','retirement-sim-scenarios-v0.4','retirement-sim-scenarios-v0.3'];

function isoFromYear(year, month=1, day=1){ return year ? `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}` : null; }

export function migrateConfig(config) {
  if (!config) return null;
  const c = structuredClone(config);
  c.meta ||= {}; c.meta.schemaVersion = '0.9';
  c.actuals ||= {}; c.reviews ||= {}; c.pendingDecisions ||= [];
  c.people ||= {}; c.people.primary ||= {}; c.people.spouse ||= {};
  if(!c.people.primary.birthDate && c.people.primary.birthYear) c.people.primary.birthDate=isoFromYear(c.people.primary.birthYear,1,1);
  if(!c.people.spouse.birthDate && c.people.spouse.birthYear) c.people.spouse.birthDate=isoFromYear(c.people.spouse.birthYear,1,1);
  c.plan ||= {};
  c.plan.startAge ??= 64; c.plan.endAge ??= 95;
  if(!c.plan.startDate && c.people.primary.birthYear) c.plan.startDate=isoFromYear(Number(c.people.primary.birthYear)+Number(c.plan.startAge),1,1);
  c.employment ||= {primary:{},spouse:{}}; c.employment.primary ||= {}; c.employment.spouse ||= {};
  c.employment.primary.mainRetirement ||= {};
  if(!c.employment.primary.mainRetirement.baseDate && c.people.primary.birthYear) c.employment.primary.mainRetirement.baseDate=isoFromYear(Number(c.people.primary.birthYear)+65,1,1);
  c.employment.primary.sideWork ||= {};
  c.employment.primary.sideWork.monthlyGross ??= Number(c.income?.labor?.annual||0)/24 || 0;
  c.employment.primary.sideWork.startMode ||= 'after_high_age_benefit';
  c.employment.spouse.sideWork ||= {};
  c.employment.spouse.sideWork.monthlyGross ??= Number(c.income?.labor?.annual||0)/24 || 0;
  c.income ||= {}; c.income.pensions ||= {};
  if(!c.income.pensions.primary && c.income.pension) c.income.pensions.primary={annualAtStart:Number(c.income.pension.annualAtStart||0),certainty:c.income.pension.certainty||'assumption'};
  c.income.pensions.primary ||= {annualAtStart:0,certainty:'unknown'};
  c.income.pensions.spouse ||= {annualAtStart:0,certainty:'unknown'};
  c.reserve ||= {}; c.reserve.total ??= 0; c.reserve.minimumSafeAsset ??= 0; c.reserve.warningStrongBelow ??= c.reserve.minimumSafeAsset; c.reserve.refillTarget ??= c.reserve.total;
  c.management ||= {}; c.management.thresholds ||= {}; c.management.reserveUsedFinalThreshold ??= 0;
  c.certainty ||= {};
  c.certainty.initialAsset ||= 'plan'; c.certainty.returnRate ||= 'scenario'; c.certainty.inflation ||= 'scenario';
  c.certainty.laborIncome ||= 'plan'; c.certainty.pension ||= 'assumption'; c.certainty.dc ||= 'assumption'; c.certainty.budgets ||= 'plan'; c.certainty.retirement ||= 'company_estimate';
  c.taxPolicy ||= {budgetIncludesTaxSocial:true,reviewDeltaAnnual:0,municipality:'未設定',rulesAsOf:'2026-09-25'};
  c.cashflow ||= {};
  c.cashflow.taxSocialMode ||= 'auto_if_possible';
  if(!Array.isArray(c.cashflow.expenseCategories)){
    const old=(c.expenseDetail?.monthlyCategories||[]);
    c.cashflow.expenseCategories=old.map(cat=>({
      key:cat.key||String(cat.label||'item'), label:cat.label||cat.key||'支出',
      fallbackMonthly:cat.key==='taxSocial'?Number(cat.amount||4):undefined,
      items:cat.key==='taxSocial'?[]:(cat.items?.length?cat.items:[{label:cat.label||'支出',amount:cat.amount||0}]).map((i,idx)=>({key:`${cat.key||'item'}-${idx}`,label:i.label||cat.label||'支出',periods:[{fromAge:Number(c.plan?.startAge||64),toAge:Number(c.plan?.endAge||95),amount:Number(i.amount||0)}]}))
    }));
  }
  if(!Array.isArray(c.cashflow.travel)) c.cashflow.travel=(c.budgets||[]).map(b=>({fromAge:Number(b.fromAge),toAge:Number(b.toAge),annualAmount:Number(b.travelReference ?? b.travelMax ?? 0)}));
  c.cashflow.manualIncomeItems ||= [{key:'inheritance',label:'相続遺産',unit:'annual',periods:[]}];
  c.cashflow.expenseReductionIdeas ||= ['通信費見直し','家賃見直し','車関連費見直し'];
  c.cashflow.incomeImprovementIdeas ||= ['労働収入増','資産収入増','相続遺産'];
  c.unemployment ||= {baselineMode:'retire_at_65',preRetirementAnnualSalary:0,insuredYears:20,highAgeDays:50,pre65GeneralDays:150,pre65SpecialDays:240,dailyBenefitCap60to64Yen:7830,dailyBenefitCapHighAgeYen:7450,baselineSideWorkDelayMonths:2};
  return c;
}

export function saveConfig(config) { localStorage.setItem(CONFIG_KEY, JSON.stringify(migrateConfig(config))); }
export function loadConfig() {
  for (const key of [CONFIG_KEY, ...LEGACY_CONFIG_KEYS]) {
    const raw = localStorage.getItem(key); if (!raw) continue;
    try { const migrated=migrateConfig(JSON.parse(raw)); if(key!==CONFIG_KEY)localStorage.setItem(CONFIG_KEY,JSON.stringify(migrated)); return migrated; } catch {}
  }
  return null;
}
export function clearConfig(){ localStorage.removeItem(CONFIG_KEY); }
export function loadScenarios(){
  for(const key of [SCENARIO_KEY,...LEGACY_SCENARIO_KEYS]){
    const raw=localStorage.getItem(key); if(!raw)continue;
    try{const data=JSON.parse(raw);if(Array.isArray(data)){const migrated=data.map((s,i)=>({...s,role:s.role||(i===0?'baseline':'scenario'),config:migrateConfig(s.config)}));if(key!==SCENARIO_KEY)localStorage.setItem(SCENARIO_KEY,JSON.stringify(migrated));return migrated;}}catch{}
  }
  return [];
}
export function saveScenarios(items){localStorage.setItem(SCENARIO_KEY,JSON.stringify(items));}
export function downloadJson(data,filename){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
