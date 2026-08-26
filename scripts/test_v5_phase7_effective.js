#!/usr/bin/env node
"use strict";
const assert=require('node:assert/strict'),path=require('node:path');
global.DietCalendarCore=require(path.resolve(__dirname,'../static/assets/js/calendar-core.js'));
require(path.resolve(__dirname,'../static/assets/js/v5-composer-core.js'));
const eff=require(path.resolve(__dirname,'../static/assets/js/v5-effective-core.js'));
const recipes=[
 {id:'base:recipe:a',title:'Pasta prova',origin:'base',currentVersionId:'v:a',archivedAt:null},
 {id:'usr:recipe:b',title:'Snack personale',origin:'personal',currentVersionId:'v:b',archivedAt:null},
];
const versions=[
 {id:'v:a',recipeId:'base:recipe:a',servings:2,calculatedNutrition:{energyKcal:400,proteinG:20,carbohydrateG:60,fatG:8,fiberG:5},ingredientLines:[{ingredientId:'base:ingredient:pasta',ingredientRevisionId:'ir:pasta',baseQuantity:200,baseUnit:'g'}],metadata:{prepMinutes:20,mealPrep:{prepareAhead:true,coldSuitable:false,reheatable:true,fridgeHours:24},cuisine:'Italiana'}},
 {id:'v:b',recipeId:'usr:recipe:b',servings:1,calculatedNutrition:{energyKcal:180,proteinG:8,carbohydrateG:25,fatG:5,fiberG:3},ingredientLines:[{ingredientId:'usr:ingredient:yogurt',ingredientRevisionId:'ir:yogurt',baseQuantity:125,baseUnit:'g'}],metadata:{prepMinutes:3,mealPrep:{prepareAhead:true,coldSuitable:true,reheatable:false,fridgeHours:24},cuisine:'Personale'}},
];
const ingredients=[
 {id:'base:ingredient:pasta',name:'pasta',category:'cereali-pane-e-derivati',origin:'base'},
 {id:'usr:ingredient:yogurt',name:'yogurt personale',category:'latticini-e-uova',origin:'personal',aliases:['vasetto']},
];
const revisions=[{id:'ir:pasta',ingredientId:'base:ingredient:pasta',basis:{unit:'g'}},{id:'ir:yogurt',ingredientId:'usr:ingredient:yogurt',basis:{unit:'g'}}];
const maps=eff.maps({recipes,versions,ingredients,revisions});
const plan={id:'usr:plan:test',startDate:'2026-09-01'};
const days=[
 {id:'d1',date:'2026-09-01',dayType:'D2',source:'personal',adherenceStatus:'planned',shift:{name:'Notte',startTime:'20:00',endTime:'08:00',endDayOffset:1},meals:[
  {id:'m1',time:'21:00',dayOffset:0,mealType:'Cena',recipeId:'base:recipe:a',recipeVersionId:'v:a',portionMultiplier:1.5,status:'replaced'},
  {id:'m2',time:'03:30',dayOffset:1,mealType:'Spuntino notturno',recipeId:'usr:recipe:b',recipeVersionId:'v:b',portionMultiplier:1,status:'planned'}]},
 {id:'d2',date:'2026-09-02',dayType:'CUSTOM',source:'replaced',adherenceStatus:'partial',shift:{name:'Extra',startTime:'10:00',endTime:'22:00',endDayOffset:0},meals:[
  {id:'m3',time:'16:00',dayOffset:0,mealType:'Spuntino',recipeId:'usr:recipe:b',recipeVersionId:'v:b',portionMultiplier:2,status:'planned'}]},
];
assert.equal(eff.eventsOnDate(days,maps,'2026-09-02').length,2);
assert.equal(eff.eventsOnDate(days,maps,'2026-09-02')[0].sourceDate,'2026-09-01');
const summary=eff.daySummary(days[0],maps);assert.equal(Math.round(summary.total.energyKcal),780); // 400*1.5 + 180
const prep=eff.prepItems(days,maps,'2026-09-01',12*60,48);assert.equal(prep.length,3);assert.equal(prep.filter(x=>x.windowSegment==='second').length,1);
const shop=eff.aggregateShopping(days,maps,'2026-09-02','2026-09-02',{pasta:{rounding_step:50,category:'Cereali, pane e derivati',note:'test'}});
assert.equal(shop.mealCount,2);assert.equal(shop.unresolvedMeals,0);
const yogurt=shop.items.find(x=>x.name==='yogurt personale');assert.ok(yogurt);assert.equal(yogurt.exact,375); // 125 tail + 250 same day
assert.equal(yogurt.suggested,375); // personal ingredient, no rule
const ics=eff.buildIcs(plan,days,maps,'2026-09-01','2026-09-02',true,new Date('2026-08-26T16:00:00Z'));
assert.ok(ics.includes('TataDiet D2'));assert.ok(ics.includes('TataDiet CUSTOM'));assert.ok(ics.includes('meal prep'));assert.ok(ics.includes('\r\n'));
const maxLine=Math.max(...ics.split('\r\n').map(x=>new TextEncoder().encode(x).length));assert.ok(maxLine<=75,maxLine);
const search=eff.personalSearchEntries({recipes,ingredients,days},maps,'2026-09-01');assert.ok(search.some(x=>x.title==='Snack personale'));assert.ok(search.some(x=>x.title==='yogurt personale'));assert.ok(search.some(x=>x.type==='day'));
console.log(JSON.stringify({status:'ok',checkpoint:'5.0.0-alpha.7-phase7',checks:{civil_tail:true,effective_nutrition:true,prep_48h:true,shopping_from_recipe_versions:true,personal_ingredient_exact:true,ics_effective:true,ics_folded:true,personal_search:true}},null,2));
