(function (global, factory) {
  const api=factory(global.TataDietDB,global.TataDietPlanCore);
  if(typeof module==="object"&&module.exports) module.exports=api;
  global.TataDietPlanStore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(dbApi,core){
  "use strict";
  function deps(){if(!dbApi||!core) throw new Error("Moduli piano V5 non inizializzati");}
  function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Transazione non riuscita"));tx.onabort=()=>reject(tx.error||new Error("Transazione annullata"));});}
  async function bundle(planId){deps();const plan=await dbApi.get("planInstances",planId);if(!plan)return null;const days=(await dbApi.getAll("calendarDays")).filter(d=>d.planInstanceId===planId);return {plan,days:core.sortDays(days)};}
  async function activeBundle(){const id=await dbApi.getSetting("activePlanInstanceId");return id?bundle(id):null;}
  async function writeNew(plan,days){const db=await dbApi.openDatabase();try{const tx=db.transaction(["planInstances","calendarDays","settings"],"readwrite");tx.objectStore("planInstances").put(plan);days.forEach(d=>tx.objectStore("calendarDays").put(d));tx.objectStore("settings").put({key:"activePlanInstanceId",value:plan.id,source:"phase5",updatedAt:new Date().toISOString()});await txDone(tx);}finally{db.close();}}
  async function ensureActive(startDate,template,datasetId="tatadiet-base-v1"){
    deps();let current=await activeBundle();if(current?.plan?.startDate===startDate)return {...current,created:false};
    const all=await dbApi.getAll("planInstances");const same=all.find(p=>p.startDate===startDate);if(same){const now=new Date().toISOString();if(current?.plan&&current.plan.id!==same.id){current.plan.status="archived";current.plan.updatedAt=now;await dbApi.put("planInstances",current.plan);}same.status="active";same.updatedAt=now;await dbApi.put("planInstances",same);await dbApi.setSetting("activePlanInstanceId",same.id,"phase5");return {...await bundle(same.id),created:false,reactivated:true};}
    const made=core.buildPlan(template,startDate,datasetId);if(current?.plan){current.plan.status="archived";current.plan.updatedAt=new Date().toISOString();await dbApi.put("planInstances",current.plan);}await writeNew(made.plan,made.days);return {...made,created:true};
  }
  async function preview(action,params,template){const current=await activeBundle();if(!current)throw new Error("Nessun piano personale attivo");return core.applyAction(current.plan,current.days,action,params,template);}
  async function commit(action,params,template){
    deps();const current=await activeBundle();if(!current)throw new Error("Nessun piano personale attivo");const next=core.applyAction(current.plan,current.days,action,params,template);const patch=core.diffPatch(current.plan,current.days,next.plan,next.days);const op=core.operationRecord(current.plan.id,action,patch);
    const existing=await dbApi.getAll("operations");
    const db=await dbApi.openDatabase();try{const tx=db.transaction(["planInstances","calendarDays","operations"],"readwrite");const os=tx.objectStore("operations");existing.filter(x=>x.planInstanceId===current.plan.id&&x.undoneAt).forEach(x=>os.delete(x.id));patch.after.deleteIds.forEach(id=>tx.objectStore("calendarDays").delete(id));patch.after.upsert.forEach(d=>tx.objectStore("calendarDays").put(d));tx.objectStore("planInstances").put(next.plan);os.put(op);await txDone(tx);}finally{db.close();}
    return {operation:op,...next};
  }
  async function commitState(nextPlanInput,nextDaysInput,kind="manage-day") {
    deps(); const current=await activeBundle(); if(!current) throw new Error("Nessun piano personale attivo");
    const plan=structuredClone(nextPlanInput), days=core.sortDays(structuredClone(nextDaysInput)); const now=new Date().toISOString();
    plan.updatedAt=now; plan.dayIds=days.map(d=>d.id); const validation=core.validateState(plan,days); if(!validation.valid) throw new Error(validation.errors.join("; "));
    const patch=core.diffPatch(current.plan,current.days,plan,days); const op=core.operationRecord(plan.id,kind,patch,now); const existing=await dbApi.getAll("operations");
    const db=await dbApi.openDatabase(); try { const tx=db.transaction(["planInstances","calendarDays","operations"],"readwrite"); const os=tx.objectStore("operations"); existing.filter(x=>x.planInstanceId===plan.id&&x.undoneAt).forEach(x=>os.delete(x.id)); patch.after.deleteIds.forEach(id=>tx.objectStore("calendarDays").delete(id)); patch.after.upsert.forEach(d=>tx.objectStore("calendarDays").put(d)); tx.objectStore("planInstances").put(plan); os.put(op); await txDone(tx); } finally { db.close(); }
    return {operation:op,plan,days};
  }
  async function applyHistory(op,side){const current=await bundle(op.planInstanceId);if(!current)throw new Error("Piano non trovato");const patch=op[side];const db=await dbApi.openDatabase();try{const tx=db.transaction(["planInstances","calendarDays","operations"],"readwrite");(patch.deleteIds||[]).forEach(id=>tx.objectStore("calendarDays").delete(id));(patch.upsert||[]).forEach(d=>tx.objectStore("calendarDays").put(d));tx.objectStore("planInstances").put(patch.plan);tx.objectStore("operations").put(op);await txDone(tx);}finally{db.close();}return bundle(op.planInstanceId);}
  async function history(){const current=await activeBundle();if(!current)return [];return (await dbApi.getAll("operations")).filter(o=>o.planInstanceId===current.plan.id).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));}
  async function undo(){const ops=await history();const op=[...ops].reverse().find(o=>!o.undoneAt);if(!op)return null;op.undoneAt=new Date().toISOString();return {operation:op,bundle:await applyHistory(op,"before")};}
  async function redo(){const ops=await history();const op=ops.find(o=>o.undoneAt);if(!op)return null;op.undoneAt=null;return {operation:op,bundle:await applyHistory(op,"after")};}
  return {bundle,activeBundle,ensureActive,preview,commit,commitState,history,undo,redo};
});
