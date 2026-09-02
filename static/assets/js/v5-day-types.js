(function(global,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;global.TataDietDayTypes=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const META={
    D1:{type:'D1',label:'Giornata',short:'G',css:'d1',dietaryProfile:'D1'},
    D2:{type:'D2',label:'Notte',short:'N',css:'d2',dietaryProfile:'D2'},
    D3:{type:'D3',label:'Smonto',short:'SN',css:'d3',dietaryProfile:'D3'},
    D4:{type:'D4',label:'Riposo 1',short:'R1',css:'d4',dietaryProfile:'D4'},
    D5:{type:'D5',label:'Riposo 2',short:'R2',css:'d5',dietaryProfile:'D5'},
    M:{type:'M',label:'Mattino',short:'M',css:'m',dietaryProfile:'D1'},
    P:{type:'P',label:'Pomeriggio',short:'P',css:'p',dietaryProfile:'D1'},
    CUSTOM:{type:'CUSTOM',label:'Personalizzata',short:'C',css:'custom',dietaryProfile:'D1'},
    OFF:{type:'OFF',label:'Fuori servizio',short:'OFF',css:'off',dietaryProfile:'D1'},
    FREE:{type:'FREE',label:'Giornata libera',short:'L',css:'free',dietaryProfile:'FREE'},
  };
  const STANDARD=['D1','D2','D3','D4','D5','M','P'];
  const EDITABLE=[...STANDARD,'CUSTOM','OFF'];
  function meta(type){return META[type]||{type:String(type||''),label:String(type||'Giornata'),short:String(type||'?'),css:String(type||'').toLowerCase(),dietaryProfile:'D1'};}
  function label(type){return meta(type).label;}
  function short(type){return meta(type).short;}
  function css(type){return meta(type).css;}
  function dietaryProfile(type){return meta(type).dietaryProfile;}
  function display(type,withShort=true){const m=meta(type);return withShort?`${m.label} · ${m.short}`:m.label;}
  return {META,STANDARD,EDITABLE,meta,label,short,css,dietaryProfile,display};
});
