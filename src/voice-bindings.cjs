'use strict';
const path=require('node:path');
function key(file){return /^(?:[a-z]:[\\/]|\\\\)/i.test(file)?path.win32.normalize(file).toLowerCase():path.normalize(file||'.');}
function clean(raw){
 const entries=[];
 if(Array.isArray(raw))for(const item of raw.slice(-500)){
  if(!item||typeof item.modelPath!=='string'||item.modelPath.length>4096||typeof item.speakerPath!=='string'||item.speakerPath.length>4096||item.speakerPath&&!item.speakerPath.toLowerCase().endsWith('.speaker.safetensors'))continue;
  const index=entries.findIndex(x=>key(x.modelPath)===key(item.modelPath));if(index!==-1)entries.splice(index,1);
  entries.push({modelPath:item.modelPath,speakerPath:item.speakerPath});
 }
 return entries;
}
function lookup(data,modelPath){return data.voiceBindings.find(x=>key(x.modelPath)===key(modelPath))?.speakerPath||'';}
function bind(data,modelPath,speakerPath){
 const entries=clean([{modelPath,speakerPath}]);if(!entries.length)throw new Error('声の関連付けが不正です。');
 data.voiceBindings=[...data.voiceBindings.filter(x=>key(x.modelPath)!==key(modelPath)),entries[0]].slice(-500);
}
function initialize(data){
 data.voiceBindings=clean(data.voiceBindings);
 const settings=data.settings;
 if(settings.speakerPath&&clean([{modelPath:settings.modelPath,speakerPath:settings.speakerPath}]).length&&!data.voiceBindings.some(x=>key(x.modelPath)===key(settings.modelPath)))bind(data,settings.modelPath,settings.speakerPath);
 settings.speakerPath=lookup(data,settings.modelPath);
}
module.exports={key,clean,lookup,bind,initialize};
