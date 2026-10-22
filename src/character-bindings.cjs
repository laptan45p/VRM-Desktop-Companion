'use strict';
const {key}=require('./voice-bindings.cjs');
function clean(raw){
 const entries=[];
 if(Array.isArray(raw))for(const item of raw.slice(-500)){
  if(!item||typeof item.modelPath!=='string'||item.modelPath.length>2000||typeof item.name!=='string'||typeof item.persona!=='string')continue;
  const index=entries.findIndex(x=>key(x.modelPath)===key(item.modelPath));if(index!==-1)entries.splice(index,1);
  entries.push({modelPath:item.modelPath,name:item.name.slice(0,2000),persona:item.persona.slice(0,12000),selfPronoun:typeof item.selfPronoun==='string'?item.selfPronoun.slice(0,100):'',userAddress:typeof item.userAddress==='string'?item.userAddress.slice(0,100):''});
 }
 return entries;
}
function lookup(data,modelPath){return data.characterBindings.find(x=>key(x.modelPath)===key(modelPath));}
function bind(data,modelPath,profile){
 const entries=clean([{modelPath,name:profile.name,persona:profile.persona,selfPronoun:profile.selfPronoun,userAddress:profile.userAddress}]);
 if(!entries.length)throw new Error('キャラクター設定の関連付けが不正です。');
 data.characterBindings=[...(data.characterBindings||[]).filter(x=>key(x.modelPath)!==key(modelPath)),entries[0]].slice(-500);
}
function initialize(data){
 data.characterBindings=clean(data.characterBindings);
 const settings=data.settings,stored=lookup(data,settings.modelPath);
 if(stored){settings.name=stored.name;settings.persona=stored.persona;settings.selfPronoun=stored.selfPronoun;settings.userAddress=stored.userAddress;}
 else bind(data,settings.modelPath,settings);
}
function activate(data,modelPath,defaults){
 bind(data,data.settings.modelPath,data.settings);
 const profile=lookup(data,modelPath)||{name:modelPath?modelPath.split(/[\\/]/).pop().replace(/\.vrm$/i,'').slice(0,2000):defaults.name,persona:defaults.persona,selfPronoun:defaults.selfPronoun,userAddress:defaults.userAddress};
 data.settings={...data.settings,modelPath,name:profile.name,persona:profile.persona,selfPronoun:profile.selfPronoun,userAddress:profile.userAddress};
 bind(data,modelPath,profile);
}
module.exports={clean,lookup,bind,initialize,activate};
