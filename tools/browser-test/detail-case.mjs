import assert from 'node:assert/strict';
export async function validateDetailUi({browser,createTestServer,open,load,openTab,snapshot,here,out,fs,path}){
 const fixture=await createTestServer();fixture.setMode('new');const context=await browser.newContext({acceptDownloads:true});
 const record={id:'D1',scope:'hierarchical tabs, details preview/apply/undo, CSV, prompt and goal guides',status:'running'};
 try{
  const data=JSON.parse(await fs.readFile(path.join(here,'synthetic-full.json'),'utf8'));
  data.config.expenseDetail={monthlyCategories:[{key:'test-living',label:'架空生活費',amount:2}],travelAnnualBase:0};data.config.cashflow||={};data.config.cashflow.periodOverrides=[];data.config.cashflow.detailSourceProfile='work-v0.9.7';
  const file=path.join(out,'detail-synthetic.json');await fs.writeFile(file,JSON.stringify(data));
  const page=await open(context,fixture.url);const errors=[];page.on('pageerror',e=>errors.push(e.message));await load(page,file);const before=(await snapshot(page)).data;
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});
   for(const id of ['nisa','salary','pension','ideco','retirement','expenses','events','allcsv','review','rules','settings','cashflow','home']){
    await openTab(page,id);assert(await page.locator('#'+id).isVisible());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
   }
   assert.equal(await page.locator('#assetChart .target-point').count(),Object.keys(data.config.management.thresholds).length);
   await openTab(page,'expenses');const f=page.locator('#detail-expense form');
   await f.locator('[name=profile]').selectOption('work-v0.9.7');await f.locator('[name=group]').selectOption('insurance');await f.locator('[name=label]').fill('架空保険');await f.locator('[name=amount]').fill('1');await f.locator('button[type=submit]').click();assert(await page.locator('#detail-expense [data-apply]').isVisible());
   assert.deepEqual((await snapshot(page)).data,before);await openTab(page,'expenses');await f.locator('[data-reset]').click();
   await page.screenshot({path:path.join(out,`D1-expenses-${width}.png`),fullPage:true});
  }
  await openTab(page,'expenses');const f=page.locator('#detail-expense form');await f.locator('[name=profile]').selectOption('work-v0.9.7');await f.locator('[name=group]').selectOption('insurance');await f.locator('[name=label]').fill('架空保険');await f.locator('[name=amount]').fill('1');await f.locator('button[type=submit]').click();await page.locator('#detail-expense [data-apply]').click();
  const after=(await snapshot(page)).data;assert.equal(after.config.expenseDetail.monthlyCategories.at(-1).items[0].label,'架空保険');assert.deepEqual(after.scenarios,before.scenarios);
  await openTab(page,'allcsv');assert((await page.locator('#detailCsvTable').innerText()).includes('架空保険'));
  const pending=page.waitForEvent('download');await page.locator('#downloadDetailedCsv').click();const download=await pending;assert((await download.suggestedFilename()).endsWith('.csv'));
  await openTab(page,'review');await page.locator('#makeReviewPrompt').click();assert((await page.locator('#reviewPromptText').inputValue()).includes('架空保険'));
  await openTab(page,'settings');await page.locator('#detailUndo').click();const undone=(await snapshot(page)).data;assert.deepEqual(undone,before);
  await openTab(page,'rules');assert.equal(await page.locator('#rules input,#rules form').count(),0);
  await page.reload();await page.locator('#dashboard').waitFor({state:'visible'});assert.deepEqual((await snapshot(page)).data,before);assert.deepEqual(errors,[]);record.status='pass';
 }catch(e){record.status='failed-or-harness-error';record.error=e.stack;throw Object.assign(e,{detailRecord:record});}
 finally{await context.close();await fixture.close();}
 return record;
}

export async function validateLaborTrendUi({browser,createTestServer,open,load,openTab,snapshot,here,out,fs,path}){
 const fixture=await createTestServer();fixture.setMode('new');const context=await browser.newContext({acceptDownloads:true});
 const record={id:'L1',scope:'person/job inputs, moved iDeCo draft, sticky navigation, selected wide CSV and annual modes',status:'running'};
 try{
  const data=JSON.parse(await fs.readFile(path.join(here,'synthetic-full.json'),'utf8'));
  const page=await open(context,fixture.url),errors=[];page.on('pageerror',e=>errors.push(e.message));await load(page,path.join(here,'synthetic-full.json'));const before=(await snapshot(page)).data;
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});await openTab(page,'salary');
   for(const id of ['laborPrimaryRegular','laborPrimarySide','laborSpouseRegular','laborSpouseSide'])assert(await page.locator('#detail-'+id+' form').isVisible());
   assert.equal(await page.locator('#salary #salary_receipt_ideco').count(),0);
   await page.evaluate(()=>window.scrollTo(0,800));
   const rect=await page.locator('.navigation-sticky').boundingBox();assert(rect.y>=-1&&rect.y<=1);assert(await page.locator('[data-group="income"]').isVisible());
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:path.join(out,`L1-navigation-${width}.png`)});
  }
  await openTab(page,'ideco');assert(await page.locator('#salary_receipt_ideco').isVisible());
  await page.locator('#salary_receipt_ideco').selectOption('separate');
  assert.deepEqual((await snapshot(page)).data,before);
  await openTab(page,'salary');await page.locator('#salaryReset').click();
  await openTab(page,'allcsv');assert.equal(await page.locator('#detailCsvPeriod').inputValue(),'monthly');
  const rowCount=await page.locator('#detailCsvTable tbody tr').count();assert(rowCount>12);
  assert.equal(await page.locator('#detailCsvIncludeDetails').isChecked(),false);
  const normalHeaders=await page.locator('#detailCsvTable thead').innerText();
  assert(normalHeaders.includes('iDeCo一時金の資産計上額'));assert(normalHeaders.includes('その他の臨時・追加収入'));
  assert(!normalHeaders.includes('一時金・臨時・追加収入'));assert(!normalHeaders.includes('本人の労働収入'));
  const normalCount=await page.locator('[data-column-id]').count();
  await page.locator('#detailCsvIncludeDetails').check();
  assert(await page.locator('[data-column-id]').count()>normalCount);
  assert((await page.locator('#detailCsvTable thead').innerText()).includes('本人の労働収入'));
  const detailPending=page.waitForEvent('download');await page.locator('#downloadDetailedCsv').click();
  const detailDownload=await detailPending,detailChunks=[];for await(const chunk of await detailDownload.createReadStream())detailChunks.push(chunk);
  assert(Buffer.concat(detailChunks).toString().split('\r\n')[0].includes('本人の労働収入'));
  await page.locator('#detailCsvIncludeDetails').uncheck();assert.equal(await page.locator('[data-column-id]').count(),normalCount);
  const normalPending=page.waitForEvent('download');await page.locator('#downloadDetailedCsv').click();
  const normalDownload=await normalPending,normalChunks=[];for await(const chunk of await normalDownload.createReadStream())normalChunks.push(chunk);
  const normalCsv=Buffer.concat(normalChunks).toString();assert(!normalCsv.split('\r\n')[0].includes('本人の労働収入'));assert(normalCsv.includes('iDeCo一時金の資産計上額'));

  // This fixture has only fixed NISA settings, which belong to opt-in details.
  await page.locator('#detailCsvIncludeDetails').check();
  await page.locator('#detailSelectAll').uncheck();assert(await page.locator('#downloadDetailedCsv').isDisabled());
  for(const section of ['NISA','iDeCo']){
   const group=page.locator('#detailColumnPicker details').filter({has:page.locator(`[data-column-section="${section}"]`)});await group.locator('summary').click();await group.locator('[data-column-section]').check();
  }
  const headers=await page.locator('#detailCsvTable thead').innerText();assert(headers.includes('NISA'));assert(headers.includes('iDeCo'));assert(!headers.includes('食費'));
  const pending=page.waitForEvent('download');await page.locator('#downloadDetailedCsv').click();const download=await pending;const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const csv=Buffer.concat(chunks).toString();
  assert(csv.includes('NISA'));assert(csv.includes('iDeCo'));assert(!csv.includes('食費'));assert.equal(csv.split('\r\n').length,rowCount+2);
  assert.equal(await page.locator('#detailCsvIncludeStatus').isChecked(),false);assert(!csv.split('\r\n')[0].includes(' 状態'));
  await page.locator('#detailCsvIncludeStatus').check();
  const statusPending=page.waitForEvent('download');await page.locator('#downloadDetailedCsv').click();const statusDownload=await statusPending;
  const statusChunks=[];for await(const chunk of await statusDownload.createReadStream())statusChunks.push(chunk);
  const statusCsv=Buffer.concat(statusChunks).toString();assert(statusCsv.split('\r\n')[0].includes(' 状態'));assert.equal(statusCsv.split('\r\n').length,csv.split('\r\n').length);
  await page.locator('#detailCsvIncludeStatus').uncheck();
  for(const period of ['annual','calendar']){await page.locator('#detailCsvPeriod').selectOption(period);assert(await page.locator('#detailCsvTable tbody tr').count()<rowCount);assert((await page.locator('#detailCsvTable thead').innerText()).includes('NISA'));}
  await page.screenshot({path:path.join(out,'L1-selected-trend.png')});
  await openTab(page,'review');await page.locator('#makeReviewPrompt').click();assert((await page.locator('#reviewPromptText').inputValue()).includes('保存済み'));
  assert.deepEqual((await snapshot(page)).data,before);
  await openTab(page,'salary');const f=page.locator('#detail-laborSpouseRegular form');
  await f.locator('[name=monthlyGross]').fill('4');await f.locator('[name=startDate]').fill(data.config.plan.startDate);await f.locator('[name=endDate]').fill(`${Number(data.config.plan.startDate.slice(0,4))+1}${data.config.plan.startDate.slice(4)}`);
  if(await f.locator('[name=useIndividualLabor]').count())await f.locator('[name=useIndividualLabor]').check();
  await f.locator('[type=submit]').click();assert(await page.locator('#detail-laborSpouseRegular [data-apply]').isVisible());
  assert.deepEqual((await snapshot(page)).data,before);await openTab(page,'salary');await page.locator('#detail-laborSpouseRegular [data-apply]').click();
  const after=(await snapshot(page)).data;assert.equal(after.config.employment.spouse.regularWork.monthlyGross,4);assert.deepEqual(after.config.employment.primary,before.config.employment.primary);assert.deepEqual(after.scenarios,before.scenarios);
  await openTab(page,'settings');await page.locator('#detailUndo').click();assert.deepEqual((await snapshot(page)).data,before);assert.deepEqual(errors,[]);record.status='pass';
 }catch(e){record.status='failed-or-harness-error';record.error=e.stack;throw Object.assign(e,{detailRecord:record});}
 finally{await context.close();await fixture.close();}
 return record;
}
