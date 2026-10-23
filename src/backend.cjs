'use strict';
const fs = require('node:fs');
const path = require('node:path');
const voices=require('./voice-bindings.cjs');
const characters=require('./character-bindings.cjs');
const DEFAULTS = {
  memoryEnabled: true, memoryAuto: true,
  llamaExecutable: '', llamaModelPath: '', llamaPort: 18080, llamaContext: 4096, llamaGpuLayers: 99, llamaTemplate: 'auto', llamaDryMultiplier: .8, llamaDryBase: 1.75, llamaDryAllowedLength: 2,
  cloudMaxTokens: 1024, cloudReasoning: 'auto', cloudTemperature: false, compatibleTokenParam: 'max_tokens', provider: 'ollama', endpoint: 'http://127.0.0.1:11434', model: '',
  name: 'コンパニオン', selfPronoun: '', userAddress: '', persona: 'あなたはデスクトップに住む親しみやすい相棒です。日本語で自然に会話してください。返答は基本的に短く、相手の話をよく聞いてください。',
  temperature: 0.7, historyTurns: 12, ttsEnabled: false, ttsEndpoint: 'http://127.0.0.1:8088', speakerPath: '', ttsCaption: '', ttsSpeed: 1, ttsVolume: .8, ttsTimeout: 300, modelPath: '', motionFolder: '', greetingMotion: 'VRMA_02.vrma', randomMotion: true, motionInterval: 60, idleMotion: '', idleMode: 'loop', idleSpeed: 1, idlePose: 50, scale: 1, angle: 0, angleX: 0, angleY: 0, angleZ: 0, topmost: true, inputX: null, inputY: null, mascotX: null, mascotY: null, controlX: null, controlY: null, displayAreas: [], lipSync: true, softIdle: true, motionStrength: 0.65, touchEnabled: true, clothDrag: true, handDrag: true, clothReach: .18, clothAngle: 80, touchZoneScale: 1, bubbleX: null, bubbleY: null, bubbleFont: 'Yu Gothic UI', bubbleFontSize: 13,
};
function cleanSettings(input = {}) {
  const s = { ...DEFAULTS };
  for (const k of ['llamaExecutable','llamaModelPath','provider','endpoint','model','name','persona','modelPath','bubbleFont','motionFolder','greetingMotion','idleMotion','ttsEndpoint','speakerPath','ttsCaption']) if (typeof input[k] === 'string') s[k] = input[k].slice(0, k === 'persona' ? 12000 : 2000);
  for(const k of ['selfPronoun','userAddress'])if(typeof input[k]==='string')s[k]=input[k].trim().slice(0,100);
  if (!['ollama', 'lmstudio','llamacpp','openai','openrouter','compatible'].includes(s.provider)) throw new Error('接続方式を選んでください。');
  if(s.provider==='openrouter')s.endpoint='https://openrouter.ai/api/v1';
  if(s.provider==='openai'&&!s.model.trim())s.model='gpt-6-luna';
  for (const [k,min,max] of [['llamaPort',1024,65535],['llamaContext',512,32768],['llamaGpuLayers',0,999],['llamaDryMultiplier',0,3],['llamaDryBase',1.01,3],['llamaDryAllowedLength',1,20],['temperature',0,2],['historyTurns',1,40],['scale',0.5,10.0],['angle',-180,180],['angleX',-180,180],['angleY',-180,180],['angleZ',-180,180],['motionStrength',0,1],['touchZoneScale',.75,1.4],['bubbleFontSize',8,72],['clothReach',.02,.5],['clothAngle',10,120],['motionInterval',10,3600],['idleSpeed',.1,3],['idlePose',0,100],['ttsSpeed',.25,4],['ttsVolume',0,1],['ttsTimeout',30,900],['cloudMaxTokens',128,8192]]) {
    if (Number.isFinite(Number(input[k]))) s[k] = Math.max(min, Math.min(max, Number(input[k])));
  }
  for(const k of ['inputX','inputY','bubbleX','bubbleY','mascotX','mascotY','controlX','controlY'])if(typeof input[k]==='number'&&Number.isFinite(input[k]))s[k]=Math.round(Math.max(-100000,Math.min(100000,input[k])));
  if(Array.isArray(input.displayAreas))s.displayAreas=input.displayAreas.slice(0,16).filter(r=>r&&['x','y','width','height'].every(k=>typeof r[k]==='number'&&Number.isFinite(r[k]))&&r.width>0&&r.height>0).map(r=>({x:Math.round(Math.max(-100000,Math.min(100000,r.x))),y:Math.round(Math.max(-100000,Math.min(100000,r.y))),width:Math.round(Math.max(1,Math.min(100000,r.width))),height:Math.round(Math.max(1,Math.min(100000,r.height)))}));
  if(!Object.prototype.hasOwnProperty.call(input,'angleY'))s.angleY=s.angle;
  s.angle=s.angleY; // Retain the legacy Y axis alias.
  if(['loop','pose'].includes(input.idleMode))s.idleMode=input.idleMode;
  s.cloudMaxTokens=Math.round(s.cloudMaxTokens);
  if(['auto','none','minimal','low','medium','high'].includes(input.cloudReasoning))s.cloudReasoning=input.cloudReasoning;
  if(['max_tokens','max_completion_tokens'].includes(input.compatibleTokenParam))s.compatibleTokenParam=input.compatibleTokenParam;
  if(typeof input.cloudTemperature==='boolean')s.cloudTemperature=input.cloudTemperature;
  s.historyTurns = Math.round(s.historyTurns);
  for(const k of ['llamaPort','llamaContext','llamaGpuLayers','llamaDryAllowedLength'])s[k]=Math.round(s[k]);
  if(['auto','mistral-v1','mistral-v3-tekken','chatml','llama3'].includes(input.llamaTemplate))s.llamaTemplate=input.llamaTemplate;
  if(s.provider==='llamacpp'){s.endpoint=require('./llama-server.cjs').endpoint(s);s.model=require('./llama-server.cjs').MODEL;}
  for(const k of ['memoryEnabled','memoryAuto','topmost','lipSync','softIdle','touchEnabled','clothDrag','handDrag','randomMotion','ttsEnabled'])if(typeof input[k]==='boolean')s[k]=input[k];
  return s;
}
function localBase(endpoint) {
  let u;
  try { u = new URL(endpoint); } catch { throw new Error('接続先URLを確認してください。'); }
  if (u.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(u.hostname) || u.username || u.password || u.search || u.hash) {
    throw new Error('接続先はこのPCの http://127.0.0.1:ポート番号 のみ指定できます。');
  }
  // APIs append their own /api or /v1 path. Accept pasted LM Studio /v1 URLs.
  if (!['/', '', '/v1', '/v1/'].includes(u.pathname)) throw new Error('接続先にはAPIのルートURLを指定してください。');
  return u.origin;
}
function isCloud(provider){return provider==='openai'||provider==='openrouter'||provider==='compatible';}
function llmBase(settings){
 if(settings.provider==='llamacpp')return require('./llama-server.cjs').endpoint(settings);
 if(!isCloud(settings.provider))return localBase(settings.endpoint);
 let u;try{u=new URL(settings.endpoint);}catch{throw new Error('接続先URLを確認してください。');}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new Error('クラウドLLMには認証情報やクエリを含まないHTTPSのベースURLを指定してください。');
 if(settings.provider==='openrouter'){
  if(u.origin!=='https://openrouter.ai'||!['/api/v1','/api/v1/'].includes(u.pathname))throw new Error('OpenRouterの接続先は https://openrouter.ai/api/v1 です。');
  return 'https://openrouter.ai/api/v1';
 }
 if(settings.provider==='openai'){
  if(u.origin!=='https://api.openai.com'||!['/','/v1','/v1/'].includes(u.pathname))throw new Error('OpenAIの接続先は https://api.openai.com/v1 です。互換APIは接続方式を切り替えてください。');
  return 'https://api.openai.com/v1';
 }
 const base=u.href.replace(/\/+$/,'');if(/\/(?:chat\/completions|models)$/.test(base))throw new Error('APIのベースURLを指定してください（例：https://example.com/v1）。');return base;
}
function authorization(settings,apiKey){
 if(settings.provider==='llamacpp'){if(!apiKey)throw new Error('llama-serverを起動してください。');return {Authorization:'Bearer '+apiKey};}
 if(!isCloud(settings.provider))return {};
 if(typeof apiKey!=='string'||!apiKey.trim()||!/^[\x21-\x7e]+$/.test(apiKey))throw new Error('この接続先のAPIキーを登録してください。');
 return {Authorization:'Bearer '+apiKey};
}
async function requestJSON(url, options = {}, timeoutMs = 180000) {
  if(options.signal?.aborted)throw new Error('生成を停止しました。');
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal, redirect: 'error' });
    let text = await r.text();const secret=options.headers?.Authorization?.replace(/^Bearer /,'');if(secret)text=text.split(secret).join('[APIキー非表示]');
    let body;
    try { body = JSON.parse(text); } catch { throw new Error(`APIからJSON以外が返りました（HTTP ${r.status}）。ポート番号とサーバーを確認してください。`); }
    if (!r.ok || body.error) throw new Error(`${!r.ok?'HTTP '+r.status:'APIエラー'}: ${String(body.error?.message || body.error || body.message || body.detail || 'APIエラー').slice(0,600)}`);
    return body;
  } catch(e) {
    if (options.signal?.aborted) throw new Error('生成を停止しました。');
    if (e.name === 'TimeoutError') throw new Error('応答がタイムアウトしました。接続先やモデルの状態を確認してください。');
    if (e.message === 'fetch failed') throw new Error('LLMに接続できません。接続先・ネットワーク、またはローカルサーバーの起動を確認してください。');
    const secret=options.headers?.Authorization?.replace(/^Bearer /,'');if(secret&&e.message?.includes(secret))throw new Error(e.message.split(secret).join('[APIキー非表示]'));
    throw e;
  }
}
async function listModels(settings,{apiKey=''}={}) {
  const base = llmBase(settings);
  const r = await requestJSON(base + (settings.provider === 'ollama' ? '/api/tags' : isCloud(settings.provider)?'/models':'/v1/models'), {headers:authorization(settings,apiKey)}, 10000);
  return (settings.provider === 'ollama' ? (r.models || []).map(m => m.name) : (r.data || []).filter(m=>settings.provider!=='openrouter'||(!Array.isArray(m.architecture?.output_modalities)||m.architecture.output_modalities.includes('text'))&&(!Array.isArray(m.architecture?.input_modalities)||m.architecture.input_modalities.includes('text'))).map(m => m.id)).filter(x => typeof x === 'string');
}
async function checkNemoChatTemplate(settings,signal){
  const info=await requestJSON(llmBase(settings)+'/api/show',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:settings.model}),signal},10000);
  if(typeof info.template!=='string'||!info.template.trim()||/^\s*{{-?\s*\.Prompt\s*-?}}\s*$/.test(info.template))throw new Error('NemoMixの会話用テンプレートが不足しています。install_ollama.batを実行して「2」を選び、導入済みモデル一覧から「vrm-companion-nemomix:12b-q4_K_M」を選択・保存してください。モデル本体の再取得は不要です。');
}
async function chat(settings, history, userText, signal, {maxTokens,timeoutMs=180000,systemExtra='',apiKey=''}={}) {
  const base = llmBase(settings),cloud=isCloud(settings.provider);maxTokens??=cloud?settings.cloudMaxTokens:512;
  if (!settings.model.trim()) throw new Error('設定でモデルを取得・選択してください。');
  if (settings.provider === 'ollama' && /(?:[:\-]cloud)(?:$|[:\-])/i.test(settings.model)) throw new Error('ローカル用モデルを選んでください（cloudモデルには対応しません）。');
  if(settings.provider==='ollama'&&/^(?:hammerai\/nemomix-unleashed:12b-q4_k_m|vrm-companion-nemomix:12b-q4_k_m|nemomix-companion:12b)$/i.test(settings.model))await checkNemoChatTemplate(settings,signal);
  const messages = [{role:'system',content:`あなたの名前は「${settings.name}」です。\n${settings.persona}${settings.selfPronoun?'\n自分を指す一人称は「'+settings.selfPronoun+'」を使ってください。':''}${settings.userAddress?'\n会話相手に呼びかける際は「'+settings.userAddress+'」と呼んでください。毎回呼びかける必要はありません。':''}${systemExtra?"\n"+systemExtra:""}`}, ...history.slice(-settings.historyTurns * 2), {role:'user',content:userText}];
  const ollama = settings.provider === 'ollama';
  const body = {model:settings.model, messages, stream:false, ...(ollama ? {options:{temperature:settings.temperature,num_predict:maxTokens}} : {temperature:settings.temperature,max_tokens:maxTokens})};
  if(settings.provider==='llamacpp')Object.assign(body,{dry_multiplier:settings.llamaDryMultiplier,dry_base:settings.llamaDryBase,dry_allowed_length:settings.llamaDryAllowedLength,dry_penalty_last_n:settings.llamaContext,repeat_penalty:1.0,chat_template_kwargs:{enable_thinking:false}});
  if(cloud){
    delete body.temperature;delete body.max_tokens;
    body[settings.provider==='openai'?'max_completion_tokens':settings.provider==='openrouter'?'max_tokens':settings.compatibleTokenParam]=maxTokens;
    if(settings.cloudTemperature)body.temperature=settings.temperature;
    if(settings.cloudReasoning!=='auto'){
      if(settings.provider==='openrouter')body.reasoning=settings.cloudReasoning==='none'?{enabled:false}:{effort:settings.cloudReasoning};
      else body.reasoning_effort=settings.cloudReasoning;
    }
    if(settings.provider==='openai')body.store=false;
  }
  // Qwen3's optional thinking can consume the entire short reply budget.
  if (ollama && /^qwen3(?::|$)/i.test(settings.model)) body.think = false;
  const r = await requestJSON(base + (ollama ? '/api/chat' : cloud?'/chat/completions':'/v1/chat/completions'), {method:'POST',headers:{'Content-Type':'application/json',...authorization(settings,apiKey)},body:JSON.stringify(body),signal},timeoutMs);
  const answer = ollama ? r.message?.content : r.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error(cloud?'返答が空でした。対応する会話モデルを選び、出力トークン上限や推論量の設定を確認してください。':'返答が空でした。モデル設定やサーバーログを確認してください。');
  return answer.trim();
}
async function touchReply(settings,history,reaction,signal,{apiKey='',relationshipContext=''}={}){
 const regions={head:'頭・顔',chest:'胸部',butt:'臀部',cloth:'衣服の裾',hand:'手'},gestures={poke:'軽くつつかれた',stroke:'撫でられた'},emotions={shy:'照れ・恥ずかしさ',surprised:'驚き',angry:'怒り'};
 if(!regions[reaction.region]||!gestures[reaction.gesture]||!emotions[reaction.emotion])throw new Error('反応の指定が不正です。');
 const systemExtra='デスクトップ上の触れ合いへの短い反応を演じてください。設定された性格・口調と直前の会話を踏まえ、指定の感情を声色が伝わる自然な言葉で表現してください。反応のセリフだけを日本語1〜2文、70文字以内で返してください。解説・ト書き・話者ラベルは不要です。性的な描写はせず、怒りの指定では嫌だという意思を保ち、触るよう誘わないでください。';
 const prompt=`【今起きた操作】${regions[reaction.region]}を${reaction.region==='cloth'?'軽く引っ張られた':reaction.region==='hand'?'つかんで動かされた':gestures[reaction.gesture]}。\n【感情】${emotions[reaction.emotion]}\n【胸部・臀部への連続操作回数】${reaction.count}回\nこの瞬間のあなたの短い反応は？`;
 const answer=await chat({...settings,historyTurns:Math.min(settings.historyTurns,3)},history,prompt,signal,{maxTokens:isCloud(settings.provider)?Math.min(settings.cloudMaxTokens,1024):128,timeoutMs:15000,systemExtra:systemExtra+"\n"+relationshipContext,apiKey});
 return answer.slice(0,160);
}
async function organizeMemory(settings,job,signal,{apiKey=''}={}){
 const memory=require('./memory.cjs');
 const answer=await chat({...settings,name:'記憶整理係',persona:memory.instructions,selfPronoun:'',userAddress:'',temperature:.2,historyTurns:1},[],memory.prompt(job),signal,{maxTokens:1024,timeoutMs:60000,apiKey});
 return memory.parse(answer);
}
class Store {
  constructor(dir) { this.file = path.join(dir, 'companion.json'); this.data = {settings:{...DEFAULTS},history:[],characterBindings:[],voiceBindings:[],relationships:require('./relationship.cjs').clean(null,DEFAULTS.name)}; }
  load() {
    if (!fs.existsSync(this.file)) return;
    const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    this.data.settings = cleanSettings(raw.settings);
    // Keep complete user/assistant turns only, never restore a dangling request.
    const items = Array.isArray(raw.history) ? raw.history : [];
    const history=[];
    for(let i=0;i+1<items.length;i+=2) if(items[i]?.role==='user' && items[i+1]?.role==='assistant' && typeof items[i].content==='string' && typeof items[i+1].content==='string') history.push(items[i],items[i+1]);
    this.data.history=history.slice(-200);
    this.data.relationships=require('./relationship.cjs').clean(raw.relationships,this.data.settings.name);
    this.data.voiceBindings=raw.voiceBindings;voices.initialize(this.data);
    this.data.characterBindings=raw.characterBindings;characters.initialize(this.data);
  }
  save() {
    characters.bind(this.data,this.data.settings.modelPath,this.data.settings);
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const tmp=this.file+'.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.data,null,2),'utf8'); fs.renameSync(tmp,this.file);
  }
}
module.exports = {isCloud,llmBase,DEFAULTS, cleanSettings, localBase, requestJSON, listModels, chat, touchReply, organizeMemory, Store};




