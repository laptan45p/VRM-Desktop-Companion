'use strict';
const {ReactionCounter}=require('./interaction.cjs');
const reactions=new ReactionCounter();
const {TouchResponder}=require('./touch-response.cjs');
const {app,BrowserWindow,ipcMain,dialog,Menu,Tray,nativeImage,globalShortcut,screen}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const {mascotBounds,popupBounds,restoreInputBounds}=require('./layout.cjs');
const {Store,cleanSettings,listModels,chat,touchReply}=require('./backend.cjs');
let store,control,mascot,input,bubble,tray,active=null,pass=false,hovered=false,drag=null,startupError='',speech='',speechTimer=null,inputSaveTimer=null;
const touchResponses=new TouchResponder({generate:touchReply,publish:(text,reaction)=>{speak(text,{touch:true});broadcast({reaction});}});
const gotLock=app.requestSingleInstanceLock();if(!gotLock)app.quit();
const allWindows=()=>[control,mascot,input,bubble].filter(w=>w&&!w.isDestroyed());
function result(fn){return async(...args)=>{try{return {ok:true,data:await fn(...args)};}catch(e){return {ok:false,error:e.message};}};}
function broadcast(extra={}){for(const w of allWindows())w.webContents.send('update',{settings:store.data.settings,history:store.data.history,busy:!!active,pass,...extra});}
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
function resizeMascot(reset=false){
 if(!mascot||mascot.isDestroyed())return;
 const previous=reset?null:mascot.getBounds(),r=reset?screen.getPrimaryDisplay().workArea:area();
 mascot.setBounds(mascotBounds(store.data.settings.scale,r,previous),false);positionPopups();
}
function applyHit(){if(mascot&&!mascot.isDestroyed())mascot.setIgnoreMouseEvents(pass||(!hovered&&!drag),{forward:true});}
function setPass(value){touchResponses.cancel();pass=!!value;drag=null;applyHit();broadcast();}
function resetMascot(){resizeMascot(true);mascot.show();setPass(false);}
function hideMascot(){touchResponses.cancel();mascot.hide();bubble.hide();input.hide();drag=null;applyHit();}
function hideSpeech(){touchResponses.cancel();clearTimeout(speechTimer);speechTimer=null;speech='';bubble.hide();broadcast({speech:''});}
function speak(text,{thinking=false,touch=false}={}){
 if(!touch)touchResponses.cancel();
 clearTimeout(speechTimer);speech=String(text).slice(0,12000);broadcast({speech,thinking});positionPopups();
 if(speech){bubble.showInactive();if(!thinking){speechTimer=setTimeout(()=>{speechTimer=null;speech='';bubble.hide();broadcast({speech:''});},Math.max(7000,Math.min(45000,speech.length*110)));speechTimer.unref?.();}}
 else bubble.hide();
}
function showControl(tab='settings'){control.show();control.webContents.send('update',{controlTab:tab});control.focus();}
function showInput(){
 reactions.reset();
 mascot.show();positionPopups();speak(active?'ちょっと待ってね、考え中だよ。':'どうしたの？',{thinking:!!active});
 broadcast({greeting:true});input.show();input.focus();input.webContents.send('update',{focusInput:true});
}
function menu(){return Menu.buildFromTemplate([
 {label:'話しかける',click:showInput},
 {label:'設定',click:()=>showControl('settings')},
 {label:'会話履歴',click:()=>showControl('chat')},
 {label:'VRMを選ぶ',click:()=>selectVRM().catch(e=>speak(e.message))},
 {type:'separator'},
 {label:'マスコットを表示',click:()=>{mascot.show();applyHit();}},
 {label:'マスコットを隠す',click:hideMascot},
 {label:'位置をリセット',click:resetMascot},
 {label:'クリック操作を無効にする（Ctrl+Alt+M）',type:'checkbox',checked:pass,click:()=>setPass(!pass)},
 {type:'separator'},{label:'終了',click:()=>app.quit()}
]);}
async function selectVRM(){
 const r=await dialog.showOpenDialog(mascot,{title:'VRMを選択',filters:[{name:'VRMモデル',extensions:['vrm']}],properties:['openFile']});
 if(r.canceled)return null;
 const file=r.filePaths[0];if((await fs.stat(file)).size>300*1024*1024)throw new Error('読み込み上限は300MBです。');
 touchResponses.cancel();reactions.reset();
 store.data.settings.modelPath=file;store.save();mascot.show();broadcast({reloadVRM:true});return file;
}
if(gotLock)app.whenReady().then(async()=>{
 app.setAppUserModelId('local.vrm.desktop.companion');store=new Store(app.getPath('userData'));
 try{store.load();}catch(e){startupError='保存データを読み込めませんでした。設定を確認してください。';try{await fs.copyFile(store.file,store.file+'.backup-'+Date.now());}catch{}}
 const webPreferences={preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true};
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
 resizeMascot();applyHit();mascot.showInactive();if(startupError)speak(startupError);
});
app.on('second-instance',()=>{if(input)showInput();});
app.on('before-quit',()=>{app.isQuitting=true;touchResponses.cancel();active?.abort();clearTimeout(speechTimer);if(inputSaveTimer){clearTimeout(inputSaveTimer);try{store.save();}catch{}}});
app.on('will-quit',()=>globalShortcut.unregisterAll());app.on('window-all-closed',()=>app.quit());
function handle(channel,fn,only){ipcMain.handle(channel,result(async(e,...args)=>{if(!allWindows().some(w=>w.webContents===e.sender)||only&&e.sender!==only()?.webContents)throw new Error('不明なウィンドウです。');return fn(...args);}));}
handle('state',()=>({...store.data,busy:!!active,pass,startupError,dataPath:store.file,speech}));
handle('save',settings=>{
 if(active)throw new Error('生成を停止してから設定を変更してください。');
 touchResponses.cancel();
 store.data.settings=cleanSettings({...settings,modelPath:store.data.settings.modelPath,inputX:store.data.settings.inputX,inputY:store.data.settings.inputY,bubbleX:store.data.settings.bubbleX,bubbleY:store.data.settings.bubbleY});store.save();
 for(const w of [mascot,input,bubble])w.setAlwaysOnTop(store.data.settings.topmost);resizeMascot();broadcast();return store.data.settings;
});
handle('models',s=>listModels(cleanSettings(s)));handle('choose-vrm',selectVRM);
handle('vrm',async()=>{const p=store.data.settings.modelPath;if(!p)return null;if((await fs.stat(p)).size>300*1024*1024)throw new Error('VRMが300MBを超えています。');return new Uint8Array(await fs.readFile(p));});
handle('touch',(region,gesture)=>{
 if(pass||!store.data.settings.touchEnabled||region==='cloth'&&!store.data.settings.clothDrag)return;
 const reaction=reactions.perform(region,gesture,Date.now());if(!reaction)return;
 const text=region==='cloth'?'わっ、裾を引っ張らないでね！':reaction.emotion==='angry'?'もう、そこは触らないで！':region!=='head'?'えっ…そこは、恥ずかしいよ。':gesture==='stroke'?'えへへ…くすぐったいよ。':'わっ、びっくりした！';
 if(!active)speak('',{touch:true});
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
handle('bubble-size',(height)=>{if(!Number.isFinite(height))return;const r=area(),h=Math.min(Math.max(90,Math.round(height)),380,r.height);bubble.setBounds({...bubble.getBounds(),height:h,width:Math.min(320,r.width)},false);positionPopups();},()=>bubble);
handle('model-status',text=>{if(typeof text==='string'&&text)speak(text.slice(0,1000));},()=>mascot);
handle('chat',async text=>{
 if(active)throw new Error('返答を生成中です。');if(typeof text!=='string'||!text.trim()||text.length>8000)throw new Error('メッセージは1〜8000文字で入力してください。');
 const request=new AbortController();active=request;broadcast({mood:'thinking'});speak('うーん、考え中…',{thinking:true});
 try{
  const answer=await chat({...store.data.settings},store.data.history,text.trim(),request.signal);if(request.signal.aborted)throw new Error('生成を停止しました。');
  const previous=store.data.history;store.data.history=[...previous,{role:'user',content:text.trim()},{role:'assistant',content:answer}].slice(-200);
  try{store.save();}catch(e){store.data.history=previous;throw new Error('会話を保存できませんでした: '+e.message);}
  broadcast({reply:answer,mood:'happy'});speak(answer);return answer;
 }catch(e){speak(e.message);throw e;}finally{active=null;broadcast({mood:'idle'});}
});
handle('cancel',()=>{touchResponses.cancel();active?.abort();});handle('clear',()=>{touchResponses.cancel();if(active)throw new Error('生成を停止してください。');store.data.history=[];store.save();broadcast();});
handle('action',name=>{
 if(name==='test-motion'){speak('こんにちは。こんな感じでお話しするよ。よろしくね。');broadcast({greeting:true});}
 else if(name==='reset-bubble'){const b=bubble.getBounds();bubble.setBounds(popupBounds(mascot.getBounds(),b.width,b.height,area(),'bubble'),false);rememberPosition(bubble,'bubble');positionPopups();}
 else if(name==='control'||name==='settings')showControl('settings');else if(name==='history')showControl('chat');else if(name==='talk')showInput();
 else if(name==='menu')menu().popup({window:mascot});else if(name==='pass')setPass(!pass);else if(name==='hide')hideMascot();
 else if(name==='close-input')input.hide();else if(name==='close-bubble')hideSpeech();else if(name==='quit')app.quit();else if(name==='reset')resetMascot();
});
