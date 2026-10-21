const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const THREE=require('./bundle-runtime.cjs'),{DEFAULTS}=require('../src/backend.cjs'),layout=require('../src/layout.cjs');
async function boot(view,withModel=false){
 const nodes=new Map(),listeners={},calls=[],rootEvents={},settings={...DEFAULTS,model:'test-local',modelPath:withModel?'fixture.vrm':''},events={};let notify,failSend=false,rendered;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,style:{},hidden:true,value:'',textContent:'',checked:false,disabled:false,children:[],clientWidth:440,clientHeight:518,scrollHeight:200,scrollTop:0,classList:{toggle(){},add(){}},append(...a){this.children.push(...a);},replaceChildren(){this.children=[];},add(o){this.children.push(o);},getBoundingClientRect(){return {left:0,top:0,width:440,height:id==='speechCard'?120:518};},focus(){this.focused=true;},setPointerCapture(){this.capture=true;},hasPointerCapture(){return !!this.capture;},releasePointerCapture(){this.capture=false;},requestSubmit(){return this.onsubmit?.({preventDefault(){}});}});return nodes.get(id);};
 const ok=data=>Promise.resolve({ok:true,data});
 const api={state:()=>ok({settings,history:[],busy:false,pass:false,dataPath:'/test',speech:''}),onUpdate:fn=>notify=fn,
  orientation:angles=>{calls.push(['orientation',angles]);return ok({...settings,...angles});},
  action:name=>{calls.push(['action',name]);return ok();},hit:v=>{calls.push(['hit',v]);return ok();},drag:(...a)=>{calls.push(['drag',...a]);return ok();},bubbleSize:h=>{calls.push(['bubbleSize',h]);return ok();},modelStatus:t=>{calls.push(['modelStatus',t]);return ok();},touch:(...args)=>{calls.push(['touch',...args]);return ok();},vrm:()=>ok(withModel?new Uint8Array(require('./fixture.cjs')()):null),
  send:async text=>{calls.push(['send',text]);if(failSend)return {ok:false,error:'接続できません'};return {ok:true,data:'返事'};},cancel:()=>ok(),models:()=>ok(['test-local']),save:s=>{calls.push(['save',s]);return ok(s);}};
 class Renderer{constructor(){this.domElement={};}setClearColor(){}setPixelRatio(){}setSize(){}setAnimationLoop(cb){cb();}render(scene,camera){rendered={scene,camera};}}
 let now=0;const context={THREE:{...THREE,WebGLRenderer:Renderer},GLTFLoader:THREE.GLTFLoader,VRMLoaderPlugin:THREE.VRMLoaderPlugin,VRMUtils:THREE.VRMUtils,
  window:{companion:api,companionLayout:layout,companionOrientation:require('../src/orientation.cjs'),companionPicking:require('../src/picking.cjs'),companionHand:withModel==='hand'?{HandDrag:class{begin(){return true;}move(v){calls.push(['handMove',v.x,v.y,v.z]);}release(){calls.push(['handRelease']);}reset(){}restore(){}update(){}}}:require('../src/hand.cjs'),companionMotion:require('../src/motion.cjs'),companionInteraction:require('../src/interaction.cjs'),companionCloth:withModel==='cloth'?{ClothDrag:class{begin(){return true;}move(v){calls.push(['clothMove',v.x,v.y,v.z]);}release(){calls.push(['clothRelease']);}reset(){calls.push(['clothReset']);}restore(){}update(){}}}:require('../src/cloth.cjs'),addEventListener:(k,f)=>listeners[k]=f},document:{body:{className:'',dataset:{}},documentElement:{classList:{add(){}}},getElementById:node,createElement:()=>node('new-'+nodes.size),createTextNode:text=>({textContent:text}),addEventListener:(k,f)=>events[k]=f},location:{search:'?view='+view},URLSearchParams,
  performance:{now:()=>now+=50},devicePixelRatio:1,ResizeObserver:class{constructor(fn){this.fn=fn;}observe(){}},requestAnimationFrame:fn=>fn(),Option:class{constructor(text,value){this.text=text;this.value=value;}},console,confirm:()=>true};
 const code=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8').split('\n').filter(l=>!l.startsWith('import ')).join('\n');
 vm.runInNewContext(code,context);await new Promise(r=>setImmediate(r));
 return {node,calls,notify,listeners,events,rendered,advance:()=>now+=200,setFailure:v=>failSend=v};
}
test('input keeps failed text, supports IME-safe Enter and Escape, and hides after success',async()=>{
 const {node,calls,setFailure}=await boot('input');assert.equal(node('inputPanel').hidden,false);
 node('messageInput').value='こんにちは';setFailure(true);await node('inputForm').onsubmit({preventDefault(){}});assert.equal(node('messageInput').value,'こんにちは');assert.match(node('inputStatus').textContent,/接続/);
 const count=calls.length;node('messageInput').onkeydown({key:'Enter',isComposing:true,preventDefault(){}});assert.equal(calls.length,count);
 setFailure(false);await node('inputForm').onsubmit({preventDefault(){}});assert.equal(node('messageInput').value,'');assert.ok(calls.some(c=>c[0]==='action'&&c[1]==='close-input'));
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
