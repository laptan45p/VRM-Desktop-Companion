import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
(() => {
const api=window.companion,$=id=>document.getElementById(id);
const view=new URLSearchParams(location.search).get('view')||'control',isMascot=view==='mascot';
document.body.className=view;document.documentElement.classList.add(view+'-root');
$({control:'control',mascot:'mascot',input:'inputPanel',bubble:'speechPanel'}[view]).hidden=false;
let state,dirty=false,pendingText='',busy=false;
function status(id,text,error=false){$(id).textContent=text;$(id).classList.toggle('error',error);}
async function call(promise){const r=await promise;if(!r.ok)throw new Error(r.error);return r.data;}
function wrap(fn,id='chatStatus'){return async(...args)=>{try{await fn(...args);}catch(e){status(id,e.message,true);}};}
function selectControlTab(which){const chat=which==='chat';$('chatView').hidden=!chat;$('settingsView').hidden=chat;$('chatTab').classList.toggle('selected',chat);$('settingsTab').classList.toggle('selected',!chat);}
function settingsFromForm(){const s={...state.settings};for(const id of ['provider','endpoint','model','name','persona','bubbleFont','greetingMotion','idleMotion','idleMode','ttsEndpoint','ttsCaption','cloudReasoning','compatibleTokenParam'])s[id]=$(id).value;for(const id of ['temperature','historyTurns','scale','angleX','angleY','angleZ','motionStrength','touchZoneScale','bubbleFontSize','clothAngle','motionInterval','idleSpeed','idlePose','ttsSpeed','ttsVolume','ttsTimeout','cloudMaxTokens'])s[id]=Number($(id).value);for(const k of ['topmost','lipSync','softIdle','touchEnabled','clothDrag','handDrag','randomMotion','ttsEnabled','cloudTemperature'])s[k]=$(k).checked;s.clothReach=Number($('clothReach').value)/100;return s;}
function fillSettings(s){for(const id of ['provider','endpoint','name','persona','bubbleFont','temperature','historyTurns','scale','angleX','angleY','angleZ','motionStrength','touchZoneScale','bubbleFontSize','clothAngle','motionInterval','idleSpeed','idlePose','ttsSpeed','ttsVolume','ttsTimeout','cloudMaxTokens'])$(id).value=s[id];for(const k of ['topmost','lipSync','softIdle','touchEnabled','clothDrag','handDrag','randomMotion','ttsEnabled','cloudTemperature'])$(k).checked=s[k];$('clothReach').value=Math.round(s.clothReach*100);setModels(s.model?[s.model]:[],s.model);$('vrmPath').textContent=s.modelPath||'VRM未選択：デモ表示';$('motionPath').textContent=s.motionFolder||'モーション未選択';$('ttsEndpoint').value=s.ttsEndpoint;$('ttsCaption').value=s.ttsCaption;$('speakerPath').textContent=s.speakerPath||'Speaker Embedding未選択';$('idleMode').value=s.idleMode;setMotionOptions(motionNames,s.greetingMotion,s.idleMotion);$('cloudReasoning').value=s.cloudReasoning;$('compatibleTokenParam').value=s.compatibleTokenParam;updateProviderUI();}
let motionNames=[];
function setMotionOptions(names,selected,idleSelected){motionNames=names;const idle=$('idleMotion');idle.replaceChildren();idle.add(new Option('標準の待機動作',''));for(const name of names)idle.add(new Option(name,name));if(idleSelected&&!names.includes(idleSelected))idle.add(new Option(idleSelected+'（未読み込み・標準動作を使用）',idleSelected));idle.value=idleSelected||'';const el=$('greetingMotion');el.replaceChildren();for(const name of names)el.add(new Option(name,name));if(!names.includes(selected))el.add(new Option(selected||'VRMA_02.vrma',selected||'VRMA_02.vrma'));el.value=selected||'VRMA_02.vrma';}
async function refreshMotionOptions(){try{const names=await call(api.motionList());setMotionOptions(names,dirty?$('greetingMotion').value:state.settings.greetingMotion,dirty?$('idleMotion').value:state.settings.idleMotion);}catch(e){status('motionStatus',e.message,true);}}
let keyRequest=0,keyAvailable=true,keySaved=false;
const cloudProvider=provider=>provider==='openai'||provider==='openrouter'||provider==='compatible';
async function refreshKeyStatus(){
 const serial=++keyRequest;if(!cloudProvider($('provider').value))return;
 status('keyStatus','確認中…');
 try{const result=await call(api.keyStatus(settingsFromForm()));if(serial!==keyRequest)return;keyAvailable=result.available;keySaved=result.saved;status('keyStatus',result.saved?'この接続先に登録済み（キーは表示しません）':result.available?'この接続先のAPIキーは未登録です。':'OSの暗号化機能を利用できません。',!result.available);$('saveKey').disabled=busy||!result.available;$('deleteKey').disabled=busy||!result.saved;}
 catch(e){if(serial===keyRequest)status('keyStatus',e.message,true);}
}
function updateProviderUI(){const provider=$('provider').value,cloud=cloudProvider(provider);$('cloudSettings').hidden=!cloud;$('endpoint').readOnly=provider==='openai'||provider==='openrouter';$('openrouterHelp').hidden=provider!=='openrouter';$('model').placeholder=provider==='openrouter'?'例：anthropic/claude-haiku-5.5':'モデルIDを選択・直接入力';$('tokenParamLabel').hidden=provider!=='compatible';$('connectionBadge').textContent=cloud?'クラウドLLM':'ローカル接続';if(cloud)refreshKeyStatus();else{keyRequest++;$('apiKey').value='';}}
function setModels(models,selected){$('modelOptions').replaceChildren();for(const m of models)$('modelOptions').append(new Option(m,m));$('model').value=selected||'';}
function renderHistory(){
 const area=$('history');area.replaceChildren();
 const history=[...state.history];if(pendingText)history.push({role:'user',content:pendingText});
 if(!history.length){const p=document.createElement('p');p.className='empty';p.textContent='ここから、会話が始まります。\n「設定」でローカルLLMを選んで、\n相棒に話しかけてみましょう。';area.append(p);}
 for(const m of history){const div=document.createElement('div');div.className='msg '+m.role;const name=document.createElement('span');name.className='speaker';name.textContent=m.role==='user'?'あなた':state.settings.name;div.append(name,document.createTextNode(m.content));area.append(div);}
 area.scrollTop=area.scrollHeight;
}
function renderRelationship(){
 const r=state.relationship;if(!r)return;
 const el=$('relationshipProfile');el.replaceChildren();for(const p of r.profiles)el.add(new Option(p.label,p.id));el.value=r.active;
 $('romanceEnabled').checked=r.romanceEnabled;
 const moods={calm:'落ち着いている',happy:'嬉しい',shy:'照れている',surprised:'驚いている',angry:'怒っている'};
 $('relationshipSummary').textContent=`${r.label}：${r.stage}（好感度 ${r.affinity}）・${r.status} ／ 今の気分：${moods[r.mood]||r.mood}`;
 $('confess').disabled=busy||!r.romanceEnabled;
}
function updateBusy(value){busy=value;$('send').disabled=busy;$('message').disabled=busy;$('stop').hidden=!busy;for(const id of ['saveSettings','clear','fetchModels'])$(id).disabled=busy;$('saveKey').disabled=busy||!keyAvailable;$('deleteKey').disabled=busy||!keySaved;for(const id of ['relationshipProfile','relationshipName','createRelationship','romanceEnabled'])$(id).disabled=busy;$('confess').disabled=busy||!state.relationship?.romanceEnabled;}
async function initControl(){
 renderRelationship();
 const relationAction=async(operation,value)=>{if(dirty)throw new Error('変更した設定を先に保存してください。');state.relationship=await call(api.relationship(operation,value));renderRelationship();status('relationshipStatus','関係の設定を保存しました。');};
 $('relationshipProfile').onchange=wrap(async()=>{try{await relationAction('select',$('relationshipProfile').value);}finally{renderRelationship();}},'relationshipStatus');
 $('createRelationship').onclick=wrap(async()=>{await relationAction('create',$('relationshipName').value);$('relationshipName').value='';},'relationshipStatus');
 $('romanceEnabled').onchange=wrap(async()=>{try{await relationAction('romance',$('romanceEnabled').checked);}finally{renderRelationship();}},'relationshipStatus');
 $('confess').onclick=wrap(async()=>{if(dirty)throw new Error('変更した設定を先に保存してください。');await call(api.confess());status('relationshipStatus','気持ちを伝えました。返事は吹き出しと会話履歴に表示します。');},'relationshipStatus');
 fillSettings(state.settings);status('voiceStatus',state.voiceStatus||'');$('chooseSpeaker').onclick=wrap(async()=>{const path=await call(api.chooseSpeaker());if(path)$('speakerPath').textContent=path;},'voiceStatus');$('testVoice').onclick=wrap(async()=>{if(dirty)throw new Error('変更した設定を先に保存してください。');await call(api.action('test-voice'));},'voiceStatus');$('stopVoice').onclick=()=>api.action('stop-voice');refreshMotionOptions();$('chooseMotions').onclick=wrap(async()=>{const names=await call(api.chooseMotions());if(names){await refreshMotionOptions();$('motionPath').textContent=state.settings.motionFolder;status('motionStatus',names.length+'件のモーションを登録しました。');}},'motionStatus');$('dataPath').textContent='設定と履歴：'+state.dataPath;
 const tabs=selectControlTab;
 $('chatTab').onclick=()=>tabs('chat');$('settingsTab').onclick=()=>tabs('settings');
 $('settingsForm').oninput=e=>{if(['relationshipProfile','relationshipName','romanceEnabled'].includes(e?.target?.id))return;dirty=true;};
 $('provider').onchange=()=>{$('endpoint').value={ollama:'http://127.0.0.1:11434',lmstudio:'http://127.0.0.1:1234',openai:'https://api.openai.com/v1',openrouter:'https://openrouter.ai/api/v1',compatible:''}[$('provider').value];$('apiKey').value='';setModels([],$('provider').value==='openai'?'gpt-6-luna':'');dirty=true;updateProviderUI();};
 $('endpoint').oninput=()=>{dirty=true;$('apiKey').value='';refreshKeyStatus();};
 $('saveKey').onclick=wrap(async()=>{const key=$('apiKey').value;$('apiKey').value='';await call(api.saveKey(settingsFromForm(),key));await refreshKeyStatus();},'keyStatus');
 $('deleteKey').onclick=wrap(async()=>{await call(api.deleteKey(settingsFromForm()));$('apiKey').value='';await refreshKeyStatus();},'keyStatus');
 $('fetchModels').onclick=wrap(async()=>{status('connectionStatus','接続中…');const models=await call(api.models(settingsFromForm()));setModels(models,$('model').value);dirty=true;status('connectionStatus',models.length?`${models.length}件取得しました。モデルIDを選択・入力して保存してください。`:'一覧が空です。モデルIDを直接入力するか、接続先のモデルを確認してください。');},'connectionStatus');
 $('settingsForm').onsubmit=async e=>{e.preventDefault();await wrap(async()=>{const s=await call(api.save(settingsFromForm()));state.settings=s;dirty=false;status('connectionStatus','設定を保存しました。');},'connectionStatus')();};
 $('loadVRM').onclick=wrap(async()=>{const p=await call(api.chooseVRM());if(p)status('chatStatus','VRMを読み込み中です。結果は吹き出しに表示します。');});
 $('chatForm').onsubmit=async e=>{e.preventDefault();if(busy)return;await wrap(async()=>{
  if(dirty)throw new Error('変更した設定を先に保存してください。');
  const text=$('message').value.trim();if(!text)return;
  pendingText=text;updateBusy(true);renderHistory();status('chatStatus','返答を考えています…（初回はモデル読み込みに時間がかかります）');
  try{await call(api.send(text));$('message').value='';status('chatStatus','');}finally{pendingText='';updateBusy(false);renderHistory();$('message').focus();}
 })();};
 $('message').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('chatForm').requestSubmit();}};
 $('stop').onclick=wrap(async()=>{await call(api.cancel());});
 $('clear').onclick=wrap(async()=>{if(confirm('このキャラクターとの会話履歴を削除しますか？'))await call(api.clear());});
 $('resetPosition').onclick=wrap(async()=>{await call(api.action('reset'));});
 $('resetBubble').onclick=wrap(async()=>{await call(api.action('reset-bubble'));});
 $('quit').onclick=()=>api.action('quit');
 $('testMotion').onclick=wrap(async()=>{await call(api.action('test-motion'));});
 if(state.startupError)status('chatStatus',state.startupError,true);
 renderHistory();updateBusy(state.busy);selectControlTab('settings');
}
let scene,camera,renderer,vrm,demoRoot,modelRoot,clock,elapsed=0,loadId=0,moodUntil=0,blinkAt=2,blinkStart=-10;
let rest=new Map(),cloth=null,hands=null,orientationPreview=null,cancelInteraction=()=>{};
let utteranceId=null,voiceText='';
const speechAudio=new window.companionAudio.SpeechAudio(()=>new window.AudioContext({latencyHint:'interactive'}),(id,phase,error)=>{
 if(phase==='start'&&id===utteranceId)lips.play(voiceText,performance.now()/1000);
 if(phase==='ended'||phase==='error')lips.stop();api.voiceState(id,phase,error);
});
function stopVoiceLocal(){speechAudio.stop();lips.stop();utteranceId=null;voiceText='';}
const motionPlayer=new window.companionVrma.VrmaPlayer(THREE);
let motionGeneration=0,interacting=false,motionHoldUntil=0;
async function loadMotions(){
 const generation=++motionGeneration,target=vrm;if(!target)return;
 motionPlayer.bind(target);motionPlayer.configure(state.settings,elapsed);
 try{
  const names=await call(api.motionList()),clips=new Map(),failures=[];
  for(const name of names){
   if(generation!==motionGeneration||target!==vrm)return;
   try{
    const bytes=await call(api.motionData(name));if(generation!==motionGeneration||target!==vrm)return;
    const loader=new GLTFLoader();loader.register(parser=>new VRMAnimationLoaderPlugin(parser));
    const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    if(generation!==motionGeneration||target!==vrm)return;
    const animation=gltf.userData.vrmAnimations?.[0];if(!animation)throw new Error('アニメーションがありません');
    const clip=createVRMAnimationClip(animation,target);if(!Number.isFinite(clip.duration)||clip.duration<=0)throw new Error('長さが不正です');
    // Keep horizontal travel inside the mascot window; preserve vertical movements such as squats.
    const hips=target.humanoid.getNormalizedBoneNode('hips');
    for(const track of clip.tracks)if(track.name===hips?.name+'.position'||track.name===hips?.uuid+'.position')for(let i=0;i<track.values.length;i+=3){track.values[i]=hips.position.x;track.values[i+2]=hips.position.z;}
    clips.set(name,clip);
   }catch(e){failures.push(name+'：'+e.message);}
  }
  if(generation!==motionGeneration||target!==vrm)return;
  motionPlayer.install(clips,elapsed);fitModel(target.scene);
  if(failures.length)api.modelStatus('一部のモーションを読み込めません：'+failures.join(' / ').slice(0,500));
 }catch(e){if(generation===motionGeneration)api.modelStatus('モーションを読み込めません：'+e.message);}
}
const modelOrientation=new window.companionOrientation.ModelOrientation(THREE.Vector3,THREE.Box3);
const picking=new window.companionPicking.MeshPicking(THREE.Vector3);
const lips=new window.companionMotion.LipMotion(),idle=new window.companionMotion.SoftIdle(),reactionMotion=new window.companionMotion.ReactionMotion();
function createDemo(){
 const g=new THREE.Group();
 const mat=new THREE.MeshStandardMaterial({color:0x8eb5a2,roughness:.8});
 const white=new THREE.MeshStandardMaterial({color:0xf2eee2});
 const dark=new THREE.MeshStandardMaterial({color:0x314c41});
 function part(geo,material,x,y,z){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);g.add(m);return m;}
 part(new THREE.CapsuleGeometry(.22,.34,8,20),mat,0,.65,0);
 part(new THREE.SphereGeometry(.3,32,24),white,0,1.2,0);
 part(new THREE.SphereGeometry(.045,12,12),dark,-.11,1.24,.27);
 part(new THREE.SphereGeometry(.045,12,12),dark,.11,1.24,.27);
 part(new THREE.SphereGeometry(.055,12,12),mat,0,1.1,.28).scale.set(1,.3,.3);
 for(const side of [-1,1]){
 part(new THREE.CapsuleGeometry(.07,.3,6,12),mat,side*.3,.65,0).rotation.z=side*.2;
 part(new THREE.CapsuleGeometry(.08,.18,6,12),dark,side*.13,.2,0);
 }
 part(new THREE.SphereGeometry(.06,12,12),mat,0,1.58,0);
 scene.add(g);return g;
}
function disposeRoot(root){if(root){scene.remove(root);VRMUtils.deepDispose(root);}}
function applyOrientation(root){
 modelOrientation.prepare(root,root===vrm?.scene?vrm.humanoid.getRawBoneNode('hips'):null);
 const bob=root===demoRoot&&state.settings.softIdle?Math.sin(elapsed*1.8)*.018*state.settings.motionStrength:0;
 modelOrientation.apply(root,orientationPreview||state.settings,bob);
}
function fitModel(root){
 if(!root)return;applyOrientation(root);
 const box=modelOrientation.bounds(root);if(box.isEmpty())return;
 const center=modelOrientation.center(root),size=new THREE.Vector3();
 // Frame around the fixed pivot instead of moving the target with the rotated bounds.
 for(const axis of ['x','y','z'])size[axis]=2*Math.max(Math.abs(box.min[axis]-center[axis]),Math.abs(box.max[axis]-center[axis]));
 if(motionPlayer.clips.size)size.multiplyScalar(1.35);
 const distance=window.companionLayout.fitDistance(size,camera.fov,camera.aspect);
 camera.position.set(center.x,center.y,center.z+distance);
 camera.far=Math.max(100,distance+size.z*2+size.y*2);
 camera.lookAt(center);camera.updateProjectionMatrix();
}
function resizeViewport(){
 if(!renderer)return;
 const el=$('avatar'),width=Math.max(1,el.clientWidth),height=Math.max(1,el.clientHeight);
 // Keep very large windows within an eight-megapixel rendering budget.
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5,Math.sqrt(8000000/(width*height))));
 renderer.setSize(width,height,false);camera.aspect=width/height;
 fitModel(vrm?.scene||demoRoot);
}
async function loadVRM(announce=false){
 stopVoiceLocal();cancelInteraction();++motionGeneration;motionPlayer.dispose();
 const id=++loadId;
 if(!state.settings.modelPath)return;
 
 let candidate;
 try{
 const bytes=await call(api.vrm());if(!bytes)return;
 const data=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
 const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
 const gltf=await loader.parseAsync(data,'');candidate=gltf.userData.vrm;
 if(!candidate)throw new Error('VRM 0.x／1.0のファイルを選んでください。');
 if(id!==loadId){VRMUtils.deepDispose(candidate.scene);return;}
 VRMUtils.rotateVRM0(candidate);
 const h=candidate.humanoid;
 h.getNormalizedBoneNode('leftUpperArm')?.rotation.set(0,0,1.12);
 h.getNormalizedBoneNode('rightUpperArm')?.rotation.set(0,0,-1.12);
 h.getNormalizedBoneNode('leftLowerArm')?.rotation.set(0,-.1,0);
 h.getNormalizedBoneNode('rightLowerArm')?.rotation.set(0,.1,0);
 candidate.update(0);
 // Disable static bounds culling on animated meshes.
 candidate.scene.traverse(o=>{if(o.isMesh)o.frustumCulled=false;});
 cloth?.reset();hands?.reset();
 disposeRoot(modelRoot);disposeRoot(demoRoot);demoRoot=null;vrm=candidate;modelRoot=vrm.scene;scene.add(modelRoot);
 rest=window.companionMotion.capturePose(vrm);lips.stop();cloth=new window.companionCloth.ClothDrag(vrm,THREE.Vector3,state.settings);hands=new window.companionHand.HandDrag(vrm,THREE.Vector3);
 applyOrientation(modelRoot);fitModel(modelRoot);loadMotions();
 if(announce)api.modelStatus('準備できたよ。話しかけてね。');
 }catch(e){if(candidate&&candidate!==vrm)VRMUtils.deepDispose(candidate.scene);api.modelStatus('VRMを読み込めませんでした：'+e.message);}
}
function initMascot(){

 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(30,440/518,.01,100);
 try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch(e){api.modelStatus('3D表示を開始できません：'+e.message);return;}
 renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
 $('avatar').append(renderer.domElement);scene.add(new THREE.HemisphereLight(0xffffff,0x697c6c,2.4));const key=new THREE.DirectionalLight(0xfff4df,2.2);key.position.set(-1,2,3);scene.add(key);
 demoRoot=createDemo();resizeViewport();
 new ResizeObserver(resizeViewport).observe($('avatar'));
 window.addEventListener('resize',resizeViewport);
 initCharacterMouse();clock=new THREE.Clock();loadVRM();
 renderer.setAnimationLoop(()=>{
 const dt=Math.min(clock.getDelta(),.05);elapsed+=dt;
 const root=vrm?.scene||demoRoot;
 if(root)applyOrientation(root);
 if(vrm){
 cloth?.restore();hands?.restore();motionPlayer.restorePose();
 idle.update(vrm,rest,elapsed,dt,{enabled:state.settings.softIdle,strength:state.settings.motionStrength,thinking:state.busy});
 motionPlayer.update(dt,elapsed,{blocked:interacting||elapsed<motionHoldUntil||state.busy||state.mascotVisible===false,speaking:speechAudio.active()||lips.active(performance.now()/1000),suspendIdle:interacting||elapsed<motionHoldUntil||state.mascotVisible===false});
 const talking=lips.update(vrm,performance.now()/1000,dt,state.settings.lipSync,speechAudio.sample());
 if(elapsed>=blinkAt){blinkStart=elapsed;blinkAt=elapsed+2.5+Math.random()*3;}
 const p=(elapsed-blinkStart)/.18;const blink=p>=0&&p<1?Math.sin(p*Math.PI):0;
 vrm.expressionManager?.setValue('blink',blink);vrm.expressionManager?.setValue('happy',elapsed<moodUntil?(talking?0:.35):0);
 reactionMotion.update(vrm,performance.now()/1000);
 hands?.update(dt);
 vrm.update(dt);
 cloth?.update(dt);
 }
 renderer.render(scene,camera);
 });
}

function setInputBusy(){busy=!!state.busy;$('sendInput').disabled=busy;$('messageInput').disabled=busy;$('stopInput').hidden=!busy;}
function focusInput(){if(!state.busy)$('messageInput').focus();}
function initInput(){
 $('inputName').textContent=state.settings.name+'に話しかける';setInputBusy();
 $('inputForm').onsubmit=async e=>{e.preventDefault();if(state.busy)return;const text=$('messageInput').value.trim();if(!text)return;
  state.busy=true;setInputBusy();status('inputStatus','返答を考えています…');
  try{await call(api.send(text));$('messageInput').value='';status('inputStatus','');await call(api.action('close-input'));}
  catch(e){status('inputStatus',e.message,true);}finally{state.busy=false;setInputBusy();focusInput();}
 };
 $('messageInput').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();api.action('close-input');}else if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('inputForm').requestSubmit();}};
 $('stopInput').onclick=wrap(async()=>{await call(api.cancel());},'inputStatus');
 window.addEventListener('focus',focusInput);
}
function updateSpeech(text){
 $('speechText').style.fontFamily=JSON.stringify(state.settings.bubbleFont||'Yu Gothic UI')+', Meiryo, system-ui, sans-serif';
 $('speechText').style.fontSize=state.settings.bubbleFontSize+'px';
 $('speechName').textContent=state.settings.name;
 if(text!==undefined)$('speechText').textContent=text;
 requestAnimationFrame(()=>api.bubbleSize(Math.ceil($('speechCard').getBoundingClientRect().height)+24));
}
function initSpeech(){
 $('dismissSpeech').onclick=()=>api.action('close-bubble');
 new ResizeObserver(()=>updateSpeech()).observe($('speechText'));
 updateSpeech(state.speech||'');
}
function initCharacterMouse(){
 const el=$('avatar'),cast={ray:new THREE.Ray(),near:0,far:Infinity,camera:null},point=new THREE.Vector3();let over=false,down=null,lastCheck=-Infinity;
 function hit(e){
  if(!renderer||!camera)return false;const rect=el.getBoundingClientRect();
  point.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1,.5);
  const root=vrm?.scene||demoRoot;if(!root)return false;
  camera.updateMatrixWorld();root.updateMatrixWorld(true);cast.camera=camera;cast.ray.origin.setFromMatrixPosition(camera.matrixWorld);cast.ray.direction.copy(point).unproject(camera).sub(cast.ray.origin).normalize();
  const hits=[];picking.intersect(root,cast,hits);
  return hits.sort((a,b)=>a.distance-b.distance).find(h=>{let p=h.object;while(p){if(!p.visible)return false;p=p.parent;}const m=Array.isArray(h.object.material)?h.object.material[h.face?.materialIndex||0]:h.object.material;return !m||m.visible!==false&&m.opacity!==0;});
 }
 function hover(e){if(down)return;const now=performance.now();if(now-lastCheck<60)return;lastCheck=now;const value=!!hit(e);if(value!==over){over=value;api.hit(value);}}
 window.addEventListener('mousemove',hover);
 document.addEventListener('mouseleave',()=>{if(!down){over=false;api.hit(false);}});
 function regionAt(hit){
  if(!vrm||!state.settings.touchEnabled)return null;
  const joints={};for(const key of ['head','hips','chest','leftUpperArm','rightUpperArm','leftFoot','rightFoot']){
   const bone=vrm.humanoid.getRawBoneNode(key);if(bone)joints[key]=bone.getWorldPosition(new THREE.Vector3());
  }
  return window.companionInteraction.classifyPoint(hit.point,joints,state.settings.touchZoneScale);
 }
 el.onpointerdown=e=>{
  if(down||e.button!==0||e.isPrimary===false||state.pass)return;const target=hit(e);if(!target)return;
  interacting=true;motionPlayer.interrupt(elapsed);
  const rotate=!!e.ctrlKey;if(rotate){cloth?.reset();hands?.reset();}
  const handGrab=!rotate&&!e.shiftKey&&state.settings.handDrag&&hands?.begin(target);
  const grab=!rotate&&!handGrab&&!e.shiftKey&&state.settings.clothDrag&&cloth?.begin(target);
  e.preventDefault();el.setPointerCapture(e.pointerId);down={id:e.pointerId,x:e.screenX,y:e.screenY,lastX:e.screenX,lastY:e.screenY,path:0,max:0,start:performance.now(),region:rotate||e.shiftKey?null:regionAt(target),rotate,roll:!!e.shiftKey,angles:{angleX:state.settings.angleX,angleY:state.settings.angleY,angleZ:state.settings.angleZ},cloth:!!grab,hand:!!handGrab,anchor:target.point.clone(),depth:target.point.clone().project(camera).z,moved:false};api.hit(true);
 };
 function track(e){
  down.path+=Math.hypot(e.screenX-down.lastX,e.screenY-down.lastY);down.lastX=e.screenX;down.lastY=e.screenY;
  down.max=Math.max(down.max,Math.hypot(e.screenX-down.x,e.screenY-down.y));
 }
 el.onpointermove=e=>{
  if(!down||e.pointerId!==down.id)return;track(e);
  if(down.rotate){
   if(down.max>3){down.moved=true;orientationPreview=window.companionLayout.rotationFromDrag(down.angles,e.screenX-down.x,e.screenY-down.y,down.roll);fitModel(vrm?.scene||demoRoot);}return;
  }
  if(down.cloth||down.hand){
   const rect=el.getBoundingClientRect(),target=new THREE.Vector3((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1,down.depth).unproject(camera);
   const delta=target.sub(down.anchor);if(down.hand){if(down.max>6)hands.move(delta);}else cloth.move(delta);return;
  }
  if(down.region)return;
  if(!down.moved&&down.max>6){down.moved=true;api.drag('start',down.x,down.y);}
  if(down.moved)api.drag('move',e.screenX,e.screenY);
 };
 el.onpointerup=e=>{
  if(!down||e.pointerId!==down.id)return;track(e);const previous=down;down=null;interacting=false;motionHoldUntil=elapsed+.4;
  if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);
  if(previous.rotate){
   const angles=orientationPreview;orientationPreview=null;
   if(previous.moved&&angles){
    state.settings={...state.settings,...angles,angle:angles.angleY};
    call(api.orientation(angles)).catch(error=>{
     state.settings={...state.settings,...previous.angles,angle:previous.angles.angleY};
     fitModel(vrm?.scene||demoRoot);api.modelStatus('向きを保存できません：'+error.message);
    });
   }
   fitModel(vrm?.scene||demoRoot);
  }
  else if(previous.hand){hands?.release();if(previous.max>6&&!state.pass)api.touch('hand','stroke');else if(previous.max<=6)api.action('talk');}
  else if(previous.cloth){cloth?.release();if(previous.max>6&&!state.pass)api.touch('cloth','stroke');else if(previous.max<=6)api.action('talk');}
  else if(previous.region){
   const target=hit(e),region=target&&regionAt(target);
   // A gesture must finish on its initial region; cancelled swipes never count.
   if(!state.pass&&region===previous.region){const gesture=window.companionInteraction.gestureKind(previous.path,performance.now()-previous.start);if(gesture)api.touch(previous.region,gesture);}
  }else if(previous.moved)api.drag('end',e.screenX,e.screenY);else api.action('talk');
  over=!!hit(e);api.hit(over);
 };
 function cancel(){interacting=false;motionPlayer.interrupt(elapsed);if(orientationPreview){orientationPreview=null;fitModel(vrm?.scene||demoRoot);}cloth?.release();hands?.release();if(down){down=null;api.drag('end',0,0);}over=false;api.hit(false);}
 cancelInteraction=cancel;
 el.onpointercancel=cancel;el.onlostpointercapture=()=>{if(down)cancel();};window.addEventListener('blur',cancel);
 el.oncontextmenu=e=>{e.preventDefault();if(!state.pass&&hit(e)){cancel();api.action('menu');}};
 document.addEventListener('contextmenu',e=>e.preventDefault());
}
api.onUpdate(data=>{
 if(!state)return;const before=state.settings;state={...state,...data};
 const rotationChanged=['angleX','angleY','angleZ'].some(k=>before[k]!==state.settings[k]);
 if(isMascot){
  if(data.reply&&data.mood!=='angry'||data.greeting&&state.relationship?.mood!=='angry')moodUntil=elapsed+4;
  if(data.greeting)motionPlayer.greet();
  if(data.reaction){motionPlayer.interrupt(elapsed);motionHoldUntil=elapsed+3.5;}
  if(data.settings)motionPlayer.configure(state.settings,elapsed);
  if(data.reloadMotions)loadMotions();
  if(data.reaction)reactionMotion.trigger(data.reaction.emotion,performance.now()/1000);
  if(data.voiceStop||data.mascotVisible===false)stopVoiceLocal();
  if(data.speech!==undefined){stopVoiceLocal();utteranceId=data.speechId??null;if(data.speech&&!data.thinking&&!data.ttsPending)lips.play(data.speech,performance.now()/1000);}
  if(data.voiceFailed===utteranceId&&state.speech)lips.play(state.speech,performance.now()/1000);
  if(data.voiceAudio&&data.voiceAudio.id===utteranceId&&state.mascotVisible!==false){voiceText=data.voiceAudio.text;lips.stop();speechAudio.play(data.voiceAudio);}
  if(data.settings&&!state.settings.ttsEnabled&&before.ttsEnabled)stopVoiceLocal();
  if(data.reloadVRM)loadVRM(true);
  if(data.settings)cloth?.configure?.(state.settings);
  if(data.pass||data.settings&&(before.handDrag!==state.settings.handDrag||before.clothDrag!==state.settings.clothDrag||before.clothReach!==state.settings.clothReach||before.clothAngle!==state.settings.clothAngle||rotationChanged||before.scale!==state.settings.scale)){cancelInteraction();cloth?.reset();hands?.reset();}
  if(renderer&&(before.scale!==state.settings.scale||rotationChanged))resizeViewport();
 }else if(view==='input'){
  $('inputName').textContent=state.settings.name+'に話しかける';setInputBusy();if(data.focusInput)focusInput();
 }else if(view==='bubble'){
  if(data.bubbleSide)document.body.dataset.side=data.bubbleSide;
  if(data.speech!==undefined||data.settings)updateSpeech(data.speech);
 }else{
  if(data.voiceStatus!==undefined)status('voiceStatus',data.voiceStatus);
  if(data.reloadMotions)refreshMotionOptions();
  if(!dirty)fillSettings(state.settings);else if(rotationChanged)for(const k of ['angleX','angleY','angleZ'])$(k).value=state.settings[k];$('companionName').textContent=state.settings.name;$('modelBadge').textContent=state.settings.model||'モデル未選択';
  if(data.reply)pendingText='';renderRelationship();renderHistory();updateBusy(state.busy);if(data.controlTab)selectControlTab(data.controlTab);
 }
});
(async()=>{try{
 state=await call(api.state());
 if(isMascot)initMascot();else if(view==='input')initInput();else if(view==='bubble')initSpeech();else{await initControl();$('companionName').textContent=state.settings.name;$('modelBadge').textContent=state.settings.model||'モデル未選択';}
}catch(e){if(isMascot)api.modelStatus(e.message);else status(view==='input'?'inputStatus':view==='bubble'?'speechText':'chatStatus',e.message,true);}})();
})();

