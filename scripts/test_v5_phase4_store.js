#!/usr/bin/env node
"use strict";
const assert=require('node:assert/strict');
const path=require('node:path');
global.structuredClone=global.structuredClone||((v)=>JSON.parse(JSON.stringify(v)));
const names=['meta','settings','ingredients','ingredientRevisions','recipes','recipeVersions','planInstances','calendarDays','operations','shoppingChecklists'];
const stores=Object.fromEntries(names.map(n=>[n,new Map()]));
function keyFor(store,row){return store==='meta'||store==='settings'?row.key:row.id}
function clone(v){return v===undefined?undefined:structuredClone(v)}
const mockDB={
 get:async(s,k)=>clone(stores[s].get(k)),
 getAll:async(s)=>Array.from(stores[s].values()).map(clone),
 put:async(s,row)=>{stores[s].set(keyFor(s,row),clone(row));return clone(row)},
 openDatabase:async()=>({transaction(){const tx={error:null};tx.objectStore=(s)=>({put:(r)=>stores[s].set(keyFor(s,r),clone(r)),delete:(id)=>stores[s].delete(id)});setImmediate(()=>tx.oncomplete&&tx.oncomplete());return tx;},close(){}}),
};
global.TataDietDB=mockDB;
require(path.resolve(__dirname,'../static/assets/js/v5-recipes-core.js'));
require(path.resolve(__dirname,'../static/assets/js/v5-recipe-store.js'));
const store=global.TataDietRecipeStore;
const now='2026-08-26T16:00:00.000Z';
const ingredient={recordType:'ingredient',id:'usr:ingredient:a',origin:'personal',name:'Ingrediente A',category:'altro',aliases:[],currentRevisionId:'usr:ingredient-revision:a1',createdAt:now,updatedAt:now,archivedAt:null};
const revision={recordType:'ingredientRevision',id:'usr:ingredient-revision:a1',ingredientId:ingredient.id,revisionNumber:1,basis:{amount:100,unit:'g'},preparationState:'as-sold',brand:null,nutrition:{energyKcal:200,proteinG:10,carbohydrateG:30,fatG:5,fiberG:2,sugarsG:null,saturatedFatG:null,saltG:null,sodiumMg:null},conversions:[],allergens:[],toleranceNotes:null,source:{type:'manual',label:'test',url:null,notedAt:now},createdAt:now};
stores.ingredients.set(ingredient.id,ingredient);stores.ingredientRevisions.set(revision.id,revision);
stores.recipes.set('base:recipe:test',{recordType:'recipe',id:'base:recipe:test',origin:'base',immutable:true,title:'Base test',currentVersionId:'base:recipe-version:test',createdAt:now,updatedAt:now,archivedAt:null});
stores.recipeVersions.set('base:recipe-version:test',{recordType:'recipeVersion',id:'base:recipe-version:test',recipeId:'base:recipe:test',versionNumber:1,servings:1,nutritionMode:'calculated',ingredientLines:[{ingredientId:ingredient.id,ingredientRevisionId:revision.id,quantity:50,unit:'g'}],metadata:{mealTypes:['Pranzo'],cuisine:'Italiana',tags:[],prepMinutes:5,instructions:[],mealPrep:{prepareAhead:false,coldSuitable:true,reheatable:false,fridgeHours:null,notes:null},spiceLevel:'none'},calculatedNutrition:{energyKcal:100,proteinG:5,carbohydrateG:15,fatG:2.5,fiberG:1},createdAt:now});
const draft={title:'Ricetta personale',servings:1,mealTypes:['Pranzo'],cuisine:'Italiana',tags:[],prepMinutes:5,spiceLevel:'none',instructions:[],mealPrep:{prepareAhead:false,coldSuitable:true,reheatable:false,fridgeHours:null,notes:null},ingredientLines:[{ingredientId:ingredient.id,ingredientRevisionId:revision.id,amount:50,unitCode:'g'}]};
(async()=>{
 const created=await store.saveDraft(draft);
 assert.equal(created.version.versionNumber,1);assert.ok(stores.recipes.has(created.recipe.id));assert.ok(stores.recipeVersions.has(created.version.id));
 const edited=await store.saveDraft({...draft,title:'Ricetta personale aggiornata',ingredientLines:[{...draft.ingredientLines[0],amount:60}]},created.recipe.id);
 assert.equal(edited.version.versionNumber,2);assert.equal(stores.recipeVersions.size,3);assert.equal(stores.recipes.get(created.recipe.id).currentVersionId,edited.version.id);
 const bundle=await store.getBundle(created.recipe.id);assert.equal(bundle.versions.length,2);assert.equal(bundle.versions[0].versionNumber,2);
 const duplicate=await store.duplicateDraft('base:recipe:test');assert.ok(duplicate.title.includes('personale'));assert.equal(duplicate.ingredientLines[0].ingredientRevisionId,revision.id);
 let baseBlocked=false;try{await store.saveDraft(draft,'base:recipe:test')}catch(e){baseBlocked=/immutabili/.test(e.message)}assert.equal(baseBlocked,true);
 await store.archiveRecipe(created.recipe.id,true);assert.ok(stores.recipes.get(created.recipe.id).archivedAt);await store.archiveRecipe(created.recipe.id,false);assert.equal(stores.recipes.get(created.recipe.id).archivedAt,null);
 stores.calendarDays.set('usr:day:1',{id:'usr:day:1',recipeId:created.recipe.id});const blocked=await store.deleteIfUnused(created.recipe.id);assert.equal(blocked.deleted,false);stores.calendarDays.clear();const deleted=await store.deleteIfUnused(created.recipe.id);assert.equal(deleted.deleted,true);assert.equal(stores.recipes.has(created.recipe.id),false);
 const report={status:'ok',checkpoint:'5.0.0-alpha.4-phase4',checks:{create_persist:true,edit_creates_version:true,version_history:true,duplicate_base:true,base_immutable:true,archive_restore:true,delete_reference_guard:true,delete_unused:true}};console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
