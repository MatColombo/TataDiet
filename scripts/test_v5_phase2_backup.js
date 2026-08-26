const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
global.crypto = webcrypto;
global.structuredClone = global.structuredClone || ((v)=>JSON.parse(JSON.stringify(v)));

const stores = Object.fromEntries(['meta','settings','ingredients','ingredientRevisions','recipes','recipeVersions','planInstances','calendarDays','operations','shoppingChecklists'].map(k=>[k,new Map()]));
function put(store,row){ stores[store].set(row[store==='settings'||store==='meta'?'key':'id'],structuredClone(row)); return Promise.resolve(row); }
const mockDB={
  get: async (s,k)=>structuredClone(stores[s].get(k)),
  getAll: async (s)=>Array.from(stores[s].values()).map((x)=>structuredClone(x)),
  put,
  bulkPut: async (s,rows)=>{ for(const r of rows) await put(s,r); return rows.length; },
  setSetting: async (key,value,source='qa')=>put('settings',{key,value,source,updatedAt:new Date().toISOString()}),
  allSettingsObject: async()=>Object.fromEntries(Array.from(stores.settings.values()).map(r=>[r.key,r.value])),
  clearStores: async(names)=>names.forEach(n=>stores[n].clear()),
  openDatabase: async()=>({
    transaction(names){
      const tx={error:null};
      tx.objectStore=(name)=>({
        put:(row)=>stores[name].set(row[name==='settings'||name==='meta'?'key':'id'],structuredClone(row)),
        delete:(id)=>stores[name].delete(id), clear:()=>stores[name].clear(),
      });
      setImmediate(()=>tx.oncomplete&&tx.oncomplete()); return tx;
    }, close(){}
  })
};
global.TataDietDB=mockDB;
require(path.resolve(__dirname,'../static/assets/js/v5-backup.js'));
const b=global.TataDietBackup;

(async()=>{
  await put('meta',{key:'baseDatasetId',value:'tatadiet-base-v1'});
  await put('meta',{key:'baseDatasetSourceSha256',value:'a'.repeat(64)});
  await put('ingredients',{id:'base:ingredient:x',origin:'base',immutable:true,name:'Base'});
  await put('recipes',{id:'base:recipe:x',origin:'base',immutable:true,title:'Base'});
  await put('ingredients',{recordType:'ingredient',id:'usr:ingredient:milk',origin:'personal',name:'Milk'});
  await put('ingredientRevisions',{recordType:'ingredientRevision',id:'usr:revision:milk1',ingredientId:'usr:ingredient:milk',origin:'personal'});
  await put('shoppingChecklists',{id:'legacy:test',scopeKey:'test',legacy:true});
  await mockDB.setSetting('planStartDate','2026-09-07');
  await mockDB.setSetting('testValue','B');

  const backup=await b.createBackup('full');
  assert.equal(backup.data.ingredients.length,1);
  assert.equal(backup.data.shoppingChecklists.length,1);
  assert.equal(backup.data.settings.planStartDate,'2026-09-07');
  assert.equal((await b.preview(backup)).valid,true);

  const corrupt=structuredClone(backup); corrupt.data.settings.testValue='tampered';
  assert.equal((await b.preview(corrupt)).valid,false);

  await mockDB.setSetting('testValue','B');
  await b.importBackup(backup,'replace');
  assert.equal((await mockDB.allSettingsObject()).testValue,'B');
  assert.equal(stores.ingredients.has('base:ingredient:x'),true);
  assert.equal(stores.ingredients.has('usr:ingredient:milk'),true);

  await mockDB.setSetting('testValue','C');
  await b.rollbackLastImport();
  assert.equal((await mockDB.allSettingsObject()).testValue,'B');

  const out={status:'ok',checks:{checksum:true,personal_only:true,checklists:true,replace_roundtrip:true,base_immutable:true,rollback:true}};
  fs.mkdirSync(path.resolve(__dirname,'../qa/v5-phase2'),{recursive:true});
  fs.writeFileSync(path.resolve(__dirname,'../qa/v5-phase2/backup-roundtrip-report.json'),JSON.stringify(out,null,2));
  console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
