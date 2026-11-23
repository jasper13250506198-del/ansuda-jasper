'use strict';
const assert=require('node:assert/strict');
const rates=require('../assets/shipping-calculator.js');

const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,`${message||'value'}: expected ${expected}, received ${actual}`);
const bulkyFromCbm=cbm=>rates.calculate('bulky',[{length:cbm*100,width:100,height:100,unit:'cm',weight:1,quantity:1}]);
const smallFromKg=kg=>rates.calculate('small',[{length:1,width:1,height:1,unit:'cm',weight:kg,quantity:1}],{confirmedChargeableWeight:kg});
const airFromKg=kg=>{const quantity=Math.ceil(kg/30);return rates.calculate('air',[{length:1,width:1,height:1,unit:'cm',weight:kg/quantity,quantity}])};

const bulkyCases=[[.05,40,.1],[.1,40,.1],[.15,50,.2],[.45,80,.5],[.8,80,.8],[1,80,1],[1.01,88,1.1],[1.15,96,1.2],[1.3,104,1.3],[2.5,200,2.5]];
for(const[cbm,total,chargeable]of bulkyCases){const result=bulkyFromCbm(cbm);near(result.total,total,`bulky ${cbm} total`);near(result.chargeableVolume,chargeable,`bulky ${cbm} chargeable volume`)}

for(const[kg,total]of[[5,15],[9,22.2],[10,18],[20,36]])near(smallFromKg(kg).total,total,`small ${kg} KG`);

for(const[kg,chargeable,total]of[[1,1,11],[2,2,17],[2.1,3,18],[10,10,60],[11,11,60.5],[50,50,275],[51,51,270.3],[100,100,530],[101,101,515.1]]){const result=airFromKg(kg);near(result.chargeableWeight,chargeable,`air ${kg} chargeable weight`);near(result.total,total,`air ${kg} total`)}

const weightTrigger=rates.calculate('air',[{length:150,width:10,height:10,unit:'cm',weight:30.01,quantity:1}]);
assert.equal(weightTrigger.surcharge,60);assert.equal(weightTrigger.total,weightTrigger.baseFreight+60);
const lengthTrigger=rates.calculate('air',[{length:150.01,width:10,height:10,unit:'cm',weight:1,quantity:1}]);
assert.equal(lengthTrigger.surcharge,60);
const exactLimits=rates.calculate('air',[{length:150,width:10,height:10,unit:'cm',weight:30,quantity:1}]);
assert.equal(exactLimits.surcharge,0);
const multipleTriggers=rates.calculate('air',[{length:151,width:10,height:10,unit:'cm',weight:31,quantity:2},{length:200,width:10,height:10,unit:'cm',weight:40,quantity:3}]);
assert.equal(multipleTriggers.surcharge,60);assert.equal(multipleTriggers.packageCount,5);assert.equal(multipleTriggers.provisional,true);

const metres=rates.calculate('bulky',[{length:1,width:.5,height:.4,unit:'m',weight:20,quantity:2}]);
near(metres.actualVolume,.4,'metre conversion');near(metres.total,70,'metre conversion price');
const mixed=rates.calculate('bulky',[{length:50,width:40,height:30,unit:'cm',weight:8,quantity:2},{length:1,width:.5,height:.2,unit:'m',weight:12,quantity:1}]);
assert.equal(mixed.packageCount,3);near(mixed.actualVolume,.22,'multiple package groups');near(mixed.chargeableVolume,.3,'multiple package rounding');

const provisionalSmall=rates.calculate('small',[{length:60,width:50,height:40,unit:'cm',weight:5.5,quantity:2}]);
assert.equal(provisionalSmall.provisional,true);near(provisionalSmall.chargeableWeight,40,'small parcel volumetric reference');
assert.match(provisionalSmall.notice,/No automatic kilogram rounding/);

assert.throws(()=>rates.calculate('air',[{length:0,width:1,height:1,unit:'cm',weight:1,quantity:1}]),/greater than zero/);
assert.throws(()=>rates.calculate('air',[{length:-1,width:1,height:1,unit:'cm',weight:1,quantity:1}]),/greater than zero/);
assert.throws(()=>rates.calculate('air',[{length:1,width:1,height:1,unit:'cm',weight:1,quantity:1.5}]),/whole number/);
assert.throws(()=>rates.calculate('air',[]),/at least one package/);

const quoteResult=bulkyFromCbm(.15);
const quote=rates.buildQuoteMessage(quoteResult,[{length:15,width:100,height:100,unit:'cm',weight:10,quantity:1}],{cargoType:'Furniture',delivery:'569933'});
assert.match(quote,/Sea Freight – Bulky Cargo/);assert.match(quote,/15 × 100 × 100 CM/);assert.match(quote,/Reference freight: S\$50\.00/);assert.match(quote,/Cargo type: Furniture/);assert.match(quote,/569933/);assert.match(quote,/GST/);
const waUrl='https://wa.me/8613250506198?text='+encodeURIComponent(quote);
assert.match(waUrl,/^https:\/\/wa\.me\/8613250506198\?text=/);assert.equal(decodeURIComponent(waUrl.split('?text=')[1]),quote);

console.log(`Passed ${bulkyCases.length+4+9+14} calculator assertions and scenario groups.`);
