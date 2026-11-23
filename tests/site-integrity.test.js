'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.name==='.git'||entry.name==='tests'?[]:entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)])}
const htmlFiles=walk(root).filter(file=>file.endsWith('.html')&&!path.basename(file).startsWith('google'));
assert.equal(htmlFiles.length,8,'expected home, five service pages and two new pages');

for(const file of htmlFiles){
  const html=fs.readFileSync(file,'utf8');
  assert.match(html,/<title>[^<]+<\/title>/,`${file}: title`);
  assert.match(html,/<meta name="description" content="[^"]+">/,`${file}: meta description`);
  assert.match(html,/<link rel="canonical" href="https:\/\/sgshipping\.com\.cn\/[^"]*">/,`${file}: canonical`);
  assert.doesNotMatch(html,/https:\/\/wa\.me\/(?!8613250506198)/,`${file}: unexpected WhatsApp number`);
  for(const match of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)){
    const url=match[1].split(/[?#]/)[0];
    if(url==='/'||url.startsWith('/#'))continue;
    const local=path.join(root,decodeURIComponent(url).replace(/^\//,''));
    const target=path.extname(local)?local:path.join(local,'index.html');
    assert.ok(fs.existsSync(target),`${file}: missing internal target ${url}`);
  }
}

for(const relative of ['shipping-rates/index.html','shipping-calculator/index.html']){
  const html=fs.readFileSync(path.join(root,relative),'utf8');
  assert.equal((html.match(/<h1\b/g)||[]).length,1,`${relative}: exactly one H1`);
  assert.match(html,/data-zh="[^"]+"/,`${relative}: Chinese content`);
}

const rates=fs.readFileSync(path.join(root,'shipping-rates/index.html'),'utf8');
for(const text of ['SGD 40','SGD 50','SGD 60','SGD 70','SGD 80/CBM','SGD 1.80','SGD 11','SGD 17','SGD 6.00/KG','SGD 5.50/KG','SGD 5.30/KG','SGD 5.10/KG','Singapore Import GST','Prohibited &amp; Controlled Goods'])assert.ok(rates.toLowerCase().includes(text.toLowerCase()),`rates page missing ${text}`);
for(const keyword of ['China to Singapore Shipping Rates','Sea Freight Rates China to Singapore','China to Singapore Air Freight Rates'])assert.ok(rates.toLowerCase().includes(keyword.toLowerCase()),`rates page missing keyword ${keyword}`);
const calculator=fs.readFileSync(path.join(root,'shipping-calculator/index.html'),'utf8');
for(const keyword of ['Shipping Cost &amp; CBM Calculator','shipping cost calculator Singapore','CBM calculator'])assert.ok(calculator.toLowerCase().includes(keyword.toLowerCase()),`calculator page missing keyword ${keyword}`);

const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
assert.equal((sitemap.match(/<url>/g)||[]).length,8,'sitemap URL count');
assert.match(sitemap,/shipping-rates\//);assert.match(sitemap,/shipping-calculator\//);
const sea=fs.readFileSync(path.join(root,'sea-freight-china-to-singapore/index.html'),'utf8');
assert.match(sea,/12–15 working days/,'sea freight transit update');
for(const relative of ['index.html','sea-freight-china-to-singapore/index.html','air-freight-china-to-singapore/index.html','furniture-shipping-china-to-singapore/index.html','building-materials-shipping-to-singapore/index.html','machinery-shipping-china-to-singapore/index.html']){
  const html=fs.readFileSync(path.join(root,relative),'utf8');
  assert.match(html,/href="\/shipping-rates\//,`${relative}: rates link`);
  assert.match(html,/href="\/shipping-calculator\//,`${relative}: calculator link`);
}

console.log(`Passed SEO and internal-link checks across ${htmlFiles.length} HTML pages and 8 sitemap URLs.`);
