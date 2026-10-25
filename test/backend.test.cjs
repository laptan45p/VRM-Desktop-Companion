const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const os=require('node:os');const fs=require('node:fs');const path=require('node:path');
const {localBase,cleanSettings,DEFAULTS,Store,chat,touchReply,listModels,requestJSON}=require('../src/backend.cjs');
async function server(fn,run){const s=http.createServer(fn);await new Promise(r=>s.listen(0,'127.0.0.1',r));try{await run(`http://127.0.0.1:${s.address().port}`);}finally{s.closeAllConnections();await new Promise(r=>s.close(r));}}
async function readBody(req){let b='';for await(const c of req)b+=c;return JSON.parse(b);}
test('only loopback HTTP servers accepted; API suffix normalized',()=>{
 assert.equal(localBase('http://127.0.0.1:1234/v1/'),'http://127.0.0.1:1234');
 for(const u of ['https://127.0.0.1','http://example.com','http://127.0.0.1.evil.test','http://user:pass@localhost:1234','file:///etc/passwd','http://localhost:11434/api/chat','http://localhost:1234/?q=x'])assert.throws(()=>localBase(u));
});
test('Ollama model discovery and multi-turn request/response',async()=>{
 await server(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'local-model'}]}));return;}
 assert.equal(req.url,'/api/chat');const b=await readBody(req);assert.equal(b.stream,false);assert.equal(b.options.num_predict,512);assert.equal(b.messages.length,4);assert.equal(b.messages[0].role,'system');assert.equal(b.messages[3].content,'こんにちは');res.end(JSON.stringify({message:{content:'やっほー！'}}));
 },async endpoint=>{const s={...DEFAULTS,endpoint,model:'local-model'};assert.deepEqual(await listModels(s),['local-model']);assert.equal(await chat(s,[{role:'user',content:'前の質問'},{role:'assistant',content:'前の返答'}],'こんにちは'),'やっほー！');});
});
test('LM Studio endpoints and bounded conversation context',async()=>{
 await server(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/v1/models'){res.end(JSON.stringify({data:[{id:'loaded-model'}]}));return;}
 assert.equal(req.url,'/v1/chat/completions');const b=await readBody(req);assert.equal(b.messages.length,4);assert.equal(b.max_tokens,512);assert.equal(b.temperature,.7);res.end(JSON.stringify({choices:[{message:{content:'了解です'}}]}));
 },async endpoint=>{const s={...DEFAULTS,provider:'lmstudio',endpoint:endpoint+'/v1',model:'loaded-model',historyTurns:1};assert.deepEqual(await listModels(s),['loaded-model']);const h=Array.from({length:10},(_,i)=>({role:i%2?'assistant':'user',content:String(i)}));assert.equal(await chat(s,h,'次の話'),'了解です');});
});
test('error, empty response, redirect and cancellation paths',async()=>{
 await server(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/bad'){res.statusCode=404;res.end(JSON.stringify({error:'model not found'}));}else if(req.url==='/redirect'){res.writeHead(302,{Location:'https://example.com'});res.end();}else if(req.url==='/empty'){res.end('{}');}else if(req.url==='/api/chat'){res.end(JSON.stringify({message:{content:''}}));}},async endpoint=>{
 await assert.rejects(requestJSON(endpoint+'/bad'),/model not found/);
 await assert.rejects(requestJSON(endpoint+'/redirect'),/接続できません|fetch|redirect/);
 await assert.rejects(chat({...DEFAULTS,endpoint,model:'local'},[],'hi'),/空/);
 const c=new AbortController();const p=requestJSON(endpoint+'/wait',{signal:c.signal});c.abort();await assert.rejects(p,/停止/);
 await assert.rejects(requestJSON(endpoint+'/wait',{},20),/タイムアウト/);
 });
});
test('save/reload Japanese settings and complete conversation turns',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'companion-test-'));
 try{const s=new Store(dir);s.data.settings.name='白い相棒';s.data.history=[{role:'user',content:'元気？'},{role:'assistant',content:'元気だよ！'}];s.save();const s2=new Store(dir);s2.load();assert.deepEqual(s2.data,s.data);assert.ok(!fs.existsSync(s.file+'.tmp'));s2.data.history.push({role:'user',content:'未完了'});s2.save();const s3=new Store(dir);s3.load();assert.equal(s3.data.history.length,2);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('clamp settings, preserve defaults, reject unknown providers and cloud names',async()=>{
 assert.equal(cleanSettings({scale:10}).scale,10.0);assert.equal(cleanSettings({historyTurns:0}).historyTurns,1);assert.equal(cleanSettings({}).name,DEFAULTS.name);assert.throws(()=>cleanSettings({provider:'external'}));await assert.rejects(chat({...DEFAULTS,model:'model:cloud'},[],'hi'),/cloud/);
});
test('Qwen3 disables optional thinking to reserve the short reply budget',async()=>{
 await server(async(req,res)=>{const b=await readBody(req);assert.equal(b.think,false);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:{content:'こんにちは'}}));},async endpoint=>{assert.equal(await chat({...DEFAULTS,endpoint,model:'qwen3:4b'},[],'hi'),'こんにちは');});
});

test('touch replies preserve persona and recent context with bounded output on both local providers',async()=>{
 for(const provider of ['ollama','lmstudio'])await server(async(req,res)=>{
  const body=await readBody(req);assert.equal(body.model,'local-model');assert.match(body.messages[0].content,/テストの口調/);assert.match(body.messages[0].content,/70文字/);assert.equal(body.messages.length,8);assert.match(body.messages.at(-1).content,/臀部.*撫でられた/);assert.match(body.messages.at(-1).content,/怒り/);assert.match(body.messages.at(-1).content,/3回/);assert.equal(body.options?.num_predict||body.max_tokens,128);
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(provider==='ollama'?{message:{content:'もう、そこはやめてよ！'}}:{choices:[{message:{content:'もう、そこはやめてよ！'}}]}));
 },async endpoint=>{
  const history=Array.from({length:20},(_,i)=>({role:i%2?'assistant':'user',content:String(i)})),original=JSON.stringify(history);
  assert.equal(await touchReply({...DEFAULTS,provider,endpoint,model:'local-model',persona:'テストの口調'},history,{region:'butt',gesture:'stroke',emotion:'angry',count:3}),'もう、そこはやめてよ！');assert.equal(JSON.stringify(history),original);
 });
});

test('cloth reach and angle preserve new defaults and clamp saved settings',()=>{
 assert.equal(cleanSettings({}).clothReach,.18);assert.equal(cleanSettings({}).clothAngle,80);assert.equal(cleanSettings({clothReach:10,clothAngle:1000}).clothReach,.5);assert.equal(cleanSettings({clothReach:0,clothAngle:0}).clothAngle,10);assert.equal(cleanSettings({clothReach:.4,clothAngle:110}).clothAngle,110);
});


test('legacy Y orientation migrates and XYZ settings persist',()=>{
 assert.equal(cleanSettings({angle:75}).angleY,75);const s=cleanSettings({angle:-10,angleX:300,angleY:25,angleZ:-300});assert.equal(s.angleX,180);assert.equal(s.angleY,25);assert.equal(s.angleZ,-180);assert.equal(s.angle,25);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'orientation-'));try{const store=new Store(dir);store.data.settings=s;store.save();const next=new Store(dir);next.load();assert.deepEqual(next.data.settings,s);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('motion settings default to 60 seconds and survive persistence with interval bounds',()=>{
 assert.equal(DEFAULTS.motionInterval,60);assert.equal(DEFAULTS.randomMotion,true);assert.equal(DEFAULTS.greetingMotion,'VRMA_02.vrma');assert.equal(cleanSettings({motionInterval:1}).motionInterval,10);assert.equal(cleanSettings({motionInterval:99999}).motionInterval,3600);assert.equal(cleanSettings({motionInterval:'bad'}).motionInterval,60);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'motion-settings-'));try{const a=new Store(dir);a.data.settings=cleanSettings({motionFolder:'/motions',greetingMotion:'hi.vrma',motionInterval:120,randomMotion:false});a.save();const b=new Store(dir);b.load();assert.deepEqual(b.data.settings,a.data.settings);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('idle settings migrate, validate and persist',()=>{
 const old=cleanSettings({});assert.equal(old.idleMotion,'');assert.equal(old.idleMode,'loop');assert.equal(old.idleSpeed,1);assert.equal(old.idlePose,50);assert.equal(cleanSettings({idleMode:'invalid'}).idleMode,'loop');assert.equal(cleanSettings({idlePose:200,idleSpeed:100}).idlePose,100);assert.equal(cleanSettings({idleSpeed:100}).idleSpeed,3);assert.equal(cleanSettings({idlePose:-1,idleSpeed:0}).idlePose,0);assert.equal(cleanSettings({idleSpeed:0}).idleSpeed,.1);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'idle-settings-'));try{const a=new Store(dir);a.data.settings=cleanSettings({idleMotion:'pose.vrma',idleMode:'pose',idleSpeed:.5,idlePose:35});a.save();const b=new Store(dir);b.load();assert.deepEqual(b.data.settings,a.data.settings);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('voice settings migrate disabled and persist with bounded synthesis options',()=>{
 assert.equal(cleanSettings({}).ttsEnabled,false);const s=cleanSettings({ttsEnabled:true,speakerPath:'/voice.speaker.safetensors',ttsEndpoint:'http://localhost:8088',ttsSpeed:99,ttsVolume:-1,ttsTimeout:9999,ttsCaption:'やさしく'});assert.equal(s.ttsSpeed,4);assert.equal(s.ttsVolume,0);assert.equal(s.ttsTimeout,900);const dir=fs.mkdtempSync(path.join(os.tmpdir(),'voice-settings-'));try{const a=new Store(dir);a.data.settings=s;a.save();const b=new Store(dir);b.load();assert.deepEqual(b.data.settings,s);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('window positions and monitor layouts migrate, validate and persist independently',()=>{
 const s=cleanSettings({mascotX:-4000,mascotY:-2000,controlX:-1200,controlY:25,displayAreas:[{x:-1600,y:0,width:1600,height:900},{x:NaN,y:0,width:1,height:1},{x:0,y:0,width:-1,height:1}]});assert.equal(s.mascotX,-4000);assert.equal(s.controlY,25);assert.equal(s.displayAreas.length,1);assert.equal(cleanSettings({}).mascotX,null);assert.deepEqual(cleanSettings({}).displayAreas,[]);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'window-positions-'));try{const a=new Store(dir);a.data.settings=s;a.save();const b=new Store(dir);b.load();assert.deepEqual(b.data.settings,s);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});


test('NemoMix raw template is detected before generation and valid templates keep history',async()=>{
 for(const template of ['{{ .Prompt }}',' \n {{- .Prompt -}}\n','', '[INST]{{ .Prompt }}[/INST] {{ .Response }}']){
  const requests=[];
  await server(async(req,res)=>{requests.push(req.url);const body=await readBody(req);res.setHeader('Content-Type','application/json');
   if(req.url==='/api/show'){assert.equal(body.model,'HammerAI/nemomix-unleashed:12b-q4_K_M');res.end(JSON.stringify({template}));return;}
   assert.equal(req.url,'/api/chat');assert.equal(body.messages.length,4);assert.equal(body.messages[0].role,'system');assert.equal(body.messages[2].content,'前の返答');res.end(JSON.stringify({message:{content:'こんばんは'}}));
  },async endpoint=>{
   const settings={...DEFAULTS,endpoint,model:'HammerAI/nemomix-unleashed:12b-q4_K_M'},history=[{role:'user',content:'前の質問'},{role:'assistant',content:'前の返答'}];
   if(template.startsWith('[INST]')){assert.equal(await chat(settings,history,'こんばんは'),'こんばんは');assert.deepEqual(requests,['/api/show','/api/chat']);}
   else{await assert.rejects(chat(settings,history,'こんばんは'),/install_ollama\.bat.*vrm-companion-nemomix/);assert.deepEqual(requests,['/api/show']);}
  });
 }
});
test('NemoMix template inspection respects cancellation',async()=>{
 await server(()=>{},async endpoint=>{const c=new AbortController();const pending=chat({...DEFAULTS,endpoint,model:'vrm-companion-nemomix:12b-q4_K_M'},[],'hi',c.signal);c.abort();await assert.rejects(pending,/停止/);});
});


test('character addressing is optional, bounded and included in conversation system instructions',async()=>{
 assert.equal(cleanSettings({selfPronoun:' 僕 ',userAddress:' 先輩 '}).selfPronoun,'僕');assert.equal(cleanSettings({userAddress:'a'.repeat(150)}).userAddress.length,100);
 for(const fields of [{selfPronoun:'僕',userAddress:'先輩'},{selfPronoun:'',userAddress:''}])await server(async(req,res)=>{const b=await readBody(req),system=b.messages[0].content;
  if(fields.selfPronoun){assert.match(system,/一人称は「僕」/);assert.match(system,/「先輩」と呼んで/);}else{assert.ok(!system.includes('一人称は'));assert.ok(!system.includes('会話相手に呼びかける際は'));}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:{content:'はい'}}));
 },async endpoint=>{assert.equal(await chat({...DEFAULTS,endpoint,model:'local',...fields},[],'こんにちは'),'はい');});
});


test('character and user addressing have explicit roles and unsupported recollection is not treated as evidence',async()=>{
 await server(async(req,res)=>{const b=await readBody(req),system=b.messages[0].content;assert.match(system,/assistant.*キャラクター「相棒A」/);assert.match(system,/assistant（キャラクター）自身の一人称は「私」/);assert.match(system,/user（ユーザー）への呼び方は「先輩」/);assert.match(system,/自分の過去の発言だけを記憶の根拠にしない/);assert.equal(b.messages[1].content,'前回の会話を覚えてる？');assert.equal(b.messages[2].content,'覚えています');assert.equal(b.messages[3].content,'何話した？');res.end(JSON.stringify({message:{content:'確認できる記録がありません。'}}));},async endpoint=>{assert.equal(await chat({...DEFAULTS,endpoint,model:'local',name:'相棒A',selfPronoun:'私',userAddress:'先輩'},[{role:'user',content:'前回の会話を覚えてる？'},{role:'assistant',content:'覚えています'}],'何話した？'),'確認できる記録がありません。');});
});

test('llama-server reasoning controls preserve automatic formatting and return only final speech text',async()=>{
 let body;await server(async(req,res)=>{body=await readBody(req);assert.equal(body.reasoning_effort,'none');assert.equal(body.reasoning_format,'deepseek');assert.equal(body.chat_template_kwargs.enable_thinking,false);assert.equal(body.messages[2].content,'以前の返答');assert.equal(body.messages.at(-1).content,'テストの質問');res.end(JSON.stringify({choices:[{message:{content:'<think>非表示の処理用テストデータ</think>\n返答本文です。',reasoning_content:'別フィールドのテストデータ'}}]}));},async endpoint=>{
  const settings={...DEFAULTS,provider:'llamacpp',endpoint,llamaPort:Number(new URL(endpoint).port),model:'test'},history=[{role:'user',content:'以前の質問'},{role:'assistant',content:'<think>以前の処理用データ</think>以前の返答'}];assert.equal(await chat(settings,history,'テストの質問',undefined,{apiKey:'test-key'}),'返答本文です。');assert.ok(history[1].content.includes('<think>'));
 });
});
test('reasoning-only or truncated replies fail without disclosing or storing a partial thought',async()=>{
 for(const content of ['<think>非表示にする処理用データ','<think>非表示にする処理用データ</think>'])await server(async(req,res)=>{await readBody(req);res.end(JSON.stringify({message:{content}}));},async endpoint=>{await assert.rejects(chat({...DEFAULTS,endpoint,model:'local'},[],'質問'),error=>error.message.includes('返答本文を取得できません')&&!error.message.includes('非表示にする処理用データ'));});
});
