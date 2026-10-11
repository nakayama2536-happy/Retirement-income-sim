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
   for(const id of ['nisa','salary','pension','ideco','retirement','expenses','events','allcsv','rules','settings','cashflow','home']){
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
  await openTab(page,'allcsv');await page.locator('#detailCsvGroup').selectOption('支出内訳');assert((await page.locator('#detailCsvTable').innerText()).includes('架空保険'));
  const pending=page.waitForEvent('download');await page.locator('#downloadDetailedCsv').click();const download=await pending;assert((await download.suggestedFilename()).endsWith('.csv'));
  await page.locator('#makeReviewPrompt').click();assert((await page.locator('#reviewPromptText').inputValue()).includes('架空保険'));
  await openTab(page,'settings');await page.locator('#detailUndo').click();const undone=(await snapshot(page)).data;assert.deepEqual(undone,before);
  await openTab(page,'rules');assert.equal(await page.locator('#rules input,#rules form').count(),0);
  await page.reload();await page.locator('#dashboard').waitFor({state:'visible'});assert.deepEqual((await snapshot(page)).data,before);assert.deepEqual(errors,[]);record.status='pass';
 }catch(e){record.status='failed-or-harness-error';record.error=e.stack;throw Object.assign(e,{detailRecord:record});}
 finally{await context.close();await fixture.close();}
 return record;
}
