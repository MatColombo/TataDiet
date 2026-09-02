(function(global,factory){
  const calendar=global.DietCalendarCore||(typeof module==='object'&&module.exports?require('./calendar-core.js'):null);
  const composer=global.TataDietComposerCore||(typeof module==='object'&&module.exports?require('./v5-composer-core.js'):null);
  const prefs=global.TataDietFoodPreferences||(typeof module==='object'&&module.exports?require('./v5-preferences-core.js'):null);
  const dayTypes=global.TataDietDayTypes||(typeof module==='object'&&module.exports?require('./v5-day-types.js'):null);
  const api=factory(calendar,composer,prefs,dayTypes);if(typeof module==='object'&&module.exports)module.exports=api;global.TataDietPlanningCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(calendar,composer,prefs,dayTypes){
  'use strict';
  if(!calendar||!composer)throw new Error('Dipendenze planning non disponibili');
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const roundPortion=v=>Math.round(v*20)/20;
  const groupLabel=id=>prefs?.GROUPS?.find(g=>g.id===id)?.label||id;
  const LEVEL_LIMIT={never:0,rare:1,less:2};
  function byVersion(catalog){return composer.catalogMap(catalog||[]);}
  function firstFuture(days,today=calendar.todayISO()){const sorted=[...(days||[])].sort((a,b)=>calendar.compareDates(a.date,b.date));return sorted.find(d=>calendar.compareDates(d.date,today)>=0)?.date||null;}
  function resolveRange(days,mode,today=calendar.todayISO()){
    const sorted=[...(days||[])].sort((a,b)=>calendar.compareDates(a.date,b.date));if(!sorted.length)return null;
    const start=firstFuture(sorted,today),last=sorted.at(-1).date;if(!start)return null;let end=start;
    if(mode==='7')end=calendar.minDate(calendar.addDays(start,6),last);
    else if(mode==='30')end=calendar.minDate(calendar.addDays(start,29),last);
    else if(mode==='rest')end=last;
    return {start,end,dayCount:calendar.diffDays(start,end)+1};
  }
  function mealsInRange(days,from,to){const out=[];(days||[]).forEach(day=>{if(calendar.compareDates(day.date,from)<0||calendar.compareDates(day.date,to)>0)return;(day.meals||[]).forEach(meal=>{if(meal.status!=='skipped')out.push({day,meal});});});return out;}
  function nutrition(entry,portion=1){return composer.scaleNutrition(entry?.nutrition||{},num(portion,1));}
  function portionForEnergy(oldNutrition,entry){const oldK=num(oldNutrition?.energyKcal),base=num(entry?.nutrition?.energyKcal);if(!oldK||!base)return 1;return roundPortion(clamp(oldK/base,.5,2));}
  function nutritionDistance(a,b){
    const keys=[['energyKcal',2.4],['proteinG',1.7],['carbohydrateG',1],['fatG',1],['fiberG',.55]];let total=0,weight=0;
    keys.forEach(([k,w])=>{const av=Math.max(1,num(a?.[k])),bv=num(b?.[k]);total+=Math.abs(bv-av)/av*w;weight+=w;});return total/weight;
  }
  function sameMealFamily(entry,mealType){const wanted=composer.mealFamily(mealType);return (entry.mealTypes||[]).some(x=>composer.mealFamily(x)===wanted);}
  function groupCountAround(days,targetDate,map,group){let max=0;for(let offset=-6;offset<=0;offset++){const start=calendar.addDays(targetDate,offset),end=calendar.addDays(start,6);let n=0;(days||[]).forEach(day=>{if(calendar.compareDates(day.date,start)<0||calendar.compareDates(day.date,end)>0)return;(day.meals||[]).forEach(meal=>{if(meal.status==='skipped')return;const e=map.get(meal.recipeVersionId);if((e?.foodGroups||[]).includes(group))n++;});});if(n>max)max=n;}return max;}
  function effectiveLimit(prefRow){if(!prefRow)return null;if(prefRow.level==='never')return 0;if(prefRow.maxPer7Days)return Number(prefRow.maxPer7Days);return LEVEL_LIMIT[prefRow.level]??null;}
  function mealOffenses(days,day,meal,map,preferences){const entry=map.get(meal.recipeVersionId);if(!entry)return[];const model=prefs?prefs.normalize(preferences):{groups:{}};return (entry.foodGroups||[]).map(group=>{const row=model.groups[group],limit=effectiveLimit(row);if(limit===null)return null;const count=groupCountAround(days,day.date,map,group);if(count<=limit)return null;const severity=row?.level==='never'?1000:(count-limit)*100+(row?.level==='rare'?30:row?.level==='less'?15:0);return {group,label:groupLabel(group),count,limit,severity};}).filter(Boolean);}
  function dailySummary(days,date,map){const day=(days||[]).find(d=>d.date===date);return day?composer.daySummary(day,map):null;}
  function chooseReplacement(days,day,meal,catalog,map,preferences,options={}){
    const current=map.get(meal.recipeVersionId);if(!current)return null;const oldN=nutrition(current,meal.portionMultiplier);const recent=composer.recentRecipeIds(days,day.date,3);const counts=prefs?prefs.occurrenceCounts(days,day.date,map,calendar):{};const forbidden=new Set(options.forbiddenGroups||[]),required=options.requiredGroup||null;
    let best=null;
    for(const entry of catalog||[]){if(!entry?.isCurrent||entry.recipe.archivedAt||entry.recipe.id===current.recipe.id)continue;if(required&&!(entry.foodGroups||[]).includes(required))continue;if([...forbidden].some(g=>(entry.foodGroups||[]).includes(g)))continue;
      const prefMatch=composer.compatibilityScore(entry,{mealType:meal.mealType,shift:day.shift,recentRecipeIds:recent,preferences,groupOccurrences:counts});if(prefMatch.avoidAutomatic&&!options.allowPreferenceOverride)continue;
      const p=portionForEnergy(oldN,entry),newN=nutrition(entry,p),dist=nutritionDistance(oldN,newN);const energyDelta=Math.abs(num(newN.energyKcal)-num(oldN.energyKcal))/Math.max(1,num(oldN.energyKcal));if(energyDelta>.16||dist>.65)continue;
      const familyBonus=sameMealFamily(entry,meal.mealType)?35:-18;const score=prefMatch.score+familyBonus-dist*120-(recent.includes(entry.recipe.id)?22:0);
      if(!best||score>best.score)best={entry,portionMultiplier:p,nutritionBefore:oldN,nutritionAfter:newN,distance:dist,score,match:prefMatch};
    }return best;
  }
  function replaceInWorking(days,dayId,mealId,replacement){const day=days.find(d=>d.id===dayId);if(!day)return null;const next=composer.replaceMeal(day,mealId,replacement.entry,replacement.portionMultiplier);const pos=days.findIndex(d=>d.id===dayId);days[pos]=next;return next;}
  function proposalRecord(day,meal,current,repl,reason,kind='preference'){
    return {id:`${day.id}|${meal.id}|${repl.entry.version.id}`,kind,date:day.date,dayId:day.id,dayType:day.dayType,dayLabel:dayTypes?dayTypes.label(day.dayType):day.dayType,dayShort:dayTypes?dayTypes.short(day.dayType):day.dayType,mealId:meal.id,time:meal.time,mealType:meal.mealType,oldRecipeId:current.recipe.id,oldRecipeVersionId:current.version.id,oldTitle:current.recipe.title,newRecipeId:repl.entry.recipe.id,newRecipeVersionId:repl.entry.version.id,newTitle:repl.entry.recipe.title,portionMultiplier:repl.portionMultiplier,nutritionBefore:repl.nutritionBefore,nutritionAfter:repl.nutritionAfter,reason,score:repl.score};
  }
  function buildRebalanceProposal(days,catalog,preferences,from,to){
    const map=byVersion(catalog),working=clone(days),proposals=[],touched=new Set(),blocked=new Set();const selected=mealsInRange(working,from,to).filter(x=>!x.meal.locked);
    // First pass: reduce hard/soft over-frequency constraints.
    let guard=0;while(guard++<selected.length*3){let worst=null;for(const {day,meal} of mealsInRange(working,from,to)){if(meal.locked||touched.has(meal.id)||blocked.has(meal.id))continue;const offenses=mealOffenses(working,day,meal,map,preferences);if(!offenses.length)continue;const top=offenses.sort((a,b)=>b.severity-a.severity)[0];if(!worst||top.severity>worst.offense.severity)worst={day,meal,offense:top,offenses};}if(!worst)break;
      const current=map.get(worst.meal.recipeVersionId);if(!current){blocked.add(worst.meal.id);continue;}const forbidden=worst.offenses.map(o=>o.group);const repl=chooseReplacement(working,worst.day,worst.meal,catalog,map,preferences,{forbiddenGroups:forbidden});if(!repl){blocked.add(worst.meal.id);continue;}
      proposals.push(proposalRecord(worst.day,worst.meal,current,repl,`${worst.offense.label}: ${worst.offense.count} occasioni/7 gg, obiettivo ≤ ${worst.offense.limit}`));replaceInWorking(working,worst.day.id,worst.meal.id,repl);touched.add(worst.meal.id);
    }
    // Second pass: "Più spesso" can gently add underrepresented groups when a nutritionally close replacement exists.
    const model=prefs?prefs.normalize(preferences):{groups:{}};const span=Math.max(1,calendar.diffDays(from,to)+1);
    Object.entries(model.groups||{}).forEach(([group,row])=>{if(row.level!=='more')return;const desired=Math.max(1,Math.round(span/7*2));let count=mealsInRange(working,from,to).filter(({meal})=>(map.get(meal.recipeVersionId)?.foodGroups||[]).includes(group)).length;let tries=0;while(count<desired&&tries++<span){let best=null;for(const {day,meal} of mealsInRange(working,from,to)){if(meal.locked||touched.has(meal.id)||(map.get(meal.recipeVersionId)?.foodGroups||[]).includes(group))continue;const repl=chooseReplacement(working,day,meal,catalog,map,preferences,{requiredGroup:group});if(!repl)continue;if(!best||repl.score>best.repl.score)best={day,meal,repl};}if(!best)break;const current=map.get(best.meal.recipeVersionId);proposals.push(proposalRecord(best.day,best.meal,current,best.repl,`${groupLabel(group)}: preferenza “Più spesso”`, 'preference-more'));replaceInWorking(working,best.day.id,best.meal.id,best.repl);touched.add(best.meal.id);count++;}});
    return {from,to,proposals,previewDays:working,before:summaryRange(days,map,from,to),after:summaryRange(working,map,from,to)};
  }
  function summaryRange(days,map,from,to){const totals={energyKcal:0,proteinG:0,carbohydrateG:0,fatG:0,fiberG:0},groups={};let mealCount=0;(prefs?.GROUPS||[]).forEach(g=>groups[g.id]=0);mealsInRange(days,from,to).forEach(({meal})=>{const e=map.get(meal.recipeVersionId);if(!e)return;mealCount++;const n=nutrition(e,meal.portionMultiplier);Object.keys(totals).forEach(k=>totals[k]+=num(n[k]));(e.foodGroups||[]).forEach(g=>{if(groups[g]!==undefined)groups[g]++;});});const dayCount=Math.max(1,calendar.diffDays(from,to)+1);const average=Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,v/dayCount]));return {dayCount,mealCount,totals,average,groups};}
  function applyProposals(days,catalog,proposals){const map=byVersion(catalog),out=clone(days);(proposals||[]).forEach(p=>{const day=out.find(d=>d.id===p.dayId||d.date===p.date);if(!day)return;const entry=map.get(p.newRecipeVersionId);if(!entry)return;const pos=out.findIndex(d=>d.id===day.id);out[pos]=composer.replaceMeal(day,p.mealId,entry,p.portionMultiplier);});return out;}
  function hashSeed(text){let h=2166136261;for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function rngFromSeed(seed){let x=hashSeed(seed)||123456789;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
  function buildRecipeScheduleProposal(days,catalog,recipeVersionId,from,to,count,seed,preferences){
    const map=byVersion(catalog),target=map.get(recipeVersionId);if(!target)throw new Error('Ricetta non disponibile');const rng=rngFromSeed(seed||`${recipeVersionId}|${from}|${to}|${count}`);const candidates=[];
    for(const {day,meal} of mealsInRange(days,from,to)){if(meal.locked)continue;const current=map.get(meal.recipeVersionId);if(!current||current.recipe.id===target.recipe.id)continue;const oldN=nutrition(current,meal.portionMultiplier),portion=portionForEnergy(oldN,target),newN=nutrition(target,portion),dist=nutritionDistance(oldN,newN);if(dist>.62)continue;const counts=prefs?prefs.occurrenceCounts(days,day.date,map,calendar):{};const comp=composer.compatibilityScore(target,{mealType:meal.mealType,shift:day.shift,recentRecipeIds:composer.recentRecipeIds(days,day.date,3),preferences,groupOccurrences:counts});const family=sameMealFamily(target,meal.mealType)?42:-25;if(comp.score+family<5)continue;const score=comp.score+family-dist*120+rng()*18;candidates.push({day,meal,current,repl:{entry:target,portionMultiplier:portion,nutritionBefore:oldN,nutritionAfter:newN,distance:dist,score,match:comp},score});}
    candidates.sort((a,b)=>b.score-a.score);const picked=[],usedDates=new Set();const pool=candidates.slice(0,Math.max(Number(count)*8,40));while(picked.length<Number(count)&&pool.length){const max=Math.min(pool.length,Math.max(6,Number(count)*3));const idx=Math.floor(rng()*max),cand=pool.splice(idx,1)[0];if(usedDates.has(cand.day.date))continue;usedDates.add(cand.day.date);picked.push(cand);}
    picked.sort((a,b)=>calendar.compareDates(a.day.date,b.day.date)||String(a.meal.time).localeCompare(String(b.meal.time)));const proposals=picked.map(x=>proposalRecord(x.day,x.meal,x.current,x.repl,`Inserimento casuale bilanciato · scostamento nutrizionale ${Math.round(x.repl.distance*100)}%`,'recipe-schedule'));
    const preview=applyProposals(days,catalog,proposals);return {from,to,requestedCount:Number(count),available:candidates.length,proposals,before:summaryRange(days,map,from,to),after:summaryRange(preview,map,from,to),recipe:{id:target.recipe.id,versionId:target.version.id,title:target.recipe.title}};
  }
  return {LEVEL_LIMIT,resolveRange,mealsInRange,nutritionDistance,portionForEnergy,effectiveLimit,mealOffenses,chooseReplacement,summaryRange,buildRebalanceProposal,applyProposals,buildRecipeScheduleProposal,rngFromSeed};
});
