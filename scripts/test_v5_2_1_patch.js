#!/usr/bin/env node
"use strict";
const assert=require('node:assert/strict'),path=require('node:path');
global.structuredClone=global.structuredClone||((v)=>JSON.parse(JSON.stringify(v)));
const names=['meta','settings','ingredients','ingredientRevisions','recipes','recipeVersions','planInstances','calendarDays','operations','shoppingChecklists'];
const stores=Object.fromEntries(names.map(n=>[n,new Map()]));
const clone=v=>v===undefined?undefined:structuredClone(v), keyFor=(s,r)=>s==='meta'||s==='settings'?r.key:r.id;
const db={
 get:async(s,k)=>clone(stores[s].get(k)),getAll:async s=>[...stores[s].values()].map(clone),put:async(s,r)=>{stores[s].set(keyFor(s,r),clone(r));return clone(r)},
 getSetting:async k=>clone(stores.settings.get(k)?.value??null),setSetting:async(k,v,source='test')=>{stores.settings.set(k,{key:k,value:v,source,updatedAt:new Date().toISOString()});return v},
 openDatabase:async()=>({transaction(){const tx={error:null};tx.objectStore=s=>({put:r=>stores[s].set(keyFor(s,r),clone(r)),delete:id=>stores[s].delete(id),clear:()=>stores[s].clear()});setImmediate(()=>tx.oncomplete&&tx.oncomplete());return tx;},close(){}})
};
global.DietCalendarCore=require(path.resolve(__dirname,'../static/assets/js/calendar-core.js'));global.TataDietDB=db;require(path.resolve(__dirname,'../static/assets/js/v5-plan-core.js'));require(path.resolve(__dirname,'../static/assets/js/v5-plan-store.js'));
const store=global.TataDietPlanStore,core=global.TataDietPlanCore;
(async()=>{
 const plan={id:'plan:test',recordType:'planInstance',status:'active',startDate:'2026-09-01',datasetId:'tatadiet-base-v1',dayIds:['day:test'],createdAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-01T00:00:00Z'};
 const day={id:'day:test',recordType:'calendarDay',planInstanceId:plan.id,date:'2026-09-01',sequenceIndex:0,dayType:'D1',shift:{name:'Turno giorno',startTime:'08:00',endTime:'20:00',endDayOffset:0},adherenceStatus:'planned',source:'base',baseDayRef:{globalDay:1},meals:[],createdAt:plan.createdAt,updatedAt:plan.updatedAt};
 stores.planInstances.set(plan.id,clone(plan));stores.calendarDays.set(day.id,clone(day));stores.settings.set('planStartDate',{key:'planStartDate',value:'2026-09-01'});
 assert.equal(await db.getSetting('activePlanInstanceId'),null);
 const recovered=await store.activeBundle();assert.equal(recovered.plan.id,plan.id);assert.equal(recovered.days.length,1);assert.equal(await db.getSetting('activePlanInstanceId'),plan.id);
 stores.settings.delete('activePlanInstanceId');plan.status='archived';stores.planInstances.set(plan.id,clone(plan));
 const recoveredArchived=await store.activeBundle();assert.equal(recoveredArchived.plan.id,plan.id);assert.equal(recoveredArchived.plan.status,'active');
 console.log(JSON.stringify({status:'ok',version:'5.2.1',checks:{active_plan_id_recovery:true,configured_start_recovery:true,archived_plan_reactivation:true}},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
