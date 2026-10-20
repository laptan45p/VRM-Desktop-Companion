const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const THREE=require('./bundle-runtime.cjs'),{DEFAULTS}=require('../src/backend.cjs'),layout=require('../src/layout.cjs');
async function boot(view){
 const nodes=new Map(),listeners={},calls=[],rootEvents={},settings={...DEFAULTS,model:'test-local'},events={};let notify,failSend=false,rendered;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,hidden:true,value:'',textContent:'',checked:false,disabled:false,children:[],clientWidth:440,clientHeight:518,scrollHeight:200,scrollTop:0,classList:{toggle(){},add(){}},append(...a){this.children.push(...a);},replaceChildren(){this.children=[];},add(o){this.children.push(o);},getBoundingClientRect(){return {left:0,top:0,width:440,height:id==='speechCard'?120:518};},focus(){this.focused=true;},setPointerCapture(){this.capture=true;},hasPointerCapture(){return !!this.capture;},releasePointerCapture(){this.capture=false;},requestSubmit(){return this.onsubmit?.({preventDefault(){}});}});return nodes.get(id);};
 const ok=data=>Promise.resolve({ok:true,data});
 const api={state:()=>ok({settings,history:[],busy:false,pass:false,dataPath:'/test',speech:''}),onUpdate:fn=>notify=fn,
  action:name=>{calls.push(['action',name]);return ok();},hit:v=>{calls.push(['hit',v]);return ok();},drag:(...a)=>{calls.push(['drag',...a]);return ok();},bubbleSize:h=>{calls.push(['bubbleSize',h]);return ok();},modelStatus:t=>{calls.push(['modelStatus',t]);return ok();},vrm:()=>ok(null),
  send:async text=>{calls.push(['send',text]);if(failSend)return {ok:false,error:'接続できません'};return {ok:true,data:'返事'};},cancel:()=>ok(),models:()=>ok(['test-local']),save:s=>ok(s)};
 class Renderer{constructor(){this.domElement={};}setClearColor(){}setPixelRatio(){}setSize(){}setAnimationLoop(cb){cb();}render(scene,camera){rendered={scene,camera};}}
 let now=0;const context={THREE:{...THREE,WebGLRenderer:Renderer},GLTFLoader:THREE.GLTFLoader,VRMLoaderPlugin:THREE.VRMLoaderPlugin,VRMUtils:THREE.VRMUtils,
  window:{companion:api,companionLayout:layout,addEventListener:(k,f)=>listeners[k]=f},document:{body:{className:'',dataset:{}},documentElement:{classList:{add(){}}},getElementById:node,createElement:()=>node('new-'+nodes.size),createTextNode:text=>({textContent:text}),addEventListener:(k,f)=>events[k]=f},location:{search:'?view='+view},URLSearchParams,
  performance:{now:()=>now+=50},devicePixelRatio:1,ResizeObserver:class{constructor(fn){this.fn=fn;}observe(){}},requestAnimationFrame:fn=>fn(),Option:class{constructor(text,value){this.text=text;this.value=value;}},console,confirm:()=>true};
 const code=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8').split('\n').filter(l=>!l.startsWith('import ')).join('\n');
 vm.runInNewContext(code,context);await new Promise(r=>setImmediate(r));
 return {node,calls,notify,listeners,events,rendered,setFailure:v=>failSend=v};
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
 const {node,calls,rendered,listeners}=await boot('mascot');assert.ok(rendered,'3D setup failed');const pos=new THREE.Vector3(0,1.2,.3).project(rendered.camera);
 const x=(pos.x+1)*220,y=(1-pos.y)*259;
 const event=(extras={})=>({button:0,pointerId:1,clientX:x,clientY:y,screenX:100,screenY:100,preventDefault(){},...extras});
 listeners.mousemove(event());assert.equal(calls.at(-1)[0],'hit');assert.equal(calls.at(-1)[1],true);
 const el=node('avatar');el.onpointerdown(event());el.onpointerup(event());assert.ok(calls.some(c=>c[0]==='action'&&c[1]==='talk'));
 const before=calls.filter(c=>c[0]==='action'&&c[1]==='talk').length;el.onpointerdown(event());el.onpointermove(event({screenX:120}));el.onpointerup(event({screenX:120}));assert.ok(calls.some(c=>c[0]==='drag'&&c[1]==='move'));assert.equal(calls.filter(c=>c[0]==='action'&&c[1]==='talk').length,before);
 el.oncontextmenu(event());assert.equal(calls.at(-1)[1],'menu');
 const menuCount=calls.filter(c=>c[1]==='menu').length;el.oncontextmenu(event({clientX:0,clientY:0}));assert.equal(calls.filter(c=>c[1]==='menu').length,menuCount);
 listeners.mousemove(event());listeners.mousemove(event({clientX:0,clientY:0}));assert.equal(calls.at(-1)[0],'hit');assert.equal(calls.at(-1)[1],false);
});
