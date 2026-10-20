const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('companion', {
  state:()=>ipcRenderer.invoke('state'),
  save:s=>ipcRenderer.invoke('save',s),
  models:s=>ipcRenderer.invoke('models',s),
  chooseVRM:()=>ipcRenderer.invoke('choose-vrm'),
  vrm:()=>ipcRenderer.invoke('vrm'),
  send:text=>ipcRenderer.invoke('chat',text),
  cancel:()=>ipcRenderer.invoke('cancel'),
  clear:()=>ipcRenderer.invoke('clear'),
  hit:v=>ipcRenderer.invoke('hit',v),
  drag:(phase,x,y)=>ipcRenderer.invoke('drag',phase,x,y),
  bubbleSize:h=>ipcRenderer.invoke('bubble-size',h),
  modelStatus:text=>ipcRenderer.invoke('model-status',text),
  action:name=>ipcRenderer.invoke('action',name),
  onUpdate:fn=>{const listener=(_e,data)=>fn(data);ipcRenderer.on('update',listener);return()=>ipcRenderer.removeListener('update',listener);},
});
