#!/usr/bin/env node
"use strict";
const assert=require('node:assert/strict'),path=require('node:path');
global.DietCalendarCore=require(path.resolve(__dirname,'../static/assets/js/calendar-core.js'));require(path.resolve(__dirname,'../static/assets/js/v5-composer-core.js'));require(path.resolve(__dirname,'../static/assets/js/v5-effective-core.js'));
const rows={recipes:[{id:'usr:r',title:'R',origin:'personal',currentVersionId:'usr:v'}],recipeVersions:[{id:'usr:v',recipeId:'usr:r',servings:1,calculatedNutrition:{energyKcal:100,proteinG:1,carbohydrateG:1,fatG:1,fiberG:1},ingredientLines:[],metadata:{mealPrep:{prepareAhead:true}}}],ingredients:[],ingredientRevisions:[]};
const db={initialize:async()=>({}),getAll:async n=>rows[n]||[],};
const bundle={plan:{id:'p',startDate:'2026-09-01'},days:[{id:'d',date:'2026-09-01',dayType:'D1',shift:{name:'Giorno',startTime:'08:00',endTime:'20:00',endDayOffset:0},meals:[{id:'m',time:'12:00',dayOffset:0,mealType:'Pranzo',recipeId:'usr:r',recipeVersionId:'usr:v',portionMultiplier:1,status:'planned'}]}]};
const planStore={activeBundle:async()=>bundle};
global.TataDietDB=db;global.TataDietPlanStore=planStore;delete require.cache[require.resolve(path.resolve(__dirname,'../static/assets/js/v5-effective-store.js'))];require(path.resolve(__dirname,'../static/assets/js/v5-effective-store.js'));
(async()=>{const s=global.TataDietEffectiveStore;const c=await s.context('2026-09-01');assert.ok(c);assert.equal(c.days.length,1);assert.equal((await s.eventsOnDate('2026-09-01','2026-09-01')).length,1);assert.equal(await s.context('2026-10-01'),null);const ics=await s.ics('2026-09-01','2026-09-01',false,'2026-09-01');assert.ok(ics.includes('VCALENDAR'));console.log(JSON.stringify({status:'ok',checkpoint:'5.0.0-alpha.7-phase7',checks:{context:true,date_guard:true,events:true,ics:true}},null,2));})().catch(e=>{console.error(e);process.exit(1)});
