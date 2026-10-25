const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const M=require('../src/memory.cjs'),R=require('../src/relationship.cjs'),{Store,cleanSettings,DEFAULTS,organizeMemory}=require('../src/backend.cjs');
const history=n=>Array.from({length:n},(_,i)=>[{role:'user',content:'好きな食べ物はカレーです。番号'+i},{role:'assistant',content:'そうなんですね。返事'+i}]).flat();
test('memory migration and validation keep legacy history and settings; memory is isolated per relationship',()=>{
 const data=R.clean(),p=R.current(data);p.memory=M.edit(p.memory,'','カレーが好きです','preference',1000);p.affinity=45;const id=R.create(data,'別の子');R.select(data,id,'B.vrm',history(2));assert.equal(R.current(data).memory.items.length,0);R.select(data,p.id,'A.vrm',[]);assert.equal(R.current(data).memory.items[0].text,'カレーが好きです');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'companion-memory-'));try{const s=new Store(dir);s.data.relationships=data;s.data.history=history(2);s.save();const restored=new Store(dir);restored.load();assert.deepEqual(restored.data.relationships,data);assert.equal(R.current(restored.data.relationships).affinity,45);assert.deepEqual(restored.data.history,history(2));assert.equal(cleanSettings({memoryAuto:false,memoryEnabled:false}).memoryEnabled,false);}finally{fs.rmSync(dir,{recursive:true,force:true});}
 assert.equal(M.clean({items:[null,{text:4}]}).items.length,0);assert.equal(M.clean({summary:'あ'.repeat(1000)}).summary.length,600);
});
test('automatic work only runs at thresholds and summarizes turns outside short-term history',()=>{
 assert.equal(M.plan(null,history(1),12),null);assert.equal(M.plan(null,history(2),12).extractTurns.length,2);const job=M.plan(null,history(6),12);assert.equal(job.summaryTurns.length,0);assert.equal(job.extractTurns.length,6);
 const old=M.plan(null,history(10),6);assert.equal(old.summaryTurns.length,4);assert.equal(old.summaryTurns.at(-1).user,history(10)[6].content);assert.ok(!old.summaryTurns.some(t=>t.user===history(10).at(-2).content));
 assert.equal(M.plan(null,[],6,true),null);
});
test('automatic facts must quote a real user source; assistant statements, unknown IDs and invented text are discarded',()=>{
 const job=M.plan(null,history(6),12),source=job.extractTurns[0];const m=M.apply(null,job,{summary:'must not be used',facts:[{sourceId:source.id,quote:'好きな食べ物はカレーです。',kind:'preference'},{sourceId:source.id,quote:source.assistant,kind:'profile'},{sourceId:'made-up',quote:source.user,kind:'profile'},{sourceId:source.id,quote:'ピザが大好きです',kind:'preference'}]},1234);
 assert.equal(m.items.length,1);assert.equal(m.summary,'');assert.equal(m.items[0].source.type,'user');assert.equal(m.items[0].source.at,0);assert.equal(m.items[0].source.quote,'好きな食べ物はカレーです。');assert.equal(m.extracted.length,6);
 const dated=M.rememberTime(null,history(1),1000),next=M.plan(dated,history(1),6,true);assert.equal(next.extractTurns[0].at,1000);
});
test('summary, processed cursors and source information survive repeated organization without duplication',()=>{
 const job=M.plan(null,history(10),6),m=M.apply(null,job,{summary:'食べ物の好みについて話した。',facts:[]},1000);assert.equal(m.summaryAt,1000);assert.equal(m.summarized.length,4);assert.equal(M.plan(m,history(10),6,true).summaryTurns.length,0);assert.throws(()=>M.apply(null,job,{summary:'',facts:[]}),/空/);
 const repeated=M.apply(m,job,{summary:'食べ物の好みについて話した。',facts:[{sourceId:job.extractTurns[0].id,quote:'好きな食べ物はカレーです。',kind:'preference'}]});const again=M.apply(repeated,job,{summary:repeated.summary,facts:[{sourceId:job.extractTurns[0].id,quote:'好きな食べ物はカレーです。',kind:'preference'}]});assert.equal(again.items.length,1);
});
test('manual edits are attributable and deleted automatic notes cannot be resurrected by the same source',()=>{
 const job=M.plan(null,history(1),6,true),result={summary:'',facts:[{sourceId:job.extractTurns[0].id,quote:'好きな食べ物はカレーです。',kind:'preference'}]},m=M.apply(null,job,result);
 const changed=M.edit(m,m.items[0].id,'いまはラーメンが好き','preference');assert.equal(changed.items[0].source.type,'manual');assert.equal(M.apply(changed,job,result).items.length,1);
 const removed=M.remove(m,m.items[0].id);assert.equal(M.apply(removed,job,result).items.length,0);assert.throws(()=>M.remove(m,'missing'),/見つかり/);assert.throws(()=>M.edit(m,'','好きな食べ物はカレーです。'),/既に/);
});
test('clearing conversation removes summary but keeps notes; clearing memory prevents reimport from retained logs',()=>{
 const h=history(6),job=M.plan(null,h,2),m=M.apply(null,job,{summary:'カレーの話',facts:[{sourceId:job.extractTurns[0].id,quote:'好きな食べ物はカレーです。',kind:'preference'}]});
 const cleared=M.clearConversation(m,h);assert.equal(cleared.summary,'');assert.equal(cleared.items.length,1);const all=M.clearAll(m,h);assert.equal(all.items.length,0);assert.equal(M.plan(all,h,2,true),null);assert.equal(M.apply(all,{...job,summaryTurns:[]},{summary:'',facts:[{sourceId:job.extractTurns[0].id,quote:'好きな食べ物はカレーです。',kind:'preference'}]}).items.length,0);
});
test('Japanese retrieval selects related memories within a bounded context and preserves complete note text',()=>{
 let m=M.edit(null,'','好きな食べ物はカレーです','preference',100);m=M.edit(m,'','誕生日は5月10日です','profile',200);m.summary='以前、食べ物の話をしました。';
 assert.ok(M.recall(m,'好きな食べ物は覚えている？').some(i=>i.text.includes('カレー')));assert.equal(M.recall(m,'VRMの描画設定について').length,0); // An unrelated query must not import all facts.
});
test('memory JSON parsing rejects malformed output and input size stays bounded for long conversations',()=>{
 assert.deepEqual(M.parse('```json\n{"summary":"","facts":[]}\n```'),{summary:'',facts:[]});for(const answer of ['not json','{}','{"summary":"x","facts":{}}'])assert.throws(()=>M.parse(answer));
 const h=history(20).map(m=>({...m,content:m.content+'あ'.repeat(10000)})),job=M.plan(null,h,6,true);assert.ok(M.prompt(job).length<=2800);assert.ok(JSON.parse(M.prompt(job)).userSources.every(s=>s.sourceId.length===64));
});
test('worker debounce, cancellation and stale completions never commit to another conversation',async()=>{
 let done,commits=0,timer,cleared=0;const worker=new M.MemoryWorker({prepare:()=>({id:1}),generate:()=>new Promise(r=>done=r),commit:()=>commits++,setTimer:fn=>(timer={fn,unref(){}}),clearTimer:()=>cleared++});
 worker.schedule();worker.schedule();assert.equal(cleared,1);const pending=worker.run(true);worker.cancel();done({summary:'',facts:[]});await pending;assert.equal(commits,0);assert.equal(worker.status,'');
 worker.generate=async()=>({});await worker.run(true);assert.equal(commits,1);worker.generate=async()=>{throw new Error('bad JSON');};await assert.rejects(worker.run(true),/bad JSON/);assert.equal(commits,1);
});
test('memory extraction uses the selected provider and bounded independent instructions without the character persona',async()=>{
 const old=global.fetch;let body;global.fetch=async(_url,o)=>{body=JSON.parse(o.body);return new Response(JSON.stringify({message:{content:'{"summary":"","facts":[]}'}}),{headers:{'Content-Type':'application/json'}});};
 try{const s={...DEFAULTS,model:'test',persona:'秘密の性格設定',name:'キャラ名',selfPronoun:'あたし'};await organizeMemory(s,M.plan(null,history(1),6,true));assert.equal(body.options.num_predict,1024);assert.equal(body.options.temperature,.2);assert.ok(!body.messages[0].content.includes('秘密の性格設定'));assert.ok(!body.messages[0].content.includes('あたし'));const input=JSON.parse(body.messages[1].content);assert.equal(input.userSources.length,1);assert.equal(input.olderConversation.length,0);assert.equal(input.userSources[0].text,history(1)[0].content);}finally{global.fetch=old;}
});

test('short follow-up questions retain relevant saved notes and empty memory still supplies grounding instructions',()=>{
 let m=M.edit(null,'','好きな食べ物はカレーです','preference',100);m=M.edit(m,'','趣味は天体観測です','preference',200);
 assert.ok(M.recall(m,'前回の会話は思い出せる？').length);assert.ok(M.recall(m,'何話した？').length);assert.ok(M.recall(m,'何を話した？').length);
 const context=M.context(m,'具体的には？',[{role:'user',content:'好きな食べ物を覚えてる？'},{role:'assistant',content:'覚えています。'}]);assert.ok(context.includes('カレー'));
 const empty=M.context(null,'前の会話は？');assert.match(empty,/具体的な根拠がなければ/);assert.match(empty,/過去のassistant/);assert.match(empty,/"conversationSummary":""/);assert.match(empty,/"relatedNotes":\[\]/);
 assert.equal(M.recall(m,'VRMの描画設定について').length,0);
});
test('automatic organization starts after two turns and exposes progress even when no lasting fact is found',()=>{
 assert.equal(M.plan(null,history(1),12),null);const job=M.plan(null,history(2),12);assert.equal(job.extractTurns.length,2);assert.equal(job.summaryTurns.length,0);
 const m=M.apply(null,job,{summary:'',facts:[]},12345),stats=M.describe(m,history(2),12);assert.equal(m.organizedAt,12345);assert.equal(m.items.length,0);assert.equal(stats.shortTermTurns,2);assert.equal(stats.pendingTurns,0);assert.equal(stats.pendingSummaryTurns,0);
 assert.equal(M.clean(JSON.parse(JSON.stringify(m))).organizedAt,12345);assert.equal(M.plan(m,history(3),2).summaryTurns.length,1);
});
test('merged notes respect target bounds without mutating sources or losing source attribution',()=>{
 let target=M.clean(),source=M.clean();for(let i=0;i<100;i++)target=M.edit(target,'','現在の記録'+i);
 source=M.edit(source,'','統合元だけの記録');source.summary='以前の話題';const snapshot=structuredClone(source),merged=M.merge(target,source);assert.equal(merged.items.length,100);assert.deepEqual(source,snapshot);assert.match(merged.summary,/以前/);
 const small=M.merge(M.edit(null,'','共通の記録'),M.edit(source,'','共通の記録'));assert.equal(small.items.length,2);assert.equal(small.items.filter(i=>i.text==='共通の記録').length,1);assert.equal(small.items.find(i=>i.text==='統合元だけの記録').source.type,'manual');
});

test('organizing legacy history excludes reasoning from assistant text and preserves the user source',()=>{
 const h=history(3);h[0].content='ユーザーの <think> という文字列';h[1].content='<think>要約に含めない処理用データ</think>返答本文';const job=M.plan(null,h,1,true),payload=JSON.parse(M.prompt(job));assert.equal(payload.olderConversation[0].assistant,'返答本文');assert.equal(payload.userSources[0].text,h[0].content);assert.equal(JSON.stringify(payload).includes('要約に含めない処理用データ'),false);assert.ok(h[1].content.includes('<think>'));
});

test('conversation restart preserves saved memory and queues unprocessed turns until both summary and extraction complete',()=>{
 let m=M.edit(null,'','紅茶が好きです','preference');m.summary='以前は本について話した。';m.summaryAt=100;
 const h=history(2),before=structuredClone(m),next=M.restartConversation(m,h);assert.deepEqual(m,before);assert.equal(next.summary,m.summary);assert.deepEqual(next.items,m.items);assert.equal(next.pending.length,4);assert.equal(M.restartConversation(next,h).pending.length,4);
 const stats=M.describe(next,[],12);assert.equal(stats.shortTermTurns,0);assert.equal(stats.archivedTurns,2);assert.equal(stats.pendingSummaryTurns,2);
 const job=M.plan(next,[],12);assert.equal(job.summaryTurns.length,2);assert.equal(job.extractTurns.length,2);const done=M.apply(next,job,{summary:'本と食べ物について話した。',facts:[{sourceId:job.extractTurns[0].id,quote:'好きな食べ物はカレーです。',kind:'preference'}]});assert.equal(done.pending.length,0);assert.equal(done.items.length,2);assert.equal(M.plan(done,[],12),null);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'restart-memory-'));try{const store=new Store(dir);R.current(store.data.relationships).memory=next;store.save();const restored=new Store(dir);restored.load();assert.deepEqual(R.current(restored.data.relationships).memory,next);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('restart overflow does not drop unprocessed data and explicit erase clears queued conversations',()=>{
 const queued=M.restartConversation(null,history(100)),snapshot=structuredClone(queued);assert.throws(()=>M.restartConversation(queued,[{role:'user',content:'追加の会話'},{role:'assistant',content:'追加の返事'}]),/100往復/);assert.deepEqual(queued,snapshot);
 const m=M.edit(M.restartConversation(null,history(2)),'','残すメモ');const erased=M.clearConversation(m,[]);assert.equal(erased.pending.length,0);assert.equal(erased.items.length,1);assert.equal(M.plan(erased,[],12,true),null);const all=M.clearAll(m,[]);assert.equal(all.pending.length,0);assert.equal(all.items.length,0);
});

test('personal facts and two-sided shared memories keep their scope and exact source quotes',()=>{
 const h=[{role:'user',content:'紅茶が好きです。'},{role:'assistant',content:'好みを教えてくれてありがとう。'},{role:'user',content:'次は一緒に映画の話をしようね。'},{role:'assistant',content:'次は映画の話をしよう。楽しみだね。'},{role:'user',content:'お話の中で一緒に星を眺めているよ。'},{role:'assistant',content:'隣で星を眺めているね。'}],job=M.plan(null,h,12,true),facts=job.extractTurns.map((p,i)=>({sourceId:p.id,scope:['user','shared','scene'][i],kind:['preference','promise','event'][i],quote:p.user,assistantQuote:p.assistant})),m=M.apply(null,job,{summary:'',facts},1234);
 assert.deepEqual(m.items.map(i=>i.scope),['user','shared','scene']);assert.equal(m.items[0].text,h[0].content);assert.equal(m.items[0].source.type,'user');assert.equal(m.items[1].source.type,'conversation');assert.equal(m.items[1].source.quote,h[2].content);assert.equal(m.items[1].source.assistantQuote,h[3].content);assert.match(m.items[2].text,/星/);
 const ctx=M.context(m,'前回の会話を覚えてる？');assert.match(ctx,/"scope":"scene"/);assert.match(ctx,/実生活の出来事へ読み替えず/);assert.match(ctx,/恋人状態はアプリ管理/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scoped-memory-'));try{const store=new Store(dir);R.current(store.data.relationships).memory=m;store.save();const loaded=new Store(dir);loaded.load();assert.deepEqual(R.current(loaded.data.relationships).memory,m);}finally{fs.rmSync(dir,{recursive:true,force:true});}
 const deleted=M.remove(m,m.items[2].id);assert.equal(M.apply(deleted,job,{summary:'',facts:[facts[2]]}).items.some(i=>i.scope==='scene'),false);
});
test('shared memories reject missing, invented, thought-only or vague evidence and invalid classifications',()=>{
 const h=[{role:'user',content:'次は一緒に映画の話をしようね。'},{role:'assistant',content:'<think>非表示の処理用データです</think>次は映画の話をしよう。楽しみだね。'},{role:'user',content:'そうしよう'},{role:'assistant',content:'映画の話をしようね。'}],job=M.plan(null,h,12,true),source=job.extractTurns[0],base={sourceId:source.id,quote:source.user,scope:'shared',kind:'promise'};
 const facts=[base,{...base,assistantQuote:'存在しない発言です'},{...base,assistantQuote:'非表示の処理用データです'},{...base,quote:'ユーザーは言っていない発言',assistantQuote:'次は映画の話をしよう。'},{...base,scope:'unknown',assistantQuote:'次は映画の話をしよう。'},{...base,scope:'scene',assistantQuote:'次は映画の話をしよう。'},{...base,sourceId:job.extractTurns[1].id,quote:'そうしよう',assistantQuote:'映画の話をしようね。'}];for(const fact of facts)assert.equal(M.apply(null,job,{summary:'',facts:[fact]}).items.length,0);
});
test('remember requests are prioritized without treating a request alone as a valid lasting fact',()=>{
 const h=history(8);h[14].content='青い花が好きなので覚えておいて';const job=M.plan(null,h,12);assert.equal(job.extractTurns[0].user,h[14].content);assert.equal(job.extractTurns.length,6);
 assert.ok(M.plan(null,h.slice(14),12));assert.equal(M.plan(null,history(1),12),null);assert.match(M.instructions,/依頼そのものだけではなく/);
 const payload=JSON.parse(M.prompt(job));assert.ok(payload.userSources.every(p=>typeof p.assistant==='string'));assert.match(M.instructions,/相棒の提案だけ/);
});
test('legacy notes migrate without reclassification and scoped manual edits, merges and deletion stay attributable',()=>{
 const legacy=M.clean({items:[{id:'old',text:'以前のメモ',kind:'profile',source:{type:'user',quote:'以前のメモ'}}]});assert.equal(legacy.items[0].scope,'user');assert.equal(legacy.items[0].source.quote,'以前のメモ');
 let m=M.edit(legacy,'','同じ言葉の記憶','event',100,'scene');m=M.edit(m,'','同じ言葉の記憶','preference',200,'user');assert.equal(m.items.length,3);
 const scene=m.items.find(i=>i.scope==='scene');m=M.edit(m,scene.id,'共有した出来事','event',300,'shared');assert.equal(m.items.find(i=>i.id===scene.id).source.type,'manual');assert.throws(()=>M.edit(m,'','不正な分類','profile',300,'bad'));
 const merged=M.merge(m,M.edit(null,'','同じ言葉の記憶','event',400,'scene'));assert.equal(merged.items.length,4);assert.equal(M.clean(JSON.parse(JSON.stringify(merged))).items.length,4);
});
