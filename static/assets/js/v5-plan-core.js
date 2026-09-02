(function (global, factory) {
  const core = global.DietCalendarCore || (typeof module === "object" && module.exports ? require("./calendar-core.js") : null);
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  global.TataDietPlanCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (calendarCore) {
  "use strict";
  if (!calendarCore) throw new Error("DietCalendarCore non disponibile");
  const core = calendarCore;
  const DAY_TYPES = ["D1", "D2", "D3", "D4", "D5", "M", "P", "CUSTOM", "OFF", "FREE"];
  const ADHERENCE = ["planned", "followed", "partial", "not-followed", "not-applicable"];
  const DEFAULT_SHIFTS = {
    D1: { type:"D1", name:"Giornata", startTime:"08:00", endTime:"20:00", endDayOffset:0, capabilities:{reheat:true,refrigeration:true,complexSnack:true} },
    D2: { type:"D2", name:"Notte", startTime:"20:00", endTime:"08:00", endDayOffset:1, capabilities:{reheat:false,refrigeration:true,complexSnack:false} },
    D3: { type:"D3", name:"Smonto", startTime:null, endTime:null, endDayOffset:0, capabilities:{reheat:true,refrigeration:true,complexSnack:true} },
    D4: { type:"D4", name:"Riposo 1", startTime:null, endTime:null, endDayOffset:0, capabilities:{reheat:true,refrigeration:true,complexSnack:true} },
    D5: { type:"D5", name:"Riposo 2", startTime:null, endTime:null, endDayOffset:0, capabilities:{reheat:true,refrigeration:true,complexSnack:true} },
    M: { type:"M", name:"Mattino", startTime:null, endTime:null, endDayOffset:0, capabilities:{reheat:true,refrigeration:true,complexSnack:true} },
    P: { type:"P", name:"Pomeriggio", startTime:null, endTime:null, endDayOffset:0, capabilities:{reheat:true,refrigeration:true,complexSnack:true} },
    OFF: { type:"OFF", name:"Fuori servizio", startTime:null, endTime:null, endDayOffset:0, capabilities:{reheat:true,refrigeration:true,complexSnack:true} },
    FREE: { type:"FREE", name:"Giornata libera", startTime:null, endTime:null, endDayOffset:0, capabilities:{reheat:true,refrigeration:true,complexSnack:true} },
  };
  function clone(v){ return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function uuid(){ if(globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`; }
  function safeId(prefix){ return `${prefix}:${uuid()}`.replace(/[^A-Za-z0-9._:-]/g,"-").slice(0,200); }
  function defaultShift(type){ return clone(DEFAULT_SHIFTS[type] || DEFAULT_SHIFTS.FREE); }
  function customShift(input={}){
    const start = /^\d{2}:\d{2}$/.test(input.startTime||"") ? input.startTime : null;
    const end = /^\d{2}:\d{2}$/.test(input.endTime||"") ? input.endTime : null;
    if(!start || !end) throw new Error("Il turno personalizzato richiede ora di inizio e fine.");
    return { type:"CUSTOM", name:String(input.name||"Turno personalizzato").trim().slice(0,120)||"Turno personalizzato", startTime:start, endTime:end,
      endDayOffset:Number(input.endDayOffset)===1?1:0,
      capabilities:{ reheat:Boolean(input.capabilities?.reheat), refrigeration:Boolean(input.capabilities?.refrigeration), complexSnack:Boolean(input.capabilities?.complexSnack) } };
  }
  function mealOccurrence(meal, dayId, index){
    return { id:`${dayId}:meal:${String(index+1).padStart(2,"0")}`, time:meal.time, dayOffset:Number(meal.day_offset||0), mealType:meal.meal_type||"Pasto",
      recipeId:meal.recipe_id, recipeVersionId:meal.recipe_version_id, portionMultiplier:1, status:"planned", source:"base", baseMealRef:meal.id||null, notes:null };
  }
  function dayFromTemplate(base, planId, date, sequenceIndex, now){
    const id=`${planId}:day:${String(base.base_global_day).padStart(3,"0")}`;
    return { recordType:"calendarDay", id, planInstanceId:planId, date, sequenceIndex, dayType:base.day_type, source:"base", adherenceStatus:"planned", baseDayRef:base.id,
      shift:{...defaultShift(base.day_type), name:base.shift?.name || defaultShift(base.day_type).name, startTime:base.shift?.start_local ?? defaultShift(base.day_type).startTime, endTime:base.shift?.end_local ?? defaultShift(base.day_type).endTime, endDayOffset:Number(base.shift?.end_day_offset||0)},
      meals:(base.meals||[]).map((m,i)=>mealOccurrence(m,id,i)), notes:null, createdAt:now, updatedAt:now };
  }
  function buildPlan(template,startDate,datasetId="tatadiet-base-v1",now=new Date().toISOString()){
    if(!core.isValidISO(startDate)) throw new Error("Data iniziale non valida");
    const planId=safeId("usr:plan");
    const days=(template.days||[]).map((base,i)=>dayFromTemplate(base,planId,core.addDays(startDate,i),i,now));
    const plan={recordType:"planInstance",id:planId,name:"Piano personale",timezone:"Europe/Rome",startDate,baseDatasetId:datasetId,schemaVersion:1,status:"active",dayIds:days.map(d=>d.id),createdAt:now,updatedAt:now};
    return {plan,days};
  }
  function sortDays(days){ return clone(days).sort((a,b)=>a.sequenceIndex-b.sequenceIndex || core.compareDates(a.date,b.date)); }
  function byDate(days,date){ return days.find(d=>d.date===date)||null; }
  function normalizeSequence(days,startAt=0){ const out=sortDays(days); out.forEach((d,i)=>{d.sequenceIndex=i;}); return out; }
  function countMeals(days){ return (days||[]).reduce((n,d)=>n+(d.meals||[]).length,0); }
  function isModified(day){ return day.source!=="base" || day.adherenceStatus!=="planned" || day.dayType!==String(day.baseDayRef||"").replace(/^.*$/, day.dayType); }
  function stats(plan,days){ const sorted=sortDays(days); return {dayCount:sorted.length,mealCount:countMeals(sorted),modifiedCount:sorted.filter(d=>d.source!=="base"||d.adherenceStatus!=="planned").length,start:sorted[0]?.date||plan.startDate,end:sorted.at(-1)?.date||plan.startDate}; }
  function validateState(plan,days){
    const errors=[]; const sorted=sortDays(days); const ids=new Set(); const dates=new Set();
    if(!plan?.id) errors.push("Piano mancante");
    sorted.forEach((d,i)=>{ if(ids.has(d.id)) errors.push(`ID giorno duplicato: ${d.id}`); ids.add(d.id); if(dates.has(d.date)) errors.push(`Data duplicata: ${d.date}`); dates.add(d.date); if(d.sequenceIndex!==i) errors.push(`sequenceIndex non continuo a ${d.date}`); if(i && core.diffDays(sorted[i-1].date,d.date)!==1) errors.push(`Date non consecutive: ${sorted[i-1].date} → ${d.date}`); if(!DAY_TYPES.includes(d.dayType)) errors.push(`Tipo giorno non valido: ${d.dayType}`); if(!ADHERENCE.includes(d.adherenceStatus)) errors.push(`Aderenza non valida: ${d.adherenceStatus}`); });
    if(plan.dayIds?.length!==sorted.length) errors.push("dayIds non coerente");
    return {valid:errors.length===0,errors};
  }
  function insertedDay(plan,date,index,type,params,now){
    const id=safeId(`${plan.id}:inserted`); let shift;
    if(type==="CUSTOM") shift=customShift(params.customShift||{}); else shift=defaultShift(type||"FREE");
    return {recordType:"calendarDay",id,planInstanceId:plan.id,date,sequenceIndex:index,dayType:type||"FREE",source:"inserted",adherenceStatus:(type==="FREE"||type==="OFF")?"not-applicable":"planned",baseDayRef:null,shift,meals:[],notes:params.notes||null,createdAt:now,updatedAt:now};
  }
  function applyAction(planInput,daysInput,action,params={},template=null,now=new Date().toISOString()){
    const plan=clone(planInput); let days=sortDays(daysInput); const targetDate=params.date; const target=targetDate?byDate(days,targetDate):null;
    const beforeStats=stats(plan,days); const kind=action;
    const requireTarget=()=>{if(!target) throw new Error("Giornata non trovata nel piano effettivo.");};
    if(action==="mark-adherence") { requireTarget(); if(!ADHERENCE.includes(params.status)) throw new Error("Stato di aderenza non valido"); target.adherenceStatus=params.status; target.updatedAt=now; }
    else if(action==="replace-day-type") { requireTarget(); const type=params.dayType; if(!["D1","D2","D3","D4","D5","M","P","CUSTOM","OFF"].includes(type)) throw new Error("Tipo giorno non valido"); target.dayType=type; target.shift=type==="CUSTOM"?customShift(params.customShift||{}):defaultShift(type); target.source="replaced"; target.adherenceStatus="planned"; target.updatedAt=now; }
    else if(action==="leave-day-free") { requireTarget(); target.dayType="FREE"; target.shift=defaultShift("FREE"); target.source="replaced"; target.adherenceStatus="not-applicable"; target.meals=[]; target.updatedAt=now; }
    else if(action==="insert-day" || action==="postpone-sequence") {
      const index=target ? target.sequenceIndex : (params.date===core.addDays(days.at(-1).date,1)?days.length:-1); if(index<0) throw new Error("Data di inserimento fuori piano");
      const type=action==="postpone-sequence"?"FREE":(params.dayType||"FREE");
      days.forEach(d=>{if(d.sequenceIndex>=index){d.sequenceIndex+=1;d.date=core.addDays(d.date,1);d.updatedAt=now;}});
      days.push(insertedDay(plan,targetDate,index,type,params,now)); days=normalizeSequence(days);
    }
    else if(action==="remove-day") { requireTarget(); if(days.length<=1) throw new Error("Non è possibile rimuovere l'unica giornata"); const idx=target.sequenceIndex; days=days.filter(d=>d.id!==target.id); days.forEach(d=>{if(d.sequenceIndex>idx){d.sequenceIndex-=1;d.date=core.addDays(d.date,-1);d.updatedAt=now;}}); days=normalizeSequence(days); }
    else if(action==="restore-day") { requireTarget(); if(!target.baseDayRef) throw new Error("La giornata inserita non ha un'origine base da ripristinare"); if(!template) throw new Error("Template base non disponibile"); const base=(template.days||[]).find(d=>d.id===target.baseDayRef); if(!base) throw new Error("Giornata base non trovata"); const restored=dayFromTemplate(base,plan.id,target.date,target.sequenceIndex,now); restored.id=target.id; restored.createdAt=target.createdAt; const pos=days.findIndex(d=>d.id===target.id); days[pos]=restored; }
    else if(action==="restore-from-date") {
      if(!template) throw new Error("Template base non disponibile"); if(!core.isValidISO(targetDate)||core.compareDates(targetDate,plan.startDate)<0) throw new Error("Data di ripristino non valida");
      const civilIndex=core.diffDays(plan.startDate,targetDate); if(civilIndex<0) throw new Error("La data è fuori dal piano base");
      const prefix=days.filter(d=>core.compareDates(d.date,targetDate)<0); const createdAt=plan.createdAt;
      const baseIndexById=new Map((template.days||[]).map((d,i)=>[d.id,i]));
      const usedBaseIndexes=prefix.map(d=>baseIndexById.get(d.baseDayRef)).filter(Number.isInteger);
      const suffixStart=usedBaseIndexes.length?Math.max(...usedBaseIndexes)+1:0;
      const suffix=(template.days||[]).slice(suffixStart).map((base,j)=>dayFromTemplate(base,plan.id,core.addDays(targetDate,j),prefix.length+j,now));
      days=normalizeSequence([...prefix,...suffix]); plan.createdAt=createdAt;
    } else throw new Error(`Operazione non supportata: ${action}`);
    plan.dayIds=days.map(d=>d.id); plan.updatedAt=now;
    const validation=validateState(plan,days); if(!validation.valid) throw new Error(validation.errors.join("; "));
    const afterStats=stats(plan,days); const impact={kind,date:targetDate,before:beforeStats,after:afterStats,affectedDays:Math.max(1,Math.abs(afterStats.dayCount-beforeStats.dayCount)||days.filter((d,i)=>JSON.stringify(d)!==JSON.stringify(sortDays(daysInput)[i])).length),mealsDelta:afterStats.mealCount-beforeStats.mealCount,endDateChange:core.diffDays(beforeStats.end,afterStats.end)};
    return {plan,days,impact};
  }
  function diffPatch(oldPlan,oldDays,newPlan,newDays){
    const oldMap=new Map(oldDays.map(d=>[d.id,d])), newMap=new Map(newDays.map(d=>[d.id,d]));
    const changedIds=new Set([...oldMap.keys(),...newMap.keys()].filter(id=>JSON.stringify(oldMap.get(id))!==JSON.stringify(newMap.get(id))));
    function side(plan,map,otherMap){ return {plan:clone(plan),upsert:[...changedIds].map(id=>map.get(id)).filter(Boolean).map(clone),deleteIds:[...changedIds].filter(id=>!map.has(id)&&otherMap.has(id))}; }
    return {before:side(oldPlan,oldMap,newMap),after:side(newPlan,newMap,oldMap),targetIds:[...changedIds]};
  }
  function applyPatch(plan,days,patch){
    const map=new Map(days.map(d=>[d.id,clone(d)])); (patch.deleteIds||[]).forEach(id=>map.delete(id)); (patch.upsert||[]).forEach(d=>map.set(d.id,clone(d)));
    const outPlan=clone(patch.plan||plan); const outDays=sortDays([...map.values()]); outPlan.dayIds=outDays.map(d=>d.id); return {plan:outPlan,days:outDays};
  }
  function operationRecord(planId,kind,patch,now=new Date().toISOString()){ return {recordType:"operationRecord",id:safeId("usr:operation"),planInstanceId:planId,kind,targetIds:patch.targetIds.length?patch.targetIds:[planId],before:patch.before,after:patch.after,createdAt:now,undoneAt:null}; }
  return {DAY_TYPES,ADHERENCE,DEFAULT_SHIFTS,defaultShift,customShift,buildPlan,stats,validateState,applyAction,diffPatch,applyPatch,operationRecord,byDate,sortDays};
});
