const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {LlamaServer,launchArgs,checkFiles,freePort,MODEL}=require('../src/llama-server.cjs');
const {cleanSettings,chat,listModels,Store}=require('../src/backend.cjs');
function fixture(extra={}){
 let child,spawned=0,args,options;
 const states=[],manager=new LlamaServer({defaultExecutable:'/bin/llama-server',validate:async()=>{},checkPort:async()=>{},wait:()=>new Promise(r=>setImmediate(r)),startupTimeout:1000,
 spawnProcess:(exe,a,o)=>{spawned++;args=a;options=o;child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{setImmediate(()=>child.emit('close',0));return true;};return child;},fetchJSON:async(url,key,signal,body)=>url.endsWith('/apply-template')?{prompt:body.messages.map(m=>m.content).join(' ')}:{data:[{id:MODEL}]},onState:s=>states.push(s),...extra});
 return {manager,states,get child(){return child;},get spawned(){return spawned;},get args(){return args;},get options(){return options;}};
}
test('managed llama validates configuration and persists it without affecting other providers',async()=>{
 const s=cleanSettings({provider:'llamacpp',endpoint:'https://wrong.example',model:'wrong',llamaPort:19000.7,llamaContext:999999,llamaGpuLayers:-5,llamaDryMultiplier:999,llamaDryBase:0,llamaDryAllowedLength:2.6,llamaTemplate:'mistral-v1'});
 assert.equal(s.endpoint,'http://127.0.0.1:19001');assert.equal(s.model,MODEL);assert.equal(s.llamaContext,32768);assert.equal(s.llamaGpuLayers,0);assert.equal(s.llamaDryMultiplier,3);assert.equal(s.llamaDryBase,1.01);assert.equal(s.llamaDryAllowedLength,3);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'llama-settings-'));try{const store=new Store(dir);store.data.settings=s;store.save();const restored=new Store(dir);restored.load();assert.equal(restored.data.settings.llamaTemplate,'mistral-v1');assert.equal(restored.data.settings.llamaPort,19001);}finally{await fs.rm(dir,{recursive:true,force:true});}
 assert.equal(cleanSettings({provider:'lmstudio',model:'local',endpoint:'http://localhost:1234'}).model,'local');
});
test('launch owns a loopback authenticated process, handles spaces, prevents duplicate starts and redacts logs',async()=>{
 const f=fixture(),s=cleanSettings({provider:'llamacpp',llamaModelPath:'/my models/Qwen.gguf',llamaTemplate:'mistral-v1'}),a=f.manager.start(s),b=f.manager.start(s);assert.equal(a,b);await a;
 assert.equal(f.spawned,1);assert.equal(f.options.shell,false);assert.equal(f.options.windowsHide,true);assert.equal(f.args[f.args.indexOf('--host')+1],'127.0.0.1');assert.equal(f.args[f.args.indexOf('--model')+1],s.llamaModelPath);assert.equal(f.args[f.args.indexOf('--parallel')+1],'1');assert.ok(f.args.includes('--dry-multiplier'));assert.ok(f.args.includes('mistral-v1'));assert.ok(f.args.includes('--no-jinja'));
 const key=f.manager.credentials(s);assert.equal(key.length,64);f.child.stderr.emit('data','key='+key);assert.ok(!f.manager.status().log.includes(key));assert.ok(!JSON.stringify(f.manager.status()).includes(key));
 await assert.rejects(f.manager.start(s),/停止/);await f.manager.stop();assert.equal(f.manager.status().phase,'stopped');assert.throws(()=>f.manager.credentials(s),/起動/);await f.manager.stop();await f.manager.start(s);assert.equal(f.spawned,2);await f.manager.stop();
});
test('startup cancellation before file validation completes never spawns; cancellation during loading kills its child',async()=>{
 let release;const f=fixture({validate:()=>new Promise(r=>release=r)}),starting=f.manager.start(cleanSettings({provider:'llamacpp'})),rejected=assert.rejects(starting,/中止/),stopped=f.manager.stop();release();await Promise.all([stopped,rejected]);assert.equal(f.spawned,0);assert.equal(f.manager.phase,'stopped');
 let loaded;const g=fixture({fetchJSON:()=>new Promise(r=>loaded=r)}),pending=g.manager.start(cleanSettings({provider:'llamacpp'})),checked=assert.rejects(pending,/中止/);await new Promise(r=>setImmediate(r));const stopping=g.manager.stop();loaded({data:[{id:MODEL}]});await Promise.all([stopping,checked]);assert.equal(g.manager.child,null);assert.equal(g.manager.phase,'stopped');
});
test('crash, spawn failure, timeout and occupied port remain visible and never attach to an external server',async()=>{
 const s=cleanSettings({provider:'llamacpp'}),f=fixture();await f.manager.start(s);f.child.emit('close',7);assert.equal(f.manager.phase,'error');assert.match(f.manager.error,/7/);assert.throws(()=>f.manager.credentials(s));
 const failed=fixture({spawnProcess:()=>{throw new Error('spawn denied');}});await assert.rejects(failed.manager.start(s),/spawn denied/);assert.equal(failed.manager.phase,'error');
 const timed=fixture({startupTimeout:10,fetchJSON:async()=>({data:[{id:'unrelated-model'}]})});await assert.rejects(timed.manager.start(s),/タイムアウト/);assert.equal(timed.manager.child,null);
 const occupied=fixture({checkPort:async()=>{throw new Error('port occupied');}});await assert.rejects(occupied.manager.start(s),/occupied/);assert.equal(occupied.spawned,0);
 const server=http.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await assert.rejects(freePort(server.address().port),/使用中/);}finally{await new Promise(r=>server.close(r));}
});
test('invalid models and executables fail validation before launch',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'llama-gguf-'));try{
 const exe=path.join(dir,'llama-server.exe'),model=path.join(dir,'model.gguf');await fs.writeFile(exe,'fixture');await fs.writeFile(model,'GGUFfixture');await checkFiles(exe,model);
 await fs.writeFile(model,'not a gguf');await assert.rejects(checkFiles(exe,model),/GGUF/);await assert.rejects(checkFiles(path.join(dir,'cmd.exe'),model),/実行ファイル/);await assert.rejects(checkFiles(exe,'relative.gguf'),/GGUF/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('real managed child accepts authenticated discovery and chat with DRY; normal local and cloud requests are not changed',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'llama-process-'));let manager;
 try{
 const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const script=path.join(dir,'mock-server.cjs');await fs.writeFile(script,`const http=require('node:http');const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1],key=get('--api-key');if(Number(get('--dry-penalty-last-n'))<0){console.error('invalid dry-penalty-last-n');process.exit(2);}http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.headers.authorization!=='Bearer '+key){res.writeHead(401);res.end('{}');return;}if(req.url==='/v1/models'){res.end(JSON.stringify({data:[{id:'companion-gguf'}]}));return;}let raw='';for await(const chunk of req)raw+=chunk;if(req.url==='/apply-template'){res.end(JSON.stringify({prompt:args.includes('--chat-template')&&!args.includes('--no-jinja')?get('--chat-template'):JSON.parse(raw).messages.map(m=>m.content).join(' ')}));return;}if(JSON.parse(raw).dry_penalty_last_n<0){res.writeHead(400);res.end(JSON.stringify({error:{message:'invalid dry_penalty_last_n'}}));return;}res.end(JSON.stringify({choices:[{message:{content:raw}}]}));}).listen(Number(get('--port')),'127.0.0.1');`);
 manager=new LlamaServer({defaultExecutable:process.execPath,validate:async()=>{},spawnProcess:(_exe,args,options)=>require('node:child_process').spawn(process.execPath,[script,...args],options),startupTimeout:10000});
 const s=cleanSettings({provider:'llamacpp',llamaPort:port,llamaModelPath:'/models/NemoMix-Unleashed-12B-Q4_K_M.gguf'});await manager.start(s);const apiKey=manager.credentials(s);assert.deepEqual(await listModels(s,{apiKey}),[MODEL]);
 const body=JSON.parse(await chat(s,[],'こんにちは',null,{apiKey}));assert.equal(body.dry_multiplier,.8);assert.equal(body.dry_base,1.75);assert.equal(body.dry_allowed_length,2);assert.equal(body.dry_penalty_last_n,s.llamaContext);assert.equal(body.repeat_penalty,1);assert.equal(body.chat_template_kwargs.enable_thinking,false);assert.equal(body.messages.at(-1).content,'こんにちは');assert.equal(body.stream,false);
 await manager.stop();assert.equal(manager.child,null);
 }finally{await manager?.stop();await fs.rm(dir,{recursive:true,force:true});}
});


test('DRY is absent from other provider requests',async()=>{
 const captured=[];const server=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;captured.push(JSON.parse(raw));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'返答'}}],message:{content:'返答'}}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{for(const provider of ['ollama','lmstudio'])await chat(cleanSettings({provider,endpoint:'http://127.0.0.1:'+server.address().port,model:'test-model'}),[],'こんにちは');for(const body of captured){assert.equal(body.dry_multiplier,undefined);assert.equal(body.chat_template_kwargs,undefined);assert.equal(body.repeat_penalty,undefined);}}
 finally{await new Promise(r=>server.close(r));}
});


test('DRY uses a positive configured context window accepted by the bundled llama.cpp parser',()=>{
 for(const llamaContext of [512,2048,4096,8192,32768]){
  const s=cleanSettings({provider:'llamacpp',llamaContext}),args=launchArgs(s,'test-key');
  const value=Number(args[args.indexOf('--dry-penalty-last-n')+1]);
  assert.ok(Number.isSafeInteger(value)&&value>0,'llama.cpp b11829 rejects negative DRY windows');
  assert.equal(value,Number(args[args.indexOf('--ctx-size')+1]),'DRY covers the configured context');
 }
});

test('known NemoMix filenames automatically select their chat format while explicit choices and other models are preserved',async()=>{
 const {resolveChatTemplate}=require('../src/llama-config.cjs');
 for(const file of ['/models/NemoMix-Unleashed-12B-Q4_K_M.gguf','C:\\モデル\\NemoMix-Unleashed-12B-Q8_0.gguf','/models/nemomix-unleashed-12b.gguf','/models/NEMOMIX-UNLEASHED-12B-Q5_K_M.GGUF']){
  const s=cleanSettings({provider:'llamacpp',llamaModelPath:file,llamaTemplate:'auto'}),config=resolveChatTemplate(s),args=launchArgs(s,'test-key');
  assert.equal(config.template,'mistral-v1');assert.equal(config.mode,'known-model');assert.ok(args.includes('--no-jinja'));assert.equal(args[args.indexOf('--chat-template')+1],'mistral-v1');assert.equal(s.llamaTemplate,'auto','Automatic resolution must not overwrite the saved user choice');
 }
 for(const file of ['/models/Qwen3-8B-Q4_K_M.gguf','/NemoMix-Unleashed-12B-folder/Qwen.gguf','/models/NotNemoMix-Unleashed-12B.gguf','/models/NemoMix-Unleashed-8B.gguf']){
  const s=cleanSettings({provider:'llamacpp',llamaModelPath:file}),config=resolveChatTemplate(s);assert.equal(config.template,null);assert.ok(!launchArgs(s,'test-key').includes('--chat-template'));assert.ok(!launchArgs(s,'test-key').includes('--no-jinja'));assert.match(config.help,/会話テンプレート/);
 }
 const s=cleanSettings({provider:'llamacpp',llamaModelPath:'/models/NemoMix-Unleashed-12B-Q4_K_M.gguf',llamaTemplate:'chatml'}),args=launchArgs(s,'test-key');assert.equal(resolveChatTemplate(s).mode,'manual');assert.equal(args[args.indexOf('--chat-template')+1],'chatml');
 const f=fixture();await f.manager.start({...s,llamaTemplate:'auto'});assert.equal(f.manager.status().template.template,'mistral-v1');assert.equal(f.manager.status().template.mode,'known-model');assert.equal(f.args[f.args.indexOf('--chat-template')+1],'mistral-v1');await f.manager.stop();
});


test('constant Jinja output is rejected at startup before a model is exposed as ready',async()=>{
 const s=cleanSettings({provider:'llamacpp',llamaModelPath:'/models/NemoMix-Unleashed-12B-Q4_K_M.gguf'});
 for(const literal of ['mistral-v1','mistral-v3-tekken','{{ .Prompt }}']){
  const f=fixture({fetchJSON:async url=>url.endsWith('/apply-template')?{prompt:literal}:{data:[{id:MODEL}]}});
  await assert.rejects(f.manager.start(s),/会話形式.*正しく含まれていません/);assert.equal(f.manager.phase,'error');assert.equal(f.manager.child,null);assert.equal(f.manager.status().templateVerified,false);assert.ok(f.manager.status().log.includes(literal));assert.throws(()=>f.manager.credentials(s));
 }
 const f=fixture();await f.manager.start(s);assert.equal(f.manager.status().templateVerified,true);assert.ok(f.args.includes('--no-jinja'));await f.manager.stop();
});
test('format verification rejects dropped system or history messages and respects cancellation',async()=>{
 const s=cleanSettings({provider:'llamacpp'});
 for(const indexes of [[1,2,3],[0,3],[3,2,1,0]]){
  const f=fixture({fetchJSON:async(url,key,signal,body)=>url.endsWith('/apply-template')?{prompt:indexes.map(i=>body.messages[i].content).join(' ')}:{data:[{id:MODEL}]}});
  await assert.rejects(f.manager.start(s),/会話形式/);assert.equal(f.manager.child,null);
 }
 let finish;const f=fixture({fetchJSON:async(url,key,signal,body)=>url.endsWith('/apply-template')?new Promise(resolve=>finish=()=>resolve({prompt:body.messages.map(m=>m.content).join(' ')})):{data:[{id:MODEL}]}}),pending=f.manager.start(s),rejected=assert.rejects(pending,/中止/);await new Promise(r=>setImmediate(r));const stop=f.manager.stop();finish();await Promise.all([rejected,stop]);assert.equal(f.manager.phase,'stopped');assert.equal(f.manager.child,null);
});

test('managed server disables thinking and separates reasoning while Qwen retains the embedded template',()=>{
 for(const llamaTemplate of ['auto','mistral-v1']){
  const s=cleanSettings({provider:'llamacpp',llamaModelPath:'/models/Test-Qwen3-8B.gguf',llamaTemplate}),args=launchArgs(s,'test-key');assert.equal(args[args.indexOf('--reasoning')+1],'off');assert.equal(args[args.indexOf('--reasoning-format')+1],'deepseek');
  if(llamaTemplate==='auto'){assert.equal(args.includes('--chat-template'),false);assert.equal(args.includes('--no-jinja'),false);}else assert.equal(args[args.indexOf('--chat-template')+1],'mistral-v1');
 }
});
