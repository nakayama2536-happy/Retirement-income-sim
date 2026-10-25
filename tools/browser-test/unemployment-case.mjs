import assert from 'node:assert/strict';
export async function validateUnemploymentUi({browser,createTestServer,open,load,openTab,snapshot,here,out,fs,path}){
 const fixture=await createTestServer();fixture.setMode('new');const context=await browser.newContext({acceptDownloads:true});const record={id:'E1',scope:'unemployment tab, explicit replacement, event, CSV, undo, persistence',status:'running'};
 try{
  const page=await open(context,fixture.url),errors=[];page.on('pageerror',e=>errors.push(e.message));await load(page,path.join(here,'synthetic-full.json'));const before=await snapshot(page);
  await openTab(page,'unemployment');const form=page.locator('#detail-unemployment form');
  for(const width of [390,1280]){await page.setViewportSize({width,height:900});assert(await page.locator('#unemploymentCurrentSummary').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await form.locator('[name=mode]').selectOption('highAge');
  for(const [name,value] of Object.entries({dailyYen:'6000',days:'50',startMonth:'2045-03',endMonth:'2045-03',basis:'架空テスト条件'}))await form.locator(`[name=${name}]`).fill(value);
  await form.locator('[name=amountStatus]').selectOption('estimate');await form.locator('[name=seekingWork]').check();await form.locator('[name=eligibilityChecked]').check();
  await form.locator('[type=submit]').click();assert.deepEqual((await snapshot(page)).data,before.data);
  await openTab(page,'unemployment');await page.locator('#detail-unemployment [data-apply]').click();const adopted=await snapshot(page);assert.equal(adopted.data.config.unemployment.receiptPlan.dailyYen,'6000');assert.deepEqual(adopted.data.scenarios,before.data.scenarios);
  await openTab(page,'home');assert((await page.locator('#timeline').innerText()).includes('高年齢求職者給付金'));
  await openTab(page,'salary');const side=page.locator('#detail-laborPrimarySide');
  assert((await side.locator('.labor-date-recommendation').innerText()).includes('2045年4月'));
  const input=side.locator('[name=monthlyGross]'),old=await input.inputValue();await input.fill('9');
  await side.locator('[data-reset]').click();assert.equal(await side.locator('[name=monthlyGross]').inputValue(),old);
  assert.deepEqual((await snapshot(page)).data,adopted.data);
  // snapshot exports from Settings; return to the editor before interacting.
  await openTab(page,'salary');
  await side.locator('[name=monthlyGross]').fill('9');
  await side.locator('[name=startDate]').fill('2045-04-01');
  await side.locator('[name=endDate]').fill('2056-02-01');
  await side.locator('[type=submit]').click();
  assert(await side.locator('.detail-preview').isVisible());assert((await side.locator('.detail-preview h3').innerText()).includes('まだ反映'));
  assert.equal(await side.locator('[data-apply]').innerText(),'全体シミュレーションに反映');
  assert.deepEqual((await snapshot(page)).data,adopted.data);

  await openTab(page,'settings');await page.locator('#settingsGroup-maintenance').evaluate(el=>el.open=true);await page.locator('#detailUndo').click();assert.deepEqual((await snapshot(page)).data,before.data);
  await openTab(page,'unemployment');await form.locator('[data-reset]').click();await page.locator('#detail-unemployment [name=mode]').selectOption('none');await page.locator('#detail-unemployment [type=submit]').click();await page.locator('#detail-unemployment [data-apply]').click();
  await page.reload();await page.locator('#dashboard').waitFor({state:'visible'});assert.equal((await snapshot(page)).data.config.unemployment.receiptPlan.mode,'none');assert.deepEqual(errors,[]);record.status='pass';
 }catch(e){record.status='failed-or-harness-error';record.error=e.stack;throw Object.assign(e,{detailRecord:record});}finally{await context.close();await fixture.close();}return record;
}
