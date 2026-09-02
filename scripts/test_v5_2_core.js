#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=f=>path.resolve(__dirname,'../static/assets/js',f);
global.DietCalendarCore=require(root('calendar-core.js'));
global.TataDietDayTypes=require(root('v5-day-types.js'));
global.TataDietFoodPreferences=require(root('v5-preferences-core.js'));
global.TataDietComposerCore=require(root('v5-composer-core.js'));
const planning=require(root('v5-planning-core.js'));
const composer=global.TataDietComposerCore,prefs=global.TataDietFoodPreferences,cal=global.DietCalendarCore;
const ingredients=[{id:'i:egg',name:'Uovo intero'},{id:'i:oats',name:'Avena'},{id:'i:fish',name:'Salmone'}];
const recipes=[
 {id:'r:egg',title:'Toast con uovo',origin:'base',currentVersionId:'v:egg',archivedAt:null,mealTypes:['Colazione']},
 {id:'r:plain',title:'Porridge di avena',origin:'base',currentVersionId:'v:plain',archivedAt:null,mealTypes:['Colazione']},
 {id:'r:target',title:'Porridge personale',origin:'personal',currentVersionId:'v:target',archivedAt:null,mealTypes:['Colazione']},
 {id:'r:fish',title:'Toast salmone',origin:'base',currentVersionId:'v:fish',archivedAt:null,mealTypes:['Colazione']},
];
const versions=[
 {id:'v:egg',recipeId:'r:egg',ingredientLines:[{ingredientId:'i:egg'}],metadata:{mealTypes:['Colazione'],prepMinutes:5,mealPrep:{coldSuitable:true}},calculatedNutrition:{energyKcal:300,proteinG:20,carbohydrateG:30,fatG:10,fiberG:3}},
 {id:'v:plain',recipeId:'r:plain',ingredientLines:[{ingredientId:'i:oats'}],metadata:{mealTypes:['Colazione'],prepMinutes:5,mealPrep:{coldSuitable:true}},calculatedNutrition:{energyKcal:305,proteinG:19,carbohydrateG:32,fatG:9,fiberG:4}},
 {id:'v:target',recipeId:'r:target',ingredientLines:[{ingredientId:'i:oats'}],metadata:{mealTypes:['Colazione'],prepMinutes:6,mealPrep:{coldSuitable:true}},calculatedNutrition:{energyKcal:310,proteinG:21,carbohydrateG:31,fatG:9,fiberG:4}},
 {id:'v:fish',recipeId:'r:fish',ingredientLines:[{ingredientId:'i:fish'}],metadata:{mealTypes:['Colazione'],prepMinutes:6,mealPrep:{coldSuitable:true}},calculatedNutrition:{energyKcal:315,proteinG:22,carbohydrateG:29,fatG:10,fiberG:3}},
];
const catalog=composer.makeCatalog(recipes,versions,ingredients),map=composer.catalogMap(catalog);
const days=Array.from({length:7},(_,i)=>({id:`d${i+1}`,planInstanceId:'p',date:cal.addDays('2026-09-07',i),dayType:'D1',shift:{name:'Giornata',capabilities:{reheat:true,refrigeration:true,complexSnack:true}},meals:[{id:`m${i+1}`,time:'06:30',dayOffset:0,mealType:'Colazione',recipeId:'r:egg',recipeVersionId:'v:egg',portionMultiplier:1,status:'planned',source:'base',locked:i===0}]}));
const pref=prefs.defaults();pref.groups.eggs.level='less';pref.groups.eggs.maxPer7Days=2;
const reb=planning.buildRebalanceProposal(days,catalog,pref,'2026-09-07','2026-09-13');
assert.ok(reb.proposals.length>=4,'riequilibrio insufficiente');
assert.ok(reb.proposals.every(p=>p.mealId!=='m1'),'pasto bloccato modificato');
const applied=planning.applyProposals(days,catalog,reb.proposals);
const eggCount=planning.summaryRange(applied,map,'2026-09-07','2026-09-13').groups.eggs;
assert.ok(eggCount<=2,`uova residue ${eggCount}`);
const kcalDelta=Math.abs(reb.after.average.energyKcal-reb.before.average.energyKcal)/reb.before.average.energyKcal;
assert.ok(kcalDelta<0.05,`scostamento kcal ${kcalDelta}`);
const scheduleDays=days.map((d,i)=>({...d,meals:d.meals.map(m=>({...m,locked:false,recipeId:'r:plain',recipeVersionId:'v:plain'}))}));
const sched=planning.buildRecipeScheduleProposal(scheduleDays,catalog,'v:target','2026-09-07','2026-09-13',3,'fixed-seed',prefs.defaults());
assert.equal(sched.proposals.length,3);
assert.equal(new Set(sched.proposals.map(p=>p.date)).size,3,'date non distinte');
assert.ok(sched.proposals.every(p=>p.newRecipeVersionId==='v:target'));
assert.ok(sched.proposals.every(p=>!String(p.reason||'').includes('NaN')),'reason scheduler contiene NaN');
assert.ok(sched.proposals.every(p=>Math.abs(p.nutritionAfter.energyKcal-p.nutritionBefore.energyKcal)/p.nutritionBefore.energyKcal<0.08));
const scheduled=planning.applyProposals(scheduleDays,catalog,sched.proposals);assert.equal(scheduled.flatMap(d=>d.meals).filter(m=>m.recipeVersionId==='v:target').length,3);
const noFuture=planning.resolveRange(days,'7','2027-01-01');assert.equal(noFuture,null);
console.log(JSON.stringify({status:'ok',version:'5.2.0',checks:{rebalance_limits:true,locked_preserved:true,nutrition_preserved:true,random_schedule_count:true,random_schedule_distinct_dates:true,random_schedule_reason_numeric:true,no_past_range:true},rebalanceProposals:reb.proposals.length,scheduled:sched.proposals.length},null,2));
