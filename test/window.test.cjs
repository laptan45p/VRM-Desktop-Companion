const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const {cleanSettings,DEFAULTS}=require('../src/backend.cjs');const layout=require('../src/layout.cjs');
async function boot(saved={},touchGenerate=async()=>'LLMの反応',motionFiles=null,tts=null,llm=null,windowFixture=null,startupLoad=null,llamaFixture=null,memoryFixture=null){
 const area={x:-1600,y:0,width:1600,height:900},handlers=new Map(),windows=[],screen=new EventEmitter(),app=new EventEmitter(),menus=[],trays=[],timers=[],intervals=[];let savedData=null,fileChoice='/motions',saveError=false,vrmResponse=0;const vrmQuestions=[];
 Object.assign(app,{requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),getPath:()=>'/test-data',setAppUserModelId:()=>{},quit:()=>{app.quitCalls=(app.quitCalls||0)+1;}});
 screen.getPrimaryDisplay=()=>({workArea:area});screen.getDisplayMatching=()=>({workArea:area});screen.getAllDisplays=()=>[{workArea:area}];
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.visible=options.show!==false;this.events=[];this.bounds={x:options.x||0,y:options.y||0,width:options.width,height:options.height};if(windows.length===1&&windowFixture)this.bounds=windowFixture('create',this.bounds);this.webContents=new EventEmitter();Object.assign(this.webContents,{setWindowOpenHandler:()=>{},send:(event,value)=>this.events.push(value),session:{webRequest:{onBeforeRequest:()=>{}},setPermissionRequestHandler:()=>{}}});windows.push(this);}
  async loadFile(){if(startupLoad)await startupLoad();}getBounds(){return {...this.bounds};}setBounds(b){this.bounds={...b};}isDestroyed(){return false;}setAlwaysOnTop(v,level){this.topmost=v;this.topmostLevel=level;}moveTop(){this.raised=(this.raised||0)+1;}isVisible(){return this.visible;}isMinimized(){return !!this.minimized;}setIgnoreMouseEvents(v){this.ignore=v;}show(){this.visible=true;}showInactive(){this.visible=true;if(windows[1]===this&&windowFixture)this.bounds=windowFixture('show',this.bounds);}hide(){this.visible=false;}focus(){this.focused=true;}
 }
 class Store{constructor(){this.file='/test-data/companion.json';this.data={settings:{...DEFAULTS,scale:.5,...saved},history:[]};}load(){}save(){if(saveError)throw new Error('test disk failure');savedData=structuredClone(this.data);}}
 const electron={app,BrowserWindow:Window,ipcMain:{handle:(k,v)=>handlers.set(k,v)},dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[fileChoice]}),showMessageBox:async(_owner,options)=>{vrmQuestions.push(options);return {response:vrmResponse};}},Menu:{buildFromTemplate:v=>{const m={items:v,popup:()=>{m.opened=true;}};menus.push(m);return m;}},Tray:class extends EventEmitter{constructor(){super();trays.push(this);}setToolTip(){}popUpContextMenu(m){this.menu=m;}},nativeImage:{createFromPath:()=>({})},globalShortcut:{register:()=>true,unregisterAll:()=>{}},screen};
 const context={require:p=>p==='electron'?electron:p==='./memory.cjs'?(memoryFixture||require('../src/memory.cjs')):p==='./llama-server.cjs'?(llamaFixture||require('../src/llama-server.cjs')):p==='./api-keys.cjs'?{ApiKeys:class{constructor(){this.entries=new Map();}load(){}available(){return true;}scope(s){return s.provider+' '+require('../src/backend.cjs').llmBase(s);}has(s){return this.entries.has(this.scope(s));}get(s){return this.entries.get(this.scope(s))||'';}set(s,key){this.entries.set(this.scope(s),key);}delete(s){this.entries.delete(this.scope(s));}}}:p==='./tts.cjs'?(tts||require('../src/tts.cjs')):p==='./vrma-files.cjs'?(motionFiles||require('../src/vrma-files.cjs')):p==='./backend.cjs'?{Store,cleanSettings,DEFAULTS,isCloud:require('../src/backend.cjs').isCloud,llmBase:require('../src/backend.cjs').llmBase,chat:llm?.chat|| (async(_s,_h,t)=>'返事：'+t),listModels:llm?.listModels||(async()=>[]),organizeMemory:llm?.organizeMemory||(async()=>({summary:'会話の要約',facts:[]})),touchReply:touchGenerate}:p==='./farewell.cjs'?{farewell:()=>'またね〜。またお話ししようね。',greeting:()=>'こんにちは〜。会えてうれしいよ。'}:p==='./character-bindings.cjs'?require('../src/character-bindings.cjs'):p==='./voice-bindings.cjs'?require('../src/voice-bindings.cjs'):p==='./relationship.cjs'?require('../src/relationship.cjs'):p==='./layout.cjs'?layout:p==='./interaction.cjs'?require('../src/interaction.cjs'):p==='./touch-response.cjs'?{TouchResponder:class extends require('../src/touch-response.cjs').TouchResponder{constructor(options){super({...options,setTimer:fn=>{const t={fn,unref(){}};timers.push(t);return t;},clearTimer:()=>{}});}}}:require(p),__dirname:path.resolve(__dirname,'../src'),setInterval:(fn,ms)=>{const t={fn,ms,unref(){}};intervals.push(t);return t;},clearInterval:t=>{if(t)t.cleared=true;},structuredClone,AbortController,console,setTimeout:(fn,ms)=>{const t={fn,ms,unref(){}};timers.push(t);return t;},clearTimeout:t=>{if(t)t.cleared=true;}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8'),context);await new Promise(r=>setImmediate(r));
 const invoke=(channel,...args)=>handlers.get(channel)({sender:windows[0].webContents},...args);
 const as=(i,channel,...args)=>handlers.get(channel)({sender:windows[i].webContents},...args);
 return {area,handlers,windows,screen,app,menus,trays,timers,intervals,invoke,as,saved:()=>savedData,chooseFile:file=>fileChoice=file,chooseVRMResponse:value=>vrmResponse=value,vrmQuestions,failSave:value=>saveError=value};
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

test('motion folder selection persists and only mascot can read selected motions',async()=>{
 const mock={findFolder:async folder=>folder+'/vrma',catalog:async()=>['VRMA_01.vrma','VRMA_02.vrma'],readMotion:async(folder,name)=>{assert.equal(folder,'/motions/vrma');assert.equal(name,'VRMA_02.vrma');return new Uint8Array([1,2]);}},b=await boot({},undefined,mock);
 assert.equal((await b.as(1,'choose-motions')).ok,false);assert.equal((await b.invoke('choose-motions')).ok,true);let s=(await b.invoke('state')).data.settings;assert.equal(s.motionFolder,'/motions/vrma');assert.equal(s.greetingMotion,'VRMA_02.vrma');assert.ok(b.windows[1].events.some(e=>e.reloadMotions));assert.equal((await b.invoke('motion-data','VRMA_02.vrma')).ok,false);assert.equal((await b.as(1,'motion-data','VRMA_02.vrma')).ok,true);
 await b.invoke('save',{...s,motionFolder:'/other',motionInterval:120,randomMotion:false});s=(await b.invoke('state')).data.settings;assert.equal(s.motionFolder,'/motions/vrma');assert.equal(s.motionInterval,120);assert.equal(s.randomMotion,false);
});

test('Irodori utterance uses selected embedding, audio is mascot-only and bubble waits for playback',async()=>{
 const mod=require('../src/tts.cjs'),generated=[],tts={checkEmbedding:async()=>'/voice.speaker.safetensors',VoiceLane:class extends mod.VoiceLane{constructor(options){super({...options,generate:async(settings,text)=>{generated.push({settings,text});return new Uint8Array(require('./audio-fixture.cjs')());}});}}};
 const b=await boot({ttsEnabled:true,speakerPath:'/old.speaker.safetensors'},undefined,null,tts);assert.equal((await b.as(1,'choose-speaker')).ok,false);await b.invoke('choose-speaker');assert.equal((await b.invoke('state')).data.settings.speakerPath,'/voice.speaker.safetensors');
 await b.invoke('action','talk');await new Promise(r=>setImmediate(r));assert.equal(generated[0].settings.speakerPath,'/voice.speaker.safetensors');const event=b.windows[1].events.findLast(e=>e.voiceAudio);assert.ok(event);assert.equal(b.windows[3].events.some(e=>e.voiceAudio),false);assert.equal(b.windows[0].events.some(e=>e.voiceAudio),false);const id=event.voiceAudio.id;assert.ok(b.windows[1].events.some(e=>e.ttsPending&&e.speechId===id));
 assert.equal((await b.invoke('voice-state',id,'start')).ok,false);await b.as(1,'voice-state',id,'start');assert.ok(b.windows[0].events.some(e=>e.voiceStatus==='読み上げ中'));await b.as(1,'voice-state',id-1,'ended');assert.equal(b.windows[3].visible,true);await b.as(1,'voice-state',id,'ended');assert.equal(b.windows[3].visible,true);b.timers.at(-1).fn();assert.equal(b.windows[3].visible,false);
});
test('voice stops on hide/new speech and failed synthesis keeps balloon and text',async()=>{
 const mod=require('../src/tts.cjs'),requests=[],tts={checkEmbedding:async p=>p,VoiceLane:class extends mod.VoiceLane{constructor(options){super({...options,generate:(_s,text,signal)=>new Promise((resolve,reject)=>requests.push({text,signal,resolve,reject}))});}}};const b=await boot({ttsEnabled:true,speakerPath:'/voice.speaker.safetensors'},undefined,null,tts);
 await b.invoke('action','talk');await b.invoke('action','test-motion');assert.equal(requests[0].signal.aborted,true);requests[0].resolve(new Uint8Array([1]));requests[1].reject(new Error('server down'));await new Promise(r=>setImmediate(r));assert.equal(b.windows[1].events.some(e=>e.voiceAudio),false);assert.ok(b.windows[0].events.some(e=>e.voiceStatus?.includes('server down')));assert.equal(b.windows[3].visible,true);
 await b.invoke('action','test-voice');await b.invoke('action','hide');assert.equal(requests[2].signal.aborted,true);assert.ok(b.windows[1].events.some(e=>e.voiceStop));requests[2].resolve(new Uint8Array([1]));await new Promise(r=>setImmediate(r));assert.equal(b.windows[1].events.some(e=>e.voiceAudio),false);
});

test('cloud keys stay in main process and reach conversation, models and touch generation',async()=>{
 const credentials=[],llm={chat:async(_s,_h,_t,_signal,options)=>{credentials.push(['chat',options.apiKey]);return 'クラウドの返事';},listModels:async(_s,options)=>{credentials.push(['models',options.apiKey]);return ['test-chat-model'];}},touch=async(_s,_h,_r,_signal,options)=>{credentials.push(['touch',options.apiKey]);return '驚いた！';};const b=await boot({},touch,null,null,llm),s={...DEFAULTS,provider:'openai',endpoint:'https://api.openai.com/v1',model:'test-chat-model'};
 assert.equal((await b.as(1,'key-save',s,'test-secret-key')).ok,false);assert.equal((await b.invoke('key-save',s,'test-secret-key')).ok,true);assert.equal((await b.as(1,'key-status',s)).ok,false);assert.equal((await b.invoke('key-status',s)).data.saved,true);assert.equal((await b.invoke('key-status',{...s,provider:'compatible'})).data.saved,false);
 assert.equal((await b.invoke('save',s)).ok,true);await b.invoke('models',s);await b.invoke('chat','こんにちは');await b.as(1,'touch','head','poke');await b.timers.at(-1).fn();assert.deepEqual(credentials,[['models','test-secret-key'],['chat','test-secret-key'],['touch','test-secret-key']]);
 assert.ok(!JSON.stringify((await b.invoke('state')).data).includes('test-secret-key'));for(const w of b.windows)assert.ok(!JSON.stringify(w.events).includes('test-secret-key'));await b.invoke('key-delete',s);assert.equal((await b.invoke('key-status',s)).data.saved,false);assert.equal((await b.invoke('save',{...s,endpoint:'https://other.example/v1'})).ok,false);
});

test('relationship points commit with successful chats only; history clear retains affinity',async()=>{
 let fail=false,context;const {invoke}=await boot({},undefined,null,null,{chat:async(_s,_h,_t,_signal,options)=>{context=options.systemExtra;if(fail)throw new Error('接続失敗');return 'ありがとう。';}});
 assert.equal((await invoke('state')).data.relationship.affinity,0);fail=true;assert.equal((await invoke('chat','かわいい')).ok,false);assert.equal((await invoke('state')).data.relationship.affinity,0);
 fail=false;assert.equal((await invoke('chat','ありがとう')).ok,true);assert.match(context,/アプリ管理の関係/);assert.equal((await invoke('state')).data.relationship.affinity,2);
 await invoke('clear');const state=(await invoke('state')).data;assert.equal(state.history.length,0);assert.equal(state.relationship.affinity,2);assert.equal(state.relationships,undefined);
});
test('relationship changes are control-only, restore per-character history, and survive model-independent profile switching',async()=>{
 const {invoke,as}=await boot();await invoke('chat','こんにちは');const first=(await invoke('state')).data.relationship.active;
 assert.equal((await as(1,'relationship','create','別人')).ok,false);
 const created=await invoke('relationship','create','あおい');assert.equal(created.ok,true);assert.notEqual(created.data.active,first);assert.equal((await invoke('state')).data.history.length,0);
 await invoke('chat','別人の話');await invoke('relationship','select',first);const state=(await invoke('state')).data;assert.equal(state.history[0].content,'こんにちは');assert.equal(state.relationship.affinity,2);
 assert.equal((await invoke('relationship','select','missing')).ok,false);assert.equal((await invoke('state')).data.relationship.active,first);
});
test('cancelled conversation leaves affection unchanged and profile changes cannot race a reply',async()=>{
 let resolve;const {invoke}=await boot({},undefined,null,null,{chat:()=>new Promise(r=>resolve=r)});const pending=invoke('chat','ありがとう');await new Promise(r=>setImmediate(r));
 assert.equal((await invoke('relationship','create','別人')).ok,false);assert.equal((await invoke('choose-vrm')).ok,false);await invoke('cancel');resolve('返事');assert.equal((await pending).ok,false);const state=(await invoke('state')).data;assert.equal(state.relationship.affinity,0);assert.equal(state.history.length,0);
});
test('confession fallback works without an LLM and opt-out preserves friendship',async()=>{
 const {invoke}=await boot();const reply=await invoke('confess');assert.equal(reply.ok,true);assert.match(reply.data,/もう少し/);assert.equal((await invoke('state')).data.relationship.lovers,false);
 await invoke('relationship','romance',false);assert.match((await invoke('confess')).data,/友達/);assert.equal((await invoke('state')).data.relationship.romanceEnabled,false);
});

test('OpenRouter keys and provider reach models, normal conversation and touch without renderer leakage',async()=>{
 const calls=[],llm={chat:async(s,_h,_t,_signal,o)=>{calls.push(['chat',s.provider,o.apiKey]);return '返事';},listModels:async(s,o)=>{calls.push(['models',s.provider,o.apiKey]);return ['anthropic/claude-haiku-5.5'];}},touch=async(s,_h,_r,_signal,o)=>{calls.push(['touch',s.provider,o.apiKey]);return 'えへへ';};
 const b=await boot({},touch,null,null,llm),s={...DEFAULTS,provider:'openrouter',endpoint:'https://openrouter.ai/api/v1',model:'anthropic/claude-haiku-5.5'};
 assert.equal((await b.invoke('key-save',s,'router-secret')).ok,true);assert.equal((await b.invoke('save',s)).ok,true);await b.invoke('models',s);assert.equal((await b.invoke('chat','こんにちは')).ok,true);await b.as(1,'touch','head','stroke');await b.timers.at(-1).fn();
 assert.deepEqual(calls,[['models','openrouter','router-secret'],['chat','openrouter','router-secret'],['touch','openrouter','router-secret']]);for(const w of b.windows)assert.ok(!JSON.stringify(w.events).includes('router-secret'));
 assert.equal((await b.invoke('key-status',{...s,provider:'compatible'})).data.saved,false);await b.invoke('key-delete',s);assert.equal((await b.invoke('key-status',s)).data.saved,false);
});

test('wheel zoom is mascot-only, bounded, relative to latest scale, persisted and independent of popup positions',async()=>{
 const {invoke,as,windows}=await boot({scale:1,angleY:25});const original=windows.map(w=>w.getBounds());
 assert.equal((await invoke('zoom',-100)).ok,false);for(const x of [NaN,Infinity,'100',301])assert.equal((await as(1,'zoom',x)).ok,false);
 assert.equal((await as(1,'zoom',-100)).data,1.105);assert.equal((await as(1,'zoom',-100)).data,1.221);assert.equal((await invoke('state')).data.settings.angleY,25);
 for(let i=0;i<20;i++)await as(1,'zoom',-300);assert.equal((await invoke('state')).data.settings.scale,10);
 for(let i=0;i<20;i++)await as(1,'zoom',300);const saved=(await invoke('state')).data.settings;assert.equal(saved.scale,.5);assert.deepEqual(windows.slice(2).map(w=>w.getBounds()),original.slice(2));
 const b=windows[1].getBounds();assert.equal(b.x+b.width/2,original[1].x+original[1].width/2);assert.equal(b.y+b.height,original[1].y+original[1].height);
 const restart=await boot(saved);assert.equal((await restart.invoke('state')).data.settings.scale,.5);await invoke('action','pass');await as(1,'zoom',-300);assert.equal((await invoke('state')).data.settings.scale,.5);
});

test('all four window positions survive settings saves and restart, including an off-screen mascot',async()=>{
 const b=await boot(),positions=[{x:-1300,y:25},{x:-4000,y:-2000},{x:-1100,y:300},{x:-700,y:450}],prefixes=['control','mascot','input','bubble'];
 b.windows.forEach((w,i)=>{w.setBounds({...w.getBounds(),...positions[i]});w.emit('move');});
 await b.invoke('save',{...DEFAULTS,controlX:0,mascotX:0,displayAreas:[]});const s=(await b.invoke('state')).data.settings;
 for(let i=0;i<4;i++){assert.equal(s[prefixes[i]+'X'],positions[i].x);assert.equal(s[prefixes[i]+'Y'],positions[i].y);}
 const next=await boot(s);for(let i=0;i<4;i++){assert.equal(next.windows[i].bounds.x,positions[i].x);assert.equal(next.windows[i].bounds.y,positions[i].y);}
 assert.equal(next.windows[0].visible,false);assert.equal(next.windows[2].visible,false);assert.equal(next.windows[3].visible,false);assert.equal(next.windows[1].visible,true);
});
test('quit captures the latest positions synchronously even without pending move timers',async()=>{
 const b=await boot();b.windows[0].getNormalBounds=()=>({x:-1200,y:20,width:570,height:850});b.windows[0].setBounds({x:0,y:0,width:1600,height:900});
 b.windows[1].setBounds({...b.windows[1].getBounds(),x:-1500,y:-70});b.windows[2].setBounds({...b.windows[2].getBounds(),x:-900,y:300});b.windows[3].setBounds({...b.windows[3].getBounds(),x:-500,y:400});
 b.app.emit('before-quit');const s=b.saved().settings;assert.equal(s.controlX,-1200);assert.equal(s.controlY,20);assert.equal(s.mascotX,-1500);assert.equal(s.mascotY,-70);assert.equal(s.inputX,-900);assert.equal(s.bubbleY,400);assert.equal(s.displayAreas.length,1);
 const next=await boot(s);assert.equal(next.windows[1].bounds.x,-1500);assert.equal(next.windows[0].bounds.x,-1200);
});
test('removed displays recover inaccessible windows while retaining partially off-screen mascot positions',async()=>{
 const previous=[{x:-4000,y:0,width:2000,height:1200}],b=await boot({mascotX:-3500,mascotY:100,controlX:-3500,controlY:100,inputX:-3500,inputY:100,bubbleX:-3500,bubbleY:100,displayAreas:previous});
 for(const w of b.windows)assert.ok(w.bounds.x>=b.area.x);
 b.windows[1].setBounds({...b.windows[1].getBounds(),x:-1700,y:-50});b.windows[1].emit('move');b.area.width=1400;b.screen.emit('display-metrics-changed');assert.equal(b.windows[1].bounds.x,-1700);assert.equal(b.windows[1].bounds.y,-50);
 // The OS may move another window before delivering the monitor-removal event.
 b.area.x=0;b.windows[0].setBounds({...b.windows[0].getBounds(),x:20,y:20});b.windows[0].emit('move');b.screen.emit('display-removed');assert.ok(b.windows[1].bounds.x>=0);
});

test('switching VRMs restores their embeddings and cancels late audio from the previous model',async()=>{
 const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'voice-model-switch-'));
 try{
  const modelA=path.join(dir,'A.vrm'),modelB=path.join(dir,'B.vrm'),voiceA=path.join(dir,'A.speaker.safetensors'),voiceB=path.join(dir,'B.speaker.safetensors');for(const p of [modelA,modelB,voiceA,voiceB])fs.writeFileSync(p,'fixture');
  const mod=require('../src/tts.cjs'),requests=[],tts={checkEmbedding:mod.checkEmbedding,VoiceLane:class extends mod.VoiceLane{constructor(options){super({...options,generate:(s,_text,signal)=>new Promise(resolve=>requests.push({path:s.speakerPath,signal,resolve}))});}}};
  const b=await boot({modelPath:modelA,speakerPath:voiceA,ttsEnabled:true},undefined,null,tts);
  b.chooseFile(modelB);assert.equal((await b.invoke('choose-vrm')).ok,true);assert.equal((await b.invoke('state')).data.settings.speakerPath,'');assert.equal((await b.invoke('action','test-voice')).ok,false);
  await b.invoke('action','talk');assert.ok(b.windows[0].events.some(e=>e.voiceStatus?.includes('未登録')));assert.equal(requests.length,0);
  b.chooseFile(voiceB);b.failSave(true);assert.equal((await b.invoke('choose-speaker')).ok,false);assert.equal((await b.invoke('state')).data.settings.speakerPath,'');b.failSave(false);assert.equal((await b.invoke('choose-speaker')).data,voiceB);await b.invoke('action','test-voice');assert.equal(requests[0].path,voiceB);
  b.chooseFile(modelA);await b.invoke('choose-vrm');assert.equal((await b.invoke('state')).data.settings.speakerPath,voiceA);assert.equal(requests[0].signal.aborted,true);requests[0].resolve(new Uint8Array([1]));await new Promise(r=>setImmediate(r));assert.ok(!b.windows[1].events.some(e=>e.voiceAudio));
  await b.invoke('action','test-voice');assert.equal(requests[1].path,voiceA);b.app.emit('before-quit');assert.equal(b.saved().voiceBindings.length,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('enlarged conversation window keeps its composer on-screen after upgrading from the small input',async()=>{
 const {windows,area}=await boot({inputX:-500,inputY:670}),input=windows[2];
 assert.equal(input.options.resizable,true);assert.equal(input.bounds.height,520);
 assert.ok(input.bounds.y+input.bounds.height<=area.y+area.height);assert.equal(input.bounds.x,-500);
});

test('topmost setting covers mascot, input and balloon across settings, menu and restart',async()=>{
 const b=await boot({topmost:false});for(const i of [1,2,3])assert.equal(b.windows[i].options.alwaysOnTop,false);assert.notEqual(b.windows[0].options.alwaysOnTop,true);
 await b.invoke('save',{...DEFAULTS,topmost:true});for(const i of [1,2,3])assert.equal(b.windows[i].topmost,true);assert.equal(b.windows[0].topmost,undefined);
 await b.invoke('action','menu');let item=b.menus.at(-1).items.find(x=>x.label?.startsWith('常に手前に表示'));assert.equal(item.type,'checkbox');assert.equal(item.checked,true);
 const before=b.windows.map(w=>({bounds:w.getBounds(),visible:w.visible}));item.click();for(const i of [1,2,3])assert.equal(b.windows[i].topmost,false);assert.equal(b.saved().settings.topmost,false);
 assert.deepEqual(b.windows.map(w=>({bounds:w.getBounds(),visible:w.visible})),before);
 await b.invoke('action','menu');item=b.menus.at(-1).items.find(x=>x.label?.startsWith('常に手前に表示'));assert.equal(item.checked,false);
 const next=await boot(b.saved().settings);for(const i of [1,2,3])assert.equal(next.windows[i].options.alwaysOnTop,false);
 item.click();assert.equal(b.saved().settings.topmost,true);assert.ok(b.windows[2].events.some(e=>e.settings?.topmost===true));
});
test('failed topmost menu save retains the setting and existing window flags',async()=>{
 const b=await boot({topmost:true});await b.invoke('save',{...DEFAULTS,topmost:true});await b.invoke('action','menu');b.failSave(true);
 b.menus.at(-1).items.find(x=>x.label?.startsWith('常に手前に表示')).click();assert.equal((await b.invoke('state')).data.settings.topmost,true);for(const i of [1,2,3])assert.equal(b.windows[i].topmost,true);
 assert.ok(b.windows[2].events.some(e=>e.speech?.includes('最前面の設定を保存できません')));
});
test('topmost recovery raises only visible windows without focusing, and stops when disabled or quitting',async()=>{
 const b=await boot({topmost:true}),[control,mascot,input,bubble]=b.windows,timer=b.intervals[0];assert.equal(timer.ms,2000);assert.equal(mascot.topmostLevel,'screen-saver');
 for(const w of b.windows)w.focused=false;input.show();bubble.show();
 const before=b.windows.map(w=>w.getBounds());timer.fn();for(const w of [mascot,input,bubble]){assert.equal(w.topmost,true);assert.ok(w.raised>0);assert.equal(w.focused,false);}assert.equal(control.raised,undefined);assert.deepEqual(b.windows.map(w=>w.getBounds()),before);
 input.hide();bubble.minimized=true;const counts=[input.raised,bubble.raised];timer.fn();assert.deepEqual([input.raised,bubble.raised],counts);assert.equal(input.visible,false);
 mascot.topmost=false;mascot.emit('always-on-top-changed',{},false);assert.equal(mascot.topmost,true);mascot.topmost=false;mascot.emit('show');assert.equal(mascot.topmost,true);mascot.topmost=false;mascot.emit('restore');assert.equal(mascot.topmost,true);
 await b.invoke('save',{...DEFAULTS,topmost:false});const raised=mascot.raised;timer.fn();mascot.emit('restore');assert.equal(mascot.raised,raised);assert.equal(mascot.topmost,false);
 await b.invoke('save',{...DEFAULTS,topmost:true});b.app.emit('before-quit');assert.equal(timer.cleared,true);const end=mascot.raised;timer.fn();assert.equal(mascot.raised,end);
});

test('startup reapplies the saved mascot rectangle after native creation and first-show adjustment',async()=>{
 const settings={...DEFAULTS,scale:5,mascotX:-2100,mascotY:-1400,inputX:-1000,inputY:300,bubbleX:-700,bubbleY:450,displayAreas:[{x:-1600,y:0,width:1600,height:900}]};
 const b=await boot(settings,undefined,null,null,null,(_phase,bounds)=>({...bounds,x:-1500,y:100,width:800,height:600}));
 const expected={...layout.mascotBounds(5,b.area),x:-2100,y:-1400};assert.deepEqual(b.windows[1].getBounds(),expected);
 assert.equal(b.windows[2].getBounds().x,-1000);assert.equal(b.windows[2].getBounds().y,300);assert.equal(b.windows[3].getBounds().x,-700);assert.equal(b.windows[3].getBounds().y,450);
 b.app.emit('before-quit');assert.equal(b.saved().settings.mascotX,-2100);assert.equal(b.saved().settings.mascotY,-1400);
 const next=await boot(b.saved().settings,undefined,null,null,null,(_phase,bounds)=>({...bounds,x:0,y:0,width:640,height:480}));assert.deepEqual(next.windows[1].getBounds(),expected);
});
test('mascot saves its actual frameless bounds rather than stale normal-window placement',async()=>{
 const b=await boot(),mascot=b.windows[1];mascot.getNormalBounds=()=>({x:0,y:0,width:800,height:600});
 mascot.setBounds({...mascot.getBounds(),x:-1900,y:-200});mascot.emit('move');assert.equal((await b.invoke('state')).data.settings.mascotX,-1900);
 b.app.emit('before-quit');assert.equal(b.saved().settings.mascotY,-200);
});

test('expression catalog and preview enforce sender, current model, name and weight',async()=>{
 const {as,invoke,windows}=await boot({modelPath:'face.vrm'});
 assert.equal((await invoke('expression-ready','face.vrm',['赤面'])).ok,false);
 assert.equal((await as(1,'expression-ready','old.vrm',['古い表情'])).ok,true);
 assert.equal((await invoke('expression-catalog')).data.names.length,0);
 assert.equal((await as(1,'expression-ready','face.vrm',['赤面','ハート','赤面'])).ok,true);
 assert.deepEqual(Array.from((await invoke('expression-catalog')).data.names),['赤面','ハート']);
 assert.equal((await as(1,'expression-preview','face.vrm','赤面',.5)).ok,false);
 assert.equal((await invoke('expression-preview','old.vrm','赤面',.5)).ok,false);
 assert.equal((await invoke('expression-preview','face.vrm','missing',.5)).ok,false);
 for(const value of [NaN,Infinity,-1,1.1,'0.5'])assert.equal((await invoke('expression-preview','face.vrm','赤面',value)).ok,false);
 assert.equal((await invoke('expression-preview','face.vrm','赤面',.5)).ok,true);
 assert.equal(windows[1].events.at(-1).expressionPreview.name,'赤面');
 assert.equal((await invoke('expression-preview','face.vrm','',0)).ok,true);
 assert.equal((await as(1,'expression-ready','face.vrm',[12])).ok,false);
});

test('quit says goodbye before closing, restores a hidden mascot and ignores duplicate exits',async()=>{
 const b=await boot();await b.invoke('action','hide');assert.equal(b.windows[1].visible,false);
 assert.equal((await b.invoke('action','quit')).ok,true);assert.equal(b.app.quitCalls||0,0);
 assert.equal(b.windows[1].visible,true);assert.equal(b.windows[3].visible,true);assert.match(b.windows[3].events.findLast(e=>e.speech)?.speech,/またね/);
 const exit=b.timers.findLast(t=>t.ms===2000&&!t.cleared);assert.ok(exit);
 await b.invoke('action','quit');assert.equal(b.timers.filter(t=>t.ms===2000&&!t.cleared).length,1);
 assert.equal((await b.invoke('chat','まだいる？')).ok,false);assert.equal((await b.invoke('save',DEFAULTS)).ok,false);
 exit.fn();assert.equal(b.app.quitCalls,1);b.app.emit('before-quit');assert.ok(b.saved());
});
test('tray exit uses the same farewell and late replies cannot replace it',async()=>{
 let reject,signal;const b=await boot({},undefined,null,null,{chat:(_s,_h,_t,s)=>{signal=s;return new Promise((_r,j)=>reject=j);}});
 const pending=b.invoke('chat','こんにちは');await new Promise(r=>setImmediate(r));
 await b.invoke('action','menu');b.menus.at(-1).items.find(i=>i.label==='終了').click();assert.equal(signal.aborted,true);
 reject(new Error('生成を停止しました。'));await pending;
 assert.match(b.windows[3].events.findLast(e=>e.speech)?.speech,/またね/);assert.equal(b.app.quitCalls||0,0);
});
test('voiced farewell waits for playback end and ignores stale audio notifications',async()=>{
 const mod=require('../src/tts.cjs'),tts={checkEmbedding:async p=>p,VoiceLane:class extends mod.VoiceLane{constructor(options){super({...options,generate:async()=>new Uint8Array([1])});}}};
 const b=await boot({ttsEnabled:true,speakerPath:'/voice.speaker.safetensors'},undefined,null,tts);
 await b.invoke('action','quit');await new Promise(r=>setImmediate(r));
 const id=b.windows[1].events.findLast(e=>e.voiceAudio).voiceAudio.id;
 assert.ok(b.timers.some(t=>t.ms===15000&&!t.cleared));assert.equal(b.app.quitCalls||0,0);
 await b.as(1,'voice-state',id,'start');assert.ok(b.timers.some(t=>t.ms===30000&&!t.cleared));
 await b.as(1,'voice-state',id-1,'ended');assert.ok(!b.timers.some(t=>t.ms===700&&!t.cleared));
 await b.as(1,'voice-state',id,'ended');const end=b.timers.findLast(t=>t.ms===700&&!t.cleared);assert.ok(end);assert.equal(b.app.quitCalls||0,0);end.fn();assert.equal(b.app.quitCalls,1);
});
test('failed or stalled farewell audio exits without waiting forever and stop can shorten it',async()=>{
 const mod=require('../src/tts.cjs');
 for(const kind of ['failure','stalled','stop']){
  const tts={checkEmbedding:async p=>p,VoiceLane:class extends mod.VoiceLane{constructor(options){super({...options,generate:async()=>{if(kind==='failure')throw new Error('server down');return new Promise(()=>{});}});}}};
  const b=await boot({ttsEnabled:true,speakerPath:'/voice.speaker.safetensors'},undefined,null,tts);
  await b.invoke('action','quit');await new Promise(r=>setImmediate(r));if(kind==='stop')await b.invoke('action','stop-voice');
  const ms=kind==='failure'?2000:kind==='stalled'?15000:700,end=b.timers.findLast(t=>t.ms===ms&&!t.cleared);assert.ok(end);end.fn();assert.equal(b.app.quitCalls,1);
 }
});

test('startup greeting waits for mascot readiness, occurs once and keeps input closed',async()=>{
 const b=await boot();assert.equal(b.windows[3].visible,false);
 assert.equal((await b.invoke('mascot-ready')).ok,false);
 await b.as(1,'mascot-ready');assert.equal(b.windows[3].visible,true);assert.equal(b.windows[2].visible,false);
 assert.match(b.windows[3].events.findLast(e=>e.speech)?.speech,/こんにちは/);
 const count=b.windows[3].events.filter(e=>e.speech).length;await b.as(1,'mascot-ready');assert.equal(b.windows[3].events.filter(e=>e.speech).length,count);
});
test('late startup readiness does not replace an existing conversation or farewell',async()=>{
 const b=await boot();await b.invoke('action','talk');const text=b.windows[3].events.findLast(e=>e.speech).speech;
 await b.as(1,'mascot-ready');assert.equal(b.windows[3].events.findLast(e=>e.speech).speech,text);
 const c=await boot();await c.invoke('action','quit');await c.as(1,'mascot-ready');assert.match(c.windows[3].events.findLast(e=>e.speech).speech,/またね/);
});

test('early mascot readiness waits until every window has loaded and the mascot is visible',async()=>{
 let resolve;const loading=new Promise(r=>resolve=r),b=await boot({},undefined,null,null,null,null,()=>loading);
 await b.as(1,'mascot-ready');assert.equal(b.windows[3].visible,false);assert.equal(b.windows[1].visible,false);
 resolve();await new Promise(r=>setImmediate(r));assert.equal(b.windows[1].visible,true);assert.equal(b.windows[3].visible,true);
 assert.match(b.windows[3].events.findLast(e=>e.speech)?.speech,/こんにちは/);
});


test('VRM switch restores persona and addressing; failed settings saves or switches roll back',async()=>{
 const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'persona-switch-'));
 try{
  const a=path.join(dir,'A.vrm'),bPath=path.join(dir,'B.vrm');for(const file of [a,bPath])fs.writeFileSync(file,'fixture');
  const identity={name:'Aの子',persona:'静かな口調',selfPronoun:'私',userAddress:'先輩'};
  const b=await boot({modelPath:a,...identity,temperature:1.1});
  b.chooseFile(bPath);assert.equal((await b.invoke('choose-vrm')).ok,true);let s=(await b.invoke('state')).data.settings;assert.equal(s.name,'B');assert.equal(s.persona,DEFAULTS.persona);assert.equal(s.selfPronoun,'');assert.equal(s.userAddress,'');assert.equal(s.temperature,1.1);
  await b.invoke('save',{...s,name:'Bの子',persona:'元気',selfPronoun:'あたし',userAddress:'相棒'});
  b.chooseFile(a);await b.invoke('choose-vrm');s=(await b.invoke('state')).data.settings;for(const [k,v]of Object.entries(identity))assert.equal(s[k],v);
  b.failSave(true);assert.equal((await b.invoke('save',{...s,name:'失敗した名前',selfPronoun:'俺'})).ok,false);s=(await b.invoke('state')).data.settings;assert.equal(s.name,identity.name);assert.equal(s.selfPronoun,'私');
  b.chooseFile(bPath);assert.equal((await b.invoke('choose-vrm')).ok,false);s=(await b.invoke('state')).data.settings;assert.equal(s.modelPath,a);assert.equal(s.name,identity.name);
  b.failSave(false);await b.invoke('choose-vrm');s=(await b.invoke('state')).data.settings;assert.equal(s.name,'Bの子');assert.equal(s.selfPronoun,'あたし');assert.equal(s.userAddress,'相棒');
  for(const window of b.windows)assert.ok(window.events.some(e=>e.reloadVRM&&e.settings.name==='Bの子'));
  assert.equal((await b.invoke('state')).data.characterBindings,undefined);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});



test('llama management is control-only; authenticated chat, configuration changes and quit use the owned server',async()=>{
 const calls=[];let server;
 const llamaFixture={LlamaServer:class{
  constructor(options){this.options=options;this.phase='stopped';server=this;}
  status(){return {phase:this.phase};}
  credentials(){if(this.phase!=='running')throw new Error('サーバーを起動してください。');return 'private-process-key';}
  async start(s){calls.push(['start',s]);this.child={};this.phase='running';this.options.onState(this.status());return this.status();}
  async stop(){calls.push(['stop']);this.child=null;this.phase='stopped';this.options.onState(this.status());return this.status();}
 }};
 const llm={chat:async(s,h,t,signal,options)=>{calls.push(['chat',options.apiKey]);return '返答';},listModels:async(s,options)=>{calls.push(['models',options.apiKey]);return ['companion-gguf'];}};
 const b=await boot({},undefined,null,null,llm,null,null,llamaFixture);
 assert.equal((await b.as(1,'llama-start')).ok,false);assert.equal((await b.as(2,'llama-stop')).ok,false);assert.equal((await b.as(1,'choose-llama-file','model')).ok,false);assert.equal((await b.invoke('choose-llama-file','unknown')).ok,false);
 assert.equal((await b.invoke('llama-start')).ok,false);assert.equal(calls.length,0);
 const settings=cleanSettings({provider:'llamacpp',llamaModelPath:'/models/Qwen.gguf'});await b.invoke('save',settings);assert.equal((await b.invoke('chat','こんにちは')).ok,false);
 await b.invoke('llama-start');await b.invoke('models',settings);await b.invoke('chat','こんにちは');assert.ok(calls.some(c=>c[0]==='chat'&&c[1]==='private-process-key'));assert.ok(calls.some(c=>c[0]==='models'&&c[1]==='private-process-key'));assert.ok(!JSON.stringify((await b.invoke('state')).data).includes('private-process-key'));
 await b.invoke('save',{...settings,llamaDryMultiplier:.4});assert.equal(server.phase,'running','DRY changes apply per request without reloading the model');
 await b.invoke('save',{...settings,llamaContext:2048});assert.equal(server.phase,'stopped');await b.invoke('llama-start');
 let prevented=false;b.app.emit('before-quit',{preventDefault(){prevented=true;}});await new Promise(r=>setImmediate(r));assert.equal(prevented,true);assert.equal(server.phase,'stopped');assert.equal(b.app.quitCalls,1);
 b.app.emit('before-quit',{preventDefault(){throw new Error('Quit may not loop.');}});assert.equal(b.app.isQuitting,true);
});


test('memory editor and organizer are control-only; source-backed memories reach chat and remain isolated',async()=>{
 const extras=[],M=require('../src/memory.cjs'),llm={chat:async(s,h,t,signal,o)=>{extras.push(o.systemExtra);return '返事：'+t;},organizeMemory:async(s,job)=>({summary:'食べ物について話した。',facts:[{sourceId:job.extractTurns[0].id,quote:'好きな食べ物はカレーです',kind:'preference'}]})};
 const b=await boot({model:'test',historyTurns:2,memoryAuto:false},undefined,null,null,llm);
 assert.equal((await b.as(1,'memory-view')).ok,false);assert.equal((await b.as(2,'memory-organize')).ok,false);assert.equal((await b.as(1,'memory-edit','default','clear')).ok,false);
 for(let i=0;i<6;i++)await b.invoke('chat',i===0?'好きな食べ物はカレーです':'その後の話'+i);
 assert.equal((await b.invoke('memory-organize')).ok,true);let view=(await b.invoke('memory-view')).data;assert.equal(view.items.length,1);assert.equal(view.summary,'食べ物について話した。');assert.equal(view.items[0].source.type,'user');
 await b.invoke('chat','好きな食べ物を覚えてる？');assert.ok(extras.at(-1).includes('カレー'));assert.ok(extras.at(-1).includes('食べ物について話した'));
 b.failSave(true);assert.equal((await b.invoke('memory-edit',view.profileId,'save',{id:view.items[0].id,text:'変更しない',kind:'preference'})).ok,false);b.failSave(false);assert.equal((await b.invoke('memory-view')).data.items[0].text,'好きな食べ物はカレーです');
 await b.invoke('clear');view=(await b.invoke('memory-view')).data;assert.equal(view.summary,'');assert.equal(view.items.length,1);assert.equal((await b.invoke('state')).data.history.length,0);
 const profile=view.profileId;await b.invoke('relationship','create','別の子');assert.equal((await b.invoke('memory-view')).data.items.length,0);assert.equal((await b.invoke('memory-edit',profile,'clear')).ok,false);
 await b.invoke('relationship','select',profile);assert.equal((await b.invoke('memory-view')).data.items.length,1);await b.invoke('memory-edit',profile,'clear');assert.equal((await b.invoke('memory-view')).data.items.length,0);
});
test('cancelled or stale memory organization cannot overwrite a new character or revive cleared memory',async()=>{
 let finish;const b=await boot({model:'test',memoryAuto:false},undefined,null,null,{organizeMemory:async(s,job)=>new Promise(r=>finish=()=>r({summary:'',facts:[{sourceId:job.extractTurns[0].id,quote:'好きな食べ物はカレーです',kind:'preference'}]}))});
 await b.invoke('chat','好きな食べ物はカレーです');const pending=b.invoke('memory-organize');await new Promise(r=>setImmediate(r));await b.invoke('relationship','create','別の子');finish();await pending;assert.equal((await b.invoke('memory-view')).data.items.length,0);await b.invoke('relationship','select','default');assert.equal((await b.invoke('memory-view')).data.items.length,0);
});
test('disabling memory omits saved notes and summary from conversation context',async()=>{
 let extra='';const b=await boot({model:'test',memoryAuto:false},undefined,null,null,{chat:async(s,h,t,signal,o)=>{extra=o.systemExtra;return '返事';}});const v=(await b.invoke('memory-view')).data;await b.invoke('memory-edit',v.profileId,'save',{text:'好きな食べ物はカレーです',kind:'preference'});await b.invoke('save',{...DEFAULTS,model:'test',memoryEnabled:false,memoryAuto:false});await b.invoke('chat','好きな食べ物を覚えてる？');assert.ok(!extra.includes('カレー'));assert.ok(!extra.includes('保存された記憶'));
});

test('VRM assignment asks before creating profiles; cancel is side-effect free and outfit reuse keeps history',async()=>{
 const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'vrm-assignment-'));try{
  const file=path.join(dir,'outfit.vrm');fs.writeFileSync(file,'fixture');const b=await boot({model:'test',memoryAuto:false});await b.invoke('chat','趣味は読書です');
  const before=JSON.stringify((await b.invoke('state')).data.history);b.chooseFile(file);b.chooseVRMResponse(2);assert.equal((await b.invoke('choose-vrm')).data,null);assert.equal((await b.invoke('state')).data.settings.modelPath,'');assert.equal(JSON.stringify((await b.invoke('state')).data.history),before);
  b.chooseVRMResponse(0);assert.equal((await b.invoke('choose-vrm')).ok,true);assert.equal((await b.invoke('state')).data.relationship.profiles.length,1);assert.equal(JSON.stringify((await b.invoke('state')).data.history),before);
  const questions=b.vrmQuestions.length;await b.invoke('choose-vrm');assert.equal(b.vrmQuestions.length,questions,'a bound path does not ask again');
  const second=path.join(dir,'other.vrm');fs.writeFileSync(second,'fixture');b.chooseFile(second);b.chooseVRMResponse(1);assert.equal((await b.invoke('choose-vrm')).ok,true);const state=(await b.invoke('state')).data;assert.equal(state.relationship.profiles.length,2);assert.equal(state.history.length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('profile merge and cleanup are control-only, preserve records and roll back failed saves',async()=>{
 const b=await boot({model:'test',memoryAuto:false});await b.invoke('chat','現在の会話');const target=(await b.invoke('state')).data.relationship.active;
 await b.invoke('relationship','create','以前のプロフィール');const source=(await b.invoke('state')).data.relationship.active;await b.invoke('chat','以前の会話');await b.invoke('memory-edit',source,'save',{text:'趣味は読書です',kind:'preference'});await b.invoke('relationship','select',target);
 assert.equal((await b.as(1,'relationship','merge',{sourceId:source,targetId:target})).ok,false);assert.equal((await b.invoke('relationship','merge',{sourceId:source,targetId:'stale'})).ok,false);
 const before=b.saved();b.failSave(true);assert.equal((await b.invoke('relationship','merge',{sourceId:source,targetId:target})).ok,false);b.failSave(false);let state=(await b.invoke('state')).data;assert.equal(state.relationship.profiles.length,2);assert.equal(state.history.length,2);assert.deepEqual(b.saved(),before);
 assert.equal((await b.invoke('relationship','merge',{sourceId:source,targetId:target})).ok,true);state=(await b.invoke('state')).data;assert.equal(state.history.length,4);assert.equal(state.relationship.profiles.length,1);assert.equal(state.relationship.archived.length,1);assert.equal((await b.invoke('memory-view')).data.items.length,1);
 await b.invoke('relationship','restore',source);assert.equal((await b.invoke('state')).data.relationship.profiles.length,2);await b.invoke('relationship','select',source);assert.equal((await b.invoke('state')).data.history[0].content,'以前の会話');assert.equal((await b.invoke('memory-view')).data.items.length,1);
 await b.invoke('relationship','rename','整理した名前');assert.equal((await b.invoke('state')).data.relationship.label,'整理した名前');
});
test('memory view distinguishes short-term history from empty notes and stores a successful empty extraction',async()=>{
 const b=await boot({model:'test',memoryAuto:false});await b.invoke('chat','こんにちは');await b.invoke('chat','今日はいい天気');let view=(await b.invoke('memory-view')).data;assert.equal(view.stats.historyTurns,2);assert.equal(view.stats.shortTermTurns,2);assert.equal(view.stats.pendingTurns,2);assert.equal(view.organizedAt,0);
 assert.equal((await b.invoke('memory-organize')).ok,true);view=(await b.invoke('memory-view')).data;assert.equal(view.items.length,0);assert.ok(view.organizedAt>0);assert.equal(view.stats.pendingTurns,0);assert.match(view.status,/直近の会話は履歴/);
});

test('automatic memory processes an idle backlog in bounded batches without a manual save',async()=>{
 const M=require('../src/memory.cjs'),timers=[],requests=[];const fixture={...M,MemoryWorker:class extends M.MemoryWorker{constructor(options){super({...options,setTimer:fn=>{const t={fn,unref(){}};timers.push(t);return t;},clearTimer:t=>{t.cancelled=true;}});}}};
 const b=await boot({model:'test',historyTurns:2},undefined,null,null,{organizeMemory:async(s,job)=>{requests.push(job);return {summary:'食べ物についての会話。',facts:[{sourceId:job.extractTurns[0].id,quote:'カレーが好きです',kind:'preference'}]};}},null,null,null,fixture);
 for(let i=0;i<8;i++)await b.invoke('chat','カレーが好きです。会話'+i);
 for(let i=0;i<2;i++){const timer=timers.findLast(t=>!t.cancelled&&!t.ran);assert.ok(timer);timer.ran=true;timer.fn();await new Promise(r=>setImmediate(r));}
 assert.equal(requests.length,2);assert.equal(requests[0].extractTurns.length,6);assert.equal(requests[1].extractTurns.length,2);
 const view=(await b.invoke('memory-view')).data;assert.equal(view.items.length,1);assert.match(view.summary,/食べ物/);assert.equal(view.stats.pendingTurns,0);assert.equal(view.stats.pendingSummaryTurns,0);assert.ok(view.organizedAt>0);assert.ok(b.saved().relationships.profiles[0].memory.items.length);
 await b.invoke('save',{...DEFAULTS,model:'test',memoryAuto:false});assert.ok(!timers.some(t=>!t.cancelled&&!t.ran));
});

test('permanent deletion is control-only, preserves the active conversation and rolls back disk failures',async()=>{
 const b=await boot({model:'test',memoryAuto:false});await b.invoke('chat','残す会話');const target=(await b.invoke('state')).data.relationship.active;
 await b.invoke('relationship','create','削除対象');const source=(await b.invoke('state')).data.relationship.active;await b.invoke('chat','削除する会話');await b.invoke('memory-edit',source,'save',{text:'削除するメモ',kind:'profile'});await b.invoke('relationship','select',target);
 assert.equal((await b.as(2,'relationship','delete',source)).ok,false);assert.equal((await b.invoke('relationship','delete',target)).ok,false);const before=JSON.stringify((await b.invoke('state')).data.history);
 b.failSave(true);assert.equal((await b.invoke('relationship','delete',source)).ok,false);b.failSave(false);assert.equal((await b.invoke('state')).data.relationship.profiles.length,2);assert.equal((await b.invoke('relationship','select',source)).ok,true);assert.equal((await b.invoke('memory-view')).data.items.length,1);await b.invoke('relationship','select',target);
 assert.equal((await b.invoke('relationship','delete',source)).ok,true);const state=(await b.invoke('state')).data;assert.equal(state.relationship.profiles.length,1);assert.equal(JSON.stringify(state.history),before);assert.equal(b.saved().relationships.profiles.some(p=>p.id===source),false);assert.equal((await b.invoke('relationship','restore',source)).ok,false);
});
