#!/usr/bin/env node
"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
global.structuredClone=global.structuredClone||((v)=>JSON.parse(JSON.stringify(v)));
const names=['meta','settings','ingredients','ingredientRevisions','recipes','recipeVersions','planInstances','calendarDays','operations','shoppingChecklists'];
const stores=Object.fromEntries(names.map(n=>[n,new Map()]));
const clone=v=>v===undefined?undefined:structuredClone(v); const keyFor=(s,r)=>s==='meta'||s==='settings'?r.key:r.id;
const mockDB={
 get:async(s,k)=>clone(stores[s].get(k)), getAll:async s=>[...stores[s].values()].map(clone), put:async(s,r)=>{stores[s].set(keyFor(s,r),clone(r));return clone(r)},
 getSetting:async k=>clone(stores.settings.get(k)?.value??null), setSetting:async(k,v,source='test')=>{stores.settings.set(k,{key:k,value:v,source,updatedAt:new Date().toISOString()});return v},
 openDatabase:async()=>({transaction(){const tx={error:null};tx.objectStore=s=>({put:r=>stores[s].set(keyFor(s,r),clone(r)),delete:id=>stores[s].delete(id),clear:()=>stores[s].clear()});setImmediate(()=>tx.oncomplete&&tx.oncomplete());return tx;},close(){}}),
};
global.DietCalendarCore=require(path.resolve(__dirname,'../static/assets/js/calendar-core.js'));global.TataDietDB=mockDB;require(path.resolve(__dirname,'../static/assets/js/v5-plan-core.js'));require(path.resolve(__dirname,'../static/assets/js/v5-plan-store.js'));
const store=global.TataDietPlanStore,template=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../v5_data/base/plan-template.base.v1.json'),'utf8'));
(async()=>{
 let b=await store.ensureActive('2026-09-01',template,template.dataset_version);const originalPlanId=b.plan.id;assert.equal(b.days.length,180);assert.equal(b.created,true);assert.ok(await mockDB.getSetting('activePlanInstanceId'));
 b=await store.ensureActive('2026-09-01',template,template.dataset_version);assert.equal(b.created,false);
 let r=await store.commit('mark-adherence',{date:'2026-09-04',status:'not-followed'},template);assert.equal(global.TataDietPlanCore.byDate(r.days,'2026-09-04').adherenceStatus,'not-followed');assert.equal((await store.history()).length,1);
 r=await store.commit('postpone-sequence',{date:'2026-09-10'},template);assert.equal(r.days.length,181);assert.equal((await store.history()).length,2);
 let u=await store.undo();assert.equal(u.bundle.days.length,180);assert.equal(global.TataDietPlanCore.byDate(u.bundle.days,'2026-09-04').adherenceStatus,'not-followed');
 u=await store.undo();assert.equal(global.TataDietPlanCore.byDate(u.bundle.days,'2026-09-04').adherenceStatus,'planned');
 let rr=await store.redo();assert.equal(global.TataDietPlanCore.byDate(rr.bundle.days,'2026-09-04').adherenceStatus,'not-followed');
 await store.commit('replace-day-type',{date:'2026-09-05',dayType:'D1'},template);const h=await store.history();assert.equal(h.filter(x=>x.undoneAt).length,0);assert.equal(h.length,2); // undone postpone was discarded
 const active=await store.activeBundle();assert.equal(active.days.length,180);assert.equal(global.TataDietPlanCore.byDate(active.days,'2026-09-05').dayType,'D1');
 const other=await store.ensureActive('2026-10-01',template,template.dataset_version);assert.equal(other.created,true);assert.notEqual(other.plan.id,originalPlanId);const back=await store.ensureActive('2026-09-01',template,template.dataset_version);assert.equal(back.plan.id,originalPlanId);assert.equal(back.reactivated,true);assert.equal(global.TataDietPlanCore.byDate(back.days,'2026-09-05').dayType,'D1');
 const report={status:'ok',checkpoint:'5.0.0-alpha.5-phase5',checks:{create_plan:true,reuse_plan:true,commit:true,history:true,undo_structural:true,undo_adherence:true,redo:true,redo_branch_discard:true,active_bundle:true,plan_reactivation:true}};
 fs.mkdirSync(path.resolve(__dirname,'../qa/v5-phase5'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../qa/v5-phase5/plan-store-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
