'use strict';
const fs = require('node:fs');
const path = require('node:path');
const DEFAULTS = {
  provider: 'ollama', endpoint: 'http://127.0.0.1:11434', model: '',
  name: 'コンパニオン', persona: 'あなたはデスクトップに住む親しみやすい相棒です。日本語で自然に会話してください。返答は基本的に短く、相手の話をよく聞いてください。',
  temperature: 0.7, historyTurns: 12, modelPath: '', scale: 1, angle: 0, angleX: 0, angleY: 0, angleZ: 0, topmost: true, inputX: null, inputY: null, lipSync: true, softIdle: true, motionStrength: 0.65, touchEnabled: true, clothDrag: true, handDrag: true, clothReach: .18, clothAngle: 80, touchZoneScale: 1, bubbleX: null, bubbleY: null, bubbleFont: 'Yu Gothic UI', bubbleFontSize: 13,
};
function cleanSettings(input = {}) {
  const s = { ...DEFAULTS };
  for (const k of ['provider','endpoint','model','name','persona','modelPath','bubbleFont']) if (typeof input[k] === 'string') s[k] = input[k].slice(0, k === 'persona' ? 12000 : 2000);
  if (!['ollama', 'lmstudio'].includes(s.provider)) throw new Error('接続方式を選んでください。');
  for (const [k,min,max] of [['temperature',0,2],['historyTurns',1,40],['scale',0.5,10.0],['angle',-180,180],['angleX',-180,180],['angleY',-180,180],['angleZ',-180,180],['motionStrength',0,1],['touchZoneScale',.75,1.4],['bubbleFontSize',8,72],['clothReach',.02,.5],['clothAngle',10,120]]) {
    if (Number.isFinite(Number(input[k]))) s[k] = Math.max(min, Math.min(max, Number(input[k])));
  }
  for(const k of ['inputX','inputY','bubbleX','bubbleY'])if(typeof input[k]==='number'&&Number.isFinite(input[k]))s[k]=Math.round(Math.max(-100000,Math.min(100000,input[k])));
  if(!Object.prototype.hasOwnProperty.call(input,'angleY'))s.angleY=s.angle;
  s.angle=s.angleY; // Retain the legacy Y axis alias.
  s.historyTurns = Math.round(s.historyTurns);
  for(const k of ['topmost','lipSync','softIdle','touchEnabled','clothDrag','handDrag'])if(typeof input[k]==='boolean')s[k]=input[k];
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
async function requestJSON(url, options = {}, timeoutMs = 180000) {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal, redirect: 'error' });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { throw new Error(`APIからJSON以外が返りました（HTTP ${r.status}）。ポート番号とサーバーを確認してください。`); }
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${String(body.error?.message || body.error || body.message || 'APIエラー').slice(0,600)}`);
    return body;
  } catch(e) {
    if (options.signal?.aborted) throw new Error('生成を停止しました。');
    if (e.name === 'TimeoutError') throw new Error('応答がタイムアウトしました。モデルの読み込みやGPUメモリを確認してください。');
    if (e.message === 'fetch failed') throw new Error('ローカルLLMに接続できません。OllamaまたはLM Studioのサーバーを起動してください。');
    throw e;
  }
}
async function listModels(settings) {
  const base = localBase(settings.endpoint);
  const r = await requestJSON(base + (settings.provider === 'ollama' ? '/api/tags' : '/v1/models'), {}, 10000);
  return (settings.provider === 'ollama' ? (r.models || []).map(m => m.name) : (r.data || []).map(m => m.id)).filter(x => typeof x === 'string');
}
async function chat(settings, history, userText, signal, {maxTokens=512,timeoutMs=180000,systemExtra=''}={}) {
  const base = localBase(settings.endpoint);
  if (!settings.model.trim()) throw new Error('設定でモデルを取得・選択してください。');
  if (settings.provider === 'ollama' && /(?:[:\-]cloud)(?:$|[:\-])/i.test(settings.model)) throw new Error('ローカル用モデルを選んでください（cloudモデルには対応しません）。');
  const messages = [{role:'system',content:`あなたの名前は「${settings.name}」です。\n${settings.persona}${systemExtra?"\n"+systemExtra:""}`}, ...history.slice(-settings.historyTurns * 2), {role:'user',content:userText}];
  const ollama = settings.provider === 'ollama';
  const body = {model:settings.model, messages, stream:false, ...(ollama ? {options:{temperature:settings.temperature,num_predict:maxTokens}} : {temperature:settings.temperature,max_tokens:maxTokens})};
  // Qwen3's optional thinking can consume the entire short reply budget.
  if (ollama && /^qwen3(?::|$)/i.test(settings.model)) body.think = false;
  const r = await requestJSON(base + (ollama ? '/api/chat' : '/v1/chat/completions'), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal},timeoutMs);
  const answer = ollama ? r.message?.content : r.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('返答が空でした。モデル設定やサーバーログを確認してください。');
  return answer.trim();
}
async function touchReply(settings,history,reaction,signal){
 const regions={head:'頭・顔',chest:'胸部',butt:'臀部',cloth:'衣服の裾',hand:'手'},gestures={poke:'軽くつつかれた',stroke:'撫でられた'},emotions={shy:'照れ・恥ずかしさ',surprised:'驚き',angry:'怒り'};
 if(!regions[reaction.region]||!gestures[reaction.gesture]||!emotions[reaction.emotion])throw new Error('反応の指定が不正です。');
 const systemExtra='デスクトップ上の触れ合いへの短い反応を演じてください。設定された性格・口調と直前の会話を踏まえ、指定の感情を声色が伝わる自然な言葉で表現してください。反応のセリフだけを日本語1〜2文、70文字以内で返してください。解説・ト書き・話者ラベルは不要です。性的な描写はせず、怒りの指定では嫌だという意思を保ち、触るよう誘わないでください。';
 const prompt=`【今起きた操作】${regions[reaction.region]}を${reaction.region==='cloth'?'軽く引っ張られた':reaction.region==='hand'?'つかんで動かされた':gestures[reaction.gesture]}。\n【感情】${emotions[reaction.emotion]}\n【胸部・臀部への連続操作回数】${reaction.count}回\nこの瞬間のあなたの短い反応は？`;
 const answer=await chat({...settings,historyTurns:Math.min(settings.historyTurns,3)},history,prompt,signal,{maxTokens:128,timeoutMs:15000,systemExtra});
 return answer.slice(0,160);
}
class Store {
  constructor(dir) { this.file = path.join(dir, 'companion.json'); this.data = {settings:{...DEFAULTS},history:[]}; }
  load() {
    if (!fs.existsSync(this.file)) return;
    const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    this.data.settings = cleanSettings(raw.settings);
    // Keep complete user/assistant turns only, never restore a dangling request.
    const items = Array.isArray(raw.history) ? raw.history : [];
    const history=[];
    for(let i=0;i+1<items.length;i+=2) if(items[i]?.role==='user' && items[i+1]?.role==='assistant' && typeof items[i].content==='string' && typeof items[i+1].content==='string') history.push(items[i],items[i+1]);
    this.data.history=history.slice(-200);
  }
  save() {
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const tmp=this.file+'.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.data,null,2),'utf8'); fs.renameSync(tmp,this.file);
  }
}
module.exports = {DEFAULTS, cleanSettings, localBase, requestJSON, listModels, chat, touchReply, Store};

