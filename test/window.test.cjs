const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const {cleanSettings,DEFAULTS}=require('../src/backend.cjs');const layout=require('../src/layout.cjs');
async function boot(saved={},touchGenerate=async()=>'LLMの反応'){
 const area={x:-1600,y:0,width:1600,height:900},handlers=new Map(),windows=[],screen=new EventEmitter(),app=new EventEmitter(),menus=[],trays=[],timers=[];
 Object.assign(app,{requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),getPath:()=>'/test-data',setAppUserModelId:()=>{},quit:()=>{}});
 screen.getPrimaryDisplay=()=>({workArea:area});screen.getDisplayMatching=()=>({workArea:area});screen.getAllDisplays=()=>[{workArea:area}];
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.visible=options.show!==false;this.events=[];this.bounds={x:options.x||0,y:options.y||0,width:options.width,height:options.height};this.webContents=new EventEmitter();Object.assign(this.webContents,{setWindowOpenHandler:()=>{},send:(event,value)=>this.events.push(value),session:{webRequest:{onBeforeRequest:()=>{}},setPermissionRequestHandler:()=>{}}});windows.push(this);}
  async loadFile(){}getBounds(){return {...this.bounds};}setBounds(b){this.bounds={...b};}isDestroyed(){return false;}setAlwaysOnTop(v){this.topmost=v;}setIgnoreMouseEvents(v){this.ignore=v;}show(){this.visible=true;}showInactive(){this.visible=true;}hide(){this.visible=false;}focus(){this.focused=true;}
 }
 class Store{constructor(){this.file='/test-data/companion.json';this.data={settings:{...DEFAULTS,scale:.5,...saved},history:[]};}load(){}save(){}}
 const electron={app,BrowserWindow:Window,ipcMain:{handle:(k,v)=>handlers.set(k,v)},dialog:{},Menu:{buildFromTemplate:v=>{const m={items:v,popup:()=>{m.opened=true;}};menus.push(m);return m;}},Tray:class extends EventEmitter{constructor(){super();trays.push(this);}setToolTip(){}popUpContextMenu(m){this.menu=m;}},nativeImage:{createFromPath:()=>({})},globalShortcut:{register:()=>true,unregisterAll:()=>{}},screen};
 const context={require:p=>p==='electron'?electron:p==='./backend.cjs'?{Store,cleanSettings,chat:async(_s,_h,t)=>'返事：'+t,touchReply:touchGenerate}:p==='./layout.cjs'?layout:p==='./interaction.cjs'?require('../src/interaction.cjs'):p==='./touch-response.cjs'?{TouchResponder:class extends require('../src/touch-response.cjs').TouchResponder{constructor(options){super({...options,setTimer:fn=>{const t={fn,unref(){}};timers.push(t);return t;},clearTimer:()=>{}});}}}:require(p),__dirname:path.resolve(__dirname,'../src'),AbortController,console,setTimeout:fn=>{const t={fn,unref(){}};timers.push(t);return t;},clearTimeout:()=>{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8'),context);await new Promise(r=>setImmediate(r));
 const invoke=(channel,...args)=>handlers.get(channel)({sender:windows[0].webContents},...args);
 const as=(i,channel,...args)=>handlers.get(channel)({sender:windows[i].webContents},...args);
 return {area,handlers,windows,screen,menus,trays,timers,invoke,as};
}
test('startup shows only the mascot; scale is independent of the screen and reset is explicit',async()=>{
 const {area,windows,screen,invoke}=await boot();assert.equal(windows.length,4);const [control,mascot,input,bubble]=windows;
 assert.equal(control.visible,false);assert.equal(input.visible,false);assert.equal(bubble.visible,false);assert.equal(mascot.visible,true);assert.equal(mascot.ignore,true);
 assert.deepEqual(mascot.getBounds(),layout.mascotBounds(.5,area));
 const result=await invoke('save',{...DEFAULTS,scale:1.8});assert.equal(result.ok,true);assert.equal(mascot.bounds.height,Math.round(518*1.8)+16);
 await invoke('action','reset');assert.deepEqual(mascot.getBounds(),layout.mascotBounds(1.8,area));
 const before=mascot.getBounds();area.width=1280;area.height=680;screen.emit('display-metrics-changed');assert.deepEqual(mascot.getBounds(),before);const large=await invoke('save',{...DEFAULTS,scale:10.0});assert.equal(large.ok,true);assert.equal(mascot.bounds.width,4400);assert.equal(mascot.bounds.height,5196);
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
 for(const [dx,dy] of [[-5000,0],[5000,0],[0,-5000],[0,5000]]){const start=mascot.getBounds();await as(1,'drag','start',0,0);await as(1,'drag','move',dx,dy);assert.equal(mascot.bounds.x,start.x+dx);assert.equal(mascot.bounds.y,start.y+dy);await as(1,'drag','end',dx,dy);}
 await invoke('action','pass');await as(1,'hit',true);assert.equal(mascot.ignore,true);
 assert.equal((await as(0,'hit',true)).ok,false);assert.equal((await as(0,'bubble-size',180)).ok,false);
});
test('bubble content size is bounded without moving its independent position',async()=>{
 const {windows,as}=await boot();const before=windows[3].getBounds();await as(3,'bubble-size',5000);assert.equal(windows[3].bounds.height,380);assert.equal(windows[3].bounds.x,before.x);assert.equal(windows[3].bounds.y,before.y);
});

test('input position survives reopening, mascot movement, settings save and restart',async()=>{
 const {windows,invoke,as}=await boot();const input=windows[2];
 await invoke('action','talk');const chosen={...input.getBounds(),x:-1200,y:300};input.setBounds(chosen);input.emit('move');
 await invoke('action','close-input');await as(1,'drag','start',0,0);await as(1,'drag','move',-800,100);await as(1,'drag','end',-800,100);
 await invoke('action','talk');assert.deepEqual(input.getBounds(),chosen);
 await invoke('save',{...DEFAULTS,scale:10.0});assert.deepEqual(input.getBounds(),chosen);
 const state=await invoke('state');assert.equal(state.data.settings.inputX,chosen.x);assert.equal(state.data.settings.inputY,chosen.y);
 const next=await boot({inputX:chosen.x,inputY:chosen.y});assert.equal(next.windows[2].bounds.x,chosen.x);assert.equal(next.windows[2].bounds.y,chosen.y);
});

test('bubble position survives speech, mascot movement, settings save and restart',async()=>{
 const {windows,invoke,as}=await boot();const bubble=windows[3];const chosen={...bubble.getBounds(),x:-1400,y:250};bubble.setBounds(chosen);bubble.emit('move');
 await invoke('action','talk');await as(1,'drag','start',0,0);await as(1,'drag','move',300,-200);await as(1,'drag','end',300,-200);
 await invoke('save',{...DEFAULTS,bubbleFont:'Meiryo',bubbleFontSize:24});assert.deepEqual(bubble.getBounds(),chosen);
 const state=(await invoke('state')).data;assert.equal(state.settings.bubbleX,chosen.x);assert.equal(state.settings.bubbleY,chosen.y);
 const next=await boot(state.settings);assert.equal(next.windows[3].bounds.x,chosen.x);assert.equal(next.windows[3].bounds.y,chosen.y);
 await invoke('action','reset-bubble');assert.notEqual(bubble.getBounds().x,chosen.x);
});
test('touch IPC is mascot-only and respects disabling, with no input popup',async()=>{
 const {windows,invoke,as}=await boot();assert.equal((await as(0,'touch','head','poke')).ok,false);
 await as(1,'touch','head','poke');assert.equal(windows[2].visible,false);assert.equal(windows[1].events.at(-1).reaction.emotion,'surprised');
 for(let i=0;i<3;i++)await as(1,'touch','chest','poke');assert.equal(windows[1].events.at(-1).reaction.emotion,'angry');
 await invoke('save',{...DEFAULTS,touchEnabled:false});const n=windows[1].events.length;await as(1,'touch','head','stroke');assert.equal(windows[1].events.length,n);
});

test('configured model generates touch text after immediate motion without writing a conversation turn',async()=>{
 const requests=[];const {windows,timers,as,invoke}=await boot({model:'local'},async(...args)=>{requests.push(args);return 'えへへ、ありがとう。';});
 await as(1,'touch','head','stroke');assert.equal(windows[1].events.at(-1).reaction.emotion,'shy');assert.equal(requests.length,0);
 await timers.at(-1).fn();assert.equal(requests.length,1);assert.equal(requests[0][2].region,'head');assert.ok(windows[3].events.some(e=>e.speech==='えへへ、ありがとう。'));assert.equal((await invoke('state')).data.history.length,0);
});
test('starting normal conversation cancels pending touch text and touches do not replace a busy reply',async()=>{
 let resolve,signal;const {windows,timers,as,invoke}=await boot({model:'local'},(_s,_h,_r,s)=>{signal=s;return new Promise(r=>resolve=r);});
 await as(1,'touch','head','stroke');const running=timers.at(-1).fn();await invoke('action','talk');assert.equal(signal.aborted,true);resolve('遅れて届いた反応');await running;assert.ok(!windows[3].events.some(e=>e.speech==='遅れて届いた反応'));
 const request=invoke('chat','会話です');await as(1,'touch','head','poke');await request;assert.equal((await invoke('state')).data.speech,'返事：会話です');
});

test('cloth reaction uses existing local LLM lane and respects the cloth toggle',async()=>{
 let received;const {windows,timers,as,invoke}=await boot({model:'local'},async(_s,_h,r)=>{received=r;return '裾が引っ張られてるよ！';});await as(1,'touch','cloth','stroke');await timers.at(-1).fn();assert.equal(received.region,'cloth');assert.equal(received.emotion,'surprised');assert.ok(windows[3].events.some(e=>e.speech==='裾が引っ張られてるよ！'));
 await invoke('save',{...DEFAULTS,clothDrag:false});const count=windows[1].events.length;await as(1,'touch','cloth','stroke');assert.equal(windows[1].events.length,count);
});

test('hand reaction uses the LLM lane and can be disabled independently',async()=>{
 let received;const {windows,timers,as,invoke}=await boot({model:'local'},async(_s,_h,r)=>{received=r;return '一緒に手をつなごう。';});await as(1,'touch','hand','stroke');await timers.at(-1).fn();assert.equal(received.region,'hand');assert.equal(received.emotion,'surprised');assert.ok(windows[3].events.some(e=>e.speech==='一緒に手をつなごう。'));
 await invoke('save',{...DEFAULTS,handDrag:false});const n=windows[1].events.length;await as(1,'touch','hand','stroke');assert.equal(windows[1].events.length,n);
});


test('orientation IPC validates mascot sender, persists angles and leaves windows independent',async()=>{
 const {windows,invoke,as}=await boot(),angles={angleX:45,angleY:80,angleZ:-25},bounds=windows.map(w=>w.getBounds());
 assert.equal((await invoke('orientation',angles)).ok,false);for(const value of [NaN,181])assert.equal((await as(1,'orientation',{...angles,angleX:value})).ok,false);
 assert.equal((await as(1,'orientation',angles)).ok,true);const s=(await invoke('state')).data.settings;assert.equal(s.angle,80);assert.deepEqual(windows.map(w=>w.getBounds()),bounds);const next=await boot(s);assert.equal((await next.invoke('state')).data.settings.angleZ,-25);
 await invoke('action','pass');await as(1,'orientation',{...angles,angleZ:100});assert.equal((await invoke('state')).data.settings.angleZ,-25);
});
