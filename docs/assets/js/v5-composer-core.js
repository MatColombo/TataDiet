(function (global, factory) {
  const calendar = global.DietCalendarCore || (typeof module === "object" && module.exports ? require("./calendar-core.js") : null);
  const api = factory(calendar);
  if (typeof module === "object" && module.exports) module.exports = api;
  global.TataDietComposerCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (calendar) {
  "use strict";
  if (!calendar) throw new Error("DietCalendarCore non disponibile");

  const SLOT_TEMPLATES = {
    D1: [["06:30",0,"Colazione"],["10:30",0,"Spuntino"],["13:30",0,"Pranzo"],["17:30",0,"Spuntino"],["21:00",0,"Cena"]],
    D2: [["09:00",0,"Colazione"],["13:00",0,"Pranzo"],["18:30",0,"Pasto preturno"],["23:30",0,"Spuntino notturno"],["03:30",1,"Spuntino notturno"],["08:20",1,"Mini-pasto pre-sonno"]],
    D3: [["15:00",0,"Brunch"],["18:30",0,"Spuntino"],["21:00",0,"Cena"]],
    D4: [["08:00",0,"Colazione"],["11:00",0,"Spuntino"],["13:30",0,"Pranzo"],["17:30",0,"Spuntino"],["20:30",0,"Cena"]],
    D5: [["08:00",0,"Colazione"],["11:00",0,"Spuntino"],["13:30",0,"Pranzo"],["17:30",0,"Spuntino"],["20:30",0,"Cena"]],
    OFF: [["08:00",0,"Colazione"],["13:30",0,"Pranzo"],["17:30",0,"Spuntino"],["20:30",0,"Cena"]],
  };
  const REFERENCE_KCAL = {D1:1612,D2:1709,D3:1467,D4:1614,D5:1626,OFF:1600,CUSTOM:1600,FREE:0};
  const NUTRIENT_KEYS = ["energyKcal","proteinG","carbohydrateG","fatG","fiberG"];

  function clone(v){ return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function normalize(v){ return String(v||"").toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim(); }
  function numeric(v,f=0){ const n=Number(v); return Number.isFinite(n)?n:f; }
  function safeId(prefix){ const id=globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;return `${prefix}:${id}`.replace(/[^A-Za-z0-9._:-]/g,"-").slice(0,200); }
  function minutes(time){ const m=String(time||"").match(/^(\d{2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null; }
  function timeFromAbsolute(abs){ const dayOffset=Math.max(0,Math.min(2,Math.floor(abs/1440)));const minute=((abs%1440)+1440)%1440;return {time:`${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`,dayOffset}; }
  function mealFamily(type){ const n=normalize(type);if(n.includes("spuntino")||n.includes("mini-pasto"))return"snack";if(n.includes("colazione"))return"breakfast";if(n.includes("brunch"))return"brunch";if(n.includes("pranzo"))return"lunch";if(n.includes("cena"))return"dinner";if(n.includes("preturno"))return"preturno";return"meal"; }
  function targetEnergy(type){ return {breakfast:300,snack:180,brunch:500,lunch:470,dinner:470,preturno:430,meal:400}[mealFamily(type)]||400; }
  function nutritionOfVersion(version){
    const raw=version?.nutritionMode==="manual"?(version.manualNutrition||version.calculatedNutrition):(version?.calculatedNutrition||version?.manualNutrition)||{};
    return {energyKcal:numeric(raw.energyKcal??raw.energy_kcal),proteinG:numeric(raw.proteinG??raw.protein_g),carbohydrateG:numeric(raw.carbohydrateG??raw.carbohydrate_g),fatG:numeric(raw.fatG??raw.fat_g),fiberG:numeric(raw.fiberG??raw.fiber_g)};
  }
  function entryFrom(recipe,version){
    if(!recipe||!version)return null;const meta=version.metadata||{};
    return {recipe,version,isCurrent:recipe.currentVersionId===version.id,nutrition:nutritionOfVersion(version),mealTypes:meta.mealTypes||recipe.mealTypes||[],cuisine:meta.cuisine||recipe.cuisines?.[0]||"",tags:meta.tags||[],prepMinutes:numeric(meta.prepMinutes),mealPrep:meta.mealPrep||{},spiceLevel:meta.spiceLevel||"none"};
  }
  function makeCatalog(recipes,versions){ const recipeById=new Map((recipes||[]).map(r=>[r.id,r]));return (versions||[]).map(v=>entryFrom(recipeById.get(v.recipeId||v.recipe_id),v)).filter(Boolean); }
  function catalogMap(catalog){ return new Map((catalog||[]).map(e=>[e.version.id,e])); }

  function slotTemplates(day){
    if(day?.dayType!=="CUSTOM")return (SLOT_TEMPLATES[day?.dayType]||SLOT_TEMPLATES.OFF).map(([time,dayOffset,mealType],i)=>({id:`slot-${i+1}`,time,dayOffset,mealType}));
    const sh=day.shift||{};let start=minutes(sh.startTime),end=minutes(sh.endTime);if(start===null||end===null)return SLOT_TEMPLATES.OFF.map(([time,dayOffset,mealType],i)=>({id:`slot-${i+1}`,time,dayOffset,mealType}));
    let endAbs=end+numeric(sh.endDayOffset)*1440;if(endAbs<=start)endAbs+=1440;const duration=endAbs-start;
    const points=[];const pre=start-90;if(pre>=0)points.push(pre);points.push(start+Math.min(210,Math.round(duration*.3)));if(duration>=480)points.push(start+Math.min(450,Math.round(duration*.62)));points.push(endAbs+30);
    const seen=new Set();return points.map((abs,i)=>{const t=timeFromAbsolute(abs);const min=minutes(t.time);let mealType;if(i===0&&pre>=0)mealType=start>=16*60?"Pasto preturno":start<10*60?"Colazione":start<15*60?"Pranzo":"Pasto preturno";else if(t.dayOffset>0||min>=22*60||min<6*60)mealType=i===points.length-1?"Mini-pasto pre-sonno":"Spuntino notturno";else if(min<10*60)mealType="Colazione";else if(min<14.5*60)mealType="Pranzo";else if(min<18.5*60)mealType="Spuntino";else mealType="Cena";return {id:`slot-${i+1}`,time:t.time,dayOffset:t.dayOffset,mealType};}).filter(s=>{const k=`${s.dayOffset}:${s.time}`;if(seen.has(k))return false;seen.add(k);return true;});
  }
  function existingOrSuggestedSlots(day){ return day?.meals?.length?clone(day.meals).sort((a,b)=>(a.dayOffset*1440+minutes(a.time))-(b.dayOffset*1440+minutes(b.time))):slotTemplates(day); }

  function compatibilityScore(entry,ctx={}){
    let score=0;const reasons=[],warnings=[];const wanted=normalize(ctx.mealType),family=mealFamily(ctx.mealType);const offered=(entry.mealTypes||[]).map(normalize);
    if(offered.includes(wanted)){score+=38;reasons.push("tipo di pasto esatto");}
    else if(offered.some(x=>mealFamily(x)===family)){score+=25;reasons.push("adatta allo stesso tipo di pasto");}
    else if(family==="preturno"&&offered.some(x=>["lunch","dinner"].includes(mealFamily(x)))){score+=12;reasons.push("pasto principale adattabile al preturno");}
    else if(family==="brunch"&&offered.some(x=>["breakfast","lunch"].includes(mealFamily(x)))){score+=12;reasons.push("compatibile con brunch");}
    else score-=18;
    const target=targetEnergy(ctx.mealType),kcal=entry.nutrition.energyKcal;const delta=Math.abs(kcal-target)/Math.max(target,1);score+=Math.max(-8,18-Math.round(delta*22));if(delta<=.2)reasons.push("energia vicina allo slot");
    const cap=ctx.shift?.capabilities||{};const mp=entry.mealPrep||{};
    if(cap.reheat===false){if(mp.coldSuitable){score+=14;reasons.push("consumabile fredda");}else if(mp.reheatable){score-=28;warnings.push("richiede riscaldamento ma il turno non lo prevede");}else {score-=8;warnings.push("consumo a temperatura non chiaramente compatibile");}}
    if(cap.refrigeration===false&&numeric(mp.fridgeHours,0)>0){score-=10;warnings.push("conservazione refrigerata da verificare");}
    if(family==="snack"&&cap.complexSnack===false){if(entry.prepMinutes<=10){score+=8;reasons.push("spuntino rapido");}else {score-=10;warnings.push("preparazione poco pratica per uno spuntino breve");}}
    if(entry.prepMinutes<=10){score+=7;reasons.push("preparazione rapida");}else if(entry.prepMinutes<=20)score+=3;else if(entry.prepMinutes>35){score-=7;warnings.push("preparazione lunga");}
    const fiber=entry.nutrition.fiberG;if(fiber<=6){score+=4;reasons.push("fibra moderata");}else if(fiber>12){score-=18;warnings.push("fibra elevata per porzione");}else if(fiber>9){score-=6;warnings.push("fibra relativamente alta");}
    if(["medium","high"].includes(entry.spiceLevel)){score-=entry.spiceLevel==="high"?18:9;warnings.push("intensità aromatica superiore al profilo abituale");}
    const recent=new Set(ctx.recentRecipeIds||[]);if(recent.has(entry.recipe.id)){score-=32;warnings.push("già usata nei giorni vicini");}else score+=4;
    if(entry.recipe.origin==="personal"){score+=2;reasons.push("ricetta personale");}
    return {score,reasons:[...new Set(reasons)].slice(0,4),warnings:[...new Set(warnings)].slice(0,4),targetKcal:target};
  }
  function suggestRecipes(catalog,ctx={},limit=12){return (catalog||[]).filter(entry=>entry.isCurrent&&!entry.recipe.archivedAt).map(entry=>({...entry,match:compatibilityScore(entry,ctx)})).sort((a,b)=>b.match.score-a.match.score||a.recipe.title.localeCompare(b.recipe.title,"it")).slice(0,limit);}

  function scaleNutrition(n,f){const out={};NUTRIENT_KEYS.forEach(k=>out[k]=numeric(n?.[k])*f);return out;}
  function addNutrition(a,b){const out={};NUTRIENT_KEYS.forEach(k=>out[k]=numeric(a?.[k])+numeric(b?.[k]));return out;}
  function daySummary(day,catalogOrMap,referenceKcal=null){const map=catalogOrMap instanceof Map?catalogOrMap:catalogMap(catalogOrMap);let total={energyKcal:0,proteinG:0,carbohydrateG:0,fatG:0,fiberG:0},resolved=0,unresolved=0;const rows=[];(day?.meals||[]).forEach(m=>{if(m.status==="skipped")return;const entry=map.get(m.recipeVersionId);if(!entry){unresolved++;rows.push({meal:m,entry:null,nutrition:null});return;}resolved++;const n=scaleNutrition(entry.nutrition,numeric(m.portionMultiplier,1));total=addNutrition(total,n);rows.push({meal:m,entry,nutrition:n});});const reference=referenceKcal??REFERENCE_KCAL[day?.dayType]??1600;return {total,rows,resolved,unresolved,referenceKcal:reference,kcalDelta:total.energyKcal-reference,percentOfReference:reference?total.energyKcal/reference*100:0};}

  function recentRecipeIds(days,targetDate,radius=3){const out=[];(days||[]).forEach(d=>{const dist=Math.abs(calendar.diffDays(targetDate,d.date));if(dist>0&&dist<=radius)(d.meals||[]).forEach(m=>out.push(m.recipeId));});return out;}
  function mealRecord(day,slot,entry,portionMultiplier=1,source=null,id=null){if(!entry?.recipe||!entry?.version)throw new Error("Ricetta non valida");const portion=Math.max(.1,Math.min(20,numeric(portionMultiplier,1)));return {id:id||safeId(`${day.id}:meal`),time:slot.time,dayOffset:numeric(slot.dayOffset),mealType:slot.mealType||"Pasto",recipeId:entry.recipe.id,recipeVersionId:entry.version.id,portionMultiplier:portion,status:"planned",source:source||(entry.recipe.origin==="personal"?"personal":"suggested"),baseMealRef:slot.baseMealRef||null,notes:slot.notes||null,locked:Boolean(slot.locked)};}
  function replaceMeal(day,mealId,entry,portionMultiplier=null){const out=clone(day);const i=(out.meals||[]).findIndex(m=>m.id===mealId);if(i<0)throw new Error("Pasto non trovato");const old=out.meals[i];out.meals[i]=mealRecord(out,old,entry,portionMultiplier??old.portionMultiplier,entry.recipe.origin==="personal"?"personal":"copied",old.id);out.meals[i].baseMealRef=old.baseMealRef||null;out.meals[i].status="replaced";out.meals[i].locked=Boolean(old.locked);return out;}
  function updateMeal(day,mealId,patch={}){const out=clone(day);const meal=(out.meals||[]).find(m=>m.id===mealId);if(!meal)throw new Error("Pasto non trovato");if(patch.time!==undefined){if(minutes(patch.time)===null)throw new Error("Ora non valida");meal.time=patch.time;}if(patch.dayOffset!==undefined)meal.dayOffset=Math.max(0,Math.min(2,Math.round(numeric(patch.dayOffset))));if(patch.mealType!==undefined)meal.mealType=String(patch.mealType||"").trim()||"Pasto";if(patch.portionMultiplier!==undefined){const p=numeric(patch.portionMultiplier,NaN);if(!Number.isFinite(p)||p<=0||p>20)throw new Error("Porzione non valida");meal.portionMultiplier=p;}if(patch.locked!==undefined)meal.locked=Boolean(patch.locked);if(patch.status!==undefined)meal.status=patch.status;meal.source=meal.source==="base"?"copied":meal.source;return out;}
  function removeMeal(day,mealId){const out=clone(day);const before=(out.meals||[]).length;out.meals=(out.meals||[]).filter(m=>m.id!==mealId);if(out.meals.length===before)throw new Error("Pasto non trovato");return out;}
  function addMeal(day,slot,entry,portionMultiplier=1){const out=clone(day);out.meals=[...(out.meals||[]),mealRecord(out,slot,entry,portionMultiplier,entry.recipe.origin==="personal"?"personal":"copied")];out.meals.sort((a,b)=>(a.dayOffset*1440+minutes(a.time))-(b.dayOffset*1440+minutes(b.time)));return out;}
  function replaceMenu(day,items){const out=clone(day);out.meals=(items||[]).map((item,i)=>mealRecord(out,item.slot||item,item.entry,item.portionMultiplier||1,item.source||"suggested",item.id||null));out.meals.sort((a,b)=>(a.dayOffset*1440+minutes(a.time))-(b.dayOffset*1440+minutes(b.time)));return out;}
  function copyMenuFromTemplate(day,baseDay,catalogByVersion){const map=catalogByVersion instanceof Map?catalogByVersion:catalogMap(catalogByVersion);const items=(baseDay?.meals||[]).map(m=>{const entry=map.get(m.recipe_version_id||m.recipeVersionId);if(!entry)return null;return {slot:{time:m.time,dayOffset:numeric(m.day_offset??m.dayOffset),mealType:m.meal_type||m.mealType,baseMealRef:m.id||null},entry,portionMultiplier:1,source:"copied"};}).filter(Boolean);if(!items.length)throw new Error("Il menu modello non contiene ricette disponibili");return replaceMenu(day,items);}
  function suggestedMenu(day,catalog,days,options={}){const map=catalogMap(catalog),slots=day?.meals?.length?clone(day.meals):slotTemplates(day),recent=recentRecipeIds(days,day.date,3),used=new Set(),items=[];for(const slot of slots){if(slot.locked&&slot.recipeVersionId&&map.get(slot.recipeVersionId)){const entry=map.get(slot.recipeVersionId);used.add(entry.recipe.id);items.push({slot,entry,portionMultiplier:slot.portionMultiplier||1,source:slot.source||"copied",locked:true,match:{score:999,reasons:["pasto bloccato"],warnings:[]}});continue;}const ranked=suggestRecipes(catalog,{mealType:slot.mealType,shift:day.shift,recentRecipeIds:[...recent,...used]},20);const pick=ranked.find(x=>!used.has(x.recipe.id))||ranked[0];if(!pick)continue;used.add(pick.recipe.id);items.push({slot,entry:pick,portionMultiplier:slot.portionMultiplier||1,source:"suggested",match:pick.match});}const next=replaceMenu(day,items);next.meals.forEach((m,i)=>{if(items[i]?.locked)m.locked=true;});return {day:next,items};}
  return {SLOT_TEMPLATES,REFERENCE_KCAL,NUTRIENT_KEYS,normalize,numeric,minutes,mealFamily,targetEnergy,nutritionOfVersion,entryFrom,makeCatalog,catalogMap,slotTemplates,existingOrSuggestedSlots,compatibilityScore,suggestRecipes,scaleNutrition,addNutrition,daySummary,recentRecipeIds,mealRecord,replaceMeal,updateMeal,removeMeal,addMeal,replaceMenu,copyMenuFromTemplate,suggestedMenu};
});
