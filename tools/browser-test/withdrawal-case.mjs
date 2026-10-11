import assert from 'node:assert/strict';
export async function validateWithdrawalUi({browser,createTestServer,open,load,openTab,snapshot,here,out,fs,path}){
 const fixture=await createTestServer();fixture.setMode('new');const context=await browser.newContext({acceptDownloads:true});
 const record={id:'W1',scope:'saved overviews, NISA/iDeCo proposal/apply/reset/undo, selected CSV and restart',status:'running'};
 try{
  const data=JSON.parse(await fs.readFile(path.join(here,'synthetic-full.json'),'utf8'));
  data.config.nisa={marketValue:100,usageYear:2044,tsumitateUsed:0,growthUsed:0,lifetimeBookUsed:80};
  data.config.ideco={asOfDate:'2044-01-01',contributionEndDate:'2045-01-01',joinDate:'2010-01-01',lumpDate:'2045-01-01',currentBalance:120,monthlyContribution:0,accumulationReturn:0,lumpPercent:50,annuityPercent:50,annuityYears:10,annuityReturn:0};
  const file=path.join(out,'withdrawal-synthetic.json');await fs.writeFile(file,JSON.stringify(data));
  const page=await open(context,fixture.url),errors=[];page.on('pageerror',e=>errors.push(e.message));await load(page,file);const before=await snapshot(page);
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});
   for(const id of ['salary','nisa','ideco','pension','retirement','expenses','events','settings']){
    await openTab(page,id);const summary=page.locator('#'+id+'CurrentSummary');assert(await summary.isVisible());assert((await summary.innerText()).includes('現在の設定の概要'));
    assert(await summary.evaluate(node=>{const panel=node.closest('section'),firstForm=panel.querySelector('form');return !firstForm||Boolean(node.compareDocumentPosition(firstForm)&Node.DOCUMENT_POSITION_FOLLOWING);}));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   }
   await openTab(page,'salary');await page.screenshot({path:path.join(out,`W1-overview-${width}.png`),fullPage:true});
  }
  await openTab(page,'nisa');const f=page.locator('#detail-nisaWithdrawal form');
  const month=data.config.plan.startDate.slice(0,7);
  await f.locator('[name=mode]').selectOption('fixed');await f.locator('[name=startMonth]').fill(month);await f.locator('[name=endMonth]').fill(month);await f.locator('[name=monthlyAmount]').fill('10');await f.locator('[type=submit]').click();
  assert(await page.locator('#detail-nisaWithdrawal [data-apply]').isVisible());assert((await page.locator('#nisaCurrentSummary').innerText()).includes('未設定'));assert.deepEqual((await snapshot(page)).data,before.data);
  await openTab(page,'nisa');await f.locator('[name=monthlyAmount]').fill('11');assert(!await page.locator('#detail-nisaWithdrawal .detail-preview').isVisible());await f.locator('[type=submit]').click();await page.locator('#detail-nisaWithdrawal [data-apply]').click();
  const after=await snapshot(page);assert.equal(after.data.config.nisa.withdrawal.monthlyAmount,11);assert.deepEqual(after.home,before.home);assert.deepEqual(after.data.scenarios,before.data.scenarios);
  await openTab(page,'nisa');assert((await page.locator('#nisaCurrentSummary').innerText()).includes('毎月定額'));await page.screenshot({path:path.join(out,'W1-nisa.png'),fullPage:true});
  await openTab(page,'allcsv');assert((await page.locator('#detailCsvTable thead').innerText()).includes('NISA取崩し可能額（参考）'));await page.locator('#detailCsvPeriod').selectOption('annual');
  const pending=page.waitForEvent('download');await page.locator('#downloadDetailedCsv').click();const download=await pending,stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);assert(Buffer.concat(chunks).toString().includes('NISA期末残高（参考）'));
  await openTab(page,'settings');await page.locator('#detailUndo').click();assert.deepEqual((await snapshot(page)).data,before.data);
  await openTab(page,'ideco');const i=page.locator('#detail-idecoWithdrawal form');await i.locator('[name=receiptMode]').selectOption('annuity');await i.locator('[name=annuityYears]').fill('10');await i.locator('[name=annuityReturn]').fill('0');await i.locator('[type=submit]').click();assert(await page.locator('#detail-idecoWithdrawal [data-apply]').isVisible());assert.deepEqual((await snapshot(page)).data,before.data);
  await openTab(page,'ideco');await page.locator('#detail-idecoWithdrawal [data-apply]').click();const receipt=await snapshot(page);assert.equal(receipt.data.config.ideco.lumpPercent,0);assert.equal(receipt.data.config.ideco.annuityPercent,100);assert.equal(receipt.data.config.ideco.annuityYears,10);assert.deepEqual(receipt.data.scenarios,before.data.scenarios);
  await openTab(page,'ideco');assert((await page.locator('#idecoCurrentSummary').innerText()).includes('全額を年金'));await page.screenshot({path:path.join(out,'W1-ideco.png'),fullPage:true});
  await openTab(page,'settings');await page.locator('#detailUndo').click();assert.deepEqual((await snapshot(page)).data,before.data);
  await openTab(page,'nisa');const nf=page.locator('#detail-nisaWithdrawal form');await nf.locator('[name=mode]').selectOption('all');await nf.locator('[name=startMonth]').fill(month);await nf.locator('[type=submit]').click();await page.locator('#detail-nisaWithdrawal [data-apply]').click();const saved=await snapshot(page);
  await page.reload();await page.locator('#dashboard').waitFor({state:'visible'});assert.deepEqual((await snapshot(page)).data,saved.data);assert.deepEqual(errors,[]);record.status='pass';
 }catch(e){record.status='failed-or-harness-error';record.error=e.stack;throw Object.assign(e,{detailRecord:record});}
 finally{await context.close();await fixture.close();}
 return record;
}
