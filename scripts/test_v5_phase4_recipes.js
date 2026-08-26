#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const core = require(path.join(root, "static/assets/js/v5-recipes-core.js"));

const now = "2026-08-26T15:00:00.000Z";
const ingredients = [
  { recordType:"ingredient", id:"usr:ingredient:pane", origin:"personal", name:"Pane prova", category:"cereali-pane-e-derivati", aliases:[], currentRevisionId:"usr:ingredient-revision:pane@2", createdAt:now, updatedAt:now, archivedAt:null },
  { recordType:"ingredient", id:"usr:ingredient:mozz", origin:"personal", name:"Mozzarella prova", category:"latticini-e-uova", aliases:[], currentRevisionId:"usr:ingredient-revision:mozz@1", createdAt:now, updatedAt:now, archivedAt:null },
  { recordType:"ingredient", id:"usr:ingredient:fibra", origin:"personal", name:"Fibra prova", category:"altro", aliases:[], currentRevisionId:"usr:ingredient-revision:fibra@1", createdAt:now, updatedAt:now, archivedAt:null },
];
const rev = (id, ingredientId, revisionNumber, kcal, p,c,f,fiber, conversions=[]) => ({
  recordType:"ingredientRevision", id, ingredientId, revisionNumber, basis:{amount:100,unit:"g"}, preparationState:"as-sold", brand:null,
  nutrition:{energyKcal:kcal,proteinG:p,carbohydrateG:c,fatG:f,fiberG:fiber,sugarsG:null,saturatedFatG:null,saltG:null,sodiumMg:null},
  conversions, allergens:[], toleranceNotes:null, source:{type:"manual",label:"Test",url:null,notedAt:now}, createdAt:now,
});
const revisions = [
  rev("usr:ingredient-revision:pane@1","usr:ingredient:pane",1,250,8,50,2,3,[{unitCode:"fetta",labelSingular:"fetta",labelPlural:"fette",basisAmount:40,isDefault:true,notes:null}]),
  rev("usr:ingredient-revision:pane@2","usr:ingredient:pane",2,270,9,51,3,3,[{unitCode:"fetta",labelSingular:"fetta",labelPlural:"fette",basisAmount:40,isDefault:true,notes:null}]),
  rev("usr:ingredient-revision:mozz@1","usr:ingredient:mozz",1,250,18,2,19,0),
  rev("usr:ingredient-revision:fibra@1","usr:ingredient:fibra",1,200,10,30,2,40),
];

const draft = {
  title:"Toast mozzarella test", servings:2, mealTypes:["Pranzo"], cuisine:"Italiana", tags:["test"], prepMinutes:10,
  spiceLevel:"none", instructions:["Componi", "Scalda"], notes:"test", mealPrep:{prepareAhead:true,coldSuitable:true,reheatable:true,fridgeHours:24,notes:null},
  ingredientLines:[
    {ingredientId:"usr:ingredient:pane",ingredientRevisionId:"usr:ingredient-revision:pane@1",amount:2,unitCode:"fetta",optional:false,notes:null},
    {ingredientId:"usr:ingredient:mozz",ingredientRevisionId:"usr:ingredient-revision:mozz@1",amount:60,unitCode:"g",optional:false,notes:null},
  ]
};

(async()=>{
  const validation = core.validateDraft(draft, ingredients, revisions, []);
  assert.equal(validation.valid, true);
  assert.equal(validation.lineResults[0].record.normalizedAmount, 80);
  assert.equal(validation.lineResults[0].record.ingredientRevisionId, "usr:ingredient-revision:pane@1");
  assert.ok(Math.abs(validation.totalNutrition.energyKcal - 350) < 1e-9);
  assert.ok(Math.abs(validation.perServing.energyKcal - 175) < 1e-9);
  assert.ok(Math.abs(validation.perServing.proteinG - 8.6) < 1e-9);

  const made1 = await core.makePersonalRecords(draft,{ingredients,revisions,recipes:[],now});
  assert.equal(made1.recipe.origin,"personal");
  assert.equal(made1.version.versionNumber,1);
  assert.equal(made1.version.supersedesVersionId,null);
  assert.equal(made1.version.ingredientLines[0].ingredientRevisionId,"usr:ingredient-revision:pane@1");
  assert.equal(made1.version.calculation.inputDigest.length,64);

  // Ingredient current revision is @2, but editing a recipe created with @1 must preserve @1 until the user changes the ingredient.
  const editDraft = core.draftFromRecords(made1.recipe,made1.version);
  assert.equal(editDraft.ingredientLines[0].ingredientRevisionId,"usr:ingredient-revision:pane@1");
  editDraft.title="Toast mozzarella test aggiornato";
  editDraft.ingredientLines[1].amount=80;
  const made2 = await core.makePersonalRecords(editDraft,{ingredients,revisions,recipes:[made1.recipe],existingRecipe:made1.recipe,currentVersion:made1.version,now:"2026-08-26T15:05:00.000Z"});
  assert.equal(made2.recipe.id,made1.recipe.id);
  assert.equal(made2.version.versionNumber,2);
  assert.equal(made2.version.supersedesVersionId,made1.version.id);
  assert.equal(made2.version.ingredientLines[0].ingredientRevisionId,"usr:ingredient-revision:pane@1");
  assert.notEqual(made2.version.id,made1.version.id);

  const badConversion = core.validateDraft({...draft, ingredientLines:[{...draft.ingredientLines[0],unitCode:"vasetto"}]},ingredients,revisions,[]);
  assert.equal(badConversion.valid,false);
  assert.ok(badConversion.errors.some(e=>e.message.includes("conversione")));

  const highFiber = core.validateDraft({...draft, servings:1, ingredientLines:[{ingredientId:"usr:ingredient:fibra",ingredientRevisionId:"usr:ingredient-revision:fibra@1",amount:40,unitCode:"g"}]},ingredients,revisions,[]);
  assert.equal(highFiber.valid,true);
  assert.ok(highFiber.warnings.some(e=>e.code==="fiber-high"));

  const duplicateTitle = core.validateDraft(draft,ingredients,revisions,[{id:"other",title:"Toast mozzarella test",archivedAt:null}]);
  assert.ok(duplicateTitle.warnings.some(e=>e.code==="duplicate-title"));

  const sample={recipe:made2.recipe,version:made2.version};
  const qaDir=path.join(root,"qa/v5-phase4"); fs.mkdirSync(qaDir,{recursive:true});
  fs.writeFileSync(path.join(qaDir,"recipe-schema-sample.json"),JSON.stringify(sample,null,2)+"\n");
  const report={status:"ok",checkpoint:"5.0.0-alpha.4-phase4",checks:{conversion_normalization:true,nutrition_recalculation:true,per_serving:true,immutable_ingredient_revision_reference:true,new_recipe:true,new_recipe_version:true,supersedes_version:true,missing_conversion_blocked:true,high_fiber_warning:true,duplicate_title_warning:true,input_digest_sha256_shape:true}};
  fs.writeFileSync(path.join(qaDir,"recipe-core-report.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
})().catch((error)=>{ console.error(error); process.exit(1); });
