import assert from 'node:assert/strict';
import {runRetirementPlan} from '../../calc.mjs';
export async function validateWithdrawalUi({browser,createTestServer,open,load,openTab,snapshot,here,out,fs,path}){
 const fixture=await createTestServer();fixture.setMode('new');const context=await browser.newContext({acceptDownloads:true});
 const record={id:'W1',scope:'saved overviews, NISA/iDeCo proposal/apply/reset/undo, selected CSV and restart',status:'running'};
 try{
  const data=JSON.parse(await fs.readFile(path.join(here,'synthetic-full.json'),'utf8'));
  data.config.nisa={marketValue:100,usageYear:2044,tsumitateUsed:0,growthUsed:0,lifetimeBookUsed:80};
  data.config.ideco={asOfDate:'2044-01-01',contributionEndDate:'2045-01-01',joinDate:'2010-01-01',lumpDate:'2045-01-01',currentBalance:120,monthlyContribution:0,accumulationReturn:0,lumpPercent:50,annuityPercent:50,annuityYears:10,annuityReturn:0};
  const file=path.join(out,'withdrawal-synthetic.json');await fs.writeFile(file,JSON.stringify(data));
  const page=await open(context,fixture.url),errors=[];page.on('pageerror',e=>errors.push(e.message));await load(page,file);assert.equal(await page.locator('#appVersion').innerText(),'v0.9.7-annual-budget-20261012');const before=await snapshot(page);
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
  assert.equal(await page.locator('#nisaToolRun').count(),0);
  assert.equal(await page.locator('#detail-nisa input').count(),1);
  assert.equal(await page.locator('#detail-nisa input[name=marketValue]').count(),1);
  assert(!/使用枠・簿価|利用枠の確認年/.test(await page.locator('#nisaCurrentSummary').innerText()));
  const month=data.config.plan.startDate.slice(0,7);
  await f.locator('[name=mode]').selectOption('fixed');await f.locator('[name=startMonth]').fill(month);await f.locator('[name=endMonth]').fill(month);await f.locator('[name=monthlyAmount]').fill('10');await f.locator('[type=submit]').click();
  assert(await page.locator('#detail-nisaWithdrawal [data-apply]').isVisible());assert((await page.locator('#nisaCurrentSummary').innerText()).includes('未設定'));assert.deepEqual((await snapshot(page)).data,before.data);
  await openTab(page,'nisa');await f.locator('[name=monthlyAmount]').fill('11');assert(!await page.locator('#detail-nisaWithdrawal .detail-preview').isVisible());await f.locator('[type=submit]').click();await page.locator('#detail-nisaWithdrawal [data-apply]').click();
  const after=await snapshot(page);assert.equal(after.data.config.nisa.withdrawal.monthlyAmount,11);assert.deepEqual(after.home,before.home);assert.deepEqual(after.data.scenarios,before.data.scenarios);
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});await openTab(page,'cashflow');
   for(const mode of ['summary','income','expense']){
    await page.locator('#yearViewMode').selectOption(mode);
    assert((await page.locator('#yearHead').innerText()).includes('NISA取崩額（資金移動）'));
    const budget=await page.locator('#yearRows tr').evaluateAll(rows=>{const heads=[...document.querySelectorAll('#yearHead th')].map(x=>x.textContent);const i=heads.indexOf('管理予算（資産負担分）');if(i<0||heads.filter(x=>x==='管理予算（資産負担分）').length!==1)throw Error('budget column');return rows.map(r=>r.children[i].textContent);});
    const expected=runRetirementPlan(after.data.config,{includeMonthlyDetails:true}).rows.map(r=>r.expense.toLocaleString('ja-JP',{maximumFractionDigits:2}));
    assert.deepEqual(budget,expected);
    const amounts=await page.locator('#yearRows tr').evaluateAll(rows=>rows.map(r=>r.children[r.children.length-2].textContent));
    assert.equal(amounts[0],'11');assert(amounts.slice(1).every(v=>v==='0'));
   }
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.locator('#yearRows').locator('xpath=../..').screenshot({path:path.join(out,'W1-annual-budget-'+width+'.png')});
  }
  assert.deepEqual((await snapshot(page)).data,after.data);
  await openTab(page,'nisa');assert((await page.locator('#nisaCurrentSummary').innerText()).includes('毎月定額'));await page.screenshot({path:path.join(out,'W1-nisa.png'),fullPage:true});
  await openTab(page,'allcsv');assert((await page.locator('#detailCsvTable thead').innerText()).includes('NISA取崩し可能額（参考）'));await page.locator('#detailCsvPeriod').selectOption('annual');
  const pending=page.waitForEvent('download');await page.locator('#downloadDetailedCsv').click();const download=await pending,stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);assert(Buffer.concat(chunks).toString().includes('NISA期末残高（参考）'));
  await openTab(page,'settings');await page.locator('#detailUndo').click();assert.deepEqual((await snapshot(page)).data,before.data);
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});await openTab(page,'budget');
   assert(await page.locator('#budget #expenseSheet').isVisible());assert(await page.locator('#budget #detail-budget').isVisible());
   assert.equal(await page.locator('#expenseKind').inputValue(),'budget');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await openTab(page,'nisa');const auto=page.locator('#detail-nisaWithdrawal form');
  await auto.locator('[name=mode]').selectOption('budget');
  assert.equal(await auto.locator('[name=startMonth]').inputValue(),month);
  assert((await auto.locator('[name=endMonth]').inputValue())>=month);
  assert(!await auto.locator('[name=monthlyAmount]').isVisible());
  await auto.locator('[type=submit]').click();assert(await page.locator('#detail-nisaWithdrawal [data-apply]').isVisible());
  assert.deepEqual((await snapshot(page)).data,before.data);await openTab(page,'nisa');
  await page.locator('#detail-nisaWithdrawal [data-apply]').click();
  const autoSaved=await snapshot(page);assert.equal(autoSaved.data.config.nisa.withdrawal.mode,'budget');assert.deepEqual(autoSaved.home,before.home);
  await page.reload();await page.locator('#dashboard').waitFor({state:'visible'});assert.deepEqual((await snapshot(page)).data,autoSaved.data);
  // Reload clears undo, so restore the same isolated synthetic fixture for subsequent cases.
  await load(page,file);assert.deepEqual((await snapshot(page)).data,before.data);
  await openTab(page,'ideco');const i=page.locator('#detail-idecoWithdrawal form');await i.locator('[name=receiptMode]').selectOption('annuity');await i.locator('[name=annuityYears]').fill('10');await i.locator('[name=annuityReturn]').fill('0');await i.locator('[type=submit]').click();assert(await page.locator('#detail-idecoWithdrawal [data-apply]').isVisible());assert.deepEqual((await snapshot(page)).data,before.data);
  await openTab(page,'ideco');await page.locator('#detail-idecoWithdrawal [data-apply]').click();const receipt=await snapshot(page);assert.equal(receipt.data.config.ideco.lumpPercent,0);assert.equal(receipt.data.config.ideco.annuityPercent,100);assert.equal(receipt.data.config.ideco.annuityYears,10);assert.deepEqual(receipt.data.scenarios,before.data.scenarios);
  await openTab(page,'ideco');assert((await page.locator('#idecoCurrentSummary').innerText()).includes('全額を年金'));await page.screenshot({path:path.join(out,'W1-ideco.png'),fullPage:true});
  await openTab(page,'settings');await page.locator('#detailUndo').click();assert.deepEqual((await snapshot(page)).data,before.data);
  await openTab(page,'nisa');const nf=page.locator('#detail-nisaWithdrawal form');await nf.locator('[name=mode]').selectOption('all');await nf.locator('[name=startMonth]').fill(month);await nf.locator('[type=submit]').click();await page.locator('#detail-nisaWithdrawal [data-apply]').click();const saved=await snapshot(page);
  await page.reload();await page.locator('#dashboard').waitFor({state:'visible'});assert.deepEqual((await snapshot(page)).data,saved.data);assert.deepEqual(errors,[]);
  const goalBefore=await snapshot(page);
  await openTab(page,'settings');const g=page.locator('#detail-goal form');
  await g.locator('[name=amount]').fill('4321');await g.locator('[type=submit]').click();
  assert.deepEqual((await snapshot(page)).data,goalBefore.data);
  await page.locator('#detail-goal [data-apply]').click();
  const goalAfter=await snapshot(page);assert.equal(goalAfter.data.config.management.thresholds[goalAfter.data.config.plan.endAge],4321);
  assert.equal(goalAfter.home.finalAsset,goalBefore.home.finalAsset);assert.deepEqual(goalAfter.data.scenarios,goalBefore.data.scenarios);
  await openTab(page,'home');
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   for(const id of ['status','finalAsset','finalThreshold','finalMargin'])assert(await page.locator('.target-overview #'+id).isVisible());
  }
  const colors=await page.evaluate(()=>({legend:getComputedStyle(document.querySelector('.legend-target')).borderTopColor,line:getComputedStyle(document.querySelector('.target-line')).stroke,style:getComputedStyle(document.querySelector('.legend-target')).borderTopStyle}));
  assert.equal(colors.legend,colors.line);assert.equal(colors.style,'dashed');
  assert.equal(await page.locator('#home #factorSummary').count(),0);
  await openTab(page,'settings');await page.locator('#detailUndo').click();
  assert.deepEqual((await snapshot(page)).data,goalBefore.data);
  await g.locator('[name=amount]').fill('4321');await g.locator('[type=submit]').click();await page.locator('#detail-goal [data-apply]').click();
  await page.reload();await page.locator('#dashboard').waitFor({state:'visible'});
  assert.equal((await snapshot(page)).data.config.management.thresholds[goalAfter.data.config.plan.endAge],4321);
  assert.deepEqual(errors,[]);record.status='pass';
 }catch(e){record.status='failed-or-harness-error';record.error=e.stack;throw Object.assign(e,{detailRecord:record});}
 finally{await context.close();await fixture.close();}
 return record;
}
