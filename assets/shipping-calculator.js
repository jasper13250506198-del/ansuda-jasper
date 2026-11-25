(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AnsudaRates=api})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  const EPSILON=1e-9;
  const roundMoney=value=>Math.round((value+Number.EPSILON)*100)/100;
  const ceilTenth=value=>Math.ceil(value*10-EPSILON)/10;
  const ceilKg=value=>Math.ceil(value-EPSILON);

  function validatePackages(packages){
    if(!Array.isArray(packages)||packages.length===0)throw new Error('Add at least one package.');
    return packages.map((item,index)=>{
      const unit=item.unit==='m'?'m':'cm';
      const multiplier=unit==='m'?100:1;
      const length=Number(item.length),width=Number(item.width),height=Number(item.height),weight=Number(item.weight),quantity=Number(item.quantity);
      if(![length,width,height,weight,quantity].every(Number.isFinite))throw new Error(`Package ${index+1}: complete every required field.`);
      if(length<=0||width<=0||height<=0||weight<=0)throw new Error(`Package ${index+1}: dimensions and weight must be greater than zero.`);
      if(!Number.isInteger(quantity)||quantity<1||quantity>999)throw new Error(`Package ${index+1}: quantity must be a whole number from 1 to 999.`);
      return{lengthCm:length*multiplier,widthCm:width*multiplier,heightCm:height*multiplier,weightKg:weight,quantity};
    });
  }

  function summarize(packages){
    const normalized=validatePackages(packages);
    return normalized.reduce((total,item)=>{
      const unitVolumeCm3=item.lengthCm*item.widthCm*item.heightCm;
      const volumeCm3=unitVolumeCm3*item.quantity;
      total.packageCount+=item.quantity;
      total.volumeCm3+=volumeCm3;
      total.actualWeight+=item.weightKg*item.quantity;
      total.volumetricWeight+=volumeCm3/6000;
      total.smallParcelWeight+=Math.max(item.weightKg,unitVolumeCm3/6000)*item.quantity;
      total.airlineSurcharge=total.airlineSurcharge||item.weightKg>30+EPSILON||item.lengthCm>150+EPSILON;
      return total;
    },{packageCount:0,volumeCm3:0,actualWeight:0,volumetricWeight:0,smallParcelWeight:0,airlineSurcharge:false,packages:normalized});
  }

  function calculateBulky(summary){
    const actualVolume=summary.volumeCm3/1000000;
    const chargeableVolume=Math.max(.1,ceilTenth(actualVolume));
    let baseFreight;
    if(chargeableVolume<=.1+EPSILON)baseFreight=40;
    else if(chargeableVolume<=.2+EPSILON)baseFreight=50;
    else if(chargeableVolume<=.3+EPSILON)baseFreight=60;
    else if(chargeableVolume<=.4+EPSILON)baseFreight=70;
    else if(chargeableVolume<=1+EPSILON)baseFreight=80;
    else baseFreight=chargeableVolume*80;
    return{mode:'bulky',packageCount:summary.packageCount,actualVolume,chargeableVolume,actualWeight:summary.actualWeight,volumetricWeight:summary.volumetricWeight,chargeableWeight:null,baseFreight:roundMoney(baseFreight),surcharge:0,total:roundMoney(baseFreight),transit:'12–15 working days',provisional:false};
  }

  function calculateSmall(summary){
    const chargeableWeight=ceilKg(summary.smallParcelWeight);
    const surcharge=chargeableWeight<10-EPSILON?6:0;
    const baseFreight=chargeableWeight*1.8;
    return{mode:'small',packageCount:summary.packageCount,actualVolume:summary.volumeCm3/1000000,chargeableVolume:null,actualWeight:summary.actualWeight,volumetricWeight:summary.volumetricWeight,chargeableWeight,baseFreight:roundMoney(baseFreight),surcharge,total:roundMoney(baseFreight+surcharge),transit:'12–15 working days',provisional:false};
  }

  function airRate(weight){
    if(weight<=1)return 11;
    if(weight<=2)return 17;
    if(weight<=10)return weight*6;
    if(weight<=50)return weight*5.5;
    if(weight<=100)return weight*5.3;
    return weight*5.1;
  }

  function calculateAir(summary){
    const chargeableWeight=ceilKg(Math.max(summary.actualWeight,summary.volumetricWeight));
    const baseFreight=airRate(chargeableWeight);
    const surcharge=summary.airlineSurcharge?60:0;
    return{mode:'air',packageCount:summary.packageCount,actualVolume:summary.volumeCm3/1000000,chargeableVolume:null,actualWeight:summary.actualWeight,volumetricWeight:summary.volumetricWeight,chargeableWeight,baseFreight:roundMoney(baseFreight),surcharge,total:roundMoney(baseFreight+surcharge),transit:'3–6 days',provisional:false};
  }

  function calculate(mode,packages){
    const summary=summarize(packages);
    if(mode==='bulky')return calculateBulky(summary);
    if(mode==='small')return calculateSmall(summary);
    if(mode==='air')return calculateAir(summary);
    throw new Error('Select a shipping mode.');
  }

  function buildQuoteMessage(result,packages,extras={}){
    const labels={bulky:'Sea Freight – Bulky Cargo',small:'Sea Freight – Small Parcels',air:'Air Freight'};
    const rules={bulky:'Add all packed volume, then round up to the next 0.1 CBM.',small:'For each package, use the greater of actual and volumetric weight; add all chargeable weights, then round the total up to a whole KG.',air:'Compare total actual weight with total volumetric weight; use the greater total, then round up to a whole KG.'};
    const packageLines=packages.map((item,index)=>`Package group ${index+1}: ${item.length} × ${item.width} × ${item.height} ${String(item.unit||'cm').toUpperCase()}, ${item.weight} KG each, quantity ${item.quantity}`);
    const rows=["Hi Jasper, I'd like to confirm a China-to-Singapore shipping quote.",`Shipping mode: ${labels[result.mode]}`,`Billing rule: ${rules[result.mode]}`,'',...packageLines,'',`Total packages: ${result.packageCount}`,`Actual total volume: ${Number(result.actualVolume).toFixed(4)} CBM`,result.chargeableVolume!==null?`Chargeable volume: ${Number(result.chargeableVolume).toFixed(1)} CBM`:`Volumetric weight: ${Number(result.volumetricWeight).toFixed(2)} KG`,result.chargeableWeight!==null?`Reference chargeable weight: ${Number(result.chargeableWeight).toFixed(2)} KG`:'',`Reference freight: S$${Number(result.total).toFixed(2)} (import GST excluded)`,`Cargo type: ${String(extras.cargoType||'').trim()||'Not provided'}`,`Singapore delivery address / postcode: ${String(extras.delivery||'').trim()||'Not provided'}`,'Please confirm cargo acceptance, final measurements, applicable charges and GST.'];
    return rows.filter(Boolean).join('\n');
  }

  return{calculate,summarize,ceilTenth,ceilKg,airRate,roundMoney,buildQuoteMessage};
});

(function(){
  'use strict';
  if(typeof document==='undefined'||!document.getElementById('shippingCalculator'))return;
  const api=window.AnsudaRates,form=document.getElementById('shippingCalculator'),list=document.getElementById('packageList'),template=document.getElementById('packageTemplate'),mode=document.getElementById('shippingMode'),error=document.getElementById('calculatorError'),quoteLink=document.getElementById('calculatorWhatsApp');
  let currentLang=new URLSearchParams(location.search).get('lang')==='zh'?'zh':'en',lastResult=null;
  const money=value=>`S$${Number(value).toFixed(2)}`;
  const number=(value,digits=2)=>Number(value).toLocaleString('en-SG',{maximumFractionDigits:digits});
  const text={en:{package:'Package group',remove:'Remove',invalid:'Please correct the package information.',notUsed:'Not used',notApplicable:'None',reference:'Reference estimate — final warehouse measurements, cargo acceptance, GST and any confirmed special-service charges prevail.',gst:'Import GST is charged separately.',airline:'This surcharge is charged by the airline, not ANSUDA Logistics.'},zh:{package:'包裹组',remove:'删除',invalid:'请检查并更正包裹资料。',notUsed:'不适用',notApplicable:'无',reference:'此为参考估算；最终以仓库实测、货物审核、GST及经确认的特殊服务费用为准。',gst:'进口 GST 另计。',airline:'此附加费由航空公司收取，并非 ANSUDA Logistics 收取。'}};

  function applyLanguage(lang){
    currentLang=lang;document.documentElement.lang=lang;
    document.querySelectorAll('[data-en][data-zh]').forEach(el=>{el.textContent=el.dataset[lang]});
    document.querySelectorAll('[data-placeholder-en][data-placeholder-zh]').forEach(el=>{el.placeholder=el.dataset['placeholder'+(lang==='en'?'En':'Zh')]});
    const langBtn=document.getElementById('langBtn');if(langBtn)langBtn.textContent=lang==='en'?'中文':'English';
    renumberPackages();if(lastResult)render(lastResult);
  }

  function renumberPackages(){
    [...list.querySelectorAll('.package-row')].forEach((row,index)=>{row.querySelector('.package-title').textContent=`${text[currentLang].package} ${index+1}`;row.querySelector('.remove-package').textContent=text[currentLang].remove;row.querySelector('.remove-package').hidden=list.children.length===1});
  }

  function addPackage(values={}){
    const row=template.content.firstElementChild.cloneNode(true);
    Object.entries(values).forEach(([key,value])=>{const input=row.querySelector(`[data-field="${key}"]`);if(input)input.value=value});
    row.querySelector('.remove-package').addEventListener('click',()=>{row.remove();renumberPackages()});
    list.appendChild(row);row.querySelectorAll('[data-en][data-zh]').forEach(el=>{el.textContent=el.dataset[currentLang]});renumberPackages();
  }

  function packagesFromForm(){
    return[...list.querySelectorAll('.package-row')].map(row=>({length:row.querySelector('[data-field="length"]').value,width:row.querySelector('[data-field="width"]').value,height:row.querySelector('[data-field="height"]').value,unit:row.querySelector('[data-field="unit"]').value,weight:row.querySelector('[data-field="weight"]').value,quantity:row.querySelector('[data-field="quantity"]').value}));
  }

  function setResult(id,value){document.getElementById(id).textContent=value}
  function render(result){
    const t=text[currentLang];lastResult=result;
    setResult('resultPackages',number(result.packageCount,0));setResult('resultActualVolume',`${number(result.actualVolume,4)} CBM`);setResult('resultChargeableVolume',result.chargeableVolume===null?t.notUsed:`${number(result.chargeableVolume,1)} CBM`);setResult('resultActualWeight',`${number(result.actualWeight,2)} KG`);setResult('resultVolumetricWeight',`${number(result.volumetricWeight,2)} KG`);setResult('resultChargeableWeight',result.chargeableWeight===null?t.notUsed:`${number(result.chargeableWeight,2)} KG`);setResult('resultBase',money(result.baseFreight));setResult('resultSurcharge',result.surcharge?money(result.surcharge):t.notApplicable);setResult('resultTotal',money(result.total));setResult('resultTransit',result.transit);
    const status=document.getElementById('resultStatus');status.textContent=result.notice||t.reference;status.classList.toggle('status',Boolean(result.notice));document.getElementById('resultGst').textContent=t.gst;document.getElementById('resultAirline').textContent=result.mode==='air'&&result.surcharge?t.airline:'';
    quoteLink.href=buildWhatsApp(result);quoteLink.setAttribute('aria-disabled','false');
  }

  function buildWhatsApp(result){
    const message=api.buildQuoteMessage(result,packagesFromForm(),{cargoType:document.getElementById('cargoType').value,delivery:document.getElementById('delivery').value});
    return'https://wa.me/8613250506198?text='+encodeURIComponent(message);
  }

  form.addEventListener('submit',event=>{event.preventDefault();error.classList.remove('visible');try{const result=api.calculate(mode.value,packagesFromForm());render(result);document.getElementById('results').scrollIntoView({behavior:'smooth',block:'start'})}catch(err){error.textContent=currentLang==='zh'?`${text.zh.invalid} ${err.message}`:err.message||text.en.invalid;error.classList.add('visible');quoteLink.setAttribute('aria-disabled','true')}});
  document.getElementById('addPackage').addEventListener('click',()=>addPackage());
  const langBtn=document.getElementById('langBtn');if(langBtn)langBtn.addEventListener('click',()=>applyLanguage(currentLang==='en'?'zh':'en'));
  const menu=document.getElementById('menu'),links=document.getElementById('navlinks');if(menu&&links){menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')==='true';menu.setAttribute('aria-expanded',String(!open));menu.textContent=open?'☰':'×';links.classList.toggle('open',!open)});links.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{links.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.textContent='☰'}))}
  document.querySelectorAll('[data-year]').forEach(el=>{el.textContent=new Date().getFullYear()});
  addPackage();applyLanguage(currentLang);
})();
