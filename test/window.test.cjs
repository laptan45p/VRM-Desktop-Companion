const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const {cleanSettings,DEFAULTS}=require('../src/backend.cjs');const layout=require('../src/layout.cjs');
async function boot(){
 const area={x:-1600,y:0,width:1600,height:900},handlers=new Map(),windows=[],screen=new EventEmitter(),app=new EventEmitter(),menus=[],trays=[],timers=[];
 Object.assign(app,{requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),getPath:()=>'/test-data',setAppUserModelId:()=>{},quit:()=>{}});
 screen.getPrimaryDisplay=()=>({workArea:area});screen.getDisplayMatching=()=>({workArea:area});
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.visible=options.show!==false;this.events=[];this.bounds={x:options.x||0,y:options.y||0,width:options.width,height:options.height};this.webContents=new EventEmitter();Object.assign(this.webContents,{setWindowOpenHandler:()=>{},send:(event,value)=>this.events.push(value),session:{webRequest:{onBeforeRequest:()=>{}},setPermissionRequestHandler:()=>{}}});windows.push(this);}
  async loadFile(){}getBounds(){return {...this.bounds};}setBounds(b){this.bounds={...b};}isDestroyed(){return false;}setAlwaysOnTop(v){this.topmost=v;}setIgnoreMouseEvents(v){this.ignore=v;}show(){this.visible=true;}showInactive(){this.visible=true;}hide(){this.visible=false;}focus(){this.focused=true;}
 }
 class Store{constructor(){this.file='/test-data/companion.json';this.data={settings:{...DEFAULTS,scale:.5},history:[]};}load(){}save(){}}
 const electron={app,BrowserWindow:Window,ipcMain:{handle:(k,v)=>handlers.set(k,v)},dialog:{},Menu:{buildFromTemplate:v=>{const m={items:v,popup:()=>{m.opened=true;}};menus.push(m);return m;}},Tray:class extends EventEmitter{constructor(){super();trays.push(this);}setToolTip(){}popUpContextMenu(m){this.menu=m;}},nativeImage:{createFromPath:()=>({})},globalShortcut:{register:()=>true,unregisterAll:()=>{}},screen};
 const context={require:p=>p==='electron'?electron:p==='./backend.cjs'?{Store,cleanSettings,chat:async(_s,_h,t)=>'返事：'+t}:p==='./layout.cjs'?layout:require(p),__dirname:path.resolve(__dirname,'../src'),AbortController,console,setTimeout:fn=>{const t={fn,unref(){}};timers.push(t);return t;},clearTimeout:()=>{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8'),context);await new Promise(r=>setImmediate(r));
 const invoke=(channel,...args)=>handlers.get(channel)({sender:windows[0].webContents},...args);
 const as=(i,channel,...args)=>handlers.get(channel)({sender:windows[i].webContents},...args);
 return {area,handlers,windows,screen,menus,trays,timers,invoke,as};
}
test('startup shows only the mascot; scaling, reset and monitor changes keep it within bounds',async()=>{
 const {area,windows,screen,invoke}=await boot();assert.equal(windows.length,4);const [control,mascot,input,bubble]=windows;
 assert.equal(control.visible,false);assert.equal(input.visible,false);assert.equal(bubble.visible,false);assert.equal(mascot.visible,true);assert.equal(mascot.ignore,true);
 assert.deepEqual(mascot.getBounds(),layout.mascotBounds(.5,area));
 const result=await invoke('save',{...DEFAULTS,scale:1.8});assert.equal(result.ok,true);assert.equal(mascot.bounds.height,900);
 await invoke('action','reset');assert.deepEqual(mascot.getBounds(),layout.mascotBounds(1.8,area));
 area.width=1280;area.height=680;screen.emit('display-metrics-changed');assert.ok(mascot.bounds.height<=680);assert.ok(mascot.bounds.x+mascot.bounds.width<=area.x+area.width);
});
test('left click greets in a bubble and opens focused input; successful reply replaces speech',async()=>{
 const {windows,invoke,timers}=await boot();const [control,mascot,input,bubble]=windows;
 await invoke('action','talk');assert.equal(control.visible,false);assert.equal(input.visible,true);assert.equal(input.focused,true);assert.equal(bubble.visible,true);
 assert.ok(bubble.events.some(e=>e.speech==='どうしたの？'));
 const reply=await invoke('chat','こんにちは');assert.equal(reply.ok,true);assert.equal(reply.data,'返事：こんにちは');assert.ok(bubble.events.some(e=>e.speech==='返事：こんにちは'));
 timers.at(-1).fn();assert.equal(bubble.visible,false);await invoke('action','close-input');assert.equal(input.visible,false);
});
test('right-click and left/right tray clicks offer settings menu; control stays hidden until selected',async()=>{
 const {windows,menus,trays,invoke}=await boot();await invoke('action','menu');assert.equal(menus.at(-1).opened,true);
 for(const event of ['click','right-click']){trays[0].emit(event);assert.ok(trays[0].menu.items.some(item=>item.label==='設定'));}
 trays[0].menu.items.find(item=>item.label==='設定').click();assert.equal(windows[0].visible,true);assert.ok(windows[0].events.some(e=>e.controlTab==='settings'));
});
test('transparent area passes clicks through; hover/drag and explicit disable take precedence',async()=>{
 const {windows,invoke,as}=await boot();const mascot=windows[1];await as(1,'hit',true);assert.equal(mascot.ignore,false);await as(1,'hit',false);assert.equal(mascot.ignore,true);
 await as(1,'drag','start',100,100);assert.equal(mascot.ignore,false);const initial=mascot.getBounds();await as(1,'drag','move',120,80);assert.equal(mascot.bounds.y,initial.y-20);await as(1,'drag','end',120,80);assert.equal(mascot.ignore,true);
 await invoke('action','pass');await as(1,'hit',true);assert.equal(mascot.ignore,true);
 assert.equal((await as(0,'hit',true)).ok,false);assert.equal((await as(0,'bubble-size',180)).ok,false);
});
test('bubble size and popup positions are clamped to work area',async()=>{
 const {windows,as,area}=await boot();await as(3,'bubble-size',5000);assert.equal(windows[3].bounds.height,380);
 for(const w of windows.slice(2)){assert.ok(w.bounds.x>=area.x&&w.bounds.y>=area.y);assert.ok(w.bounds.x+w.bounds.width<=area.x+area.width);assert.ok(w.bounds.y+w.bounds.height<=area.y+area.height);}
});
