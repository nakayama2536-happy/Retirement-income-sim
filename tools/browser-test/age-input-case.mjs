import assert from 'node:assert/strict';
export async function validateAgeInputUi({browser,createTestServer,open,load,openTab,snapshot,here,out,fs,path}){
 const fixture=await createTestServer();fixture.setMode('new');const context=await browser.newContext({acceptDownloads:true});
 const record={id:'A1',scope:'all date inputs, per-person ages, exclusive end, stale sibling editors and storage',status:'running'};
 try{
  const data=JSON.parse(await fs.readFile(path.join(here,'synthetic-full.json'),'utf8'));
  data.config.ideco={asOfDate:'2044-01-01',contributionEndDate:'2045-01-01',joinDate:'2010-01-01',lumpDate:'2045-01-01',currentBalance:100,monthlyContribution:1,accumulationReturn:0,lumpPercent:50,annuityPercent:50,annuityYears:5,annuityReturn:0};
  data.config.plan.initialAssetIncludesIdeco=false;
  const file=path.join(out,'age-input-synthetic.json');await fs.writeFile(file,JSON.stringify(data));
  const page=await open(context,fixture.url),errors=[];page.on('pageerror',e=>errors.push(e.message));await load(page,file);
  const before=(await snapshot(page)).data;
  const coverage=await page.evaluate(()=>[...document.querySelectorAll('input[type=date],input[type=month],input[name=usageYear]')].map(i=>({name:i.name||i.id,form:i.form?.id,linked:!!i.getAttribute('aria-describedby'),text:document.getElementById(i.getAttribute('aria-describedby'))?.textContent,disabled:i.disabled})));
  assert.equal(coverage.length,26);assert(coverage.every(x=>x.linked&&x.text));assert.equal(coverage.filter(x=>x.form==='mortalityForm'&&x.name==='deathMonth').length,1);record.dateInputs=coverage.length;
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});
   for(const tab of ['salary','nisa','ideco','retirement','pension','unemployment','events']){await openTab(page,tab);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  }
  await openTab(page,'salary');
  const optionalLabor=page.locator('#salary details.salary-optional-labor');
  if(!await optionalLabor.evaluate(n=>n.open))await optionalLabor.locator('summary').click();
  const f=page.locator('#detail-laborSpouseSide form');
  await f.locator('[name=endDate]').fill('2057-02-01');
  assert.match(await f.locator('[name=endDate]').locator('..').locator('.date-age-hint').innerText(),/配偶者.*収入の最終月：2057年1月/);
  await f.locator('[data-reset]').click();assert.deepEqual((await snapshot(page)).data,before);
  await openTab(page,'ideco');const basic=page.locator('#detail-ideco form'),withdraw=page.locator('#detail-idecoWithdrawal form');
  await page.locator('#ideco details').filter({has:basic}).locator('summary').click();
  await basic.locator('[name=currentBalance]').fill('101');
  await withdraw.locator('[name=receiptMode]').selectOption('annuity');await withdraw.locator('[name=annuityYears]').fill('10');
  await withdraw.locator('[type=submit]').click();await page.locator('#detail-idecoWithdrawal [data-apply]').click();
  assert.equal(await basic.locator('[name=currentBalance]').inputValue(),'101');assert(await page.locator('#detail-ideco [role=alert]').isVisible());
  await basic.locator('[type=submit]').click();assert(await page.locator('#detail-ideco .detail-preview').isHidden());
  const adopted=(await snapshot(page)).data;assert.equal(adopted.config.ideco.lumpPercent,0);assert.equal(adopted.config.ideco.annuityYears,10);assert.equal(adopted.config.ideco.currentBalance,100);
  await openTab(page,'ideco');await basic.locator('[data-reset]').click();assert.equal(await basic.locator('[name=lumpPercent]').inputValue(),'0');
  // Now the sibling form is untouched: it must refresh after another apply.
  await withdraw.locator('[name=annuityYears]').fill('5');await withdraw.locator('[type=submit]').click();await page.locator('#detail-idecoWithdrawal [data-apply]').click();
  assert.equal(await basic.locator('[name=annuityYears]').inputValue(),'5');assert.equal(await basic.locator('[name=currentBalance]').inputValue(),'100');
  const saved=(await snapshot(page)).data;await page.reload();await page.locator('#dashboard').waitFor({state:'visible'});assert.deepEqual((await snapshot(page)).data,saved);
  assert.deepEqual(errors,[]);record.status='pass';
 }catch(e){record.status='failed-or-harness-error';record.error=e.stack;throw Object.assign(e,{detailRecord:record});}
 finally{await context.close();await fixture.close();}
 return record;
}
