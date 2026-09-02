(() => {
  "use strict";
  if (document.body.dataset.page !== "recipe-studio") return;
  const db = window.TataDietDB, core = window.TataDietRecipeCore, store = window.TataDietRecipeStore;
  if (!db || !core || !store) return;

  const $ = (s, r=document) => r.querySelector(s), $$ = (s,r=document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const fmt = (v,d=1) => Number.isFinite(Number(v)) ? Number(v).toLocaleString("it-IT", {maximumFractionDigits:d}) : "—";
  const statusHost = $("[data-recipes-status]"), loading=$("[data-recipes-loading]"), apps=$$("[data-recipes-app]");
  const grid=$("[data-recipe-studio-grid]"), empty=$("[data-recipe-studio-empty]"), search=$("[data-recipe-studio-search]"), origin=$("[data-recipe-studio-origin]"), statusFilter=$("[data-recipe-studio-status]");
  const dialog=$("[data-recipe-dialog]"), form=$("[data-recipe-form]"), lineList=$("[data-recipe-line-list]"), lineTemplate=$("#recipe-line-template"), lineEmpty=$("[data-recipe-line-empty]");
  const historyDialog=$("[data-recipe-history-dialog]");
  let recipeRows=[], ingredients=[], revisions=[], revisionById=new Map(), ingredientById=new Map(), editingRecipeId=null, liveValidation=null;

  function setStatus(message,tone="ok") { statusHost.textContent=message; statusHost.className=`tool-status ${tone}`; statusHost.hidden=false; clearTimeout(setStatus.timer); setStatus.timer=setTimeout(()=>statusHost.hidden=true,7000); }
  function isBase(recipe){ return store.isBase(recipe); }
  function nutritionOf(version){ return version?.calculatedNutrition || version?.manualNutrition || version?.nutrition?.values_per_serving || {}; }
  function metadataOf(version){ return version?.metadata || {}; }
  function card(row){
    const r=row.recipe,v=row.version,n=nutritionOf(v),m=metadataOf(v),base=isBase(r),arch=!!r.archivedAt;
    const meal=(m.mealTypes||r.mealTypes||r.meal_types||[]).join(" · ") || "Pasto";
    const cuisine=m.cuisine || v?.cuisine || "—";
    const action=base
      ? `<button class="button secondary compact" data-recipe-action="duplicate" data-id="${esc(r.id)}">Duplica e personalizza</button>`
      : `<button class="button secondary compact" data-recipe-action="edit" data-id="${esc(r.id)}">Modifica</button>${arch?'':`<a class="button secondary compact" href="../programma/index.html?recipe=${encodeURIComponent(r.id)}">Programma</a>`}<button class="button ghost compact" data-recipe-action="history" data-id="${esc(r.id)}">Versioni</button><button class="button ghost compact" data-recipe-action="${arch?'restore':'archive'}" data-id="${esc(r.id)}">${arch?'Riattiva':'Archivia'}</button>${arch?`<button class="button danger-soft compact" data-recipe-action="delete" data-id="${esc(r.id)}">Elimina</button>`:""}`;
    const ingredientCount=(v?.ingredientLines||v?.ingredient_lines||[]).length;
    return `<article class="recipe-studio-card ${arch?'is-archived':''}" data-search="${esc(core.normalize(`${r.title} ${meal} ${cuisine}`))}"><div class="recipe-studio-card-top"><span class="origin-pill ${base?'base':'personal'}">${base?'TataDiet':'Personale'}</span>${arch?'<span class="status-pill">Archiviata</span>':`<span>v${esc(v?.versionNumber ?? v?.revision ?? 1)}</span>`}</div><h2>${esc(r.title)}</h2><p>${esc(meal)} · ${esc(cuisine)} · ${ingredientCount} ingredienti</p><div class="recipe-mini-nutrition"><span><strong>${fmt(n.energyKcal ?? n.energy_kcal,0)}</strong> kcal</span><span><strong>${fmt(n.proteinG ?? n.protein_g)}</strong> P</span><span><strong>${fmt(n.fiberG ?? n.fiber_g)}</strong> fibra</span></div><div class="card-actions">${action}</div></article>`;
  }
  function render(){
    const q=core.normalize(search.value), o=origin.value, st=statusFilter.value;
    const filtered=recipeRows.filter(({recipe})=>{
      if(q && !(recipeRows.find((x)=>x.recipe.id===recipe.id)?.searchText||core.normalize(recipe.title)).includes(q)) return false;
      if(o==="base" && !isBase(recipe)) return false; if(o==="personal" && isBase(recipe)) return false;
      if(st==="active" && recipe.archivedAt) return false; if(st==="archived" && !recipe.archivedAt) return false; return true;
    });
    grid.innerHTML=filtered.map(card).join(""); $("[data-recipe-studio-results]").textContent=filtered.length.toLocaleString("it-IT"); empty.hidden=filtered.length>0;
  }
  async function reload(){
    [recipeRows,{ingredients,revisions}] = await Promise.all([store.listRecipes({includeArchived:true}), store.ingredientContext({activeOnly:false})]);
    revisionById=new Map(revisions.map(x=>[x.id,x])); ingredientById=new Map(ingredients.map(x=>[x.id,x]));
    recipeRows.forEach((row)=>{ const names=(row.version?.ingredientLines||row.version?.ingredient_lines||[]).map((line)=>ingredientById.get(line.ingredientId||line.ingredient_id)?.name||""); row.searchText=core.normalize([row.recipe.title, ...(row.version?.metadata?.mealTypes||[]), row.version?.metadata?.cuisine||"", ...names].join(" ")); });
    const personalIds=new Set(recipeRows.filter(x=>!isBase(x.recipe)).map(x=>x.recipe.id));
    const allVersions=await db.getAll("recipeVersions");
    $("[data-recipe-count-base]").textContent=recipeRows.filter(x=>isBase(x.recipe)).length.toLocaleString("it-IT");
    $("[data-recipe-count-personal]").textContent=recipeRows.filter(x=>!isBase(x.recipe)&&!x.recipe.archivedAt).length.toLocaleString("it-IT");
    $("[data-recipe-count-archived]").textContent=recipeRows.filter(x=>!isBase(x.recipe)&&x.recipe.archivedAt).length.toLocaleString("it-IT");
    $("[data-recipe-count-versions]").textContent=allVersions.filter(x=>personalIds.has(x.recipeId)).length.toLocaleString("it-IT");
    render();
  }

  function ingredientOptions(selected=""){
    const active=ingredients.filter(i=>!i.archivedAt || i.id===selected);
    const base=active.filter(i=>isBase(i)), personal=active.filter(i=>!isBase(i));
    const options=(rows)=>rows.map(i=>`<option value="${esc(i.id)}" ${i.id===selected?'selected':''}>${esc(i.name)}</option>`).join("");
    return `<option value="">Seleziona…</option><optgroup label="Personali">${options(personal)}</optgroup><optgroup label="TataDiet">${options(base)}</optgroup>`;
  }
  function updateLineUnits(row, preferred=null){
    const ingredientId=$("[data-line=ingredientId]",row).value, ingredient=ingredientById.get(ingredientId);
    const revisionId=row.dataset.revisionId || ingredient?.currentRevisionId || "";
    const rev=revisionById.get(revisionId) || revisionById.get(ingredient?.currentRevisionId), select=$("[data-line=unitCode]",row);
    if (rev) row.dataset.revisionId=rev.id;
    const units=core.unitsForRevision(rev); select.innerHTML=units.map(u=>`<option value="${esc(u.unitCode)}">${esc(u.labelSingular||u.unitCode)}</option>`).join("");
    if(preferred && units.some(u=>u.unitCode===preferred)) select.value=preferred;
  }
  function addLine(values={}){
    const fragment=lineTemplate.content.cloneNode(true), row=$(".recipe-editor-line",fragment);
    const select=$("[data-line=ingredientId]",row); select.innerHTML=ingredientOptions(values.ingredientId||"");
    if(values.ingredientId) select.value=values.ingredientId;
    if(values.ingredientRevisionId) row.dataset.revisionId=values.ingredientRevisionId;
    $("[data-line=amount]",row).value=values.amount ?? 100; $("[data-line=notes]",row).value=values.notes||""; $("[data-line=optional]",row).checked=!!values.optional;
    updateLineUnits(row, values.unitCode); lineList.appendChild(fragment); lineEmpty.hidden=true; validateLive();
  }
  function collectLines(){ return $$(".recipe-editor-line",lineList).map(row=>({ingredientId:$("[data-line=ingredientId]",row).value, ingredientRevisionId:row.dataset.revisionId || ingredientById.get($("[data-line=ingredientId]",row).value)?.currentRevisionId||"", amount:$("[data-line=amount]",row).value, unitCode:$("[data-line=unitCode]",row).value, optional:$("[data-line=optional]",row).checked, notes:$("[data-line=notes]",row).value})); }
  function collectDraft(){ const d=new FormData(form); return {title:d.get("title"),servings:d.get("servings"),mealTypes:d.get("mealTypes"),cuisine:d.get("cuisine"),tags:d.get("tags"),prepMinutes:d.get("prepMinutes"),spiceLevel:d.get("spiceLevel"),instructions:d.get("instructions"),notes:d.get("notes"),mealPrep:{prepareAhead:d.get("prepareAhead")==="on",coldSuitable:d.get("coldSuitable")==="on",reheatable:d.get("reheatable")==="on",fridgeHours:d.get("fridgeHours"),notes:d.get("mealPrepNotes")},ingredientLines:collectLines()}; }
  function updateLinePreview(validation){ $$(".recipe-editor-line",lineList).forEach((row,i)=>{ const r=validation.lineResults[i]; const err=$("[data-line-error]",row); if(!r) return; $("[data-line-normalized]",row).textContent=Number.isFinite(r.record.normalizedAmount)?`${fmt(r.record.normalizedAmount,2)} ${r.revision?.basis?.unit||''}`:"—"; $("[data-line-kcal]",row).textContent=`${fmt(r.nutrition.energyKcal,0)} kcal`; err.hidden=r.errors.length===0; err.textContent=r.errors.join(" "); }); }
  function renderValidation(v){ liveValidation=v; const p=v.perServing,t=v.totalNutrition; $("[data-recipe-preview-kcal]").textContent=fmt(p.energyKcal,0); $("[data-recipe-preview-protein]").textContent=fmt(p.proteinG); $("[data-recipe-preview-carbs]").textContent=fmt(p.carbohydrateG); $("[data-recipe-preview-fat]").textContent=fmt(p.fatG); $("[data-recipe-preview-fiber]").textContent=fmt(p.fiberG); $("[data-recipe-total-kcal]").textContent=`${fmt(t.energyKcal,0)} kcal`; updateLinePreview(v);
    const host=$("[data-recipe-validation]"); if(v.errors.length){host.className="validation-preview has-errors";host.innerHTML=`<strong>${v.errors.length} problemi da correggere</strong><ul>${v.errors.slice(0,6).map(e=>`<li>${esc(e.message)}</li>`).join("")}</ul>`;} else if(v.warnings.length){host.className="validation-preview has-warnings";host.innerHTML=`<strong>Ricetta salvabile · ${v.warnings.length} avvisi</strong><ul>${v.warnings.slice(0,6).map(e=>`<li>${esc(e.message)}</li>`).join("")}</ul>`;} else {host.className="validation-preview is-valid";host.innerHTML="<strong>Ricetta coerente</strong><p>Ingredienti e calcolo nutrizionale sono completi.</p>";} $("[data-save-recipe]").disabled=!v.valid;
  }
  function validateLive(){ try{ renderValidation(core.validateDraft(collectDraft(),ingredients,revisions,recipeRows.map(x=>x.recipe),editingRecipeId)); }catch(e){} }
  function resetForm(){ form.reset(); lineList.innerHTML=""; lineEmpty.hidden=false; editingRecipeId=null; form.elements.servings.value=1; form.elements.cuisine.value="Italiana"; form.elements.prepMinutes.value=10; form.elements.spiceLevel.value="none"; $("[data-recipe-dialog-eyebrow]").textContent="Ricetta personale"; $("[data-recipe-dialog-title]").textContent="Nuova ricetta"; $("[data-recipe-dialog-subtitle]").textContent="Componi la ricetta usando ingredienti con valori nutrizionali versionati."; $("[data-recipe-save-explanation]").textContent="Il salvataggio creerà la versione 1."; }
  function fillForm(d){ const f=form.elements; f.title.value=d.title||"";f.servings.value=d.servings||1;f.mealTypes.value=(d.mealTypes||[]).join(", ");f.cuisine.value=d.cuisine||"Italiana";f.tags.value=(d.tags||[]).join(", ");f.prepMinutes.value=d.prepMinutes||0;f.spiceLevel.value=d.spiceLevel||"none";f.instructions.value=(d.instructions||[]).join("\n");f.notes.value=d.notes||"";f.prepareAhead.checked=!!d.mealPrep?.prepareAhead;f.coldSuitable.checked=!!d.mealPrep?.coldSuitable;f.reheatable.checked=!!d.mealPrep?.reheatable;f.fridgeHours.value=d.mealPrep?.fridgeHours??"";f.mealPrepNotes.value=d.mealPrep?.notes||"";lineList.innerHTML="";(d.ingredientLines||[]).forEach(addLine);if(!d.ingredientLines?.length)addLine();validateLive(); }
  function showDialog(){ if(dialog.showModal) dialog.showModal(); else dialog.setAttribute("open",""); setTimeout(()=>form.elements.title.focus(),50); }
  async function openNew(){resetForm();addLine();showDialog();}
  async function openDuplicate(id){resetForm();const d=await store.duplicateDraft(id);$("[data-recipe-dialog-eyebrow]").textContent="Copia personale";$("[data-recipe-dialog-title]").textContent="Duplica ricetta TataDiet";$("[data-recipe-dialog-subtitle]").textContent="La ricetta originale resta immutabile.";fillForm(d);showDialog();}
  async function openEdit(id){resetForm();const b=await store.getBundle(id);if(!b)throw new Error("Ricetta non trovata");editingRecipeId=id;$("[data-recipe-dialog-eyebrow]").textContent=`Versione ${Number(b.currentVersion?.versionNumber||0)+1}`;$("[data-recipe-dialog-title]").textContent=`Modifica ${b.recipe.title}`;$("[data-recipe-dialog-subtitle]").textContent="La versione corrente resterà nello storico.";$("[data-recipe-save-explanation]").textContent=`Il salvataggio creerà la versione ${Number(b.currentVersion?.versionNumber||0)+1}.`;fillForm(core.draftFromRecords(b.recipe,b.currentVersion));showDialog();}
  async function showHistory(id){const b=await store.getBundle(id);if(!b)return;$("[data-recipe-history-title]").textContent=`${b.recipe.title} · versioni`;$("[data-recipe-version-timeline]").innerHTML=b.versions.map(v=>{const n=nutritionOf(v),current=v.id===b.recipe.currentVersionId;return `<article class="revision-entry ${current?'is-current':''}"><div class="revision-entry-head"><div><span class="ingredient-revision-badge">v${esc(v.versionNumber??v.revision??1)}</span>${current?'<span class="status-pill success">Corrente</span>':''}</div><time>${esc(v.createdAt?new Date(v.createdAt).toLocaleString('it-IT'):'dataset base')}</time></div><div class="recipe-mini-nutrition"><span>${fmt(n.energyKcal??n.energy_kcal,0)} kcal</span><span>${fmt(n.proteinG??n.protein_g)} g P</span><span>${(v.ingredientLines||v.ingredient_lines||[]).length} ingredienti</span></div></article>`;}).join(""); if(historyDialog.showModal) historyDialog.showModal();else historyDialog.setAttribute("open","");}

  lineList.addEventListener("change",e=>{const row=e.target.closest(".recipe-editor-line");if(!row)return;if(e.target.matches('[data-line=ingredientId]')){ row.dataset.revisionId=ingredientById.get(e.target.value)?.currentRevisionId||""; updateLineUnits(row); }validateLive();}); lineList.addEventListener("input",validateLive); lineList.addEventListener("click",e=>{const b=e.target.closest("[data-remove-recipe-line]");if(!b)return;b.closest(".recipe-editor-line").remove();lineEmpty.hidden=lineList.children.length>0;validateLive();});
  form.addEventListener("input",validateLive); form.addEventListener("change",validateLive); $("[data-add-recipe-line]").addEventListener("click",()=>addLine()); $("[data-new-recipe]").addEventListener("click",openNew); $$('[data-close-recipe-dialog]').forEach((button)=>button.addEventListener('click',()=>dialog.close())); [search,origin,statusFilter].forEach(el=>el.addEventListener(el.tagName==="INPUT"?"input":"change",render));
  grid.addEventListener("click",async e=>{const b=e.target.closest("[data-recipe-action]");if(!b)return;try{const {recipeAction:action,id}=b.dataset;if(action==="duplicate")await openDuplicate(id);else if(action==="edit")await openEdit(id);else if(action==="history")await showHistory(id);else if(action==="archive"||action==="restore"){await store.archiveRecipe(id,action==="archive");await reload();setStatus(action==="archive"?"Ricetta archiviata.":"Ricetta riattivata.");}else if(action==="delete"){if(!confirm("Eliminare definitivamente questa ricetta personale e tutte le sue versioni?"))return;const r=await store.deleteIfUnused(id);if(!r.deleted)throw new Error("La ricetta è già referenziata dal piano personale e non può essere eliminata.");await reload();setStatus("Ricetta eliminata.");}}catch(err){setStatus(err.message||String(err),"error");}});
  form.addEventListener("submit",async e=>{e.preventDefault();validateLive();if(!liveValidation?.valid)return;const button=$("[data-save-recipe]");button.disabled=true;try{const result=await store.saveDraft(collectDraft(),editingRecipeId);dialog.close();await reload();setStatus(`Ricetta salvata · versione ${result.version.versionNumber} · ${fmt(result.version.calculatedNutrition.energyKcal,0)} kcal/porzione.`);}catch(err){setStatus(err.message||String(err),"error");}finally{button.disabled=false;}});

  async function init(){try{const init=await db.initialize();await reload();loading.hidden=true;apps.forEach(x=>x.hidden=false);const params=new URLSearchParams(location.search);if(params.get("new")==="1")await openNew();else if(params.get("recipe")){const id=params.get("recipe"),r=recipeRows.find(x=>x.recipe.id===id);if(r){if(isBase(r.recipe))await openDuplicate(id);else await openEdit(id);}}}catch(err){loading.textContent=`Impossibile inizializzare lo Studio ricette: ${err.message}`;loading.classList.add("error");}}
  init();
})();
