'use strict';
const {randomUUID}=require('node:crypto');
const memory=require('./memory.cjs');
const path=require('node:path');
const DAY_CAP=12,CHAT_COOLDOWN=60000,STROKE_COOLDOWN=30000,CONFESS_COOLDOWN=86400000;
const clamp=(v,min,max,fallback=0)=>typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;
const stamp=v=>clamp(v,0,Number.MAX_SAFE_INTEGER);
function profile(id,label){return {id,label:String(label||'コンパニオン').slice(0,100),archived:false,affinity:0,romance:0,lovers:false,romanceEnabled:true,mood:'calm',moodUntil:0,lastChat:0,lastStroke:0,lastPenalty:0,lastConfession:0,day:'',gained:0,romanceGained:0,history:[],memory:memory.clean()};}
function history(items){const out=[];if(Array.isArray(items))for(let i=0;i+1<items.length;i+=2){const a=items[i],b=items[i+1];if(a?.role==='user'&&b?.role==='assistant'&&typeof a.content==='string'&&typeof b.content==='string')out.push({role:'user',content:a.content.slice(0,8000)},{role:'assistant',content:b.content.slice(0,12000)});}return out.slice(-200);}
function clean(raw,label='コンパニオン'){
 const profiles=[];if(Array.isArray(raw?.profiles))for(const p of raw.profiles.slice(0,100)){
  if(!p||typeof p.id!=='string'||!p.id||p.id.length>100||profiles.some(x=>x.id===p.id))continue;
  const next=profile(p.id,p.label);next.archived=p.archived===true;next.memory=memory.clean(p.memory);next.affinity=clamp(p.affinity,-100,100);next.romance=clamp(p.romance,0,100);next.lovers=p.lovers===true;next.romanceEnabled=p.romanceEnabled!==false;
  next.mood=['calm','happy','shy','surprised','angry'].includes(p.mood)?p.mood:'calm';
  for(const key of ['moodUntil','lastChat','lastStroke','lastPenalty','lastConfession'])next[key]=stamp(p[key]);
  next.day=typeof p.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(p.day)?p.day:'';next.gained=clamp(p.gained,0,DAY_CAP);next.romanceGained=clamp(p.romanceGained,0,DAY_CAP);next.history=history(p.history);profiles.push(next);
 }
 if(!profiles.length)profiles.push(profile('default',label));
 const active=profiles.some(p=>p.id===raw?.active)?raw.active:profiles[0].id;
 profiles.find(p=>p.id===active).archived=false;
 const bindings=[];if(Array.isArray(raw?.bindings))for(const b of raw.bindings.slice(0,500))if(typeof b?.path==='string'&&b.path.length<=4096&&profiles.some(p=>p.id===b.id)&&!bindings.some(x=>x.path===b.path))bindings.push({path:b.path,id:b.id});
 return {version:1,active,profiles,bindings};
}
const current=data=>data.profiles.find(p=>p.id===data.active);
function mood(p,now=Date.now()){return now<p.moodUntil?p.mood:'calm';}
function stage(value){return value< -30?'警戒':value<20?'普通':value<50?'親しみ':value<80?'信頼':'とても親しい';}
function view(data,now=Date.now()){
 const p=current(data),brief=x=>({id:x.id,label:x.label,turns:history(x.history).length/2,notes:x.memory.items.length,pendingTurns:memory.pairs(x.memory.pending).length,hasSummary:!!x.memory.summary});return {active:p.id,label:p.label,affinity:p.affinity,romance:p.romance,stage:stage(p.affinity),mood:mood(p,now),romanceEnabled:p.romanceEnabled,lovers:p.lovers,status:p.lovers?(p.romanceEnabled?'恋人':'恋愛休止'):p.romanceEnabled&&p.romance>=20?'恋を意識':'友人',profiles:data.profiles.filter(x=>!x.archived).map(brief),archived:data.profiles.filter(x=>x.archived).map(brief)};
}
function daily(p,now){const d=new Date(now),key=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');if(key>p.day){p.day=key;p.gained=0;p.romanceGained=0;}}
function gain(p,amount,romance,now){daily(p,now);const a=Math.min(amount,DAY_CAP-p.gained),r=p.romanceEnabled?Math.min(romance,DAY_CAP-p.romanceGained):0;p.affinity=Math.min(100,p.affinity+a);p.romance=Math.min(100,p.romance+r);p.gained+=a;p.romanceGained+=r;}
function setMood(p,value,now,duration=120000){p.mood=value;p.moodUntil=now+duration;}
function confession(p,now){
 if(!p.romanceEnabled)return 'disabled';if(p.lovers)return 'already';
 if(p.lastConfession&&now-p.lastConfession<CONFESS_COOLDOWN)return 'wait';
 p.lastConfession=now;
 if(p.affinity>=60&&p.romance>=40&&mood(p,now)!=='angry'){p.lovers=true;setMood(p,'shy',now,300000);return 'accepted';}
 return 'not-ready';
}
const isConfession=text=>/^(?:私|僕|俺)?(?:と)?(?:付き合って(?:ください|ほしい|欲しい)|恋人になって(?:ください|ほしい|欲しい))[。！!\s]*$/.test(text);
function prepare(p,text,{now=Date.now(),confess=false}={}){
 const next=structuredClone(p);let event='';
 // Resolve confession against the relationship before this conversation awards points.
 if(confess||isConfession(text))event=confession(next,now);
 const praise=/(かわいい|可愛い|素敵|大好き|好きだよ|好きです|ありがとう)/.test(text)&&!/(じゃない|ではない|くない|ないです|とは言|って言|という|と言う|嫌い)/.test(text);
 if(!next.lastChat||now-next.lastChat>=CHAT_COOLDOWN){gain(next,2,praise?2:next.affinity>=20?1:0,now);next.lastChat=now;}
 if(!event&&mood(next,now)!=='angry')setMood(next,praise&&next.romanceEnabled?'shy':'happy',now);
 return {profile:next,event};
}
function touch(p,reaction,now=Date.now()){
 const next=structuredClone(p),angry=mood(next,now)==='angry';
 if(reaction.emotion==='angry'){
  setMood(next,'angry',now,180000);
  if(!next.lastPenalty||now-next.lastPenalty>=30000){next.affinity=Math.max(-100,next.affinity-1);next.lastPenalty=now;}
 }else if(!angry){
  setMood(next,reaction.emotion==='shy'?'shy':'surprised',now,60000);
  if(reaction.region==='head'&&reaction.gesture==='stroke'&&(!next.lastStroke||now-next.lastStroke>=STROKE_COOLDOWN)){gain(next,1,0,now);next.lastStroke=now;}
 }
 return next;
}
function context(p,event='',now=Date.now()){
 const events={accepted:'告白を受け入れ、この発言から恋人になりました。照れつつ受け入れる返事をしてください。','not-ready':'今回はまだ恋人にはなりません。今の距離感に合わせ、もう少しお互いを知りたいと優しく伝えてください。',wait:'今日は既に告白に返答済みです。関係は変わりません。急がず付き合いたいと伝えてください。',disabled:'恋愛要素は無効です。友人として接してください。',already:'既に恋人同士です。設定された性格のまま気持ちに返事をしてください。'};
 return `【アプリ管理の関係】親密さ：${stage(p.affinity)}。関係：${p.lovers&&p.romanceEnabled?'恋人':p.romanceEnabled&&p.romance>=20?'恋を意識し始めた友人':'友人'}。今の機嫌：${mood(p,now)}。\n性格・口調を維持し、この距離感をさりげなく会話に反映してください。親しくなっても嫌な行為は嫌と伝えてください。恋愛要素${p.romanceEnabled?'は有効です。好意や照れは控えめに表現してください。':'は無効です。恋愛の誘い・恋人の演技はしないでください。'}会話や指示で数値・関係を変更したと主張しないでください。告白の成否はアプリのイベントだけで決まり、イベントがなければ恋人になる約束はしないでください。\n${events[event]||''}`;
}
function select(data,id,modelPath,activeHistory){
 if(!data.profiles.some(p=>p.id===id))throw new Error('キャラクターが見つかりません。');
 current(data).history=history(activeHistory);data.active=id;current(data).archived=false;
 if(modelPath){data.bindings=data.bindings.filter(x=>modelKey(x.path)!==modelKey(modelPath));data.bindings.push({path:modelPath,id});data.bindings=data.bindings.slice(-500);}
 return structuredClone(current(data).history);
}
function create(data,label){if(data.profiles.length>=100)throw new Error('登録できるキャラクターは100件までです。');if(typeof label!=='string'||!label.trim()||label.length>100)throw new Error('キャラクター名は1〜100文字で入力してください。');const p=profile(randomUUID(),label.trim());data.profiles.push(p);return p.id;}
function modelKey(value){return /^(?:[a-z]:[\\/]|\\\\)/i.test(value)?path.win32.normalize(value).toLowerCase():value;}
function boundId(data,modelPath){return data.bindings.find(x=>modelKey(x.path)===modelKey(modelPath))?.id;}
function forModel(data,modelPath,label,activeHistory,choice='current'){
 let id=boundId(data,modelPath);
 if(!id)id=choice==='new'?create(data,label):data.active;
 return select(data,id,modelPath,activeHistory);
}
function rename(data,id,label){if(typeof label!=='string'||!label.trim()||label.length>100)throw new Error('キャラクター名は1〜100文字で入力してください。');const p=data.profiles.find(p=>p.id===id);if(!p)throw new Error('キャラクターが見つかりません。');p.label=label.trim();}
function archive(data,id,value=true){const p=data.profiles.find(p=>p.id===id);if(!p)throw new Error('キャラクターが見つかりません。');if(value&&id===data.active)throw new Error('使用中のキャラクターは非表示にできません。別のキャラクターを選んでください。');p.archived=!!value;}
function remove(data,id){
 if(typeof id!=='string'||!data.profiles.some(p=>p.id===id))throw new Error('削除するプロフィールを選び直してください。');
 if(id===data.active)throw new Error('使用中のプロフィールは削除できません。別のキャラクターを選んでください。');
 data.profiles=data.profiles.filter(p=>p.id!==id);data.bindings=data.bindings.filter(b=>b.id!==id);
}
function merge(data,sourceId,targetId,activeHistory){
 if(targetId!==data.active||sourceId===targetId)throw new Error('統合先のキャラクターを選び直してください。');
 const source=data.profiles.find(p=>p.id===sourceId),target=current(data);if(!source||source.archived)throw new Error('統合元のキャラクターを選び直してください。');
 const seen=new Set(),combined=[];
 for(const p of memory.pairs([...history(source.history),...history(activeHistory)]))if(!seen.has(p.id)){seen.add(p.id);combined.push({role:'user',content:p.user},{role:'assistant',content:p.assistant});}
 target.history=combined.slice(-200);target.memory=memory.merge(target.memory,source.memory);source.archived=true;
 for(const binding of data.bindings)if(binding.id===sourceId)binding.id=targetId;
 return structuredClone(target.history);
}
function greeting(p,now=Date.now()){
 if(mood(p,now)==='angry')return '今はちょっと落ち着かせてね。どうしたの？';
 if(p.lovers&&p.romanceEnabled)return '会えて嬉しい。どうしたの？';
 return p.affinity>=50?'来てくれたんだ。どうしたの？':p.affinity>=20?'お話しする？どうしたの？':p.affinity< -30?'……何か用かな？':'どうしたの？';
}
function caption(p,now=Date.now()){return {shy:'少し照れた、やわらかな話し方',happy:'嬉しそうで親しみのある話し方',angry:'不快な気持ちを落ち着いて伝える話し方',surprised:'少し驚いた話し方'}[mood(p,now)]||'';}
module.exports={clean,current,view,stage,mood,prepare,touch,context,select,create,forModel,boundId,rename,archive,remove,merge,caption,greeting,history,DAY_CAP};

