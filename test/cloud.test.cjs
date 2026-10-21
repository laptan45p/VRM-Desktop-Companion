const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {DEFAULTS,cleanSettings,llmBase,localBase,chat,touchReply,listModels}=require('../src/backend.cjs'),{ApiKeys,scope}=require('../src/api-keys.cjs');
async function fakeFetch(fn,run){const old=global.fetch;global.fetch=fn;try{await run();}finally{global.fetch=old;}}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const openai={...DEFAULTS,provider:'openai',endpoint:'https://api.openai.com/v1',model:'test-chat-model'};
test('cloud base URLs enforce HTTPS, official host and exact endpoint key scope; TTS stays loopback',()=>{
 assert.equal(cleanSettings({provider:'openai'}).model,'gpt-6-luna');assert.equal(cleanSettings({...openai,model:'chosen-model'}).model,'chosen-model');assert.equal(cleanSettings({provider:'ollama'}).model,''); assert.equal(llmBase({...openai,endpoint:'https://api.openai.com/'}),'https://api.openai.com/v1');assert.equal(llmBase({...openai,provider:'compatible',endpoint:'https://provider.example/api/v1/'}),'https://provider.example/api/v1');
 for(const endpoint of ['http://api.openai.com/v1','https://other.example/v1','https://x:y@api.openai.com/v1','https://api.openai.com/v1?key=x'])assert.throws(()=>llmBase({...openai,endpoint}));
 for(const endpoint of ['http://provider.example/v1','https://provider.example/v1#key','https://provider.example/v1/chat/completions'])assert.throws(()=>llmBase({...openai,provider:'compatible',endpoint}));
 assert.throws(()=>localBase('https://provider.example/v1'));assert.notEqual(scope(openai),scope({...openai,provider:'compatible'}));assert.notEqual(scope({...openai,provider:'compatible',endpoint:'https://provider.example/v1'}),scope({...openai,provider:'compatible',endpoint:'https://provider.example/v2'}));
});
test('OpenAI models and chat use auth, bounded history, completion budget and optional parameters',async()=>{
 const calls=[];await fakeFetch(async(url,options)=>{calls.push({url,options});assert.equal(options.headers.Authorization,'Bearer test-secret-key');assert.equal(options.redirect,'error');if(url.endsWith('/models'))return json({data:[{id:'test-chat-model'}]});return json({choices:[{message:{content:'やっほー'}}]});},async()=>{
 assert.deepEqual(await listModels(openai,{apiKey:'test-secret-key'}),['test-chat-model']);assert.equal(await chat({...openai,historyTurns:1},[{role:'user',content:'old'},{role:'assistant',content:'old'},{role:'user',content:'previous'},{role:'assistant',content:'reply'}],'こんにちは',undefined,{apiKey:'test-secret-key'}),'やっほー');
 const body=JSON.parse(calls[1].options.body);assert.equal(calls[1].url,'https://api.openai.com/v1/chat/completions');assert.equal(body.messages.length,4);assert.equal(body.max_completion_tokens,1024);assert.equal(body.max_tokens,undefined);assert.equal(body.temperature,undefined);assert.equal(body.reasoning_effort,undefined);assert.equal(body.store,false);
 await chat({...openai,cloudReasoning:'low',cloudTemperature:true},[],'hi',undefined,{apiKey:'test-secret-key'});const extra=JSON.parse(calls[2].options.body);assert.equal(extra.reasoning_effort,'low');assert.equal(extra.temperature,.7);
 });
});
test('compatible API supports custom root, manual model ID and token-parameter choice',async()=>{
 const bodies=[];await fakeFetch(async(url,o)=>{assert.equal(url,'https://provider.example/api/v1/chat/completions');bodies.push(JSON.parse(o.body));return json({choices:[{message:{content:'OK'}}]});},async()=>{
 const s={...openai,provider:'compatible',endpoint:'https://provider.example/api/v1',model:'manually-entered'};await chat(s,[],'hi',undefined,{apiKey:'test-secret-key'});await chat({...s,compatibleTokenParam:'max_completion_tokens'},[],'hi',undefined,{apiKey:'test-secret-key'});assert.equal(bodies[0].max_tokens,1024);assert.equal(bodies[0].store,undefined);assert.equal(bodies[1].max_completion_tokens,1024);
 });
});
test('cloud touch reactions use the same key and persona without sending audio or model files',async()=>{
 await fakeFetch(async(_url,o)=>{const body=JSON.parse(o.body);assert.equal(o.headers.Authorization,'Bearer test-secret-key');assert.equal(body.max_completion_tokens,1024);assert.ok(body.messages[0].content.includes('test persona'));assert.ok(body.messages.at(-1).content.includes('頭'));assert.ok(!JSON.stringify(body).includes('private-model.vrm'));return json({choices:[{message:{content:'びっくりした！'}}]});},async()=>assert.equal(await touchReply({...openai,persona:'test persona',modelPath:'private-model.vrm'},[],{region:'head',gesture:'poke',emotion:'surprised',count:1},undefined,{apiKey:'test-secret-key'}),'びっくりした！'));
});
test('cloud failures redact credentials, never retry paid requests and preserve cancellation',async()=>{
 let count=0;await fakeFetch(async()=>{count++;return json({error:{message:'invalid test-secret-key'}},401);},async()=>{await assert.rejects(chat(openai,[],'hi',undefined,{apiKey:'test-secret-key'}),e=>!e.message.includes('test-secret-key')&&e.message.includes('401'));assert.equal(count,1);});
 await fakeFetch(async(_url,o)=>new Promise((_r,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason))),async()=>{const c=new AbortController(),p=chat(openai,[],'hi',c.signal,{apiKey:'test-secret-key'});c.abort();await assert.rejects(p,/停止/);});
 await assert.rejects(chat(openai,[],'hi'),/APIキー/);
});
function safeStorage(){const key=crypto.randomBytes(32);return {isEncryptionAvailable:()=>true,encryptString:s=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([c.update(s,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),encrypted]);},decryptString:b=>{const d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8');}};}
test('key vault encrypts at rest, scopes each endpoint, reloads and deletes without settings leakage',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'api-keys-')),safe=safeStorage();try{const vault=new ApiKeys(dir,safe);vault.load();vault.set(openai,'test-secret-key');assert.ok(vault.has(openai));assert.equal(vault.get(openai),'test-secret-key');assert.ok(!fs.readFileSync(vault.file,'utf8').includes('test-secret-key'));assert.equal(vault.has({...openai,provider:'compatible'}),false);assert.throws(()=>vault.get({...openai,provider:'compatible'}),/登録/);const next=new ApiKeys(dir,safe);next.load();assert.equal(next.get(openai),'test-secret-key');next.delete(openai);assert.equal(next.has(openai),false);assert.equal(cleanSettings({apiKey:'test-secret-key'}).apiKey,undefined);assert.throws(()=>new ApiKeys(dir,safeStorage()).get(openai),/登録/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('key vault refuses plaintext fallback, unsafe key values and unreadable OS encryption',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'api-keys-'));try{for(const safe of [{isEncryptionAvailable:()=>false},{isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=>'basic_text'}])assert.throws(()=>new ApiKeys(dir,safe).set(openai,'test-secret-key'),/暗号化/);const vault=new ApiKeys(dir,safeStorage());for(const key of ['','key\nvalue','key value','キー'])assert.throws(()=>vault.set(openai,key),/確認/);vault.set(openai,'test-secret-key');const different=new ApiKeys(dir,safeStorage());different.load();assert.throws(()=>different.get(openai),/読み出せません/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

const openrouter={...DEFAULTS,provider:'openrouter',endpoint:'https://openrouter.ai/api/v1',model:'anthropic/claude-haiku-5.5'};
test('OpenRouter preset pins its base URL, preserves explicit model IDs and isolates keys',()=>{
 const cleaned=cleanSettings({provider:'openrouter',endpoint:'https://other.example/v1',model:openrouter.model});assert.equal(cleaned.endpoint,openrouter.endpoint);assert.equal(cleaned.model,openrouter.model);assert.equal(cleanSettings({provider:'openrouter'}).model,'');assert.equal(llmBase(openrouter),openrouter.endpoint);
 for(const endpoint of ['http://openrouter.ai/api/v1','https://other.example/api/v1','https://openrouter.ai/api/v1/chat/completions','https://user:key@openrouter.ai/api/v1','https://openrouter.ai/api/v1?key=secret'])assert.throws(()=>llmBase({...openrouter,endpoint}));
 assert.notEqual(scope(openrouter),scope({...openrouter,provider:'compatible'}));assert.notEqual(scope(openrouter),scope(openai));
});
test('OpenRouter lists text models and sends chat/touch context with the correct reasoning schema',async()=>{
 const bodies=[];await fakeFetch(async(url,o)=>{
  assert.equal(o.headers.Authorization,'Bearer router-secret');
  if(url.endsWith('/models'))return json({data:[{id:openrouter.model,architecture:{input_modalities:['text','image'],output_modalities:['text']}},{id:'image-only',architecture:{output_modalities:['image']}},{id:'audio-only',architecture:{input_modalities:['audio'],output_modalities:['text']}},{id:'manual-id'}]});
  assert.equal(url,openrouter.endpoint+'/chat/completions');bodies.push(JSON.parse(o.body));return json({choices:[{message:{content:'こんにちは',reasoning:'internal reasoning'}}]});
 },async()=>{
  assert.deepEqual(await listModels(openrouter,{apiKey:'router-secret'}),[openrouter.model,'manual-id']);
  await chat({...openrouter,compatibleTokenParam:'max_completion_tokens'},[],'こんにちは',undefined,{apiKey:'router-secret',systemExtra:'親密さ：信頼'});
  assert.equal(bodies[0].max_tokens,1024);assert.equal(bodies[0].max_completion_tokens,undefined);assert.equal(bodies[0].reasoning,undefined);assert.equal(bodies[0].reasoning_effort,undefined);assert.equal(bodies[0].temperature,undefined);assert.equal(bodies[0].store,undefined);assert.match(bodies[0].messages[0].content,/親密さ：信頼/);
  await chat({...openrouter,cloudReasoning:'low',cloudTemperature:true},[],'hi',undefined,{apiKey:'router-secret'});assert.deepEqual(bodies[1].reasoning,{effort:'low'});assert.equal(bodies[1].temperature,.7);
  await chat({...openrouter,cloudReasoning:'none'},[],'hi',undefined,{apiKey:'router-secret'});assert.deepEqual(bodies[2].reasoning,{enabled:false});
  assert.equal(await touchReply(openrouter,[],{region:'head',gesture:'stroke',emotion:'shy',count:0},undefined,{apiKey:'router-secret',relationshipContext:'親密さ：親しみ'}),'こんにちは');assert.match(bodies[3].messages[0].content,/親密さ：親しみ/);assert.equal(bodies[3].model,openrouter.model);
 });
});
test('OpenRouter credit/provider errors preserve readable messages, redact keys, and do not retry',async()=>{
 for(const status of [200,402,429,503]){let count=0;await fakeFetch(async()=>{count++;return json({error:{message:'router-secret: provider unavailable or insufficient credits'}},status);},async()=>{
  await assert.rejects(chat(openrouter,[],'hi',undefined,{apiKey:'router-secret'}),e=>!e.message.includes('router-secret')&&e.message.includes('provider unavailable'));
  assert.equal(count,1);
 });}
});
