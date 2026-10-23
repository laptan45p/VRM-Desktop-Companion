const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const R=require('../src/relationship.cjs'),{Store}=require('../src/backend.cjs');
const now=new Date(2026,9,21,9).getTime(),fresh=()=>R.current(R.clean());
test('relationship stages have exact boundaries and mood expires without affinity decay',()=>{
 for(const [n,s] of [[-100,'警戒'],[-31,'警戒'],[-30,'普通'],[19,'普通'],[20,'親しみ'],[49,'親しみ'],[50,'信頼'],[79,'信頼'],[80,'とても親しい'],[100,'とても親しい']])assert.equal(R.stage(n),s);
 const p=fresh();p.affinity=80;p.mood='angry';p.moodUntil=now+100;assert.equal(R.mood(p,now),'angry');assert.equal(R.mood(p,now+101),'calm');assert.equal(p.affinity,80);assert.match(R.greeting(p,now),/落ち着かせて/);assert.match(R.greeting(p,now+101),/来てくれた/);p.lovers=true;assert.match(R.greeting(p,now+101),/会えて嬉しい/);
});
test('successful chat candidates are immutable and bounded by cooldown and local-day caps',()=>{
 const p=fresh();let n=R.prepare(p,'ありがとう',{now}).profile;assert.equal(p.affinity,0);assert.equal(n.affinity,2);assert.equal(n.romance,2);assert.equal(n.mood,'shy');
 assert.equal(R.prepare(n,'ありがとう',{now:now+59000}).profile.affinity,2);
 for(let i=1;i<30;i++)n=R.prepare(n,'ありがとう',{now:now+i*60000}).profile;
 assert.equal(n.affinity,12);assert.equal(n.romance,12);n=R.prepare(n,'ありがとう',{now:now+86400000}).profile;assert.equal(n.affinity,14);assert.equal(n.romance,14);
 const rollback=R.prepare(n,'ありがとう',{now:now+60000}).profile;assert.equal(rollback.affinity,14);
});
test('head strokes share the daily cap; anger resists head strokes and repeated penalties are throttled',()=>{
 let p=fresh();const head={region:'head',gesture:'stroke',emotion:'shy'},bad={region:'chest',gesture:'poke',emotion:'angry'};
 p=R.touch(p,head,now);assert.equal(p.affinity,1);p=R.touch(p,head,now+1);assert.equal(p.affinity,1);p=R.touch(p,bad,now+2);assert.equal(p.affinity,0);
 p=R.touch(p,bad,now+3);assert.equal(p.affinity,0);p=R.touch(p,head,now+31000);assert.equal(p.affinity,0);assert.equal(R.mood(p,now+31000),'angry');
 p=R.touch(p,bad,now+32000);assert.equal(p.affinity,-1);p=R.touch(p,head,now+300000);assert.equal(p.affinity,0);assert.equal(p.romance,0);
});
test('friendship and praise do not automatically establish romance; confession uses pre-award state',()=>{
 const p=fresh();p.affinity=100;p.romance=100;assert.equal(R.prepare(p,'大好き',{now}).profile.lovers,false);
 const accepted=R.prepare(p,'恋人になってください。',{now});assert.equal(accepted.event,'accepted');assert.equal(accepted.profile.lovers,true);assert.equal(p.lovers,false);
 p.affinity=59;p.romance=39;const notReady=R.prepare(p,'恋人になってください。',{now});assert.equal(notReady.event,'not-ready');assert.equal(notReady.profile.lovers,false);
 assert.equal(R.prepare(notReady.profile,'恋人になってください。',{now:now+100000}).event,'wait');
 assert.equal(R.prepare(p,'「恋人になってください」という台詞について教えて',{now}).event,'');
});
test('disabled romance and temporary anger block confession, and personality context carries authoritative outcomes',()=>{
 const p=fresh();p.affinity=100;p.romance=100;p.romanceEnabled=false;let n=R.prepare(p,'かわいい',{now});assert.equal(n.profile.romance,100);assert.equal(n.profile.mood,'happy');assert.equal(R.prepare(p,'付き合ってください',{now}).event,'disabled');
 p.romanceEnabled=true;p.mood='angry';p.moodUntil=now+180000;n=R.prepare(p,'付き合ってください',{now});assert.equal(n.event,'not-ready');assert.match(R.context(n.profile,n.event,now),/まだ恋人にはなりません/);assert.match(R.context(n.profile,'',now),/性格・口調を維持/);
 p.lovers=true;assert.equal(R.prepare(p,'付き合ってください',{now}).event,'already');
});
test('model bindings, alternate outfits and character histories stay isolated across persistence',()=>{
 const data=R.clean(null,'あかり'),h=[{role:'user',content:'おはよう'},{role:'assistant',content:'おはよう！'}];
 R.forModel(data,'C:/A.vrm','A',h);const first=data.active;R.current(data).affinity=45;
 assert.deepEqual(R.forModel(data,'C:/B.vrm','B',h,'new'),[]);const second=data.active;assert.notEqual(second,first);assert.equal(R.current(data).affinity,0);
 assert.deepEqual(R.select(data,first,'C:/A-outfit.vrm',[]),h);assert.equal(R.current(data).affinity,45);assert.equal(data.bindings.find(x=>x.path.endsWith('outfit.vrm')).id,first);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relations-'));try{const s=new Store(dir);s.data.relationships=data;s.data.history=h;s.save();const b=new Store(dir);b.load();assert.deepEqual(b.data.relationships,data);assert.deepEqual(b.data.history,h);assert.equal(R.current(b.data.relationships).affinity,45);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('legacy saves migrate and invalid saved relationship fields cannot escape bounds',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relations-old-'));try{const s=new Store(dir);fs.writeFileSync(s.file,JSON.stringify({settings:{name:'昔の相棒'},history:[{role:'user',content:'前'},{role:'assistant',content:'返事'}]}));s.load();assert.equal(R.current(s.data.relationships).label,'昔の相棒');assert.equal(s.data.history.length,2);assert.equal(R.current(s.data.relationships).affinity,0);}finally{fs.rmSync(dir,{recursive:true,force:true});}
 const d=R.clean({active:'no',profiles:[{id:'a',affinity:9999,romance:-99,mood:'evil',history:[{role:'user',content:'dangling'}]},{id:'a'}],bindings:[{path:'x',id:'missing'}]});assert.equal(d.active,'a');assert.equal(d.profiles.length,1);assert.equal(R.current(d).affinity,100);assert.equal(R.current(d).romance,0);assert.equal(R.current(d).mood,'calm');assert.deepEqual(R.current(d).history,[]);assert.deepEqual(d.bindings,[]);
});


test('new VRM paths share the chosen character unless new registration is explicit; Windows paths normalize',()=>{
 const data=R.clean(null,'相棒A'),h=[{role:'user',content:'趣味は読書です'},{role:'assistant',content:'覚えておきます'}],id=data.active;
 R.current(data).memory=require('../src/memory.cjs').edit(null,'','趣味は読書です');R.current(data).affinity=41;
 assert.deepEqual(R.forModel(data,'C:\\Models\\A.vrm','A',h),h);
 R.forModel(data,'C:\\Models\\A-outfit.vrm','別衣装',h);assert.equal(data.profiles.length,1);assert.equal(data.active,id);assert.equal(R.current(data).affinity,41);
 assert.equal(R.boundId(data,'c:/models/a-OUTFIT.vrm'),id);R.forModel(data,'c:/models/a-OUTFIT.vrm','同じパス',h);assert.equal(data.profiles.length,1);
 R.forModel(data,'C:\\Models\\B.vrm','相棒B',h,'new');assert.equal(data.profiles.length,2);assert.notEqual(data.active,id);assert.equal(R.current(data).memory.items.length,0);
});
test('profile merge keeps source snapshots, target relationship and VRM bindings through disk persistence',()=>{
 const M=require('../src/memory.cjs'),data=R.clean(null,'統合先'),target=data.active,h=[{role:'user',content:'現在の話題'},{role:'assistant',content:'現在の返事'}];
 R.current(data).affinity=58;R.current(data).lovers=true;R.current(data).memory=M.edit(null,'','紅茶が好きです');
 const source=R.create(data,'統合元');R.select(data,source,'C:/B.vrm',h);const sourceProfile=R.current(data);sourceProfile.affinity=3;sourceProfile.memory=M.edit(null,'','趣味は読書です');sourceProfile.memory.summary='以前は本について話しました。';
 const old=[{role:'user',content:'以前の話題'},{role:'assistant',content:'以前の返事'}];R.select(data,target,'C:/A.vrm',old);const snapshot=structuredClone(data.profiles.find(p=>p.id===source));
 const result=R.merge(data,source,target,h);assert.equal(result.length,4);assert.equal(R.current(data).affinity,58);assert.equal(R.current(data).lovers,true);assert.equal(R.current(data).memory.items.length,2);assert.match(R.current(data).memory.summary,/本/);
 assert.deepEqual({...data.profiles.find(p=>p.id===source),archived:false},snapshot);assert.equal(R.boundId(data,'C:/B.vrm'),target);assert.equal(R.view(data).profiles.length,1);assert.equal(R.view(data).archived.length,1);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'merged-relations-'));try{const store=new Store(dir);store.data.relationships=data;store.data.history=result;store.save();const loaded=new Store(dir);loaded.load();assert.deepEqual(loaded.data.relationships,data);assert.deepEqual(loaded.data.history,result);R.archive(loaded.data.relationships,source,false);assert.equal(R.view(loaded.data.relationships).profiles.length,2);assert.deepEqual(loaded.data.relationships.profiles.find(p=>p.id===source).memory,snapshot.memory);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('profile cleanup validates targets, preserves hidden data and disambiguates duplicate labels',()=>{
 const data=R.clean(null,'同じ名前'),target=data.active,source=R.create(data,'同じ名前');assert.equal(R.view(data).profiles.length,2);
 R.rename(data,target,'  分かりやすい名前  ');assert.equal(R.current(data).label,'分かりやすい名前');assert.throws(()=>R.rename(data,target,' '));assert.throws(()=>R.archive(data,target));assert.throws(()=>R.merge(data,target,target,[]));assert.throws(()=>R.merge(data,source,'stale',[]));
 R.archive(data,source);assert.equal(data.profiles.length,2);assert.equal(R.view(data).archived[0].id,source);assert.throws(()=>R.merge(data,source,target,[]));R.archive(data,source,false);assert.equal(R.view(R.clean(data)).profiles.length,2);
});
