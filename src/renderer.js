import llamaConfig from './llama-config.cjs';
import unlit from './unlit-materials.cjs';
import renderQuality from './render-quality.cjs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
(() => {
const api=window.companion,$=id=>document.getElementById(id);
const view=new URLSearchParams(location.search).get('view')||'control',isMascot=view==='mascot';
document.body.className=view;document.documentElement.classList.add(view+'-root');
$({control:'control',mascot:'mascot',input:'inputPanel',bubble:'speechPanel'}[view]).hidden=false;
let state,dirty=false,pendingText='',busy=false,fetchingModels=false,modelRequest=0;
const unlitMaterials=new unlit.UnlitMaterials(m=>new THREE.MeshBasicMaterial({name:m.name+' (陰影なし)',color:m.color.clone(),map:m.map,alphaMap:m.alphaMap||null,opacity:m.opacity,transparent:m.transparent,alphaTest:m.alphaTest,side:m.side,depthWrite:m.depthWrite,depthTest:m.depthTest,vertexColors:m.vertexColors,toneMapped:false}));
function status(id,text,error=false){$(id).textContent=text;$(id).classList.toggle('error',error);}
async function call(promise){const r=await promise;if(!r.ok)throw new Error(r.error);return r.data;}
function wrap(fn,id='chatStatus'){return async(...args)=>{try{await fn(...args);}catch(e){status(id,e.message,true);}};}
function selectControlTab(which){const chat=which==='chat';$('chatView').hidden=!chat;$('settingsView').hidden=chat;$('chatTab').classList.toggle('selected',chat);$('settingsTab').classList.toggle('selected',!chat);}
function settingsFromForm(){const s={...state.settings};for(const id of ['llamaExecutable','llamaModelPath','llamaTemplate','provider','endpoint','model','name','persona','selfPronoun','userAddress','bubbleFont','greetingMotion','idleMotion','idleMode','ttsEndpoint','ttsCaption','cloudReasoning','compatibleTokenParam'])s[id]=$(id).value;for(const id of ['llamaPort','llamaContext','llamaGpuLayers','llamaDryMultiplier','llamaDryBase','llamaDryAllowedLength','temperature','historyTurns','scale','angleX','angleY','angleZ','motionStrength','touchZoneScale','bubbleFontSize','clothAngle','motionInterval','idleSpeed','idlePose','ttsSpeed','ttsVolume','ttsTimeout','cloudMaxTokens'])s[id]=Number($(id).value);for(const k of ['memoryEnabled','memoryAuto','topmost','lipSync','softIdle','touchEnabled','clothDrag','handDrag','randomMotion','ttsEnabled','cloudTemperature'])s[k]=$(k).checked;s.clothReach=Number($('clothReach').value)/100;return s;}
function fillSettings(s){for(const id of ['llamaExecutable','llamaModelPath','llamaTemplate','llamaPort','llamaContext','llamaGpuLayers','llamaDryMultiplier','llamaDryBase','llamaDryAllowedLength','provider','endpoint','name','persona','selfPronoun','userAddress','bubbleFont','temperature','historyTurns','scale','angleX','angleY','angleZ','motionStrength','touchZoneScale','bubbleFontSize','clothAngle','motionInterval','idleSpeed','idlePose','ttsSpeed','ttsVolume','ttsTimeout','cloudMaxTokens'])$(id).value=s[id];for(const k of ['memoryEnabled','memoryAuto','topmost','lipSync','softIdle','touchEnabled','clothDrag','handDrag','randomMotion','ttsEnabled','cloudTemperature'])$(k).checked=s[k];$('clothReach').value=Math.round(s.clothReach*100);setModels(s.model?[s.model]:[],s.model);$('vrmPath').textContent=s.modelPath||'VRM未選択：デモ表示';$('motionPath').textContent=s.motionFolder||'モーション未選択';$('ttsEndpoint').value=s.ttsEndpoint;$('ttsCaption').value=s.ttsCaption;$('speakerPath').textContent=s.speakerPath||'Speaker Embedding未選択';$('idleMode').value=s.idleMode;setMotionOptions(motionNames,s.greetingMotion,s.idleMotion);$('cloudReasoning').value=s.cloudReasoning;$('compatibleTokenParam').value=s.compatibleTokenParam;updateProviderUI();}
let motionNames=[];
let expressionPath='',expressionNames=[],expressionRequest=0;
function setExpressionOptions(names,modelPath){
 expressionRequest++;
 const el=$('expressionName'),selected=expressionPath===modelPath?el.value:'';
 expressionPath=modelPath;expressionNames=names;el.replaceChildren();el.add(new Option('表情を選択',''));
 for(const name of names)el.add(new Option(name,name));el.value=names.includes(selected)?selected:'';
 status('expressionStatus',names.length?`${names.length}個の表情を読み込みました。`:'VRMの読み込み後、登録されている表情が表示されます。');
}
async function refreshExpressionOptions(){const request=++expressionRequest;try{const catalog=await call(api.expressionCatalog());if(request===expressionRequest&&catalog.modelPath===state.settings.modelPath)setExpressionOptions(catalog.names,catalog.modelPath);}catch(e){if(request===expressionRequest)status('expressionStatus',e.message,true);}}
async function previewExpression(){const name=$('expressionName').value;if(!name)throw new Error('表情を選んでください。');await call(api.previewExpression(expressionPath,name,Number($('expressionWeight').value)/100));status('expressionStatus','5秒間プレビューします：'+name);}
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
function modelListButtonText(){return cloudProvider($('provider').value)?'モデル一覧を取得':'導入済みモデル一覧を取得';}
function updateProviderUI(){renderLlamaTemplate();const provider=$('provider').value,cloud=cloudProvider(provider);$('cloudSettings').hidden=!cloud;$('llamaSettings').hidden=provider!=='llamacpp';$('model').readOnly=provider==='llamacpp';if(provider==='llamacpp'){$('endpoint').value='http://127.0.0.1:'+Number($('llamaPort').value);$('model').value='companion-gguf';}$('endpoint').readOnly=provider==='openai'||provider==='openrouter'||provider==='llamacpp';$('openrouterHelp').hidden=provider!=='openrouter';$('model').placeholder=provider==='openrouter'?'例：anthropic/claude-haiku-5.5':'モデルIDを選択・直接入力';$('tokenParamLabel').hidden=provider!=='compatible';$('connectionBadge').textContent=cloud?'クラウドLLM':'ローカル接続';if(!fetchingModels)$('fetchModels').textContent=modelListButtonText();$('localModelHelp').hidden=cloud||provider==='llamacpp';if(cloud)refreshKeyStatus();else{keyRequest++;$('apiKey').value='';}}
function renderLlamaTemplate(){
 const config=llamaConfig.resolveChatTemplate({llamaModelPath:$('llamaModelPath').value,llamaTemplate:$('llamaTemplate').value});
 $('llamaTemplateInfo').textContent='会話形式：'+config.label;$('llamaTemplateHelp').textContent=config.help;
}
function renderLlamaState(value=state.llamaState||{phase:'stopped'}){
 state.llamaState=value;const phase=value.phase;
 $('llamaProgress').hidden=phase!=='starting';
 $('startLlama').disabled=busy||['starting','running','stopping'].includes(phase);
 $('stopLlama').disabled=busy||!['starting','running','error'].includes(phase);
 const applied=phase==='running'&&value.template?'\n適用中：'+value.template.label+(value.templateVerified?'（会話形式の検証済み）':''):'';
 status('llamaStatus',value.error||({stopped:'停止中',starting:'GGUFモデルを読み込み中…',running:'起動済み：会話できます。',stopping:'停止しています…',error:'起動できませんでした。ログを確認してください。'}[phase]||phase)+applied,phase==='error');
 $('llamaLog').value=value.log||'';
}
let memoryData=null,memoryRequest=0,memoryEditing=false,summaryEditing=false;
const memoryKinds={profile:'情報',preference:'好み',promise:'約束',event:'出来事'};
function selectMemory(id=''){
 const item=memoryData?.items.find(i=>i.id===id);$('memoryList').value=item?.id||'';$('memoryText').value=item?.text||'';$('memoryKind').value=item?.kind||'profile';memoryEditing=false;
 $('memorySource').textContent=!item?'新しいメモを作成します。':item.source.type==='user'?'発言元：ユーザー'+(item.source.at?'（'+new Date(item.source.at).toLocaleString('ja-JP')+'）':'（日時不明）')+'\n原文：'+item.source.quote:'発言元：手動で登録・編集';
}
async function refreshMemory(force=false){
 const request=++memoryRequest,data=await call(api.memoryView());if(request!==memoryRequest)return;
 const changed=!memoryData||memoryData.profileId!==data.profileId,selected=$('memoryList').value;memoryData=data;
 $('memoryInfo').textContent='対象：'+(state.relationship?.label||state.settings.name)+' ／ 長期メモ '+data.items.length+'件';
 $('memoryList').replaceChildren();for(const item of data.items)$('memoryList').add(new Option('['+memoryKinds[item.kind]+'] '+item.text.replace(/\s+/g,' ').slice(0,70),item.id));
 $('memoryList').value=selected;
 if(changed||force||!summaryEditing){$('memorySummary').value=data.summary;summaryEditing=false;}
 if(changed||force||!memoryEditing)selectMemory(changed?'':selected);
}
function updateMemoryBusy(){
 const organizing=state.memoryStatus==='記憶を整理しています…';
 for(const id of ['organizeMemory','saveMemory','deleteMemory','saveMemorySummary','clearMemory'])$(id).disabled=busy||organizing;
 $('cancelMemory').disabled=!organizing;
 if(state.memoryStatus!==undefined)status('memoryStatus',state.memoryStatus,/できませんでした/.test(state.memoryStatus));
}
function setModels(models,selected,showList=false){
 $('modelOptions').replaceChildren();$('modelList').replaceChildren();for(const m of models){$('modelOptions').append(new Option(m,m));$('modelList').add(new Option(m,m));}
 $('model').value=selected||'';$('modelList').value=selected||'';$('modelListLabel').hidden=!showList||!models.length;
}
function invalidateModels(){modelRequest++;fetchingModels=false;$('fetchModels').textContent=modelListButtonText();$('fetchModels').disabled=busy;$('modelListLabel').hidden=true;status('connectionStatus','');}

const historyViews=new WeakMap();
function renderHistory(id='history',follow=false){
 const area=$(id),key=JSON.stringify([state.settings.modelPath,state.relationship?.active]),previous=historyViews.get(area);
 const signature=JSON.stringify([key,state.settings.name,state.history,pendingText]);
 if(previous?.signature===signature)return;
 const reset=!previous||previous.key!==key,atEnd=area.scrollHeight-area.scrollTop-area.clientHeight<48,top=area.scrollTop;
 area.replaceChildren();
 const history=[...state.history];if(pendingText)history.push({role:'user',content:pendingText});
 if(!history.length){const p=document.createElement('p');p.className='empty';p.textContent='ここから、会話が始まります。\n相棒に話しかけてみましょう。';area.append(p);}
 for(const m of history){const div=document.createElement('div');div.className='msg '+m.role;const name=document.createElement('span');name.className='speaker';name.textContent=m.role==='user'?'あなた':state.settings.name;div.append(name,document.createTextNode(m.content));area.append(div);}
 area.scrollTop=reset||follow||atEnd?area.scrollHeight:top;historyViews.set(area,{key,signature});
}
function renderRelationship(){
 const r=state.relationship;if(!r)return;
 const el=$('relationshipProfile');el.replaceChildren();for(const p of r.profiles)el.add(new Option(p.label,p.id));el.value=r.active;
 $('romanceEnabled').checked=r.romanceEnabled;
 const moods={calm:'落ち着いている',happy:'嬉しい',shy:'照れている',surprised:'驚いている',angry:'怒っている'};
 $('relationshipSummary').textContent=`${r.label}：${r.stage}（好感度 ${r.affinity}）・${r.status} ／ 今の気分：${moods[r.mood]||r.mood}`;
 $('confess').disabled=busy||!r.romanceEnabled;
}
function updateBusy(value){busy=value;renderLlamaState();updateMemoryBusy();$('send').disabled=busy;$('message').disabled=busy;$('stop').hidden=!busy;for(const id of ['saveSettings','clear'])$(id).disabled=busy;$('fetchModels').disabled=busy||fetchingModels;$('saveKey').disabled=busy||!keyAvailable;$('deleteKey').disabled=busy||!keySaved;for(const id of ['relationshipProfile','relationshipName','createRelationship','romanceEnabled'])$(id).disabled=busy;$('confess').disabled=busy||!state.relationship?.romanceEnabled;}
async function initControl(){
 await refreshMemory();
 $('memoryList').onchange=()=>selectMemory($('memoryList').value);$('newMemory').onclick=()=>selectMemory();
 $('memoryText').oninput=()=>memoryEditing=true;$('memoryKind').onchange=()=>memoryEditing=true;$('memorySummary').oninput=()=>summaryEditing=true;
 $('refreshMemory').onclick=wrap(async()=>{if((memoryEditing||summaryEditing)&&!confirm('編集中の記憶を破棄して読み直しますか？'))return;await refreshMemory(true);},'memoryStatus');
 const editMemory=async(operation,value)=>{if(!memoryData)throw new Error('記憶を読み直してください。');await call(api.editMemory(memoryData.profileId,operation,value));await refreshMemory(true);status('memoryStatus','記憶を保存しました。');};
 $('saveMemory').onclick=wrap(()=>editMemory('save',{id:$('memoryList').value,text:$('memoryText').value,kind:$('memoryKind').value}),'memoryStatus');
 $('deleteMemory').onclick=wrap(async()=>{const id=$('memoryList').value;if(!id)throw new Error('削除するメモを選んでください。');if(confirm('この長期メモを削除しますか？'))await editMemory('delete',id);},'memoryStatus');
 $('saveMemorySummary').onclick=wrap(()=>editMemory('summary',$('memorySummary').value),'memoryStatus');
 $('clearMemory').onclick=wrap(async()=>{if(confirm('このキャラクターの要約と長期メモを全消去しますか？会話履歴と好感度は残ります。'))await editMemory('clear');},'memoryStatus');
 $('organizeMemory').onclick=wrap(async()=>{if(dirty)throw new Error('変更した設定を先に保存してください。');status('memoryStatus','記憶を整理しています…');await call(api.organizeMemory());await refreshMemory();},'memoryStatus');
 $('cancelMemory').onclick=wrap(async()=>{await call(api.cancelMemory());status('memoryStatus','記憶の整理を中止しました。');},'memoryStatus');
 for(const [button,field,kind]of [['chooseLlamaExecutable','llamaExecutable','executable'],['chooseLlamaModel','llamaModelPath','model']])$(button).onclick=wrap(async()=>{const file=await call(api.chooseLlamaFile(kind));if(file){$(field).value=file;dirty=true;renderLlamaTemplate();}},'llamaStatus');
 $('startLlama').onclick=wrap(async()=>{if(dirty)throw new Error('変更した設定を先に保存してください。');renderLlamaState({phase:'starting'});try{renderLlamaState(await call(api.startLlama()));}catch(e){renderLlamaState(await call(api.llamaStatus()));throw e;}},'llamaStatus');
 $('stopLlama').onclick=wrap(async()=>renderLlamaState(await call(api.stopLlama())),'llamaStatus');
 $('refreshLlama').onclick=wrap(async()=>renderLlamaState(await call(api.llamaStatus())),'llamaStatus');
 for(const id of ['llamaModelPath','llamaTemplate'])$(id).onchange=()=>{dirty=true;renderLlamaTemplate();};
 $('llamaModelPath').oninput=()=>{dirty=true;renderLlamaTemplate();};
 $('llamaPort').oninput=()=>{if($('provider').value==='llamacpp')updateProviderUI();};
 refreshExpressionOptions();
 $('previewExpression').onclick=wrap(previewExpression,'expressionStatus');
 $('resetExpression').onclick=wrap(async()=>{await call(api.previewExpression(expressionPath,'',0));status('expressionStatus','自動表情へ戻しました。');},'expressionStatus');
 $('expressionWeight').value=70;
 $('expressionWeight').oninput=wrap(async()=>{if($('expressionName').value)await previewExpression();},'expressionStatus');
 renderRelationship();
 const relationAction=async(operation,value)=>{if(dirty)throw new Error('変更した設定を先に保存してください。');state.relationship=await call(api.relationship(operation,value));renderRelationship();status('relationshipStatus','関係の設定を保存しました。');};
 $('relationshipProfile').onchange=wrap(async()=>{try{await relationAction('select',$('relationshipProfile').value);}finally{renderRelationship();}},'relationshipStatus');
 $('createRelationship').onclick=wrap(async()=>{await relationAction('create',$('relationshipName').value);$('relationshipName').value='';},'relationshipStatus');
 $('romanceEnabled').onchange=wrap(async()=>{try{await relationAction('romance',$('romanceEnabled').checked);}finally{renderRelationship();}},'relationshipStatus');
 $('confess').onclick=wrap(async()=>{if(dirty)throw new Error('変更した設定を先に保存してください。');await call(api.confess());status('relationshipStatus','気持ちを伝えました。返事は吹き出しと会話履歴に表示します。');},'relationshipStatus');
 fillSettings(state.settings);status('voiceStatus',state.voiceStatus||'');$('chooseSpeaker').onclick=wrap(async()=>{const path=await call(api.chooseSpeaker());if(path)$('speakerPath').textContent=path;},'voiceStatus');$('testVoice').onclick=wrap(async()=>{if(dirty)throw new Error('変更した設定を先に保存してください。');await call(api.action('test-voice'));},'voiceStatus');$('stopVoice').onclick=()=>api.action('stop-voice');refreshMotionOptions();$('chooseMotions').onclick=wrap(async()=>{const names=await call(api.chooseMotions());if(names){await refreshMotionOptions();$('motionPath').textContent=state.settings.motionFolder;status('motionStatus',names.length+'件のモーションを登録しました。');}},'motionStatus');$('dataPath').textContent='設定と履歴：'+state.dataPath;
 const tabs=selectControlTab;
 $('chatTab').onclick=()=>tabs('chat');$('settingsTab').onclick=()=>tabs('settings');
 $('settingsForm').oninput=e=>{if(['relationshipProfile','relationshipName','romanceEnabled','expressionName','expressionWeight','memoryList','memoryText','memoryKind','memorySummary'].includes(e?.target?.id))return;dirty=true;};
 $('provider').onchange=()=>{invalidateModels();$('endpoint').value={ollama:'http://127.0.0.1:11434',lmstudio:'http://127.0.0.1:1234',llamacpp:'http://127.0.0.1:'+Number($('llamaPort').value),openai:'https://api.openai.com/v1',openrouter:'https://openrouter.ai/api/v1',compatible:''}[$('provider').value];$('apiKey').value='';setModels([],$('provider').value==='openai'?'gpt-6-luna':'');dirty=true;updateProviderUI();};
 $('endpoint').oninput=()=>{invalidateModels();dirty=true;$('apiKey').value='';refreshKeyStatus();};
 $('saveKey').onclick=wrap(async()=>{const key=$('apiKey').value;$('apiKey').value='';await call(api.saveKey(settingsFromForm(),key));await refreshKeyStatus();},'keyStatus');
 $('deleteKey').onclick=wrap(async()=>{await call(api.deleteKey(settingsFromForm()));$('apiKey').value='';await refreshKeyStatus();},'keyStatus');
 $('modelList').onchange=()=>{if($('modelList').value){$('model').value=$('modelList').value;dirty=true;}};
 $('fetchModels').onclick=async()=>{
  if(fetchingModels||busy)return;const request=++modelRequest;fetchingModels=true;$('fetchModels').disabled=true;$('fetchModels').textContent='取得中…';status('connectionStatus','モデル一覧を取得中…（最大約10秒）');$('modelListLabel').hidden=true;
  try{
   const models=await call(api.models(settingsFromForm()));if(request!==modelRequest)return;
   let selected=$('model').value;if($('provider').value==='ollama'&&(!selected||/^hammerai\/nemomix-unleashed:12b-q4_k_m$/i.test(selected)))selected=models.find(m=>m.toLowerCase()==='vrm-companion-nemomix:12b-q4_k_m')||selected;
   setModels(models,selected,true);dirty=true;status('connectionStatus',models.length?`${models.length}件取得しました。下の一覧から選び、「設定を保存」を押してください。`:cloudProvider($('provider').value)?'一覧が空です。モデルIDを直接入力するか、接続先のモデルを確認してください。':'一覧が空です。接続先に導入済みモデルがありません。Ollamaの場合はinstall_ollama.batでモデルをダウンロードしてから、もう一度取得してください。');
  }catch(e){if(request===modelRequest)status('connectionStatus',e.message,true);}
  finally{if(request===modelRequest){fetchingModels=false;$('fetchModels').disabled=busy;$('fetchModels').textContent=modelListButtonText();}}
 };
 $('settingsForm').onsubmit=async e=>{e.preventDefault();await wrap(async()=>{const s=await call(api.save(settingsFromForm()));state.settings=s;dirty=false;updateProviderUI();status('connectionStatus','設定を保存しました。');},'connectionStatus')();};
 $('loadVRM').onclick=wrap(async()=>{const p=await call(api.chooseVRM());if(p)status('chatStatus','VRMを読み込み中です。結果は吹き出しに表示します。');});
 $('chatForm').onsubmit=async e=>{e.preventDefault();if(busy)return;await wrap(async()=>{
  if(dirty)throw new Error('変更した設定を先に保存してください。');
  const text=$('message').value.trim();if(!text)return;
  pendingText=text;updateBusy(true);renderHistory();status('chatStatus','返答を考えています…（初回はモデル読み込みに時間がかかります）');
  try{await call(api.send(text));$('message').value='';status('chatStatus','');}finally{pendingText='';updateBusy(false);renderHistory();$('message').focus();}
 })();};
 $('message').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('chatForm').requestSubmit();}};
 $('stop').onclick=wrap(async()=>{await call(api.cancel());});
 $('clear').onclick=wrap(async()=>{if(confirm('このキャラクターとの会話履歴と要約を削除しますか？長期メモと好感度は残ります。'))await call(api.clear());});
 $('resetPosition').onclick=wrap(async()=>{await call(api.action('reset'));});
 $('resetBubble').onclick=wrap(async()=>{await call(api.action('reset-bubble'));});
 $('quit').onclick=()=>api.action('quit');
 $('testMotion').onclick=wrap(async()=>{await call(api.action('test-motion'));});
 if(state.startupError)status('chatStatus',state.startupError,true);
 renderHistory();updateBusy(state.busy);selectControlTab('settings');
}
let scene,camera,renderer,vrm,demoRoot,modelRoot,clock,elapsed=0,loadId=0,blinkAt=2,blinkStart=-10;
const faces=new window.companionExpressions.FaceExpressions();
const speechFaces=new window.companionExpressions.SpeechExpressions(faces);
let rest=new Map(),cloth=null,hands=null,chestPoke=null,orientationPreview=null,cancelInteraction=()=>{};
let utteranceId=null,voiceText='';
const speechAudio=new window.companionAudio.SpeechAudio(()=>new window.AudioContext({latencyHint:'interactive'}),(id,phase,error)=>{
 if(id===utteranceId){
  if(phase==='start'){lips.play(voiceText,performance.now()/1000);speechFaces.start(id,elapsed);}
  else if(phase==='ended'){lips.stop();speechFaces.end(id,elapsed);}
  else if(phase==='error'){lips.play(voiceText,performance.now()/1000);speechFaces.fallback(id,elapsed,window.companionMotion.planSpeech(voiceText).duration);}
 }
 api.voiceState(id,phase,error);
});
function stopVoiceLocal(){speechAudio.stop();lips.stop();speechFaces.cancel(elapsed);utteranceId=null;voiceText='';}
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
const lips=new window.companionMotion.LipMotion(),idle=new window.companionMotion.SoftIdle(),reactionMotion=new window.companionMotion.ReactionMotion(),touchPose=new window.companionMotion.TouchPoseBlend();
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
 // Supersample High, while bounding framebuffer area and dimensions.
 renderer.setPixelRatio(renderQuality.pixelRatio(width,height,devicePixelRatio,renderer.capabilities?.maxTextureSize));
 renderer.setSize(width,height,false);camera.aspect=width/height;
 fitModel(vrm?.scene||demoRoot);
}
async function loadVRM(announce=false){
 faces.bind(null);api.expressionReady(state.settings.modelPath,[]);
 stopVoiceLocal();cancelInteraction();touchPose.reset();reactionMotion.stop();++motionGeneration;motionPlayer.dispose();
 const id=++loadId;
 if(!state.settings.modelPath)return true;
 
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
 cloth?.reset();hands?.reset();chestPoke?.reset();
 unlitMaterials.clear();disposeRoot(modelRoot);disposeRoot(demoRoot);demoRoot=null;vrm=candidate;modelRoot=vrm.scene;scene.add(modelRoot);unlitMaterials.bind(modelRoot);
 faces.bind(vrm);api.expressionReady(state.settings.modelPath,faces.names);
 rest=window.companionMotion.capturePose(vrm);lips.stop();cloth=new window.companionCloth.ClothDrag(vrm,THREE.Vector3,state.settings);hands=new window.companionHand.HandDrag(vrm,THREE.Vector3);chestPoke=new window.companionMotion.ChestPoke(vrm,THREE.Vector3);
 applyOrientation(modelRoot);fitModel(modelRoot);loadMotions();
 if(announce)api.modelStatus('準備できたよ。話しかけてね。');
 return true;
 }catch(e){if(candidate&&candidate!==vrm)VRMUtils.deepDispose(candidate.scene);api.modelStatus('VRMを読み込めませんでした：'+e.message);return false;}
}
function initMascot(){

 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(30,440/518,.01,100);
 try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch(e){api.modelStatus('3D表示を開始できません：'+e.message);return;}
 renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
 $('avatar').append(renderer.domElement);scene.add(new THREE.HemisphereLight(0xffffff,0x697c6c,2.4));const key=new THREE.DirectionalLight(0xfff4df,2.2);key.position.set(-1,2,3);scene.add(key);
 demoRoot=createDemo();resizeViewport();
 new ResizeObserver(resizeViewport).observe($('avatar'));
 window.addEventListener('resize',resizeViewport);
 initCharacterMouse();clock=new THREE.Clock();loadVRM().then(ready=>{if(ready===true)api.mascotReady();});
 renderer.setAnimationLoop(()=>{
 const dt=Math.min(clock.getDelta(),.05);elapsed+=dt;
 const root=vrm?.scene||demoRoot;
 if(root)applyOrientation(root);
 if(vrm){
 cloth?.restore();chestPoke?.restore();hands?.restore();motionPlayer.restorePose();
 idle.update(vrm,rest,elapsed,dt,{enabled:state.settings.softIdle,strength:state.settings.motionStrength,thinking:state.busy});
 motionPlayer.update(dt,elapsed,{blocked:interacting||elapsed<motionHoldUntil||state.busy||state.mascotVisible===false,speaking:speechAudio.active()||lips.active(performance.now()/1000),suspendIdle:interacting||elapsed<motionHoldUntil||state.mascotVisible===false});
 touchPose.update(vrm,elapsed);
 const talking=lips.update(vrm,performance.now()/1000,dt,state.settings.lipSync,speechAudio.sample());
 if(elapsed>=blinkAt){blinkStart=elapsed;blinkAt=elapsed+2.5+Math.random()*3;}
 const p=(elapsed-blinkStart)/.18;const blink=p>=0&&p<1?Math.sin(p*Math.PI):0;
 vrm.expressionManager?.setValue('blink',blink);
 reactionMotion.update(vrm,performance.now()/1000,{expressions:false});
 faces.update(elapsed,dt,{talking,blink});
 hands?.update(dt);
 vrm.update(dt);
 chestPoke?.update(dt);
 cloth?.update(dt);
 }
 if(vrm)unlitMaterials.apply();
 renderer.render(scene,camera);
 });
}

function setInputBusy(){busy=!!state.busy;$('sendInput').disabled=busy;$('messageInput').disabled=busy;$('stopInput').hidden=!busy;}
function focusInput(){if(!state.busy)$('messageInput').focus();}
function initInput(){
 $('inputName').textContent=state.settings.name+'に話しかける';setInputBusy();renderHistory('inputHistory');
 $('inputForm').onsubmit=async e=>{e.preventDefault();if(state.busy)return;const text=$('messageInput').value.trim();if(!text)return;
  pendingText=text;state.busy=true;setInputBusy();renderHistory('inputHistory',true);status('inputStatus','返答を考えています…');
  try{await call(api.send(text));$('messageInput').value='';status('inputStatus','');}
  catch(e){status('inputStatus',e.message,true);}finally{pendingText='';state.busy=false;setInputBusy();renderHistory('inputHistory');focusInput();}
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
 el.addEventListener('wheel',e=>{
  if(!e.ctrlKey||state.pass)return;
  e.preventDefault();
  if(down)return;
  const target=hit(e);if(!target){over=false;api.hit(false);return;}
  if(!Number.isFinite(e.deltaY)||e.deltaY===0)return;
  const pixels=e.deltaY*(e.deltaMode===1?32:e.deltaMode===2?el.getBoundingClientRect().height:1);
  const delta=Math.max(-300,Math.min(300,pixels));
  call(api.zoom(delta)).catch(error=>api.modelStatus('大きさを保存できません：'+error.message));
 },{passive:false});
 el.onpointerdown=e=>{
  if(down||e.button!==0||e.isPrimary===false||state.pass)return;const target=hit(e);if(!target)return;
  const rotate=!!e.ctrlKey,region=rotate||e.shiftKey?null:regionAt(target);
  if(region==='chest'){touchPose.begin(vrm,elapsed);reactionMotion.stop();}else touchPose.reset();
  interacting=true;motionPlayer.interrupt(elapsed);
  if(region==='chest')touchPose.update(vrm,elapsed);
  if(rotate){cloth?.reset();hands?.reset();}
  const handGrab=!rotate&&!e.shiftKey&&state.settings.handDrag&&hands?.begin(target);
  const grab=!rotate&&!handGrab&&!e.shiftKey&&state.settings.clothDrag&&cloth?.begin(target);
  if(handGrab||grab)touchPose.reset();
  e.preventDefault();el.setPointerCapture(e.pointerId);down={id:e.pointerId,x:e.screenX,y:e.screenY,lastX:e.screenX,lastY:e.screenY,path:0,max:0,start:performance.now(),region,rotate,roll:!!e.shiftKey,angles:{angleX:state.settings.angleX,angleY:state.settings.angleY,angleZ:state.settings.angleZ},cloth:!!grab,hand:!!handGrab,anchor:target.point.clone(),depth:target.point.clone().project(camera).z,moved:false};api.hit(true);
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
   if(!state.pass&&region===previous.region){const gesture=window.companionInteraction.gestureKind(previous.path,performance.now()-previous.start);if(gesture){if(region==='chest'&&gesture==='poke'&&chestPoke?.poke(target,target.point.clone().sub(camera.position)))reactionMotion.stop();api.touch(previous.region,gesture);}}
  }else if(previous.moved)api.drag('end',e.screenX,e.screenY);else api.action('talk');
  over=!!hit(e);api.hit(over);
 };
 function cancel(){interacting=false;touchPose.reset();motionPlayer.interrupt(elapsed);if(orientationPreview){orientationPreview=null;fitModel(vrm?.scene||demoRoot);}cloth?.release();hands?.release();chestPoke?.reset();if(down){down=null;api.drag('end',0,0);}over=false;api.hit(false);}
 cancelInteraction=cancel;
 el.onpointercancel=cancel;el.onlostpointercapture=()=>{if(down)cancel();};window.addEventListener('blur',cancel);
 el.oncontextmenu=e=>{e.preventDefault();if(!state.pass&&hit(e)){cancel();api.action('menu');}};
 document.addEventListener('contextmenu',e=>e.preventDefault());
}
api.onUpdate(data=>{
 if(!state)return;const before=state.settings,beforeRelation=state.relationship?.active;state={...state,...data};
 const rotationChanged=['angleX','angleY','angleZ'].some(k=>before[k]!==state.settings[k]);
 if(isMascot){
  if(data.reply||data.greeting){const mood=data.mood||state.relationship?.mood||'happy';speechFaces.setMood(mood,elapsed);}
  if(data.expressionPreview)faces.show(data.expressionPreview.name,data.expressionPreview.weight,elapsed);
  if(data.greeting)motionPlayer.greet();
  if(data.settings)motionPlayer.configure(state.settings,elapsed);
  if(data.reloadMotions)loadMotions();
  if(data.reaction){
   const delay=data.reaction.region==='chest'&&data.reaction.gesture==='poke'?(chestPoke?.reactionDelay()||0):0;
   motionPlayer.interrupt(elapsed);motionHoldUntil=elapsed+3.5+delay;
   reactionMotion.trigger(data.reaction.emotion,performance.now()/1000,{delay});speechFaces.setMood(data.reaction.emotion,elapsed,3.5);
  }
  const failedCurrent=data.voiceFailed!==undefined&&data.voiceFailed===utteranceId;
  if(data.voiceStop||data.mascotVisible===false)stopVoiceLocal();
  if(data.speech!==undefined){
   stopVoiceLocal();utteranceId=data.speechId??null;
   if(data.speech&&!data.thinking&&state.mascotVisible!==false){
    speechFaces.begin(utteranceId,elapsed,{pending:!!data.ttsPending,duration:window.companionMotion.planSpeech(data.speech).duration});
    if(!data.ttsPending)lips.play(data.speech,performance.now()/1000);
   }
  }
  if(failedCurrent&&state.speech&&state.mascotVisible!==false&&data.speech===undefined){
   utteranceId=data.voiceFailed;lips.play(state.speech,performance.now()/1000);
   speechFaces.begin(utteranceId,elapsed,{duration:window.companionMotion.planSpeech(state.speech).duration});
  }
  if(data.voiceAudio&&data.voiceAudio.id===utteranceId&&state.mascotVisible!==false){voiceText=data.voiceAudio.text;lips.stop();speechAudio.play(data.voiceAudio);}
  if(data.settings&&!state.settings.ttsEnabled&&before.ttsEnabled)stopVoiceLocal();
  if(data.reloadVRM)loadVRM(true);
  if(data.settings)cloth?.configure?.(state.settings);
  if(data.mascotVisible===false||data.pass||data.reloadVRM||data.settings&&(!state.settings.touchEnabled||rotationChanged||before.scale!==state.settings.scale)){chestPoke?.reset();touchPose.reset();}
  if(data.pass||data.settings&&(before.handDrag!==state.settings.handDrag||before.clothDrag!==state.settings.clothDrag||before.clothReach!==state.settings.clothReach||before.clothAngle!==state.settings.clothAngle||rotationChanged||before.scale!==state.settings.scale)){if(interacting||data.pass||rotationChanged||before.scale===state.settings.scale)cancelInteraction();cloth?.reset();hands?.reset();}
  if(renderer&&(before.scale!==state.settings.scale||rotationChanged))resizeViewport();
 }else if(view==='input'){
  if(data.reply||data.reloadVRM)pendingText='';renderHistory('inputHistory');
  $('inputName').textContent=state.settings.name+'に話しかける';setInputBusy();if(data.focusInput)focusInput();
 }else if(view==='bubble'){
  if(data.bubbleSide)document.body.dataset.side=data.bubbleSide;
  if(data.speech!==undefined||data.settings)updateSpeech(data.speech);
 }else{
  if(data.memoryStatus!==undefined)state.memoryStatus=data.memoryStatus;
  if(data.memoryChanged||data.relationship&&beforeRelation!==state.relationship?.active)refreshMemory().catch(e=>status('memoryStatus',e.message,true));
  if(data.expressionNames)setExpressionOptions(data.expressionNames,state.settings.modelPath);
  if(data.voiceStatus!==undefined)status('voiceStatus',data.voiceStatus);
  if(data.settings){$('speakerPath').textContent=state.settings.speakerPath||'Speaker Embedding未選択';$('vrmPath').textContent=state.settings.modelPath||'VRM未選択：デモ表示';}
  if(data.reloadMotions)refreshMotionOptions();
  if(!dirty)fillSettings(state.settings);else{if(before.modelPath!==state.settings.modelPath)for(const k of ['name','persona','selfPronoun','userAddress'])$(k).value=state.settings[k];if(rotationChanged)for(const k of ['angleX','angleY','angleZ'])$(k).value=state.settings[k];if(before.scale!==state.settings.scale)$('scale').value=state.settings.scale;if(before.topmost!==state.settings.topmost)$('topmost').checked=state.settings.topmost;}$('companionName').textContent=state.settings.name;$('modelBadge').textContent=state.settings.model||'モデル未選択';
  if(data.llamaState)state.llamaState=data.llamaState;
  if(data.reply)pendingText='';renderRelationship();renderHistory();updateBusy(state.busy);if(data.controlTab)selectControlTab(data.controlTab);
 }
});
(async()=>{try{
 state=await call(api.state());
 if(isMascot)initMascot();else if(view==='input')initInput();else if(view==='bubble')initSpeech();else{await initControl();if(state.version)$('appVersion').textContent='v'+state.version;$('companionName').textContent=state.settings.name;$('modelBadge').textContent=state.settings.model||'モデル未選択';}
}catch(e){if(isMascot)api.modelStatus(e.message);else status(view==='input'?'inputStatus':view==='bubble'?'speechText':'chatStatus',e.message,true);}})();
})();




