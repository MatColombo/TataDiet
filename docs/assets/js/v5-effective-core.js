(function(global,factory){
  const calendar=global.DietCalendarCore||(typeof module==='object'&&module.exports?require('./calendar-core.js'):null);
  const composer=global.TataDietComposerCore||(typeof module==='object'&&module.exports?require('./v5-composer-core.js'):null);
  const api=factory(calendar,composer);if(typeof module==='object'&&module.exports)module.exports=api;global.TataDietEffectiveCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(core,composer){
  'use strict';
  const dayTypes=globalThis.TataDietDayTypes;
  if(!core) throw new Error('DietCalendarCore non disponibile');
  const NUTRIENTS=['energyKcal','proteinG','carbohydrateG','fatG','fiberG'];
  const CATEGORY_LABELS={
    'orto-frutta':'Ortofrutta','ortofrutta':'Ortofrutta','latticini-e-uova':'Latticini e uova','cereali-pane-e-derivati':'Cereali, pane e derivati',
    'legumi-e-conserve':'Legumi e conserve','carne-pesce-e-affettati':'Carne, pesce e affettati','condimenti-e-dispensa':'Condimenti e dispensa','altro':'Altro'
  };
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
  const minutes=t=>{const m=/^(\d{2}):(\d{2})$/.exec(String(t||''));if(!m)return 0;return Number(m[1])*60+Number(m[2]);};
  const addNutrition=(a,b)=>Object.fromEntries(NUTRIENTS.map(k=>[k,num(a?.[k])+num(b?.[k])]));
  const scaleNutrition=(n,f)=>Object.fromEntries(NUTRIENTS.map(k=>[k,num(n?.[k])*f]));
  const nutritionOfVersion=v=>composer?.nutritionOfVersion?composer.nutritionOfVersion(v):(v?.calculatedNutrition||v?.manualNutrition||{});
  function maps(input={}){
    return {
      recipes:new Map((input.recipes||[]).map(x=>[x.id,x])),versions:new Map((input.versions||[]).map(x=>[x.id,x])),
      ingredients:new Map((input.ingredients||[]).map(x=>[x.id,x])),revisions:new Map((input.revisions||[]).map(x=>[x.id,x]))
    };
  }
  function recipeTitle(recipeId,m){return m.recipes.get(recipeId)?.title||'Ricetta non disponibile';}
  function recipePath(recipe,m){return recipe?.origin==='personal'?`ricette/studio/index.html?recipe=${encodeURIComponent(recipe.id)}`:`ricette/${String(recipe?.id||'').replace(/^base:recipe:/,'')}/index.html`;}
  function mealEvent(day,meal,m){
    const version=m.versions.get(meal.recipeVersionId),recipe=m.recipes.get(meal.recipeId)||m.recipes.get(version?.recipeId);
    const portion=Math.max(.01,num(meal.portionMultiplier,1)); const nutrition=scaleNutrition(nutritionOfVersion(version),portion);
    const meta=version?.metadata||{};const mp=meta.mealPrep||{}; const actualDate=core.addDays(day.date,num(meal.dayOffset));
    return {id:meal.id,meal,day,sourceDate:day.date,actualDate,time:meal.time,minuteOfDay:minutes(meal.time),dayOffset:num(meal.dayOffset),mealType:meal.mealType||'Pasto',
      recipeId:recipe?.id||meal.recipeId,recipeVersionId:version?.id||meal.recipeVersionId,title:recipe?.title||'Ricetta non disponibile',recipe,version,portionMultiplier:portion,nutrition,
      prepMinutes:num(meta.prepMinutes),mealPrep:mp,cuisine:meta.cuisine||'',status:meal.status||'planned',locked:Boolean(meal.locked),source:meal.source||'base',
      href:recipePath(recipe,m)};
  }
  function allEvents(days,m){
    const out=[];(days||[]).forEach(day=>(day.meals||[]).forEach(meal=>{if(meal.status!=='skipped')out.push(mealEvent(day,meal,m));}));
    return out.sort((a,b)=>core.compareDates(a.actualDate,b.actualDate)||a.minuteOfDay-b.minuteOfDay||String(a.id).localeCompare(String(b.id)));
  }
  function eventsOnDate(days,m,date){return allEvents(days,m).filter(e=>e.actualDate===date);}
  function eventsBetween(days,m,date,minute,hours=48){
    const origin=Date.parse(`${date}T00:00:00Z`)+num(minute)*60000,limit=origin+hours*3600000;
    return allEvents(days,m).map(e=>({...e,absolute:Date.parse(`${e.actualDate}T00:00:00Z`)+e.minuteOfDay*60000})).filter(e=>e.absolute>=origin&&e.absolute<=limit).map(e=>({...e,hoursUntil:(e.absolute-origin)/3600000,windowSegment:(e.absolute-origin)<=24*3600000?'first':'second'}));
  }
  function daySummary(day,m){let total={energyKcal:0,proteinG:0,carbohydrateG:0,fatG:0,fiberG:0},resolved=0,unresolved=0;const rows=[];(day?.meals||[]).forEach(meal=>{if(meal.status==='skipped')return;const event=mealEvent(day,meal,m);if(event.version)resolved++;else unresolved++;total=addNutrition(total,event.nutrition);rows.push(event);});return {total,rows,resolved,unresolved};}
  function prepItems(days,m,date,minute,hours=48){return eventsBetween(days,m,date,minute,hours).filter(e=>Boolean(e.mealPrep?.prepareAhead)).map(e=>({...e,urgency:e.hoursUntil<=8?'prioritaria':e.hoursUntil<=24?'entro-24':'tra-24-48',prepDate:e.hoursUntil<=24?date:core.maxDate(date,core.addDays(e.actualDate,-1))}));}
  function ingredientCode(ingredient){return ingredient?.origin==='base'?String(ingredient.id).replace(/^base:ingredient:/,''):ingredient?.id||'ingrediente';}
  function categoryLabel(value){if(!value)return 'Altro';return CATEGORY_LABELS[value]||String(value).replaceAll('-',' ').replace(/(^|\s)\S/g,c=>c.toUpperCase());}
  function aggregateShopping(days,m,from,to,rules={}){
    const items=new Map();let mealCount=0,unresolvedMeals=0;
    allEvents(days,m).filter(e=>core.compareDates(e.actualDate,from)>=0&&core.compareDates(e.actualDate,to)<=0).forEach(e=>{
      mealCount++;const v=e.version;if(!v||(v.ingredientLines||[]).length===0){unresolvedMeals++;return;}const servings=Math.max(.01,num(v.servings,1));
      (v.ingredientLines||[]).forEach(line=>{const ingredient=m.ingredients.get(line.ingredientId);const code=ingredientCode(ingredient);const rule=rules[code]||null;const unit=line.baseUnit||m.revisions.get(line.ingredientRevisionId)?.basis?.unit||'g';
        const base=num(line.baseQuantity??line.normalizedAmount??line.quantity??line.amount);const exact=base/servings*e.portionMultiplier;const key=`${line.ingredientId}|${unit}`;
        if(!items.has(key))items.set(key,{code:line.ingredientId,name:ingredient?.name||code,category:rule?.category||categoryLabel(ingredient?.category),unit,exact:0,suggested:0,roundingStep:num(rule?.rounding_step,0),note:rule?.note||(ingredient?.origin==='personal'?'Ingrediente personale: nessun arrotondamento di confezione definito.':'Quantità calcolata dalle ricette effettive.'),dates:new Set(),meals:0,origin:ingredient?.origin||'unknown'});
        const row=items.get(key);row.exact+=exact;row.dates.add(e.actualDate);row.meals+=1;
      });
    });
    const rows=[...items.values()].map(row=>{row.suggested=row.roundingStep>0?Math.ceil((row.exact-1e-9)/row.roundingStep)*row.roundingStep:row.exact;row.dates=[...row.dates].sort();return row;}).sort((a,b)=>a.category.localeCompare(b.category,'it')||a.name.localeCompare(b.name,'it'));
    return {start:from,end:to,dayCount:core.diffDays(from,to)+1,mealCount,unresolvedMeals,items:rows};
  }
  function icsEscape(v){return String(v??'').replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll(',','\\,').replaceAll(';','\\;');}
  const compact=d=>d.replaceAll('-','');
  function stampUtc(date=new Date()){const d=date instanceof Date?date:new Date(date);const p=n=>String(n).padStart(2,'0');return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;}
  function foldLine(line){const enc=new TextEncoder();if(enc.encode(line).length<=75)return [line];const rows=[];let current='';for(const ch of line){const candidate=current+ch;if(enc.encode(candidate).length>74){rows.push(current);current=' '+ch;}else current=candidate;}if(current)rows.push(current);return rows;}
  function buildIcs(plan,days,m,from,to,includePrep=false,generatedAt=new Date()){
    const selected=(days||[]).filter(d=>core.compareDates(d.date,from)>=0&&core.compareDates(d.date,to)<=0);const dtstamp=stampUtc(generatedAt);const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//TataDiet//V5 Effective Plan//IT','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:TataDiet - piano effettivo','BEGIN:VTIMEZONE','TZID:Europe/Rome','X-LIC-LOCATION:Europe/Rome','BEGIN:DAYLIGHT','TZOFFSETFROM:+0100','TZOFFSETTO:+0200','TZNAME:CEST','DTSTART:19700329T020000','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU','END:DAYLIGHT','BEGIN:STANDARD','TZOFFSETFROM:+0200','TZOFFSETTO:+0100','TZNAME:CET','DTSTART:19701025T030000','RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU','END:STANDARD','END:VTIMEZONE'];
    selected.forEach(day=>{const next=core.addDays(day.date,1),shift=day.shift||{},timed=shift.startTime&&shift.endTime;const summary=day.dayType==='FREE'?'TataDiet · giornata libera':day.dayType==='OFF'?'TataDiet · fuori servizio':`TataDiet ${dayTypes?dayTypes.short(day.dayType):day.dayType} · ${dayTypes?dayTypes.label(day.dayType):(shift.name||day.dayType)}`;lines.push('BEGIN:VEVENT',`UID:tatadiet-${plan?.id||'plan'}-${day.id}@local`,`DTSTAMP:${dtstamp}`);if(timed){const endDate=core.addDays(day.date,num(shift.endDayOffset));lines.push(`DTSTART;TZID=Europe/Rome:${compact(day.date)}T${shift.startTime.replace(':','')}00`,`DTEND;TZID=Europe/Rome:${compact(endDate)}T${shift.endTime.replace(':','')}00`);}else lines.push(`DTSTART;VALUE=DATE:${compact(day.date)}`,`DTEND;VALUE=DATE:${compact(next)}`);
      const mealText=(day.meals||[]).map(meal=>{const e=mealEvent(day,meal,m);return `${e.time}${e.dayOffset?` +${e.dayOffset}g`:''} ${e.mealType}: ${e.title}`;}).join('\n');lines.push(`SUMMARY:${icsEscape(summary)}`,`DESCRIPTION:${icsEscape(`${day.adherenceStatus==='not-followed'?'Non seguita. ':''}${mealText}`)}`,`CATEGORIES:${icsEscape(dayTypes?dayTypes.short(day.dayType):day.dayType)}`,'TRANSP:TRANSPARENT','END:VEVENT');});
    if(includePrep){const groups=new Map();allEvents(selected,m).filter(e=>e.mealPrep?.prepareAhead).forEach(e=>{const d=core.addDays(e.actualDate,-1);if(core.compareDates(d,from)<0)return;const key=d;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);});groups.forEach((events,date)=>{lines.push('BEGIN:VEVENT',`UID:tatadiet-prep-${plan?.id||'plan'}-${date}@local`,`DTSTAMP:${dtstamp}`,`DTSTART;TZID=Europe/Rome:${compact(date)}T180000`,`DTEND;TZID=Europe/Rome:${compact(date)}T183000`,`SUMMARY:${icsEscape('TataDiet · meal prep')}`,`DESCRIPTION:${icsEscape(events.map(e=>e.title).join('\n'))}`,'END:VEVENT');});}
    lines.push('END:VCALENDAR');return lines.flatMap(foldLine).join('\r\n')+'\r\n';
  }
  function personalSearchEntries(input,m,start){const out=[];(input.recipes||[]).filter(r=>r.origin==='personal'&&!r.archivedAt).forEach(r=>{const v=m.versions.get(r.currentVersionId);out.push({type:'recipe',type_label:'Ricetta personale',title:r.title,subtitle:`Ricetta personale${v?` · ${Math.round(num(nutritionOfVersion(v).energyKcal))} kcal/porzione`:''}`,badges:['Personale'],text:[r.title,...(r.mealTypes||[]),...(r.cuisines||[])].join(' '),href:`ricette/studio/index.html?recipe=${encodeURIComponent(r.id)}`});});(input.ingredients||[]).filter(i=>i.origin==='personal'&&!i.archivedAt).forEach(i=>out.push({type:'ingredient',type_label:'Ingrediente personale',title:i.name,subtitle:categoryLabel(i.category),badges:['Personale'],text:[i.name,...(i.aliases||[])].join(' '),href:`ingredienti/index.html?ingredient=${encodeURIComponent(i.id)}`}));(input.days||[]).filter(d=>d.source!=='base'||d.adherenceStatus!=='planned').forEach(d=>{const uiShort=dayTypes?dayTypes.short(d.dayType):d.dayType,uiLabel=dayTypes?dayTypes.label(d.dayType):(d.shift?.name||d.dayType);out.push({type:'day',type_label:'Giornata personale',title:`${d.date} · ${uiShort}`,subtitle:`${uiLabel} · ${d.meals?.length||0} pasti`,badges:[d.source==='base'?'Aderenza':'Modificata'],text:`${d.date} ${d.dayType} ${uiShort} ${uiLabel} ${d.adherenceStatus}`,href:`calendario/gestisci/index.html?start=${encodeURIComponent(start||'')}&focus=${encodeURIComponent(d.date)}`});});return out;}
  return {NUTRIENTS,maps,nutritionOfVersion,scaleNutrition,addNutrition,mealEvent,allEvents,eventsOnDate,eventsBetween,daySummary,prepItems,aggregateShopping,buildIcs,personalSearchEntries,categoryLabel};
});
