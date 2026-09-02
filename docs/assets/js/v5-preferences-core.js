(function(global,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;global.TataDietFoodPreferences=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const LEVELS=['more','normal','less','rare','never'];
  const GROUPS=[
    {id:'eggs',label:'Uova',hint:'uova, albume, tuorlo'},
    {id:'milkYogurt',label:'Latte e yogurt',hint:'latte, yogurt, kefir, skyr'},
    {id:'cheese',label:'Formaggi',hint:'mozzarella, ricotta, grana, feta e simili'},
    {id:'coldCuts',label:'Affettati',hint:'prosciutto, bresaola, fesa e simili'},
    {id:'fish',label:'Pesce',hint:'pesce e conserve ittiche'},
    {id:'legumes',label:'Legumi',hint:'ceci, lenticchie, fagioli, piselli'},
    {id:'redMeat',label:'Carne rossa',hint:'manzo, vitello, bovino, maiale'},
  ];
  const LEVEL_LABELS={more:'Più spesso',normal:'Normale',less:'Meno spesso',rare:'Raramente',never:'Mai'};
  function defaults(){const groups={};GROUPS.forEach(g=>groups[g.id]={level:'normal',maxPer7Days:null});return {schemaVersion:1,groups};}
  function normalize(input){const out=defaults(),src=input?.groups||{};GROUPS.forEach(g=>{const row=src[g.id]||{};out.groups[g.id]={level:LEVELS.includes(row.level)?row.level:'normal',maxPer7Days:Number.isFinite(Number(row.maxPer7Days))&&Number(row.maxPer7Days)>0?Math.min(21,Math.round(Number(row.maxPer7Days))):null};});return out;}
  function lineText(version,ingredientById=null){const lines=version?.ingredientLines||version?.ingredient_lines||[];return lines.map(x=>x.displayText||x.label||x.source_text||x.ingredient_code||ingredientById?.get?.(x.ingredientId||x.ingredient_id)?.name||'').join(' | ').toLocaleLowerCase('it');}
  function groupsForVersion(version,recipe=null,ingredientById=null){const ingredients=lineText(version,ingredientById).trim(),source=ingredients||String(recipe?.title||'');const text=source.toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g,'');const out=new Set();const dairyText=text.replace(/\blatte di (?:cocco|mandorl\w*|soia|avena|riso)\b/g,'');
    if(/\b(uov[oaie]?|albume|tuorlo)\b/.test(text))out.add('eggs');
    if(/\b(latte|yogurt|kefir|skyr)\b/.test(dairyText))out.add('milkYogurt');
    if(/formagg|mozzarella|ricotta|parmig|grana|robiola|crescenza|stracchino|feta|pecorino|provol|scamorza|fiocchi di latte|mascarpone|primosale/.test(text))out.add('cheese');
    if(/prosciutto|bresaola|fesa di tacchino|speck|mortadella|salame|affettat/.test(text))out.add('coldCuts');
    if(/tonno|salmone|merluzzo|orata|branzino|sgombro|sardina|acciug|gamber|pesce|trota|nasello/.test(text))out.add('fish');
    if(/\b(ceci|lenticchi|fagiol|pisell|cicerchi|edamame)\b/.test(text))out.add('legumes');
    if(/\b(manzo|vitello|bovino|maiale|suino)\b/.test(text))out.add('redMeat');
    return [...out];
  }
  function occurrenceCounts(days,targetDate,catalogByVersion,calendarCore){const counts={};GROUPS.forEach(g=>counts[g.id]=0);if(!targetDate||!calendarCore)return counts;(days||[]).forEach(day=>{if(day.date===targetDate)return;const dist=Math.abs(calendarCore.diffDays(targetDate,day.date));if(dist>3)return;(day.meals||[]).forEach(meal=>{const e=catalogByVersion.get(meal.recipeVersionId);(e?.foodGroups||[]).forEach(g=>{if(counts[g]!==undefined)counts[g]++;});});});return counts;}
  function scoreAdjustment(entry,preferences,counts={}){const prefs=normalize(preferences);let score=0,avoidAutomatic=false;const reasons=[],warnings=[];(entry?.foodGroups||[]).forEach(group=>{const p=prefs.groups[group]||{level:'normal',maxPer7Days:null},n=Number(counts[group]||0);if(p.level==='more'){score+=12;reasons.push(`${GROUPS.find(g=>g.id===group)?.label||group}: preferito`);}else if(p.level==='less'){score-=10+Math.min(12,n*3);warnings.push(`${GROUPS.find(g=>g.id===group)?.label||group}: preferenza “meno spesso”`);}else if(p.level==='rare'){score-=24+Math.min(18,n*4);warnings.push(`${GROUPS.find(g=>g.id===group)?.label||group}: preferenza “raramente”`);}else if(p.level==='never'){score-=1000;avoidAutomatic=true;warnings.push(`${GROUPS.find(g=>g.id===group)?.label||group}: impostato su “mai”`);}if(p.maxPer7Days&&n>=p.maxPer7Days){score-=1000;avoidAutomatic=true;warnings.push(`${GROUPS.find(g=>g.id===group)?.label||group}: limite di ${p.maxPer7Days} occasioni/7 giorni già raggiunto`);}});return {score,avoidAutomatic,reasons,warnings};}
  return {LEVELS,GROUPS,LEVEL_LABELS,defaults,normalize,groupsForVersion,occurrenceCounts,scoreAdjustment};
});
