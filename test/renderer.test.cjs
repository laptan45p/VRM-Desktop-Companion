const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const THREE=require('./bundle-runtime.cjs'),{DEFAULTS}=require('../src/backend.cjs'),layout=require('../src/layout.cjs');
async function boot(view,withModel=false,audioFixture=null,modelFixture=null){
 const faceControllers=[];const expressionModule=require('../src/expressions.cjs');
 const nodes=new Map(),listeners={},calls=[],rootEvents={},settings={...DEFAULTS,model:'test-local',modelPath:withModel?'fixture.vrm':''},events={};let notify,failSend=false,rendered,frame;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,style:{},hidden:true,value:'',textContent:'',checked:false,disabled:false,children:[],clientWidth:440,clientHeight:518,scrollHeight:200,scrollTop:0,classList:{toggle(){},add(){}},append(...a){this.children.push(...a);},replaceChildren(){this.children=[];},add(o){this.children.push(o);},addEventListener(type,fn){this['on'+type]=fn;},getBoundingClientRect(){return {left:0,top:0,width:440,height:id==='speechCard'?120:518};},focus(){this.focused=true;},setPointerCapture(){this.capture=true;},hasPointerCapture(){return !!this.capture;},releasePointerCapture(){this.capture=false;},requestSubmit(){return this.onsubmit?.({preventDefault(){}});}});return nodes.get(id);};
 const ok=data=>Promise.resolve({ok:true,data});
 let relation=require('../src/relationship.cjs').view(require('../src/relationship.cjs').clean());
 const api={mascotReady:()=>{calls.push(['mascotReady']);return ok();},expressionCatalog:()=>ok({modelPath:settings.modelPath,names:[]}),expressionReady:(path,names)=>{calls.push(['expressionReady',path,names]);return ok();},previewExpression:(...args)=>{calls.push(['previewExpression',...args]);return ok();},relationship:(op,value)=>{calls.push(['relationship',op,value]);if(op==='romance')relation={...relation,romanceEnabled:value};notify?.({relationship:relation});return ok(relation);},confess:()=>{calls.push(['confess']);return ok('返事');},keyStatus:()=>ok({saved:false,available:true}),saveKey:(s,key)=>{calls.push(['saveKey',s.provider,s.endpoint,key]);return ok({saved:true});},deleteKey:s=>{calls.push(['deleteKey',s.provider,s.endpoint]);return ok({saved:false});},voiceState:(...args)=>{calls.push(['voiceState',...args]);return ok();},chooseSpeaker:()=>ok(null),motionList:()=>ok(withModel==='vrma'?['VRMA_02.vrma']:[]),chooseMotions:()=>ok(null),motionData:()=>ok(new Uint8Array(require('./vrma-fixture.cjs')())),state:()=>ok({settings,relationship:relation,history:[],busy:false,pass:false,dataPath:'/test',speech:''}),onUpdate:fn=>notify=fn,
  zoom:delta=>{calls.push(['zoom',delta]);return ok(settings.scale);},
  orientation:angles=>{calls.push(['orientation',angles]);return ok({...settings,...angles});},
  action:name=>{calls.push(['action',name]);return ok();},hit:v=>{calls.push(['hit',v]);return ok();},drag:(...a)=>{calls.push(['drag',...a]);return ok();},bubbleSize:h=>{calls.push(['bubbleSize',h]);return ok();},modelStatus:t=>{calls.push(['modelStatus',t]);return ok();},touch:(...args)=>{calls.push(['touch',...args]);return ok();},vrm:()=>ok(withModel?new Uint8Array(require('./fixture.cjs')()):null),
  send:async text=>{calls.push(['send',text]);if(failSend)return {ok:false,error:'接続できません'};return {ok:true,data:'返事'};},cancel:()=>ok(),models:s=>{calls.push(['models',s]);return modelFixture?modelFixture(s):ok(['test-local']);},save:s=>{calls.push(['save',s]);return ok(s);}};
 class Renderer{constructor(){this.domElement={};}setClearColor(){}setPixelRatio(value){calls.push(['pixelRatio',value]);}setSize(){}setAnimationLoop(cb){frame=cb;cb();}render(scene,camera){rendered={scene,camera};}}
 let now=0;const context={THREE:{...THREE,Clock:class{getDelta(){return .05;}},WebGLRenderer:Renderer},GLTFLoader:THREE.GLTFLoader,VRMLoaderPlugin:THREE.VRMLoaderPlugin,VRMUtils:THREE.VRMUtils,VRMAnimationLoaderPlugin:THREE.VRMAnimationLoaderPlugin,createVRMAnimationClip:THREE.createVRMAnimationClip,
  window:{AudioContext:class{constructor(){if(!audioFixture)throw new Error('No audio fixture');return audioFixture.ctx;}},companionAudio:require('../src/speech-audio.cjs'),companionVrma:require('../src/vrma-player.cjs'),companion:api,companionLayout:layout,companionOrientation:require('../src/orientation.cjs'),companionPicking:require('../src/picking.cjs'),companionHand:withModel==='hand'?{HandDrag:class{begin(){return true;}move(v){calls.push(['handMove',v.x,v.y,v.z]);}release(){calls.push(['handRelease']);}reset(){}restore(){}update(){}}}:require('../src/hand.cjs'),companionExpressions:{...expressionModule,FaceExpressions:class extends expressionModule.FaceExpressions{constructor(){super();faceControllers.push(this);}}},companionMotion:require('../src/motion.cjs'),companionInteraction:require('../src/interaction.cjs'),companionCloth:withModel==='cloth'?{ClothDrag:class{begin(){return true;}move(v){calls.push(['clothMove',v.x,v.y,v.z]);}release(){calls.push(['clothRelease']);}reset(){calls.push(['clothReset']);}restore(){}update(){}}}:require('../src/cloth.cjs'),addEventListener:(k,f)=>listeners[k]=f},document:{body:{className:'',dataset:{}},documentElement:{classList:{add(){}}},getElementById:node,createElement:()=>node('new-'+nodes.size),createTextNode:text=>({textContent:text}),addEventListener:(k,f)=>events[k]=f},location:{search:'?view='+view},URLSearchParams,
  performance:{now:()=>now+=50},devicePixelRatio:1,ResizeObserver:class{constructor(fn){this.fn=fn;}observe(){}},requestAnimationFrame:fn=>fn(),Option:class{constructor(text,value){this.text=text;this.value=value;}},console,confirm:()=>true};
 const code=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8').split('\n').filter(l=>!l.startsWith('import ')).join('\n');
 context.renderQuality=require('../src/render-quality.cjs');
 vm.runInNewContext(code,context);await new Promise(r=>setImmediate(r));
 return {node,calls,notify,listeners,events,rendered,faceControllers,tick:()=>frame?.(),advance:()=>now+=200,setFailure:v=>failSend=v};
}
test('input keeps failed text, supports IME-safe Enter and Escape, and stays open for successive messages',async()=>{
 const {node,calls,setFailure}=await boot('input');assert.equal(node('inputPanel').hidden,false);
 node('messageInput').value='こんにちは';setFailure(true);await node('inputForm').onsubmit({preventDefault(){}});assert.equal(node('messageInput').value,'こんにちは');assert.match(node('inputStatus').textContent,/接続/);
 const count=calls.length;node('messageInput').onkeydown({key:'Enter',isComposing:true,preventDefault(){}});assert.equal(calls.length,count);
 setFailure(false);await node('inputForm').onsubmit({preventDefault(){}});assert.equal(node('messageInput').value,'');assert.ok(!calls.some(c=>c[0]==='action'&&c[1]==='close-input'));assert.equal(node('messageInput').focused,true);node('messageInput').value='続きの会話';await node('inputForm').onsubmit({preventDefault(){}});assert.ok(calls.some(c=>c[0]==='send'&&c[1]==='続きの会話'));assert.ok(!calls.some(c=>c[0]==='action'&&c[1]==='close-input'));
 node('messageInput').onkeydown({key:'Escape',preventDefault(){}});assert.equal(calls.at(-1)[1],'close-input');
});
test('speech is plain text, measured to fit and can be dismissed',async()=>{
 const {node,calls,notify}=await boot('bubble');notify({speech:'<script>hello</script>\nどうしたの？'});assert.equal(node('speechText').textContent,'<script>hello</script>\nどうしたの？');assert.ok(calls.some(c=>c[0]==='bubbleSize'&&c[1]===144));
 node('dismissSpeech').onclick();assert.equal(calls.at(-1)[1],'close-bubble');
});
test('character mesh picking separates clicks, background, context menu and drag',async()=>{
 const {node,calls,rendered,listeners,advance}=await boot('mascot');assert.ok(rendered,'3D setup failed');const pos=new THREE.Vector3(0,1.2,.3).project(rendered.camera);
 const x=(pos.x+1)*220,y=(1-pos.y)*259;
 const event=(extras={})=>({button:0,pointerId:1,clientX:x,clientY:y,screenX:100,screenY:100,preventDefault(){},...extras});
 listeners.mousemove(event());assert.equal(calls.at(-1)[0],'hit');assert.equal(calls.at(-1)[1],true);
 const el=node('avatar');el.onpointerdown(event());el.onpointerup(event());assert.ok(calls.some(c=>c[0]==='action'&&c[1]==='talk'));
 const before=calls.filter(c=>c[0]==='action'&&c[1]==='talk').length;el.onpointerdown(event());el.onpointermove(event({screenX:120}));el.onpointerup(event({screenX:120}));assert.ok(calls.some(c=>c[0]==='drag'&&c[1]==='move'));assert.equal(calls.filter(c=>c[0]==='action'&&c[1]==='talk').length,before);
 el.oncontextmenu(event());assert.equal(calls.at(-1)[1],'menu');
 const menuCount=calls.filter(c=>c[1]==='menu').length;el.oncontextmenu(event({clientX:0,clientY:0}));assert.equal(calls.filter(c=>c[1]==='menu').length,menuCount);
 listeners.mousemove(event());advance();listeners.mousemove(event({clientX:0,clientY:0}));assert.equal(calls.at(-1)[0],'hit');assert.equal(calls.at(-1)[1],false);
});

test('motion controls load saved values and persist toggles and strength',async()=>{
 const {node,calls}=await boot('control');assert.equal(node('lipSync').checked,true);assert.equal(node('softIdle').checked,true);
 node('lipSync').checked=false;node('softIdle').checked=false;node('motionStrength').value='0.25';
 await node('settingsForm').onsubmit({preventDefault(){}});const saved=calls.find(c=>c[0]==='save')[1];assert.equal(saved.lipSync,false);assert.equal(saved.softIdle,false);assert.equal(saved.motionStrength,.25);
 node('testMotion').onclick();await new Promise(r=>setImmediate(r));assert.ok(calls.some(c=>c[0]==='action'&&c[1]==='test-motion'));
});

test('speech font updates immediately from settings, including an arbitrary family name',async()=>{
 const {node,notify}=await boot('bubble');notify({settings:{...DEFAULTS,bubbleFont:'Custom Japanese Font',bubbleFontSize:32},speech:'こんにちは'});
 assert.match(node('speechText').style.fontFamily,/Custom Japanese Font/);assert.equal(node('speechText').style.fontSize,'32px');
});

test('VRM head tap/swipe emits one reaction per completed pointer gesture and Shift still drags',async()=>{
 const {node,calls,rendered,advance}=await boot('mascot',true);assert.ok(!calls.some(c=>c[0]==='modelStatus'),'VRM load failed');
 const pos=new THREE.Vector3(0,1.74,.1).project(rendered.camera),x=(pos.x+1)*220,y=(1-pos.y)*259;
 const event=(extras={})=>({button:0,pointerId:1,isPrimary:true,clientX:x,clientY:y,screenX:100,screenY:100,preventDefault(){},...extras});const el=node('avatar');
 el.onpointerdown(event());el.onpointerup(event());assert.ok(calls.some(c=>c[0]==='touch'&&c[1]==='head'&&c[2]==='poke'),JSON.stringify(calls));
 el.onpointerdown(event());el.onpointermove(event({screenX:125}));advance();el.onpointermove(event({screenX:100}));el.onpointerup(event());assert.equal(calls.filter(c=>c[0]==='touch').length,2);assert.equal(calls.filter(c=>c[0]==='touch').at(-1)[2],'stroke');assert.equal(calls.filter(c=>c[0]==='drag').length,0);
 el.onpointerdown(event());el.onpointercancel();el.onpointerup(event());assert.equal(calls.filter(c=>c[0]==='touch').length,2);
 el.onpointerdown(event({shiftKey:true}));el.onpointermove(event({screenX:130}));el.onpointerup(event({screenX:130}));assert.ok(calls.some(c=>c[0]==='drag'&&c[1]==='move'));
});

test('cloth drag owns its gesture, releases on cancellation, and Shift preserves mascot movement',async()=>{
 const {node,calls,rendered}=await boot('mascot','cloth');const pos=new THREE.Vector3(0,1.2,.1).project(rendered.camera),x=(pos.x+1)*220,y=(1-pos.y)*259;
 const event=(extras={})=>({button:0,pointerId:1,isPrimary:true,clientX:x,clientY:y,screenX:100,screenY:100,preventDefault(){},...extras}),el=node('avatar');
 el.onpointerdown(event());el.onpointermove(event({clientY:y-20,screenY:80}));el.onpointerup(event({clientY:y-20,screenY:80}));assert.ok(calls.some(c=>c[0]==='clothMove'&&c[2]>0));assert.ok(calls.some(c=>c[0]==='touch'&&c[1]==='cloth'));assert.ok(!calls.some(c=>c[0]==='drag'));
 const count=calls.filter(c=>c[0]==='touch').length;el.onpointerdown(event());el.onpointercancel();el.onpointerup(event());assert.equal(calls.filter(c=>c[0]==='touch').length,count);
 el.onpointerdown(event({shiftKey:true}));el.onpointermove(event({screenX:130}));el.onpointerup(event({screenX:130}));assert.ok(calls.some(c=>c[0]==='drag'&&c[1]==='move'));
});

test('cloth range controls load defaults and save percentage and angle correctly',async()=>{
 const {node,calls}=await boot('control');assert.equal(Number(node('clothReach').value),18);assert.equal(Number(node('clothAngle').value),80);node('clothReach').value='40';node('clothAngle').value='110';await node('settingsForm').onsubmit({preventDefault(){}});const saved=calls.find(c=>c[0]==='save')[1];assert.equal(saved.clothReach,.4);assert.equal(saved.clothAngle,110);
});

test('hand drag moves the hand, emits one reaction, cancels cleanly, and leaves Shift-drag available',async()=>{
 const {node,calls,rendered}=await boot('mascot','hand');const pos=new THREE.Vector3(0,1.2,.1).project(rendered.camera),x=(pos.x+1)*220,y=(1-pos.y)*259;
 const event=(extras={})=>({button:0,pointerId:1,isPrimary:true,clientX:x,clientY:y,screenX:100,screenY:100,preventDefault(){},...extras}),el=node('avatar');
 el.onpointerdown(event());el.onpointermove(event({clientY:y-25,screenY:75}));el.onpointerup(event({clientY:y-25,screenY:75}));assert.ok(calls.some(c=>c[0]==='handMove'&&c[2]>0));assert.ok(calls.some(c=>c[0]==='touch'&&c[1]==='hand'));assert.ok(!calls.some(c=>c[0]==='drag'));
 const count=calls.filter(c=>c[0]==='touch').length;el.onpointerdown(event());el.onpointercancel();el.onpointerup(event());assert.equal(calls.filter(c=>c[0]==='touch').length,count);
 el.onpointerdown(event({shiftKey:true}));el.onpointermove(event({screenX:130}));el.onpointerup(event({screenX:130}));assert.ok(calls.some(c=>c[0]==='drag'&&c[1]==='move'));
});


test('Ctrl drag rotates XY and Ctrl Shift rotates Z around a fixed center',async()=>{
 const {node,calls,rendered}=await boot('mascot'),root=rendered.scene.children.find(o=>o.isGroup),center=new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3()),local=root.worldToLocal(center.clone()),el=node('avatar');
 function event(extras={}){const p=root.localToWorld(new THREE.Vector3(0,1.2,.3)).project(rendered.camera);return {button:0,pointerId:1,ctrlKey:true,clientX:(p.x+1)*220,clientY:(1-p.y)*259,screenX:100,screenY:100,preventDefault(){},...extras};}
 el.onpointerdown(event());el.onpointermove(event({screenX:150,screenY:125}));assert.ok(root.localToWorld(local.clone()).distanceTo(center)<1e-9);el.onpointerup(event({screenX:150,screenY:125}));await new Promise(r=>setImmediate(r));
 assert.deepEqual(JSON.parse(JSON.stringify(calls.find(c=>c[0]==='orientation')[1])),{angleX:10,angleY:20,angleZ:0});assert.ok(!calls.some(c=>['drag','touch','action'].includes(c[0])));
 el.onpointerdown(event({shiftKey:true}));el.onpointermove(event({shiftKey:true,screenX:150}));el.onpointerup(event({shiftKey:true,screenX:150}));assert.deepEqual(JSON.parse(JSON.stringify(calls.filter(c=>c[0]==='orientation').at(-1)[1])),{angleX:10,angleY:20,angleZ:20});
});
test('axis form saves XYZ and cancellation does not commit rotation',async()=>{
 const control=await boot('control');for(const [k,v] of Object.entries({angleX:15,angleY:30,angleZ:45}))control.node(k).value=String(v);await control.node('settingsForm').onsubmit({preventDefault(){}});const s=control.calls.find(c=>c[0]==='save')[1];assert.equal(s.angleX,15);assert.equal(s.angleY,30);assert.equal(s.angleZ,45);
 const {node,calls,rendered}=await boot('mascot'),p=new THREE.Vector3(0,1.2,.3).project(rendered.camera),e={button:0,pointerId:1,ctrlKey:true,clientX:(p.x+1)*220,clientY:(1-p.y)*259,screenX:100,screenY:100,preventDefault(){}};node('avatar').onpointerdown(e);node('avatar').onpointermove({...e,screenX:150});node('avatar').onpointercancel();assert.ok(!calls.some(c=>c[0]==='orientation'));
});
test('external rotation refreshes axes while preserving an unsaved persona',async()=>{
 const {node,notify}=await boot('control');node('persona').value='draft';node('settingsForm').oninput();notify({settings:{...DEFAULTS,angleX:20,angleY:35,angleZ:-10}});assert.equal(node('persona').value,'draft');assert.equal(Number(node('angleX').value),20);assert.equal(Number(node('angleY').value),35);assert.equal(Number(node('angleZ').value),-10);
});

test('renderer loads VRMA, greets on startup/click and restores pose on hide',async()=>{
 const {calls,rendered,tick,notify}=await boot('mascot','vrma');for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));
 assert.ok(!calls.some(c=>c[0]==='modelStatus'),JSON.stringify(calls));notify({settings:{...DEFAULTS,modelPath:'fixture.vrm',softIdle:false}});const bone=rendered.scene.getObjectByName('Normalized_leftUpperArm');assert.ok(bone);const base=bone.quaternion.clone();for(let i=0;i<10;i++)tick();assert.ok(bone.quaternion.angleTo(base)>.05);
 for(let i=0;i<20;i++)tick();assert.ok(bone.quaternion.angleTo(base)<.02);notify({greeting:true});for(let i=0;i<10;i++)tick();assert.ok(bone.quaternion.angleTo(base)>.05);notify({mascotVisible:false});tick();assert.ok(bone.quaternion.angleTo(base)<.02);
});
test('VRMA controls persist greeting, periodic toggle and interval',async()=>{
 const {node,calls}=await boot('control');assert.equal(Number(node('motionInterval').value),60);assert.equal(node('randomMotion').checked,true);node('motionInterval').value='120';node('greetingMotion').value='my_greeting.vrma';node('randomMotion').checked=false;await node('settingsForm').onsubmit({preventDefault(){}});const s=calls.find(c=>c[0]==='save')[1];assert.equal(s.motionInterval,120);assert.equal(s.greetingMotion,'my_greeting.vrma');assert.equal(s.randomMotion,false);
});

test('idle controls save selected file, mode, speed, and pose while preserving drafts',async()=>{
 const {node,calls,notify}=await boot('control','vrma');for(let i=0;i<3;i++)await new Promise(r=>setImmediate(r));assert.ok(node('idleMotion').children.some(o=>o.value==='VRMA_02.vrma'));assert.equal(node('idleMotion').value,'');
 node('idleMotion').value='VRMA_02.vrma';node('idleMode').value='pose';node('idlePose').value='45';node('idleSpeed').value='.6';node('persona').value='draft';node('settingsForm').oninput();notify({reloadMotions:true,settings:{...DEFAULTS,modelPath:'fixture.vrm'}});for(let i=0;i<3;i++)await new Promise(r=>setImmediate(r));assert.equal(node('persona').value,'draft');assert.equal(node('idleMotion').value,'VRMA_02.vrma');
 await node('settingsForm').onsubmit({preventDefault(){}});const s=calls.find(c=>c[0]==='save')[1];assert.equal(s.idleMotion,'VRMA_02.vrma');assert.equal(s.idleMode,'pose');assert.equal(s.idlePose,45);assert.equal(s.idleSpeed,.6);
});
test('renderer displays chosen static idle after greeting, during conversation, and after showing again',async()=>{
 const {rendered,tick,notify}=await boot('mascot','vrma');for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));const settings={...DEFAULTS,modelPath:'fixture.vrm',softIdle:false,randomMotion:false,idleMotion:'VRMA_02.vrma',idleMode:'pose',idlePose:50};notify({settings});for(let i=0;i<30;i++)tick();const arm=rendered.scene.getObjectByName('Normalized_leftUpperArm');assert.ok(Math.abs(arm.quaternion.z)>.6);
 notify({busy:true});for(let i=0;i<10;i++)tick();assert.ok(Math.abs(arm.quaternion.z)>.6);notify({busy:false,greeting:true});for(let i=0;i<30;i++)tick();assert.ok(Math.abs(arm.quaternion.z)>.6);
 notify({mascotVisible:false});tick();assert.ok(Math.abs(arm.quaternion.z)<.6);notify({mascotVisible:true});for(let i=0;i<10;i++)tick();assert.ok(Math.abs(arm.quaternion.z)>.6);
});

test('renderer starts only current utterance audio and stops it on explicit stop',async()=>{
 const f=require('./audio-context.cjs')(),b=await boot('mascot',false,f);b.notify({speech:'こんにちは',speechId:10,ttsPending:true});assert.equal(f.ctx.sources.length,0);b.notify({voiceAudio:{id:9,data:new Uint8Array([1]),text:'old',volume:.8}});assert.equal(f.ctx.sources.length,0);b.notify({voiceAudio:{id:10,data:new Uint8Array([1]),text:'こんにちは',volume:.8}});await new Promise(r=>setImmediate(r));assert.equal(f.ctx.sources.length,1);assert.equal(f.ctx.sources[0].started,true);assert.ok(b.calls.some(c=>c[0]==='voiceState'&&c[1]===10&&c[2]==='start'));
 b.notify({voiceStop:true});assert.equal(f.ctx.sources[0].onended,null);b.notify({voiceAudio:{id:10,data:[1],text:'stale'}});await new Promise(r=>setImmediate(r));assert.equal(f.ctx.sources.length,1);
});
test('TTS form persists enable, endpoint, caption, speed, volume and timeout; test uses saved settings',async()=>{
 const {node,calls}=await boot('control');assert.equal(node('ttsEnabled').checked,false);assert.equal(node('ttsEndpoint').value,'http://127.0.0.1:8088');node('ttsEnabled').checked=true;node('ttsEndpoint').value='http://localhost:8088';node('ttsCaption').value='元気に';node('ttsSpeed').value='1.1';node('ttsVolume').value='.6';node('ttsTimeout').value='600';node('settingsForm').oninput();await node('testVoice').onclick();assert.ok(!calls.some(c=>c[1]==='test-voice'));await node('settingsForm').onsubmit({preventDefault(){}});const s=calls.find(c=>c[0]==='save')[1];assert.equal(s.ttsEnabled,true);assert.equal(s.ttsEndpoint,'http://localhost:8088');assert.equal(s.ttsCaption,'元気に');assert.equal(s.ttsSpeed,1.1);assert.equal(s.ttsVolume,.6);assert.equal(s.ttsTimeout,600);await node('testVoice').onclick();assert.ok(calls.some(c=>c[1]==='test-voice'));node('stopVoice').onclick();assert.ok(calls.some(c=>c[1]==='stop-voice'));
});

test('cloud UI selects official endpoint, clears submitted key, and saves manual model without key',async()=>{
 const {node,calls}=await boot('control');node('provider').value='openai';node('provider').onchange();await new Promise(r=>setImmediate(r));assert.equal(node('endpoint').value,'https://api.openai.com/v1');assert.equal(node('model').value,'gpt-6-luna');assert.equal(node('endpoint').readOnly,true);assert.equal(node('cloudSettings').hidden,false);node('apiKey').value='test-secret-key';await node('saveKey').onclick();assert.equal(node('apiKey').value,'');assert.ok(calls.some(c=>c[0]==='saveKey'&&c[3]==='test-secret-key'));
 node('model').value='manual-chat-model';node('cloudMaxTokens').value='2048';node('cloudReasoning').value='low';await node('settingsForm').onsubmit({preventDefault(){}});const s=calls.find(c=>c[0]==='save')[1];assert.equal(s.model,'manual-chat-model');assert.equal(s.cloudMaxTokens,2048);assert.equal(s.cloudReasoning,'low');assert.ok(!JSON.stringify(s).includes('test-secret-key'));node('provider').value='ollama';node('provider').onchange();assert.equal(node('cloudSettings').hidden,true);assert.equal(node('endpoint').value,'http://127.0.0.1:11434');
});
test('compatible endpoint remains editable and credentials are cleared on endpoint edits',async()=>{
 const {node,calls}=await boot('control');node('provider').value='compatible';node('provider').onchange();assert.equal(node('endpoint').readOnly,false);assert.equal(node('tokenParamLabel').hidden,false);node('apiKey').value='old-key';node('endpoint').value='https://provider.example/api/v1';node('endpoint').oninput();assert.equal(node('apiKey').value,'');await node('deleteKey').onclick();assert.ok(calls.some(c=>c[0]==='deleteKey'&&c[2]==='https://provider.example/api/v1'));
});


test('relationship settings show state and send profile, romance and confession actions',async()=>{
 const {node,calls,notify}=await boot('control');assert.match(node('relationshipSummary').textContent,/普通.*好感度 0/);assert.equal(node('romanceEnabled').checked,true);
 node('relationshipName').value='あかり';await node('createRelationship').onclick();assert.ok(calls.some(c=>c[0]==='relationship'&&c[1]==='create'&&c[2]==='あかり'));
 await node('confess').onclick();assert.ok(calls.some(c=>c[0]==='confess'));node('romanceEnabled').checked=false;await node('romanceEnabled').onchange();assert.equal(node('confess').disabled,true);
 notify({busy:true});assert.equal(node('relationshipProfile').disabled,true);assert.equal(node('createRelationship').disabled,true);
});

test('OpenRouter preset fills the fixed endpoint, explains its key, and saves manual model IDs',async()=>{
 const {node,calls}=await boot('control');node('provider').value='openrouter';node('provider').onchange();assert.equal(node('endpoint').value,'https://openrouter.ai/api/v1');assert.equal(node('endpoint').readOnly,true);assert.equal(node('cloudSettings').hidden,false);assert.equal(node('openrouterHelp').hidden,false);assert.equal(node('tokenParamLabel').hidden,true);
 node('model').value='anthropic/claude-haiku-5.5';node('apiKey').value='router-secret';await node('saveKey').onclick();assert.equal(node('apiKey').value,'');assert.ok(calls.some(c=>c[0]==='saveKey'&&c[1]==='openrouter'&&c[2]==='https://openrouter.ai/api/v1'));
 await node('settingsForm').onsubmit({preventDefault(){}});const saved=calls.find(c=>c[0]==='save')[1];assert.equal(saved.provider,'openrouter');assert.equal(saved.model,'anthropic/claude-haiku-5.5');assert.ok(!JSON.stringify(saved).includes('router-secret'));
 node('provider').value='compatible';node('provider').onchange();assert.equal(node('openrouterHelp').hidden,true);assert.equal(node('endpoint').readOnly,false);
});

test('Ctrl wheel zoom requires a character hit, normalizes wheel modes and never opens chat or rotates',async()=>{
 const {node,calls,rendered,notify,listeners}=await boot('mascot');const p=new THREE.Vector3(0,1.2,.3).project(rendered.camera),el=node('avatar');let prevented=0;
 const e={ctrlKey:true,clientX:(p.x+1)*220,clientY:(1-p.y)*259,deltaY:-100,deltaMode:0,preventDefault(){prevented++;}};
 el.onwheel({...e,ctrlKey:false});assert.equal(prevented,0);assert.equal(calls.filter(c=>c[0]==='zoom').length,0);
 el.onwheel(e);el.onwheel({...e,deltaY:3,deltaMode:1});el.onwheel({...e,deltaY:1,deltaMode:2});await new Promise(r=>setImmediate(r));assert.deepEqual(calls.filter(c=>c[0]==='zoom').map(c=>c[1]),[-100,96,300]);
 assert.ok(!calls.some(c=>['orientation','drag','touch','action'].includes(c[0])));const before=calls.filter(c=>c[0]==='zoom').length;
 el.onwheel({...e,clientX:0,clientY:0});el.onwheel({...e,deltaY:NaN});notify({pass:true});el.onwheel(e);assert.equal(calls.filter(c=>c[0]==='zoom').length,before);
 notify({pass:false});el.onpointerdown({...e,button:0,pointerId:1,screenX:100,screenY:100});el.onwheel(e);assert.equal(calls.filter(c=>c[0]==='zoom').length,before);el.onpointercancel();listeners.mousemove(e);const hitCount=calls.filter(c=>c[0]==='hit'&&c[1]===false).length;notify({settings:{...DEFAULTS,scale:1.2}});assert.equal(calls.filter(c=>c[0]==='hit'&&c[1]===false).length,hitCount);
});
test('external wheel scale updates numeric settings without discarding unsaved persona edits',async()=>{
 const {node,notify,calls}=await boot('control');node('persona').value='編集中';node('settingsForm').oninput({target:node('persona')});notify({settings:{...DEFAULTS,scale:2.5}});assert.equal(node('scale').value,2.5);assert.equal(node('persona').value,'編集中');node('scale').value='2.125';await node('settingsForm').onsubmit({preventDefault(){}});assert.equal(calls.find(c=>c[0]==='save')[1].scale,2.125);
});

test('model list request shows immediate progress next to button, blocks duplicates and opens selectable results',async()=>{
 for(const provider of ['openai','openrouter']){
  let resolve;const {node,calls,notify}=await boot('control',false,null,()=>new Promise(r=>resolve=r));node('provider').value=provider;node('provider').onchange();
  const pending=node('fetchModels').onclick();assert.match(node('connectionStatus').textContent,/取得中/);assert.equal(node('fetchModels').textContent,'取得中…');assert.equal(node('fetchModels').disabled,true);
  notify({voiceStatus:'更新'});assert.equal(node('fetchModels').disabled,true);await node('fetchModels').onclick();assert.equal(calls.filter(c=>c[0]==='models').length,1);
  resolve({ok:true,data:['first-model','second-model']});await pending;assert.equal(node('modelListLabel').hidden,false);assert.equal(node('modelList').children.length,2);assert.match(node('connectionStatus').textContent,/2件取得/);assert.equal(node('fetchModels').disabled,false);
  node('modelList').value='second-model';node('modelList').onchange();await node('settingsForm').onsubmit({preventDefault(){}});assert.equal(calls.find(c=>c[0]==='save')[1].model,'second-model');
 }
});
test('model list errors and empty responses are visible and changing providers ignores stale responses',async()=>{
 let finish;const {node}=await boot('control',false,null,()=>new Promise(r=>finish=r));let pending=node('fetchModels').onclick();finish({ok:false,error:'APIキーを登録してください。'});await pending;assert.match(node('connectionStatus').textContent,/APIキー/);assert.equal(node('modelListLabel').hidden,true);assert.equal(node('fetchModels').disabled,false);
 pending=node('fetchModels').onclick();finish({ok:true,data:[]});await pending;assert.match(node('connectionStatus').textContent,/一覧が空/);
 pending=node('fetchModels').onclick();const old=finish;node('provider').value='openrouter';node('provider').onchange();const newer=node('fetchModels').onclick();old({ok:true,data:['stale']});await pending;assert.match(node('connectionStatus').textContent,/取得中/);assert.equal(node('fetchModels').disabled,true);
 finish({ok:true,data:['current']});await newer;assert.equal(node('modelList').children[0].value,'current');
 const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');assert.ok(html.indexOf('id="fetchModels"')<html.indexOf('id="connectionStatus"'));assert.ok(html.indexOf('id="connectionStatus"')<html.indexOf('id="cloudSettings"'));
});

test('VRM voice changes refresh persona while preserving unrelated unsaved settings',async()=>{
 const {node,notify}=await boot('control');node('persona').value='未保存の性格';node('temperature').value='1.2';node('settingsForm').oninput({target:node('persona')});notify({settings:{...DEFAULTS,modelPath:'B.vrm',persona:'Bの性格',speakerPath:'B.speaker.safetensors'}});assert.equal(node('speakerPath').textContent,'B.speaker.safetensors');assert.equal(node('vrmPath').textContent,'B.vrm');assert.equal(node('persona').value,'Bの性格');assert.equal(node('temperature').value,'1.2');
});

test('input log follows saved character history, shows pending text once, and retains failed drafts',async()=>{
 const {node,notify,setFailure}=await boot('input'),area=node('inputHistory');
 assert.equal(area.children[0].className,'empty');
 const history=[{role:'user',content:'前の会話'},{role:'assistant',content:'<b>前の返事</b>'}];
 notify({history});assert.equal(area.children.length,2);assert.equal(area.children[1].children[1].textContent,'<b>前の返事</b>');
 assert.equal(area.children[0].children[0].textContent,'あなた');
 node('messageInput').value='新しい会話';const sending=node('inputForm').onsubmit({preventDefault(){}});
 assert.equal(area.children.length,3);assert.equal(area.children[2].children[1].textContent,'新しい会話');
 notify({history:[...history,{role:'user',content:'新しい会話'},{role:'assistant',content:'新しい返事'}],reply:'新しい返事'});
 assert.equal(area.children.length,4);await sending;assert.equal(area.children.length,4);
 node('messageInput').value='再送する文章';setFailure(true);await node('inputForm').onsubmit({preventDefault(){}});
 assert.equal(node('messageInput').value,'再送する文章');assert.equal(area.children.length,4);
 notify({settings:{...DEFAULTS,modelPath:'別のキャラ.vrm',name:'別の相棒'},history:[{role:'assistant',content:'別の履歴'}]});
 assert.equal(area.children.length,1);assert.equal(area.children[0].children[0].textContent,'別の相棒');
 notify({history:[]});assert.equal(area.children[0].className,'empty');
});
test('input log preserves reading position on updates and follows new replies only near the bottom',async()=>{
 const {node,notify}=await boot('input'),area=node('inputHistory'),history=[{role:'assistant',content:'最初の返答'}];
 area.clientHeight=100;area.scrollHeight=1000;area.scrollTop=900;notify({history});assert.equal(area.scrollTop,1000);
 area.scrollTop=150;const first=area.children[0];notify({busy:true});assert.equal(area.children[0],first);assert.equal(area.scrollTop,150);
 notify({history:[...history,{role:'user',content:'別ウィンドウから送信'},{role:'assistant',content:'返答'}],reply:'返答'});assert.equal(area.scrollTop,150);
 area.scrollTop=900;notify({history:[...history,{role:'assistant',content:'次の返答'}],reply:'次の返答'});assert.equal(area.scrollTop,1000);
 area.scrollTop=150;notify({settings:{...DEFAULTS,modelPath:'other.vrm'},history:[]});assert.equal(area.scrollTop,1000);
});
test('topmost menu updates the settings checkbox without discarding an unsaved persona',async()=>{
 const {node,notify}=await boot('control');node('persona').value='未保存の性格';node('settingsForm').oninput();notify({settings:{...DEFAULTS,topmost:false}});assert.equal(node('topmost').checked,false);assert.equal(node('persona').value,'未保存の性格');notify({settings:{...DEFAULTS,topmost:true}});assert.equal(node('topmost').checked,true);
});

test('expression controls show exact names, preview strength, and do not dirty saved settings',async()=>{
 const {node,calls,notify}=await boot('control');notify({expressionNames:['happy','赤面','ハート']});
 assert.equal(node('expressionName').children.length,4);node('expressionName').value='ハート';node('expressionWeight').value='65';
 node('settingsForm').oninput({target:{id:'expressionName'}});node('settingsForm').oninput({target:{id:'expressionWeight'}});
 await node('previewExpression').onclick();assert.deepEqual(calls.find(c=>c[0]==='previewExpression'),['previewExpression','','ハート',.65]);
 await node('resetExpression').onclick();assert.equal(calls.filter(c=>c[0]==='previewExpression').at(-1)[2],'');
 await node('testVoice').onclick();assert.ok(calls.some(c=>c[0]==='action'&&c[1]==='test-voice'));
 notify({settings:{...DEFAULTS,modelPath:'new.vrm'},expressionNames:['涙']});assert.equal(node('expressionName').value,'');assert.equal(node('expressionName').children.length,2);
});
test('mascot publishes loaded expressions, previews them and releases them without a stuck face',async()=>{
 const {notify,calls,tick}=await boot('mascot',true);
 assert.ok(calls.some(c=>c[0]==='expressionReady'&&c[2].includes('happy')));
 notify({expressionPreview:{name:'happy',weight:.8}});tick();
 notify({expressionPreview:{name:'',weight:0}});for(let i=0;i<30;i++)tick();
 assert.ok(!calls.some(c=>c[0]==='modelStatus'));
});

test('facial expression waits for actual audio, stays through playback and fades after ending',async()=>{
 const f=require('./audio-context.cjs')(),b=await boot('mascot',true,f),faces=b.faceControllers[0],m=faces.manager;
 b.notify({reply:'こんにちは',mood:'happy'});b.notify({speech:'こんにちは',speechId:10,ttsPending:true});
 for(let i=0;i<140;i++)b.tick();assert.equal(m.getValue('happy'),0);
 b.notify({voiceAudio:{id:10,data:[1],text:'こんにちは',volume:1}});await new Promise(r=>setImmediate(r));
 for(let i=0;i<180;i++)b.tick();assert.ok(m.getValue('happy')>0);
 f.ctx.sources[0].onended();for(let i=0;i<60;i++)b.tick();assert.equal(m.getValue('happy'),0);
});
test('audio errors with voiceStop fall back to text expressions; stale or hidden audio cannot restore them',async()=>{
 const f=require('./audio-context.cjs')(),b=await boot('mascot',true,f),faces=b.faceControllers[0],m=faces.manager;
 b.notify({reply:'こんにちは',mood:'happy'});b.notify({speech:'こんにちは',speechId:20,ttsPending:true});
 b.notify({voiceStop:true,voiceFailed:20});for(let i=0;i<6;i++)b.tick();assert.ok(m.getValue('happy')>0);
 b.notify({voiceStop:true});for(let i=0;i<50;i++)b.tick();assert.equal(m.getValue('happy'),0);
 b.notify({voiceAudio:{id:20,data:[1],text:'old'}});await new Promise(r=>setImmediate(r));assert.equal(f.ctx.sources.length,0);
 b.notify({speech:'新しい返事',speechId:21,ttsPending:true});b.notify({mascotVisible:false});
 b.notify({voiceAudio:{id:21,data:[1],text:'hidden'}});await new Promise(r=>setImmediate(r));for(let i=0;i<30;i++)b.tick();assert.equal(m.getValue('happy'),0);assert.equal(f.ctx.sources.length,0);
});

test('renderer announces startup readiness after demo or VRM initialization',async()=>{
 for(const withModel of [false,true]){const b=await boot('mascot',withModel);await new Promise(r=>setImmediate(r));assert.equal(b.calls.filter(c=>c[0]==='mascotReady').length,1);}
 const b=await boot('control');assert.equal(b.calls.filter(c=>c[0]==='mascotReady').length,0);
});

test('local discovery offers repaired NemoMix without changing an unrelated model or cloud selection',async()=>{
 const alias='vrm-companion-nemomix:12b-q4_K_M';
 for(const [provider,current,expected]of [['ollama','HammerAI/nemomix-unleashed:12b-q4_K_M',alias],['ollama','',alias],['ollama','qwen3:8b','qwen3:8b'],['openrouter','cloud/model','cloud/model']]){
  const {node,calls}=await boot('control',false,null,()=>Promise.resolve({ok:true,data:[alias,current].filter(Boolean)}));
  node('provider').value=provider;node('model').value=current;
  await node('fetchModels').onclick();assert.equal(node('model').value,expected);
  assert.equal(calls.filter(c=>c[0]==='save').length,0,'Discovery must not save the choice before user saves settings.');
 }
});


test('VRM changes refresh character fields even with unsaved global settings',async()=>{
 const {node,notify,calls}=await boot('control');node('endpoint').value='http://127.0.0.1:11999';node('name').value='未保存の元VRM';node('settingsForm').oninput();
 notify({settings:{...DEFAULTS,modelPath:'/B.vrm',name:'Bの子',persona:'Bの口調',selfPronoun:'あたし',userAddress:'相棒'},reloadVRM:true});
 for(const [id,value]of Object.entries({name:'Bの子',persona:'Bの口調',selfPronoun:'あたし',userAddress:'相棒'}))assert.equal(node(id).value,value);
 assert.equal(node('endpoint').value,'http://127.0.0.1:11999');await node('settingsForm').onsubmit({preventDefault(){}});const saved=calls.findLast(c=>c[0]==='save')[1];assert.equal(saved.name,'Bの子');assert.equal(saved.selfPronoun,'あたし');assert.equal(saved.userAddress,'相棒');
});

test('mascot always renders with high resolution',async()=>{
 const mascot=await boot('mascot',true);
 assert.equal(mascot.calls.filter(c=>c[0]==='pixelRatio').at(-1)[1],2);
});
