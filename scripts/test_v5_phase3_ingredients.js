const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
global.crypto = webcrypto;
global.structuredClone = global.structuredClone || ((v) => JSON.parse(JSON.stringify(v)));

const core = require(path.resolve(__dirname, '../static/assets/js/v5-ingredients-core.js'));
global.TataDietIngredientCore = core;

const names = ['meta','settings','ingredients','ingredientRevisions','recipes','recipeVersions','planInstances','calendarDays','operations','shoppingChecklists'];
const stores = Object.fromEntries(names.map((name) => [name, new Map()]));
const keyFor = (store, row) => (store === 'meta' || store === 'settings') ? row.key : row.id;
function clone(v) { return v === undefined ? undefined : structuredClone(v); }
function put(store, row) { stores[store].set(keyFor(store,row), clone(row)); return Promise.resolve(clone(row)); }
const mockDB = {
  get: async (store,key) => clone(stores[store].get(key)),
  getAll: async (store) => Array.from(stores[store].values()).map(clone),
  put,
  openDatabase: async () => ({
    transaction() {
      const tx = { error:null };
      tx.objectStore = (store) => ({
        put: (row) => stores[store].set(keyFor(store,row), clone(row)),
        delete: (key) => stores[store].delete(key),
      });
      setImmediate(() => tx.oncomplete && tx.oncomplete());
      return tx;
    },
    close() {},
  }),
};
global.TataDietDB = mockDB;
const ingredientStore = require(path.resolve(__dirname, '../static/assets/js/v5-ingredient-store.js'));

const validDraft = {
  name: 'Mozzarella test', category: 'latticini-e-uova', aliases: 'fiordilatte test', basisUnit: 'g', preparationState: 'as-sold', brand: 'Test',
  energyKcal: 240, proteinG: 18, carbohydrateG: 2, fatG: 18, fiberG: 0,
  sugarsG: 1, saturatedFatG: 12, saltG: 0.7, sodiumMg: 280,
  sourceType: 'label', sourceLabel: 'Etichetta test', sourceUrl: 'https://example.com/label', allergens: 'latte', toleranceNotes: '',
  conversions: [{ unitCode:'portion', labelSingular:'porzione', labelPlural:'porzioni', basisAmount:80, basisUnit:'g', notes:'porzione pratica' }],
};

(async () => {
  // Pure validation.
  const ok = core.validateDraft(validDraft, []);
  assert.equal(ok.valid, true);
  assert.equal(ok.errors.length, 0);
  assert.equal(Math.round(ok.atwaterKcal), 242);
  const mlDraft=core.validateDraft({...validDraft,name:'Latte test ml',basisUnit:'ml',conversions:[]},[]);
  assert.equal(mlDraft.valid,true);
  assert.equal(core.makePersonalRecords(mlDraft.draft,{now:'2026-08-26T14:30:00.000Z'}).revision.basis.unit,'ml');
  const customUnit=core.validateDraft({...validDraft,name:'Yogurt vasetto',conversions:[{unitCode:'vasetto',labelSingular:'vasetto',labelPlural:'vasetti',basisAmount:125,basisUnit:'g'}]},[]);
  assert.equal(customUnit.valid,true);
  assert.equal(customUnit.draft.conversions[0].unitCode,'vasetto');

  const invalid = core.validateDraft({ ...validDraft, name:'', proteinG:-1, sourceLabel:'' }, []);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((x) => x.code === 'name-required'));
  assert.ok(invalid.errors.some((x) => x.code.includes('proteinG')));
  assert.ok(invalid.errors.some((x) => x.code === 'source-label'));

  const duplicateConversion = core.validateDraft({ ...validDraft, conversions:[validDraft.conversions[0], {...validDraft.conversions[0]}] }, []);
  assert.equal(duplicateConversion.valid, false);
  assert.ok(duplicateConversion.errors.some((x) => x.code.includes('duplicate')));

  const energyWarning = core.validateDraft({ ...validDraft, energyKcal:50 }, []);
  assert.equal(energyWarning.valid, true);
  assert.ok(energyWarning.warnings.some((x) => x.code === 'atwater'));

  const baseSnakeRevision = {
    revisionNumber:1, nutrition_basis:{amount:100,unit:'g'}, food_state:'unspecified', nutrients:{energy_kcal:47,protein_g:.9,carbohydrate_g:12,fat_g:.1,fiber_g:2.4},
    conversions:[], provenance:{kind:'legacy_dataset_estimate',source_name:'Dataset test'},
  };
  const baseDraft = core.draftFromRecords({id:'base:ingredient:arancia',name:'arancia',category:'ortofrutta',aliases:[]}, baseSnakeRevision);
  assert.equal(baseDraft.energyKcal,47);
  assert.equal(baseDraft.preparationState,'unknown');
  assert.equal(baseDraft.sourceType,'database');

  // Store behaviour.
  await put('ingredients',{recordType:'ingredient',id:'base:ingredient:latte',origin:'base',immutable:true,name:'latte',category:'latticini-e-uova',aliases:[],currentRevisionId:'base:ingredient-revision:latte@1',createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString(),archivedAt:null});
  await put('ingredientRevisions',{recordType:'ingredientRevision',id:'base:ingredient-revision:latte@1',ingredientId:'base:ingredient:latte',revisionNumber:1,basis:{amount:100,unit:'ml'},preparationState:'as-sold',nutrition:{energyKcal:46,proteinG:3.3,carbohydrateG:4.8,fatG:1.6,fiberG:0},conversions:[],source:{type:'database',label:'Base'},createdAt:new Date(0).toISOString(),origin:'base',immutable:true});

  const created = await ingredientStore.saveDraft(validDraft);
  assert.equal(created.ingredient.origin,'personal');
  assert.equal(created.revision.revisionNumber,1);
  assert.equal(stores.ingredients.has(created.ingredient.id),true);
  assert.equal(stores.ingredientRevisions.has(created.revision.id),true);

  const edited = await ingredientStore.saveDraft({ ...validDraft, energyKcal:230, sourceLabel:'Etichetta aggiornata' }, created.ingredient.id);
  assert.equal(edited.revision.revisionNumber,2);
  assert.notEqual(edited.revision.id,created.revision.id);
  assert.equal(stores.ingredientRevisions.has(created.revision.id),true);
  const bundle = await ingredientStore.getBundle(created.ingredient.id);
  assert.equal(bundle.revisions.length,2);
  assert.equal(bundle.currentRevision.id,edited.revision.id);

  const duplicateName = core.validateDraft(validDraft, [edited.ingredient], null);
  assert.ok(duplicateName.warnings.some((x) => x.code === 'duplicate-name'));

  await ingredientStore.archiveIngredient(created.ingredient.id,true);
  assert.ok((await mockDB.get('ingredients',created.ingredient.id)).archivedAt);
  await ingredientStore.archiveIngredient(created.ingredient.id,false);
  assert.equal((await mockDB.get('ingredients',created.ingredient.id)).archivedAt,null);

  await assert.rejects(() => ingredientStore.saveDraft(validDraft,'base:ingredient:latte'),/immutabili/);
  await assert.rejects(() => ingredientStore.archiveIngredient('base:ingredient:latte',true),/base/);

  // Referenced ingredient cannot be deleted.
  await put('recipeVersions',{id:'usr:recipe-version:test',origin:'personal',ingredientLines:[{ingredientId:created.ingredient.id}]});
  const blocked = await ingredientStore.deleteIfUnused(created.ingredient.id);
  assert.equal(blocked.deleted,false);
  assert.equal(blocked.reason,'referenced');
  stores.recipeVersions.clear();
  const deleted = await ingredientStore.deleteIfUnused(created.ingredient.id);
  assert.equal(deleted.deleted,true);
  assert.equal(stores.ingredients.has(created.ingredient.id),false);
  assert.equal(stores.ingredientRevisions.has(created.revision.id),false);
  assert.equal(stores.ingredientRevisions.has(edited.revision.id),false);

  const schemaSample = core.makePersonalRecords(validDraft, { now:'2026-08-26T14:30:00.000Z' });
  const report = {
    status:'ok', checkpoint:'5.0.0-alpha.3-phase3', checks:{
      valid_draft:true, basis_ml:true, custom_conversion_unit:true, blocking_validation:true, conversions:true, atwater_warning:true, legacy_normalization:true,
      create_revision:true, immutable_history:true, duplicate_warning:true, archive_restore:true, base_immutable:true, delete_reference_guard:true,
    },
    schemaSample,
  };
  const qaDir = path.resolve(__dirname,'../qa/v5-phase3'); fs.mkdirSync(qaDir,{recursive:true});
  fs.writeFileSync(path.join(qaDir,'ingredient-core-report.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(qaDir,'ingredient-schema-sample.json'),JSON.stringify(schemaSample,null,2));
  console.log(JSON.stringify(report,null,2));
})().catch((error) => { console.error(error); process.exit(1); });
