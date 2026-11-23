'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const evidence=process.env.EVIDENCE_DIR||path.join(root,'test-evidence');
fs.mkdirSync(evidence,{recursive:true});
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.xml':'application/xml; charset=utf-8','.jpg':'image/jpeg','.webp':'image/webp','.avif':'image/avif'};
const server=http.createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
  if(pathname==='/favicon.ico'){response.writeHead(204);return response.end()}
  let file=path.join(root,pathname.replace(/^\//,''));
  if(pathname.endsWith('/'))file=path.join(file,'index.html');
  if(!path.extname(file))file=path.join(file,'index.html');
  if(!file.startsWith(root)||!fs.existsSync(file)){response.writeHead(404);return response.end('Not found')}
  response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(response);
});
async function warmImages(page){await page.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=700){window.scrollTo(0,y);await new Promise(resolve=>setTimeout(resolve,20))}window.scrollTo(0,0);const images=Promise.all([...document.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true})})));await Promise.race([images,new Promise(resolve=>setTimeout(resolve,2500))])})}

async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||chromium.executablePath()});
  const errors=[];
  try{
    const beforeDesktop=await browser.newPage({viewport:{width:1440,height:1000}});await beforeDesktop.goto('https://sgshipping.com.cn/',{waitUntil:'networkidle',timeout:60000});await warmImages(beforeDesktop);await beforeDesktop.screenshot({path:path.join(evidence,'before-home-1440.png'),fullPage:true});await beforeDesktop.close();
    const beforeMobile=await browser.newPage({viewport:{width:390,height:844}});await beforeMobile.goto('https://sgshipping.com.cn/',{waitUntil:'networkidle',timeout:60000});await warmImages(beforeMobile);await beforeMobile.screenshot({path:path.join(evidence,'before-home-390.png'),fullPage:true});await beforeMobile.close();
    for(const width of [320,390,768,1440]){
      const page=await browser.newPage({viewport:{width,height:width<500?844:1000}});
      page.on('console',msg=>{if(msg.type()==='error')errors.push(`${width}px console: ${msg.text()}`)});page.on('pageerror',err=>errors.push(`${width}px page: ${err.message}`));
      for(const route of ['/','/shipping-rates/','/shipping-calculator/']){
        await page.goto(base+route,{waitUntil:'networkidle'});
        const overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
        assert.ok(overflow.scroll<=overflow.client,`${route} overflows at ${width}px: ${JSON.stringify(overflow)}`);
      }
      await page.close();
    }
    const desktop=await browser.newPage({viewport:{width:1440,height:1000}});
    await desktop.goto(base+'/',{waitUntil:'networkidle'});await warmImages(desktop);await desktop.screenshot({path:path.join(evidence,'after-home-1440.png'),fullPage:true});
    await desktop.goto(base+'/shipping-rates/',{waitUntil:'networkidle'});await desktop.screenshot({path:path.join(evidence,'shipping-rates-1440.png'),fullPage:true});
    await desktop.goto(base+'/shipping-calculator/',{waitUntil:'networkidle'});await desktop.screenshot({path:path.join(evidence,'shipping-calculator-1440.png'),fullPage:true});
    const mobile=await browser.newPage({viewport:{width:390,height:844}});
    await mobile.goto(base+'/',{waitUntil:'networkidle'});await warmImages(mobile);await mobile.screenshot({path:path.join(evidence,'after-home-390.png'),fullPage:true});
    await mobile.goto(base+'/shipping-rates/',{waitUntil:'networkidle'});await mobile.screenshot({path:path.join(evidence,'shipping-rates-390.png'),fullPage:true});
    await mobile.goto(base+'/shipping-calculator/',{waitUntil:'networkidle'});await mobile.screenshot({path:path.join(evidence,'shipping-calculator-390.png'),fullPage:true});

    const page=desktop;await page.goto(base+'/shipping-calculator/',{waitUntil:'networkidle'});
    await page.locator('[data-field="length"]').fill('15');await page.locator('[data-field="width"]').fill('100');await page.locator('[data-field="height"]').fill('100');await page.locator('[data-field="weight"]').fill('10');await page.locator('button[type="submit"]').click();
    assert.equal(await page.locator('#resultChargeableVolume').textContent(),'0.2 CBM');assert.equal(await page.locator('#resultTotal').textContent(),'S$50.00');
    const href=await page.locator('#calculatorWhatsApp').getAttribute('href');assert.match(href,/^https:\/\/wa\.me\/8613250506198\?text=/);const message=decodeURIComponent(href.split('?text=')[1]);assert.match(message,/Reference freight: S\$50\.00/);assert.match(message,/15 × 100 × 100 CM/);
    await page.locator('#addPackage').click();assert.equal(await page.locator('.package-row').count(),2);await page.locator('.package-row').nth(1).locator('[data-field="length"]').fill('1');await page.locator('.package-row').nth(1).locator('[data-field="unit"]').selectOption('m');await page.locator('.package-row').nth(1).locator('[data-field="width"]').fill('.5');await page.locator('.package-row').nth(1).locator('[data-field="height"]').fill('.2');await page.locator('.package-row').nth(1).locator('[data-field="weight"]').fill('12');await page.locator('button[type="submit"]').click();assert.equal(await page.locator('#resultPackages').textContent(),'2');
    await page.locator('.package-row').first().locator('[data-field="length"]').fill('0');await page.locator('button[type="submit"]').click();assert.ok(await page.locator('#calculatorError').isVisible());
    await page.locator('#langBtn').click();assert.match(await page.locator('h1').textContent(),/中国至新加坡/);await page.locator('#addPackage').click();assert.match(await page.locator('.package-title').last().textContent(),/包裹组/);
    assert.deepEqual(errors,[],'browser console/page errors');
    console.log(`Passed browser QA at 320, 390, 768 and 1440px; created 8 evidence screenshots in ${evidence}.`);
  }finally{await browser.close();server.close()}
}
run().catch(error=>{console.error(error);server.close();process.exitCode=1});
