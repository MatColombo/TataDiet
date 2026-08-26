#!/usr/bin/env node
"use strict";
const assert=require('node:assert/strict'),path=require('node:path');
global.DietCalendarCore=require(path.resolve(__dirname,'../static/assets/js/calendar-core.js'));
const core=require(path.resolve(__dirname,'../static/assets/js/v5-composer-core.js'));
const now='2026-08-26T16:00:00.000Z';
const recipes=[
 {id:'base:recipe:cold',title:'Pasta fredda',origin:'base',currentVersionId:'v:cold',archivedAt:null},
 {id:'base:recipe:hot',title:'Pasta calda',origin:'base',currentVersionId:'v:hot',archivedAt:null},
 {id:'usr:recipe:snack',title:'Snack personale',origin:'personal',currentVersionId:'v:snack',archivedAt:null},
];
const versions=[
 {id:'v:cold',recipeId:'base:recipe:cold',nutritionMode:'calculated',calculatedNutrition:{energyKcal:430,proteinG:22,carbohydrateG:55,fatG:12,fiberG:5},metadata:{mealTypes:['Pasto preturno','Pranzo'],cuisine:'Italiana',tags:[],prepMinutes:12,mealPrep:{prepareAhead:true,coldSuitable:true,reheatable:false,fridgeHours:24},spiceLevel:'none'}},
 {id:'v:hot',recipeId:'base:recipe:hot',nutritionMode:'calculated',calculatedNutrition:{energyKcal:440,proteinG:24,carbohydrateG:52,fatG:13,fiberG:6},metadata:{mealTypes:['Pasto preturno','Pranzo'],cuisine:'Italiana',tags:[],prepMinutes:18,mealPrep:{prepareAhead:true,coldSuitable:false,reheatable:true,fridgeHours:24},spiceLevel:'none'}},
 {id:'v:snack',recipeId:'usr:recipe:snack',nutritionMode:'calculated',calculatedNutrition:{energyKcal:180,proteinG:12,carbohydrateG:22,fatG:4,fiberG:3},metadata:{mealTypes:['Spuntino','Spuntino notturno'],cuisine:'Italiana',tags:[],prepMinutes:3,mealPrep:{prepareAhead:true,coldSuitable:true,reheatable:false,fridgeHours:24},spiceLevel:'none'}},
];
const catalog=core.makeCatalog(recipes,versions),map=core.catalogMap(catalog);
assert.equal(core.slotTemplates({dayType:'D1'}).length,5);assert.equal(core.slotTemplates({dayType:'D2'}).length,6);
const custom=core.slotTemplates({dayType:'CUSTOM',shift:{startTime:'20:00',endTime:'08:00',endDayOffset:1}});assert.ok(custom.length>=3);assert.ok(custom.some(s=>s.dayOffset===1));
const ranked=core.suggestRecipes(catalog,{mealType:'Pasto preturno',shift:{capabilities:{reheat:false,refrigeration:true,complexSnack:false}},recentRecipeIds:[]},3);assert.equal(ranked[0].recipe.id,'base:recipe:cold');assert.ok(ranked[0].match.score>ranked.find(x=>x.recipe.id==='base:recipe:hot').match.score);
const repeated=core.compatibilityScore(catalog[0],{mealType:'Pasto preturno',shift:{capabilities:{reheat:false,refrigeration:true,complexSnack:false}},recentRecipeIds:['base:recipe:cold']});assert.ok(repeated.score<ranked[0].match.score);
const day={id:'usr:day:1',date:'2026-09-01',dayType:'D1',shift:{capabilities:{reheat:true,refrigeration:true,complexSnack:true}},meals:[{id:'m1',time:'13:30',dayOffset:0,mealType:'Pranzo',recipeId:'base:recipe:cold',recipeVersionId:'v:cold',portionMultiplier:1.5,status:'planned',source:'base',baseMealRef:'bm1',notes:null,locked:true}]};
let summary=core.daySummary(day,map,1600);assert.equal(Math.round(summary.total.energyKcal),645);assert.equal(Math.round(summary.total.proteinG),33);
const replaced=core.replaceMeal(day,'m1',catalog.find(x=>x.recipe.id==='base:recipe:hot'),1);assert.equal(replaced.meals[0].id,'m1');assert.equal(replaced.meals[0].baseMealRef,'bm1');assert.equal(replaced.meals[0].locked,true);assert.equal(replaced.meals[0].status,'replaced');
const updated=core.updateMeal(replaced,'m1',{portionMultiplier:1.25,time:'14:00',mealType:'Pranzo tardivo'});assert.equal(updated.meals[0].portionMultiplier,1.25);assert.equal(updated.meals[0].time,'14:00');
const added=core.addMeal(updated,{time:'17:30',dayOffset:0,mealType:'Spuntino'},catalog.find(x=>x.recipe.id==='usr:recipe:snack'),1);assert.equal(added.meals.length,2);assert.equal(core.removeMeal(added,added.meals[1].id).meals.length,1);
const suggested=core.suggestedMenu(day,catalog,[day]);assert.equal(suggested.day.meals[0].recipeVersionId,'v:cold');assert.equal(suggested.day.meals[0].locked,true);
const baseDay={meals:[{id:'base:m1',time:'10:30',day_offset:0,meal_type:'Spuntino',recipe_version_id:'v:snack'}]};const copied=core.copyMenuFromTemplate(day,baseDay,map);assert.equal(copied.meals.length,1);assert.equal(copied.meals[0].recipeVersionId,'v:snack');
console.log(JSON.stringify({status:'ok',checkpoint:'5.0.0-alpha.6-phase6',checks:{slot_templates:true,custom_overnight_slots:true,no_reheat_ranking:true,repetition_penalty:true,portion_nutrition:true,replace_preserves_identity:true,meal_edit:true,add_remove:true,locked_menu:true,copy_template:true}},null,2));
