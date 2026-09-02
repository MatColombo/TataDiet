#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const root=f=>path.resolve(__dirname,'../static/assets/js',f);
global.DietCalendarCore=require(root('calendar-core.js'));
global.TataDietDayTypes=require(root('v5-day-types.js'));
global.TataDietFoodPreferences=require(root('v5-preferences-core.js'));
const plan=require(root('v5-plan-core.js'));
const composer=require(root('v5-composer-core.js'));
const types=global.TataDietDayTypes,prefs=global.TataDietFoodPreferences,cal=global.DietCalendarCore;

assert.equal(types.label('D1'),'Giornata'); assert.equal(types.short('D1'),'G');
assert.equal(types.label('D2'),'Notte'); assert.equal(types.short('D2'),'N');
assert.equal(types.label('D3'),'Smonto'); assert.equal(types.short('D3'),'SN');
assert.equal(types.label('D4'),'Riposo 1'); assert.equal(types.short('D4'),'R1');
assert.equal(types.label('D5'),'Riposo 2'); assert.equal(types.short('D5'),'R2');
assert.equal(types.label('M'),'Mattino'); assert.equal(types.short('M'),'M');
assert.equal(types.label('P'),'Pomeriggio'); assert.equal(types.short('P'),'P');
assert.equal(types.dietaryProfile('M'),'D1'); assert.equal(types.dietaryProfile('P'),'D1');
assert.ok(plan.DAY_TYPES.includes('M')&&plan.DAY_TYPES.includes('P'));
assert.equal(plan.defaultShift('M').name,'Mattino'); assert.equal(plan.defaultShift('M').startTime,null);
assert.equal(plan.defaultShift('P').name,'Pomeriggio'); assert.equal(plan.defaultShift('P').startTime,null);
assert.deepEqual(composer.slotTemplates({dayType:'M'}).map(x=>[x.time,x.mealType]),composer.slotTemplates({dayType:'D1'}).map(x=>[x.time,x.mealType]));
assert.deepEqual(composer.slotTemplates({dayType:'P'}).map(x=>[x.time,x.mealType]),composer.slotTemplates({dayType:'D1'}).map(x=>[x.time,x.mealType]));
assert.equal(composer.daySummary({dayType:'M',meals:[]},new Map()).referenceKcal,composer.REFERENCE_KCAL.D1);
assert.equal(composer.daySummary({dayType:'P',meals:[]},new Map()).referenceKcal,composer.REFERENCE_KCAL.D1);

const ingredients=[
 {id:'i:egg',name:'Uovo intero'},
 {id:'i:yog',name:'Yogurt greco'},
 {id:'i:cheese',name:'Mozzarella'},
 {id:'i:oats',name:'Fiocchi di avena'},
 {id:'i:primo',name:'Formaggio primosale'},
 {id:'i:coconut',name:'Latte di cocco light'},
];
const recipes=[
 {id:'r:egg',title:'Colazione salata',origin:'base',currentVersionId:'v:egg',archivedAt:null,mealTypes:['Colazione']},
 {id:'r:yog',title:'Coppa fresca',origin:'base',currentVersionId:'v:yog',archivedAt:null,mealTypes:['Colazione']},
 {id:'r:plain',title:'Porridge semplice',origin:'base',currentVersionId:'v:plain',archivedAt:null,mealTypes:['Colazione']},
 {id:'r:cheese',title:'Piatto mediterraneo',origin:'base',currentVersionId:'v:cheese',archivedAt:null,mealTypes:['Pranzo']},
 {id:'r:primo',title:'Wrap mediterraneo',origin:'base',currentVersionId:'v:primo',archivedAt:null,mealTypes:['Pranzo']},
 {id:'r:coconut',title:'Curry leggero',origin:'base',currentVersionId:'v:coconut',archivedAt:null,mealTypes:['Pranzo']},
];
const n={energyKcal:300,proteinG:20,carbohydrateG:30,fatG:10,fiberG:4};
const versions=[
 {id:'v:egg',recipeId:'r:egg',ingredientLines:[{ingredientId:'i:egg'}],metadata:{mealTypes:['Colazione'],prepMinutes:5},calculatedNutrition:n},
 {id:'v:yog',recipeId:'r:yog',ingredientLines:[{ingredientId:'i:yog'}],metadata:{mealTypes:['Colazione'],prepMinutes:5},calculatedNutrition:n},
 {id:'v:plain',recipeId:'r:plain',ingredientLines:[{ingredientId:'i:oats'}],metadata:{mealTypes:['Colazione'],prepMinutes:5},calculatedNutrition:n},
 {id:'v:cheese',recipeId:'r:cheese',ingredientLines:[{ingredientId:'i:cheese'}],metadata:{mealTypes:['Pranzo'],prepMinutes:5},calculatedNutrition:n},
 {id:'v:primo',recipeId:'r:primo',ingredientLines:[{ingredientId:'i:primo'}],metadata:{mealTypes:['Pranzo'],prepMinutes:5},calculatedNutrition:n},
 {id:'v:coconut',recipeId:'r:coconut',ingredientLines:[{ingredientId:'i:coconut'}],metadata:{mealTypes:['Pranzo'],prepMinutes:5},calculatedNutrition:n},
];
const catalog=composer.makeCatalog(recipes,versions,ingredients),map=composer.catalogMap(catalog);
assert.deepEqual(map.get('v:egg').foodGroups,['eggs']);
assert.deepEqual(map.get('v:yog').foodGroups,['milkYogurt']);
assert.deepEqual(map.get('v:cheese').foodGroups,['cheese']);
assert.deepEqual(map.get('v:primo').foodGroups,['cheese']);
assert.deepEqual(map.get('v:coconut').foodGroups,[]);
assert.deepEqual(map.get('v:plain').foodGroups,[]);

const around=[
 {date:'2026-09-01',meals:[{recipeVersionId:'v:egg'},{recipeVersionId:'v:egg'},{recipeVersionId:'v:yog'}]},
 {date:'2026-09-02',meals:[{recipeVersionId:'v:cheese'}]},
 {date:'2026-09-03',meals:[]},
];
const counts=prefs.occurrenceCounts(around,'2026-09-03',map,cal);
assert.equal(counts.eggs,2); // occasioni = pasti, non giorni
assert.equal(counts.milkYogurt,1); assert.equal(counts.cheese,1);
const cfg=prefs.defaults(); cfg.groups.eggs.level='less'; cfg.groups.eggs.maxPer7Days=2;
const adj=prefs.scoreAdjustment(map.get('v:egg'),cfg,counts);
assert.equal(adj.avoidAutomatic,true); assert.ok(adj.score<-500);
const never=prefs.defaults(); never.groups.eggs.level='never';
const ranked=composer.suggestRecipes(catalog,{mealType:'Colazione',shift:{capabilities:{}},preferences:never,groupOccurrences:{}},10);
assert.equal(ranked.find(x=>x.version.id==='v:egg').match.avoidAutomatic,true);
const day={id:'d',date:'2026-09-03',dayType:'M',shift:plan.defaultShift('M'),meals:[]};
const proposed=composer.suggestedMenu(day,catalog,around,{preferences:never,forceSlots:true});
assert.ok(proposed.items.length>0); assert.ok(proposed.items.every(x=>!x.entry.foodGroups.includes('eggs')));

console.log(JSON.stringify({status:'ok',version:'5.1.0',checks:{day_labels:true,new_day_types:true,morning_afternoon_profile:true,ingredient_name_classification:true,meal_occurrence_counts:true,preference_limits:true,manual_only_never:true}},null,2));
