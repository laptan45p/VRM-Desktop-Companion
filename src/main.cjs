'use strict';
const relationship=require('./relationship.cjs');
const motionFiles=require('./vrma-files.cjs');
const {ApiKeys}=require('./api-keys.cjs');
const {VoiceLane,checkEmbedding}=require('./tts.cjs');
const {ReactionCounter}=require('./interaction.cjs');
const reactions=new ReactionCounter();
const {TouchResponder}=require('./touch-response.cjs');
const {app,BrowserWindow,ipcMain,dialog,Menu,Tray,nativeImage,globalShortcut,screen,safeStorage}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const {mascotBounds,popupBounds,restoreInputBounds}=require('./layout.cjs');
const {Store,cleanSettings,listModels,chat,touchReply,isCloud,llmBase}=require('./backend.cjs');
let store,keys,control,mascot,input,bubble,tray,active=null,pass=false,hovered=false,drag=null,startupError='',speech='',speechTimer=null,inputSaveTimer=null,voiceId=0,voiceAwaiting=null,voiceStatus='',wheelAnchor=null;
const touchResponses=new TouchResponder({generate:(s,h,r,signal)=>touchReply(s,h,r,signal,{apiKey:credentials(s),relationshipContext:relationship.context(relationship.current(store.data.relationships))}),publish:(text,reaction)=>{speak(text,{touch:true});broadcast({reaction});}});
const voiceLane=new VoiceLane({publish:audio=>{
 if(audio.id!==voiceId)return;voiceAwaiting=audio.id;clearTimeout(speechTimer);voiceStatus='音声の再生準備中…';broadcast({voiceStatus});
 mascot.webContents.send('update',{voiceAudio:audio});
 speechTimer=setTimeout(()=>finishVoice(audio.id,'error','音声の再生を開始できませんでした。'),15000);speechTimer.unref?.();
},fail:(id,error)=>{if(id!==voiceId)return;voiceStatus=error+' 文字で表示します。';broadcast({voiceStatus,voiceFailed:id});armSpeechTimer();}});
function cancelVoice(notify=true){voiceId=voiceLane.cancel();voiceAwaiting=null;voiceStatus='';if(notify){clearTimeout(speechTimer);if(speech)armSpeechTimer();broadcast({voiceStop:true,voiceStatus});}}
function armSpeechTimer(delay=Math.max(7000,Math.min(45000,speech.length*110))){
 clearTimeout(speechTimer);speechTimer=setTimeout(()=>{speechTimer=null;speech='';bubble.hide();broadcast({speech:''});},delay);speechTimer.unref?.();
}
function finishVoice(id,phase,error=''){
 if(id!==voiceId||voiceAwaiting!==id)return;clearTimeout(speechTimer);
 if(phase==='start'){voiceStatus='読み上げ中';speechTimer=setTimeout(()=>{cancelVoice();armSpeechTimer();},310000);speechTimer.unref?.();}
 else {voiceAwaiting=null;if(phase==='error')broadcast({voiceStop:true,voiceFailed:id});voiceStatus=phase==='error'?'音声を再生できません：'+String(error).slice(0,300):'';armSpeechTimer(7000);}
 broadcast({voiceStatus});
}
const gotLock=app.requestSingleInstanceLock();if(!gotLock)app.quit();
function credentials(settings){return isCloud(settings.provider)?keys.get(settings):'';}
const allWindows=()=>[control,mascot,input,bubble].filter(w=>w&&!w.isDestroyed());
function result(fn){return async(...args)=>{try{return {ok:true,data:await fn(...args)};}catch(e){return {ok:false,error:e.message};}};}
function broadcast(extra={}){for(const w of allWindows())w.webContents.send('update',{settings:store.data.settings,history:store.data.history,relationship:relationship.view(store.data.relationships),busy:!!active,pass,mascotVisible:mascot?.isVisible?.()!==false,...extra});}
function area(){return screen.getDisplayMatching(mascot.getBounds()).workArea;}
function positionPopups(){
 if(!mascot)return;const r=area(),m=mascot.getBounds();
 if(bubble&&!bubble.isDestroyed()){const b=bubble.getBounds();bubble.webContents.send('update',{bubbleSide:b.x+b.width/2<m.x+m.width/2?'left':'right'});}

}
function inputAreas(){return screen.getAllDisplays().map(d=>d.workArea);}
function rememberPosition(window,prefix){
 const b=window.getBounds();store.data.settings[prefix+'X']=b.x;store.data.settings[prefix+'Y']=b.y;
 clearTimeout(inputSaveTimer);inputSaveTimer=setTimeout(()=>{inputSaveTimer=null;try{store.save();}catch(e){console.error('ウィンドウの位置を保存できません:',e.message);}},200);inputSaveTimer.unref?.();
}
function recoverInput(){
 for(const w of [input,bubble]){const b=w.getBounds(),next=restoreInputBounds({x:b.x,y:b.y},b,inputAreas());if(next.x!==b.x||next.y!==b.y)w.setBounds(next,false);}
}
function resizeMascot(reset=false,anchor=null){
 if(!mascot||mascot.isDestroyed())return;
 const previous=reset?null:mascot.getBounds(),r=reset?screen.getPrimaryDisplay().workArea:area();
 const bounds=mascotBounds(store.data.settings.scale,r,previous);
 if(anchor){bounds.x=Math.round(anchor.center-bounds.width/2);bounds.y=Math.round(anchor.bottom-bounds.height);}
 mascot.setBounds(bounds,false);positionPopups();
}
function applyHit(){if(mascot&&!mascot.isDestroyed())mascot.setIgnoreMouseEvents(pass||(!hovered&&!drag),{forward:true});}
function setPass(value){touchResponses.cancel();pass=!!value;drag=null;applyHit();broadcast();}
function resetMascot(){resizeMascot(true);mascot.show();setPass(false);}
function hideMascot(){cancelVoice();touchResponses.cancel();mascot.hide();bubble.hide();input.hide();drag=null;applyHit();broadcast({mascotVisible:false});}
function hideSpeech(){cancelVoice();touchResponses.cancel();clearTimeout(speechTimer);speechTimer=null;speech='';bubble.hide();broadcast({speech:''});}
function speak(text,{thinking=false,touch=false,voice=true}={}){
 if(!touch)touchResponses.cancel();
 cancelVoice(false);clearTimeout(speechTimer);speech=String(text).slice(0,12000);
 const useVoice=!!(speech&&!thinking&&voice&&store.data.settings.ttsEnabled);
 voiceStatus=useVoice?'音声を生成中…':'';broadcast({speech,thinking,speechId:voiceId,ttsPending:useVoice,voiceStatus});positionPopups();
 if(speech){bubble.showInactive();if(!thinking){if(useVoice)voiceLane.request(voiceId,{...store.data.settings,ttsCaption:[store.data.settings.ttsCaption,relationship.caption(relationship.current(store.data.relationships))].filter(Boolean).join('。')},speech);else armSpeechTimer();}}
 else bubble.hide();
}
function showControl(tab='settings'){broadcast();control.show();control.webContents.send('update',{controlTab:tab});control.focus();}
function showInput(){
 reactions.reset();
 mascot.show();positionPopups();speak(active?'ちょっと待ってね、考え中だよ。':relationship.greeting(relationship.current(store.data.relationships)),{thinking:!!active});
 broadcast({greeting:true});input.show();input.focus();input.webContents.send('update',{focusInput:true});
}
function menu(){return Menu.buildFromTemplate([
 {label:'話しかける',click:showInput},
 {label:'設定',click:()=>showControl('settings')},
 {label:'会話履歴',click:()=>showControl('chat')},
 {label:'読み上げを停止',click:()=>{cancelVoice();armSpeechTimer();}},
 {label:'VRMを選ぶ',click:()=>selectVRM().catch(e=>speak(e.message))},
 {type:'separator'},
 {label:'マスコットを表示',click:()=>{mascot.show();applyHit();broadcast({mascotVisible:true});}},
 {label:'マスコットを隠す',click:hideMascot},
 {label:'位置をリセット',click:resetMascot},
 {label:'クリック操作を無効にする（Ctrl+Alt+M）',type:'checkbox',checked:pass,click:()=>setPass(!pass)},
 {type:'separator'},{label:'終了',click:()=>app.quit()}
]);}
async function selectVRM(){
 if(active)throw new Error('生成を停止してからVRMを変更してください。');
 const r=await dialog.showOpenDialog(mascot,{title:'VRMを選択',filters:[{name:'VRMモデル',extensions:['vrm']}],properties:['openFile']});
 if(r.canceled)return null;
 const file=r.filePaths[0];if((await fs.stat(file)).size>300*1024*1024)throw new Error('読み込み上限は300MBです。');
 if(active)throw new Error('生成を停止してからVRMを変更してください。');
 cancelVoice();touchResponses.cancel();reactions.reset();
 const previous=structuredClone(store.data);
 store.data.history=relationship.forModel(store.data.relationships,file,path.basename(file,path.extname(file)),store.data.history);store.data.settings.modelPath=file;
 try{store.save();}catch(e){store.data=previous;throw e;}mascot.show();broadcast({reloadVRM:true});return file;
}
if(gotLock)app.whenReady().then(async()=>{
 app.setAppUserModelId('local.vrm.desktop.companion');store=new Store(app.getPath('userData'));keys=new ApiKeys(app.getPath('userData'),safeStorage);
 try{keys.load();}catch{startupError='APIキーの保存データを読み込めません。クラウド利用時は登録し直してください。';}
 try{store.load();}catch(e){startupError='保存データを読み込めませんでした。設定を確認してください。';try{await fs.copyFile(store.file,store.file+'.backup-'+Date.now());}catch{}}
 store.data.relationships=relationship.clean(store.data.relationships,store.data.settings.name);
 if(store.data.settings.modelPath&&!store.data.relationships.bindings.length)relationship.select(store.data.relationships,store.data.relationships.active,store.data.settings.modelPath,store.data.history);
 const webPreferences={preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,autoplayPolicy:'no-user-gesture-required'};
 control=new BrowserWindow({width:570,height:850,minWidth:480,minHeight:650,show:false,title:'VRM Desktop Companion — 設定・履歴',backgroundColor:'#f5f5f3',webPreferences});
 const r=screen.getPrimaryDisplay().workArea;
 mascot=new BrowserWindow({...mascotBounds(store.data.settings.scale,r),show:false,transparent:true,frame:false,resizable:false,hasShadow:false,alwaysOnTop:store.data.settings.topmost,skipTaskbar:true,backgroundColor:'#00000000',webPreferences});
 const inputInitial=popupBounds(mascot.getBounds(),390,224,r,'input');
 const inputLocation=restoreInputBounds({x:store.data.settings.inputX,y:store.data.settings.inputY},inputInitial,inputAreas());
 input=new BrowserWindow({...inputLocation,minWidth:320,minHeight:190,show:false,resizable:false,autoHideMenuBar:true,title:'話しかける',alwaysOnTop:store.data.settings.topmost,skipTaskbar:true,backgroundColor:'#f7f5ee',webPreferences});
 const bubbleInitial=popupBounds(mascot.getBounds(),320,160,r,'bubble');
 const bubbleLocation=restoreInputBounds({x:store.data.settings.bubbleX,y:store.data.settings.bubbleY},bubbleInitial,inputAreas());
 bubble=new BrowserWindow({...bubbleLocation,show:false,transparent:true,frame:false,resizable:false,hasShadow:false,alwaysOnTop:store.data.settings.topmost,skipTaskbar:true,backgroundColor:'#00000000',webPreferences});
 for(const w of allWindows()){w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());}
 control.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_d,cb)=>cb({cancel:true}));
 control.webContents.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
 await Promise.all([control.loadFile(path.join(__dirname,'index.html'),{query:{view:'control'}}),mascot.loadFile(path.join(__dirname,'index.html'),{query:{view:'mascot'}}),input.loadFile(path.join(__dirname,'index.html'),{query:{view:'input'}}),bubble.loadFile(path.join(__dirname,'index.html'),{query:{view:'bubble'}})]);
 for(const w of [control,input,bubble])w.on('close',e=>{if(!app.isQuitting){e.preventDefault();w.hide();}});
 mascot.on('close',e=>{if(!app.isQuitting){e.preventDefault();hideMascot();}});
 input.on('move',()=>rememberPosition(input,'input'));
 bubble.on('move',()=>{rememberPosition(bubble,'bubble');positionPopups();});
 mascot.on('move',positionPopups);
 screen.on('display-metrics-changed',()=>{resizeMascot();recoverInput();});screen.on('display-removed',()=>{resizeMascot();recoverInput();});
 tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'tray.png')));tray.setToolTip('VRM Desktop Companion');
 tray.on('click',()=>tray.popUpContextMenu(menu()));tray.on('right-click',()=>tray.popUpContextMenu(menu()));
 if(!globalShortcut.register('CommandOrControl+Alt+M',()=>setPass(!pass)))startupError+=' Ctrl+Alt+Mを登録できませんでした。';
 if(!globalShortcut.register('CommandOrControl+Alt+C',showInput))startupError+=' Ctrl+Alt+Cを登録できませんでした。';
 resizeMascot();applyHit();mascot.showInactive();if(startupError)speak(startupError,{voice:false});
});
app.on('second-instance',()=>{if(input)showInput();});
app.on('before-quit',()=>{app.isQuitting=true;cancelVoice(false);touchResponses.cancel();active?.abort();clearTimeout(speechTimer);if(inputSaveTimer){clearTimeout(inputSaveTimer);try{store.save();}catch{}}});
app.on('will-quit',()=>globalShortcut.unregisterAll());app.on('window-all-closed',()=>app.quit());
function handle(channel,fn,only){ipcMain.handle(channel,result(async(e,...args)=>{if(!allWindows().some(w=>w.webContents===e.sender)||only&&e.sender!==only()?.webContents)throw new Error('不明なウィンドウです。');return fn(...args);}));}
handle('state',()=>({...store.data,relationships:undefined,relationship:relationship.view(store.data.relationships),busy:!!active,pass,mascotVisible:mascot?.isVisible?.()!==false,startupError,dataPath:store.file,speech,voiceStatus}));
handle('save',settings=>{
 if(active)throw new Error('生成を停止してから設定を変更してください。');
 const cleaned=cleanSettings(settings);if(isCloud(cleaned.provider))llmBase(cleaned);
 cancelVoice();touchResponses.cancel();clearTimeout(speechTimer);if(speech)armSpeechTimer();
 store.data.settings=cleanSettings({...settings,speakerPath:store.data.settings.speakerPath,modelPath:store.data.settings.modelPath,motionFolder:store.data.settings.motionFolder,inputX:store.data.settings.inputX,inputY:store.data.settings.inputY,bubbleX:store.data.settings.bubbleX,bubbleY:store.data.settings.bubbleY});store.save();
 for(const w of [mascot,input,bubble])w.setAlwaysOnTop(store.data.settings.topmost);resizeMascot();broadcast();return store.data.settings;
});
handle('choose-speaker',async()=>{
 const r=await dialog.showOpenDialog(control,{title:'Speaker Embeddingを選択',filters:[{name:'Speaker Embedding',extensions:['safetensors']}],properties:['openFile']});if(r.canceled)return null;
 const file=await checkEmbedding(r.filePaths[0]),previous=store.data.settings;cancelVoice();store.data.settings={...previous,speakerPath:file};
 try{store.save();}catch(e){store.data.settings=previous;throw e;}broadcast();return file;
},()=>control);
handle('voice-state',(id,phase,error)=>{if(!Number.isSafeInteger(id)||!['start','ended','error'].includes(phase))throw new Error('音声状態が不正です。');finishVoice(id,phase,error);},()=>mascot);
handle('choose-motions',async()=>{
 const r=await dialog.showOpenDialog(control,{title:'VRMAモーションフォルダーを選択',properties:['openDirectory']});if(r.canceled)return null;
 const folder=await motionFiles.findFolder(r.filePaths[0]),names=await motionFiles.catalog(folder),previous=store.data.settings;
 store.data.settings={...previous,motionFolder:folder,greetingMotion:names.includes(previous.greetingMotion)?previous.greetingMotion:names.find(n=>/02|greet|挨拶/i.test(n))||names[0]};
 try{store.save();}catch(e){store.data.settings=previous;throw e;}broadcast({reloadMotions:true});return names;
},()=>control);
handle('motion-list',()=>motionFiles.catalog(store.data.settings.motionFolder));
handle('motion-data',name=>motionFiles.readMotion(store.data.settings.motionFolder,name),()=>mascot);
handle('key-status',s=>{s=cleanSettings(s);return {saved:isCloud(s.provider)&&keys.has(s),available:keys.available()};},()=>control);
handle('key-save',(s,key)=>{if(active)throw new Error('生成を停止してからAPIキーを変更してください。');s=cleanSettings(s);touchResponses.cancel();keys.set(s,key);return {saved:true};},()=>control);
handle('key-delete',s=>{if(active)throw new Error('生成を停止してからAPIキーを変更してください。');s=cleanSettings(s);touchResponses.cancel();keys.delete(s);return {saved:false};},()=>control);
handle('models',s=>{s=cleanSettings(s);return listModels(s,{apiKey:credentials(s)});},()=>control);handle('choose-vrm',selectVRM);
handle('vrm',async()=>{const p=store.data.settings.modelPath;if(!p)return null;if((await fs.stat(p)).size>300*1024*1024)throw new Error('VRMが300MBを超えています。');return new Uint8Array(await fs.readFile(p));});
handle('touch',(region,gesture)=>{
 if(pass||!store.data.settings.touchEnabled||region==='cloth'&&!store.data.settings.clothDrag||region==='hand'&&!store.data.settings.handDrag)return;
 const reaction=reactions.perform(region,gesture,Date.now());if(!reaction)return;
 if(!active)speak('',{touch:true});
 if(!active){const previous=store.data.relationships;const next=structuredClone(previous);next.profiles[next.profiles.findIndex(p=>p.id===next.active)]=relationship.touch(relationship.current(next),reaction);store.data.relationships=next;try{store.save();}catch(e){store.data.relationships=previous;throw e;}}
 if(relationship.mood(relationship.current(store.data.relationships))==='angry')reaction.emotion='angry';
 const text=reaction.emotion==='angry'?'もう、嫌だって言ってるよ。':region==='hand'?'わっ、手を持ち上げたの？':region==='cloth'?'わっ、裾を引っ張らないでね！':reaction.emotion==='angry'?'もう、そこは触らないで！':region!=='head'?'えっ…そこは、恥ずかしいよ。':gesture==='stroke'?'えへへ…くすぐったいよ。':'わっ、びっくりした！';
 broadcast({reaction});
 if(active)return;
 touchResponses.request({...store.data.settings},store.data.history.slice(),reaction,text);
},()=>mascot);
handle('hit',value=>{hovered=!!value;applyHit();},()=>mascot);
handle('drag',(phase,x,y)=>{
 if(pass)return;if(!['start','move','end'].includes(phase)||!Number.isFinite(x)||!Number.isFinite(y))throw new Error('移動座標が不正です。');
 if(phase==='start')drag={x,y,bounds:mascot.getBounds()};
 else if(drag&&phase==='move'){const b={...drag.bounds,x:Math.round(drag.bounds.x+x-drag.x),y:Math.round(drag.bounds.y+y-drag.y)};mascot.setBounds(b,false);}
 else if(phase==='end')drag=null;applyHit();
},()=>mascot);
handle('zoom',delta=>{
 if(typeof delta!=='number'||!Number.isFinite(delta)||Math.abs(delta)>300)throw new Error('拡大縮小の値が不正です。');
 if(pass||delta===0)return store.data.settings.scale;
 const previous=store.data.settings,next=Math.max(.5,Math.min(10,Math.round(previous.scale*Math.exp(-delta*.001)*1000)/1000));
 if(next===previous.scale)return next;
 store.data.settings={...previous,scale:next};
 try{store.save();}catch(e){store.data.settings=previous;throw e;}
 const bounds=mascot.getBounds();
 if(!wheelAnchor||['x','y','width','height'].some(k=>wheelAnchor.bounds[k]!==bounds[k]))wheelAnchor={center:bounds.x+bounds.width/2,bottom:bounds.y+bounds.height,bounds};
 resizeMascot(false,wheelAnchor);wheelAnchor.bounds=mascot.getBounds();broadcast();return next;
},()=>mascot);
handle('orientation',angles=>{
 if(pass)return store.data.settings;
 if(!angles||!['angleX','angleY','angleZ'].every(k=>typeof angles[k]==='number'&&Number.isFinite(angles[k])&&Math.abs(angles[k])<=180))throw new Error('回転角度が不正です。');
 const previous=store.data.settings;store.data.settings=cleanSettings({...previous,angleX:angles.angleX,angleY:angles.angleY,angleZ:angles.angleZ});
 try{store.save();}catch(e){store.data.settings=previous;throw e;}
 broadcast();return store.data.settings;
},()=>mascot);
handle('bubble-size',(height)=>{if(!Number.isFinite(height))return;const r=area(),h=Math.min(Math.max(90,Math.round(height)),380,r.height);bubble.setBounds({...bubble.getBounds(),height:h,width:Math.min(320,r.width)},false);positionPopups();},()=>bubble);
handle('model-status',text=>{if(typeof text==='string'&&text)speak(text.slice(0,1000),{voice:false});},()=>mascot);
async function converse(text,{confess=false}={}){
 if(active)throw new Error('返答を生成中です。');if(typeof text!=='string'||!text.trim()||text.length>8000)throw new Error('メッセージは1〜8000文字で入力してください。');
 const request=new AbortController();active=request;broadcast({mood:'thinking'});speak('うーん、考え中…',{thinking:true});
 const prepared=relationship.prepare(relationship.current(store.data.relationships),text.trim(),{confess});
 try{
  const fallback={accepted:'私も、あなたのことが好き。これから恋人として、よろしくね。','not-ready':'気持ちは嬉しいよ。もう少しお互いを知ってから、考えさせてね。',wait:'気持ちは受け取っているよ。今は急がず、ゆっくりお話ししよう。',disabled:'大切な友達として、これからもお話ししようね。',already:'うん。これからも、よろしくね。'};
  const answer=confess&&!store.data.settings.model?fallback[prepared.event]:await chat({...store.data.settings},store.data.history,text.trim(),request.signal,{apiKey:credentials(store.data.settings),systemExtra:relationship.context(prepared.profile,prepared.event)});
  if(request.signal.aborted)throw new Error('生成を停止しました。');
  const previous=structuredClone(store.data);store.data.history=[...store.data.history,{role:'user',content:text.trim()},{role:'assistant',content:answer}].slice(-200);
  store.data.relationships.profiles[store.data.relationships.profiles.findIndex(p=>p.id===prepared.profile.id)]=prepared.profile;
  try{store.save();}catch(e){store.data=previous;throw new Error('会話を保存できませんでした: '+e.message);}
  const emotion=relationship.mood(prepared.profile);broadcast({reply:answer,mood:emotion,...(['shy','angry','surprised'].includes(emotion)?{reaction:{emotion}}:{})});speak(answer);return answer;
 }catch(e){speak(e.message,{voice:false});throw e;}finally{active=null;broadcast({mood:'idle'});}
}
handle('chat',text=>converse(text));
handle('confess',()=>converse('恋人になってください。',{confess:true}));
handle('relationship',(operation,value)=>{
 if(active)throw new Error('生成を停止してから関係の設定を変更してください。');
 const previous=structuredClone(store.data);cancelVoice();touchResponses.cancel();reactions.reset();
 try{
  const data=store.data.relationships;
  if(operation==='select')store.data.history=relationship.select(data,value,store.data.settings.modelPath,store.data.history);
  else if(operation==='create'){const id=relationship.create(data,value);store.data.history=relationship.select(data,id,store.data.settings.modelPath,store.data.history);}
  else if(operation==='romance'){if(typeof value!=='boolean')throw new Error('設定値が不正です。');relationship.current(data).romanceEnabled=value;}
  else throw new Error('不明な関係操作です。');
  store.save();
 }catch(e){store.data=previous;throw e;}
 hideSpeech();broadcast();return relationship.view(store.data.relationships);
},()=>control);
handle('cancel',()=>{cancelVoice();touchResponses.cancel();active?.abort();});handle('clear',()=>{touchResponses.cancel();if(active)throw new Error('生成を停止してください。');store.data.history=[];store.save();broadcast();});
handle('action',name=>{
 if(name==='test-voice'){if(!store.data.settings.ttsEnabled)throw new Error('読み上げを有効にして設定を保存してください。');speak('こんにちは。これから、この声でお話しするね。');}
 else if(name==='stop-voice'){cancelVoice();armSpeechTimer();}
 else if(name==='test-motion'){speak('こんにちは。こんな感じでお話しするよ。よろしくね。');broadcast({greeting:true});}
 else if(name==='reset-bubble'){const b=bubble.getBounds();bubble.setBounds(popupBounds(mascot.getBounds(),b.width,b.height,area(),'bubble'),false);rememberPosition(bubble,'bubble');positionPopups();}
 else if(name==='control'||name==='settings')showControl('settings');else if(name==='history')showControl('chat');else if(name==='talk')showInput();
 else if(name==='menu')menu().popup({window:mascot});else if(name==='pass')setPass(!pass);else if(name==='hide')hideMascot();
 else if(name==='close-input')input.hide();else if(name==='close-bubble')hideSpeech();else if(name==='quit')app.quit();else if(name==='reset')resetMascot();
});

