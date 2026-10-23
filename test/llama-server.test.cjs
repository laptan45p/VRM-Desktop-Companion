const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {LlamaServer,launchArgs,checkFiles,freePort,MODEL}=require('../src/llama-server.cjs');
const {cleanSettings,chat,listModels,Store}=require('../src/backend.cjs');
function fixture(extra={}){
 let child,spawned=0,args,options;
 const states=[],manager=new LlamaServer({defaultExecutable:'/bin/llama-server',validate:async()=>{},checkPort:async()=>{},wait:()=>new Promise(r=>setImmediate(r)),startupTimeout:1000,
 spawnProcess:(exe,a,o)=>{spawned++;args=a;options=o;child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{setImmediate(()=>child.emit('close',0));return true;};return child;},fetchJSON:async()=>({data:[{id:MODEL}]}),onState:s=>states.push(s),...extra});
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
 assert.equal(f.spawned,1);assert.equal(f.options.shell,false);assert.equal(f.options.windowsHide,true);assert.equal(f.args[f.args.indexOf('--host')+1],'127.0.0.1');assert.equal(f.args[f.args.indexOf('--model')+1],s.llamaModelPath);assert.equal(f.args[f.args.indexOf('--parallel')+1],'1');assert.ok(f.args.includes('--dry-multiplier'));assert.ok(f.args.includes('mistral-v1'));
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
 const script=path.join(dir,'mock-server.cjs');await fs.writeFile(script,`const http=require('node:http');const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1],key=get('--api-key');http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.headers.authorization!=='Bearer '+key){res.writeHead(401);res.end('{}');return;}if(req.url==='/v1/models'){res.end(JSON.stringify({data:[{id:'companion-gguf'}]}));return;}let raw='';for await(const chunk of req)raw+=chunk;res.end(JSON.stringify({choices:[{message:{content:raw}}]}));}).listen(Number(get('--port')),'127.0.0.1');`);
 manager=new LlamaServer({defaultExecutable:process.execPath,validate:async()=>{},spawnProcess:(_exe,args,options)=>require('node:child_process').spawn(process.execPath,[script,...args],options),startupTimeout:10000});
 const s=cleanSettings({provider:'llamacpp',llamaPort:port,llamaModelPath:'/models/Qwen3.gguf'});await manager.start(s);const apiKey=manager.credentials(s);assert.deepEqual(await listModels(s,{apiKey}),[MODEL]);
 const body=JSON.parse(await chat(s,[],'こんにちは',null,{apiKey}));assert.equal(body.dry_multiplier,.8);assert.equal(body.dry_base,1.75);assert.equal(body.dry_allowed_length,2);assert.equal(body.dry_penalty_last_n,-1);assert.equal(body.repeat_penalty,1);assert.equal(body.chat_template_kwargs.enable_thinking,false);assert.equal(body.messages.at(-1).content,'こんにちは');assert.equal(body.stream,false);
 await manager.stop();assert.equal(manager.child,null);
 }finally{await manager?.stop();await fs.rm(dir,{recursive:true,force:true});}
});


test('DRY is absent from other provider requests',async()=>{
 const captured=[];const server=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;captured.push(JSON.parse(raw));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'返答'}}],message:{content:'返答'}}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{for(const provider of ['ollama','lmstudio'])await chat(cleanSettings({provider,endpoint:'http://127.0.0.1:'+server.address().port,model:'test-model'}),[],'こんにちは');for(const body of captured){assert.equal(body.dry_multiplier,undefined);assert.equal(body.chat_template_kwargs,undefined);assert.equal(body.repeat_penalty,undefined);}}
 finally{await new Promise(r=>server.close(r));}
});
