'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server=http.createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
  if(pathname==='/favicon.ico'){response.writeHead(204);return response.end()}
  let file=path.join(root,pathname.replace(/^\//,''));
  if(pathname.endsWith('/'))file=path.join(file,'index.html');
  if(!path.extname(file))file=path.join(file,'index.html');
  if(!file.startsWith(root)||!fs.existsSync(file)){response.writeHead(404);return response.end('Not found')}
  response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(response);
});

async function fillGroup(row,values={}){
  const defaults={length:'15',width:'100',height:'100',weight:'10',quantity:'1',unit:'cm'};
  const data={...defaults,...values};
  for(const field of ['length','width','height','weight','quantity'])await row.locator(`[data-field="${field}"]`).fill(data[field]);
  await row.locator('[data-field="unit"]').selectOption(data.unit);
}

async function openCalculated(browser,base){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto(base+'/shipping-calculator/',{waitUntil:'networkidle'});
  await fillGroup(page.locator('.package-row').first());
  await page.locator('button[type="submit"]').click();
  assert.equal(await page.locator('#calculatorWhatsApp').getAttribute('aria-disabled'),'false');
  assert.match(await page.locator('#calculatorWhatsApp').getAttribute('href'),/^https:\/\/wa\.me\/8613250506198\?text=/);
  return page;
}

async function calculatePage(browser,base,mode,groups){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto(base+'/shipping-calculator/',{waitUntil:'networkidle'});
  await page.locator('#shippingMode').selectOption(mode);
  await fillGroup(page.locator('.package-row').first(),groups[0]);
  for(const group of groups.slice(1)){await page.locator('#addPackage').click();await fillGroup(page.locator('.package-row').last(),group)}
  await page.locator('button[type="submit"]').click();
  return page;
}

async function assertDisabled(page,messagePattern){
  const link=page.locator('#calculatorWhatsApp');
  assert.equal(await link.getAttribute('aria-disabled'),'true');
  assert.equal(await link.getAttribute('href'),null);
  assert.equal(await link.getAttribute('tabindex'),'-1');
  assert.equal(await page.locator('#resultTotal').textContent(),'—');
  assert.match(await page.locator('#resultStatus').textContent(),messagePattern);
  const before=page.url();
  await link.click({force:true});
  assert.equal(page.url(),before,'disabled link must not navigate on mouse click');
  await link.evaluate(element=>element.focus());
  await page.keyboard.press('Enter');
  assert.equal(page.url(),before,'disabled link must not navigate on Enter');
  const semantics=await link.evaluate(element=>({href:element.hasAttribute('href'),ariaDisabled:element.getAttribute('aria-disabled'),tabIndex:element.tabIndex}));
  assert.deepEqual(semantics,{href:false,ariaDisabled:'true',tabIndex:-1});
}

async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||chromium.executablePath()});
  let scenarios=0;
  try{
    for(const field of ['length','width','height','weight']){
      const page=await openCalculated(browser,base);await page.locator(`[data-field="${field}"]`).fill(field==='length'?'20':'101');await assertDisabled(page,/Cargo details changed/);await page.close();scenarios++;
    }
    for(const [field,value] of [['quantity','2'],['unit','m']]){
      const page=await openCalculated(browser,base);const control=page.locator(`[data-field="${field}"]`);if(field==='unit')await control.selectOption(value);else await control.fill(value);await assertDisabled(page,/Cargo details changed/);await page.close();scenarios++;
    }
    {
      const page=await openCalculated(browser,base);await page.locator('#shippingMode').selectOption('air');await assertDisabled(page,/Cargo details changed/);await page.close();scenarios++;
    }
    for(const [field,value] of [['cargoType','Furniture'],['delivery','569933']]){
      const page=await openCalculated(browser,base);await page.locator('#'+field).fill(value);await assertDisabled(page,/Cargo details changed/);await page.close();scenarios++;
    }
    {
      const page=await openCalculated(browser,base);await page.locator('#addPackage').click();await assertDisabled(page,/Cargo details changed/);await fillGroup(page.locator('.package-row').nth(1),{length:'20'});await page.locator('button[type="submit"]').click();assert.equal(await page.locator('#calculatorWhatsApp').getAttribute('aria-disabled'),'false');await page.locator('.package-row').nth(1).locator('.remove-package').click();await assertDisabled(page,/Cargo details changed/);await page.close();scenarios+=2;
    }
    {
      const page=await openCalculated(browser,base);await page.locator('[data-field="length"]').fill('1e308');await page.locator('button[type="submit"]').click();await assertDisabled(page,/estimate is unavailable/i);assert.ok(await page.locator('#calculatorError').isVisible());await page.close();scenarios++;
    }
    {
      const page=await openCalculated(browser,base);await page.locator('[data-field="length"]').fill('20');await assertDisabled(page,/Cargo details changed/);await page.locator('button[type="submit"]').click();const href=await page.locator('#calculatorWhatsApp').getAttribute('href');assert.equal(await page.locator('#calculatorWhatsApp').getAttribute('aria-disabled'),'false');assert.match(decodeURIComponent(href),/20 × 100 × 100 CM/);assert.doesNotMatch(decodeURIComponent(href),/15 × 100 × 100 CM/);await page.close();scenarios++;
    }
    {
      const page=await openCalculated(browser,base);const href=await page.locator('#calculatorWhatsApp').getAttribute('href');await page.locator('#langBtn').click();assert.equal(await page.locator('#langBtn').getAttribute('lang'),'en');assert.equal(await page.locator('#calculatorWhatsApp').getAttribute('aria-disabled'),'false');assert.equal(await page.locator('#calculatorWhatsApp').getAttribute('href'),href);await page.locator('[data-field="length"]').fill('20');await assertDisabled(page,/货物资料已修改/);await page.locator('#langBtn').click();assert.equal(await page.locator('#langBtn').getAttribute('lang'),'zh');await assertDisabled(page,/Cargo details changed/);await page.close();scenarios++;
    }
    {
      const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(base+'/shipping-calculator/');await assertDisabled(page,/Complete the form/);await page.close();scenarios++;
    }
    console.log(`Passed ${scenarios} browser state and WhatsApp invalidation regression scenarios.`);

    const billingCases=[
      {mode:'bulky',groups:[{length:'15'}],total:'S$50.00'},
      {mode:'small',groups:[{length:'1',width:'1',height:'1',weight:'12.3'}],total:'S$23.40'},
      {mode:'small',groups:[{length:'1',width:'1',height:'1',weight:'5'}],total:'S$15.00'},
      {mode:'small',groups:[{length:'30',width:'100',height:'10',weight:'10'},{length:'60',width:'100',height:'10',weight:'5'}],total:'S$36.00'},
      {mode:'small',groups:[{length:'1',width:'1',height:'1',weight:'9.1'}],total:'S$18.00'},
      {mode:'air',groups:[{length:'1',width:'1',height:'1',weight:'2.2'},{length:'1',width:'1',height:'1',weight:'3.3'}],total:'S$36.00'},
      {mode:'air',groups:[{length:'30',width:'100',height:'10',weight:'10'},{length:'60',width:'100',height:'10',weight:'5'}],total:'S$82.50'}
    ];
    for(const test of billingCases){const page=await calculatePage(browser,base,test.mode,test.groups);assert.equal(await page.locator('#resultTotal').textContent(),test.total);await page.close()}
    console.log(`Passed ${billingCases.length} page-level billing scenarios.`);

    {
      const page=await calculatePage(browser,base,'bulky',[{length:'20',width:'100',height:'100',weight:'10'}]);
      await page.locator('#cargoType').fill('Furniture');await page.locator('#delivery').fill('569933');await page.locator('button[type="submit"]').click();
      const href=await page.locator('#calculatorWhatsApp').getAttribute('href'),message=decodeURIComponent(href.split('?text=')[1]);
      const checks=[/^https:\/\/wa\.me\/8613250506198\?text=/.test(href),/20 × 100 × 100 CM/.test(message),/Reference freight: S\$50\.00/.test(message),/Cargo type: Furniture/.test(message),/569933/.test(message),/GST/.test(message)&&/Billing rule:/.test(message)];
      assert.deepEqual(checks,[true,true,true,true,true,true]);await page.close();console.log(`Passed ${checks.length} WhatsApp number, data, price, cargo, delivery and disclosure checks.`);
    }
  }finally{await browser.close();server.close()}
}

run().catch(error=>{console.error(error);server.close();process.exitCode=1});
