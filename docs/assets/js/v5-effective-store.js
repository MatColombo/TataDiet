(function(global,factory){const api=factory(global.TataDietDB,global.TataDietPlanStore,global.TataDietEffectiveCore);if(typeof module==='object'&&module.exports)module.exports=api;global.TataDietEffectiveStore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(db,planStore,effective){
  'use strict';
  function deps(){if(!db||!planStore||!effective)throw new Error('Moduli piano effettivo non inizializzati');}
  async function data(){deps();await db.initialize();const [recipes,versions,ingredients,revisions]=await Promise.all([db.getAll('recipes'),db.getAll('recipeVersions'),db.getAll('ingredients'),db.getAll('ingredientRevisions')]);return {recipes,versions,ingredients,revisions,maps:effective.maps({recipes,versions,ingredients,revisions})};}
  async function context(startDate=null){deps();await db.initialize();const bundle=await planStore.activeBundle();if(!bundle||startDate&&bundle.plan.startDate!==startDate)return null;const d=await data();return {...bundle,...d};}
  async function eventsOnDate(date,startDate=null){const c=await context(startDate);return c?effective.eventsOnDate(c.days,c.maps,date):null;}
  async function prep(date,minute,hours=48,startDate=null){const c=await context(startDate);return c?effective.prepItems(c.days,c.maps,date,minute,hours):null;}
  async function shopping(from,to,rules={},startDate=null){const c=await context(startDate);return c?effective.aggregateShopping(c.days,c.maps,from,to,rules):null;}
  async function ics(from,to,includePrep=false,startDate=null){const c=await context(startDate);return c?effective.buildIcs(c.plan,c.days,c.maps,from,to,includePrep):null;}
  return {data,context,eventsOnDate,prep,shopping,ics};
});
