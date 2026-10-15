import assert from 'node:assert/strict';
export async function validateFullPlanUi({browser,createTestServer,open,load,openTab,snapshot,here,out,fs,path}){
 const fixture=await createTestServer();fixture.setMode('new');
 const context=await browser.newContext({acceptDownloads:true});
 const record={id:'F1',scope:'saved unadopted comparisons, difference review, browser backup and CSV 390/1280 widths',status:'running'};
 try{
  const state=JSON.parse(await fs.readFile(path.join(here,'synthetic-full.json'),'utf8')),c=state.config;
  c.people.primary.birthDate='1980-08-27';c.people.spouse.birthDate='1981-05-01';
  c.plan.startDate='2044-08-27';c.plan.startAge=64;c.plan.initialAsset=100;
  c.budgets=[{fromAge:65,toAge:95,annualBudget:0}];
  c.ideco={asOfDate:'2044-08-27',currentBalance:120,monthlyContribution:0,contributionEndDate:'2044-08-27',lumpDate:'2044-08-27',lumpPercent:50,annuityPercent:50,annuityYears:5,accumulationReturn:0,annuityReturn:0};
  c.cashflow.salaryLife={mode:'net-transfer-v1',lastSalaryMonth:'2044-08',monthlyAddition:0,monthlyWithdrawal:0,pre65MonthlyBudget:0,postSalaryLabor:{mode:'none'},receiptTreatment:{ideco:'separate',pension:'separate',unemployment:'separate'}};
  c.employment.primary.mainRetirement.baseDate='2045-08-27';
  c.employment.primary.sideWork={monthlyGross:0,startMode:'after_high_age_benefit'};
  const src=path.join(out,'F1-synthetic-input.json');await fs.writeFile(src,JSON.stringify(state));
  const page=await open(context,fixture.url),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await load(page,src);const before=(await snapshot(page)).data;
  await openTab(page,'settings');await page.locator('#step8TrialCard details > summary').click();
  const opening=page.locator('#step8TrialContainer'),full=page.locator('#fullPlanComparisonContainer');
  for(const [name,value] of [['startMonth','2044-09'],['salaryLastMonth','2044-08'],['priceBaseMonth','2044-08'],['openingAsOfMonth','2044-08'],['openingAmount','100'],['annuityStartMonth','2044-09']])await opening.locator('[name="'+name+'"]').fill(value);
  await opening.locator('[name="idecoAssetScope"]').selectOption('received-lump-only-v1');
  await opening.locator('input[type=checkbox]').nth(0).check();
  await opening.locator('input[type=checkbox]').nth(1).check();
  await full.locator('[name="fullPlanSideMonth"]').fill('2045-10');
  await full.locator('[name="fullPlanBudgetAmount0"]').fill('12');
  assert.deepEqual((await snapshot(page)).data,before,'input must not mutate current state');
  await openTab(page,'settings');await full.getByRole('button',{name:'全条件を比較（未反映）'}).click();
  assert.match(await full.locator('[role=status]').innerText(),/年齢期CSVの照合が完了/);
  assert(await full.locator('tbody tr').count()>0);
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});await openTab(page,'settings');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow '+width);
   await full.screenshot({path:path.join(out,'F1-full-plan-'+width+'.png')});
  }
  const wait=page.waitForEvent('download');
  await full.getByRole('button',{name:'未反映比較の年齢期CSVを保存'}).click();
  const d=await wait,stream=await d.createReadStream(),parts=[];for await(const part of stream)parts.push(part);
  const content=Buffer.concat(parts).toString('utf8');
  assert.match(content,/年齢期/);assert.match(content,/期末資産_万円/);assert(content.split('\r\n').length>20);
  assert.deepEqual((await snapshot(page)).data,before,'CSV download must not adopt proposal');
  await full.locator('[name="fullPlanSavedName"]').fill('架空比較A');
  await full.getByRole('button',{name:'比較案を保存（採用しない）'}).click();
  const saved=(await snapshot(page)).data;
  assert.deepEqual(saved.config,before.config,'comparison saving must not modify adopted settings');
  assert.deepEqual(saved.scenarios.slice(0,before.scenarios.length),before.scenarios,'existing comparisons must remain');
  assert.equal(saved.scenarios.length,before.scenarios.length+1,'exactly one new comparison: '+await full.locator('[role=status]').innerText());
  const added=saved.scenarios.at(-1);
  assert.equal(added.name,'架空比較A');assert.equal(added.role,'scenario');assert.equal(added.selected,false);
  assert.equal(added.comparisonPlan.version,1);assert.equal(added.comparisonPlan.inputs.opening.openingConfirmed,false);
  assert(saved.recoveryCompatibility.requiredFeatures.includes('full-plan-comparison-saved-v1'));
  await full.getByRole('button',{name:'架空比較A の差分を表示'}).click();
  assert.match(await full.innerText(),/現在の採用値と比較案の差分/);
  assert.deepEqual((await snapshot(page)).data,saved,'viewing a saved scenario must not write');
  await page.setViewportSize({width:390,height:900});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'saved list horizontal overflow');
  await openTab(page,'settings');await full.locator('[name="fullPlanBudgetAmount0"]').fill('13');
  assert(!/照合が完了/.test(await full.locator('[role=status]').innerText()));
  assert(await full.getByRole('button',{name:'未反映比較の年齢期CSVを保存'}).isDisabled());
  await full.getByRole('button',{name:'この比較入力を破棄'}).click();
  assert.deepEqual((await snapshot(page)).data,saved);
  await page.reload();await page.locator('#dashboard').waitFor({state:'visible'});
  assert.deepEqual((await snapshot(page)).data,saved,'reload must retain the saved proposal');
  await openTab(page,'settings');await page.locator('#step8TrialCard details > summary').click();
  await full.getByRole('button',{name:'架空比較A の差分を表示'}).click();
  assert.match(await full.innerText(),/現在の採用値と比較案の差分/);
  assert.deepEqual((await snapshot(page)).data,saved);assert.deepEqual(errors,[]);
  record.status='pass';
 }catch(e){record.status='failed-or-harness-error';record.error=e.stack;throw Object.assign(e,{detailRecord:record});}
 finally{await context.close();await fixture.close();}
 return record;
}
