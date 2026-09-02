(function(){"use strict";
  if(document.body?.dataset.page!=="calendar") return;
  const db=globalThis.TataDietDB,store=globalThis.TataDietPlanStore,state=globalThis.DietSiteState,core=globalThis.TataDietPlanCore,dayTypes=globalThis.TataDietDayTypes;
  if(!db||!store||!state||!core) return;
  let planBundle=null;
  function stripType(el){["d1","d2","d3","d4","d5","m","p","custom","free","off"].forEach(c=>el.classList.remove(c));}
  function apply(){
    if(!planBundle) return; const map=new Map(planBundle.days.map(d=>[d.date,d]));
    document.querySelectorAll("[data-calendar-date]").forEach(el=>{
      const d=map.get(el.dataset.calendarDate); if(!d)return; stripType(el);el.classList.add(dayTypes?dayTypes.css(d.dayType):d.dayType.toLowerCase());
      const changed=d.source!=="base"||d.adherenceStatus!=="planned";el.classList.toggle("is-effective-changed",changed);el.classList.toggle("is-not-followed",d.adherenceStatus==="not-followed");
      const code=el.querySelector(".calendar-shift-code");if(code)code.textContent=dayTypes?dayTypes.short(d.dayType):d.dayType;
      const name=el.querySelector(".calendar-shift-name");if(name)name.textContent=dayTypes?dayTypes.label(d.dayType):(d.shift?.name||d.dayType);
      const flags=el.querySelector(".calendar-cell-flags");if(flags&&changed&&!flags.querySelector(".effective-flag")){const span=document.createElement("span");span.className="calendar-flag effective-flag";span.title="Giornata personalizzata";span.textContent="✎";flags.prepend(span);}
      if(el.tagName==="A"){const url=state.stateUrl("calendario/gestisci/index.html",planBundle.plan.startDate,{focus:d.date});el.href=url.href;}
    });
    const banner=document.querySelector("[data-effective-calendar-banner]");if(banner){const changed=planBundle.days.filter(d=>d.source!=="base"||d.adherenceStatus!=="planned").length;banner.hidden=changed===0;const count=banner.querySelector("[data-effective-calendar-count]");if(count)count.textContent=String(changed);const link=banner.querySelector("a");if(link)link.href=state.stateUrl("calendario/gestisci/index.html",planBundle.plan.startDate,{focus:new URLSearchParams(location.search).get("focus")||undefined}).href;}
  }
  async function init(){try{await db.initialize();const b=await store.activeBundle();const start=state.resolveStart().value;if(!b||b.plan.startDate!==start)return;planBundle=b;apply();const grid=document.querySelector("[data-calendar-grid]");if(grid)new MutationObserver(()=>apply()).observe(grid,{childList:true});}catch(e){console.warn("Overlay piano effettivo non disponibile",e);}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
