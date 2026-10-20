const {test}=require('node:test'),assert=require('node:assert/strict');
const {TouchResponder}=require('../src/touch-response.cjs');
const reaction={region:'head',gesture:'stroke',emotion:'shy',count:0};
function setup(generate){const tasks=[],published=[];const queue=new TouchResponder({generate,publish:(...args)=>published.push(args),setTimer:fn=>{const t={fn};tasks.push(t);return t;},clearTimer:t=>t.cancelled=true});return {queue,tasks,published};}
test('touch requests debounce to the newest gesture and no model uses immediate fallback',async()=>{
 const generated=[],{queue,tasks,published}=setup(async(_s,_h,r)=>{generated.push(r);return '最新の反応';});
 queue.request({model:'local'},[],reaction,'固定');queue.request({model:'local'},[],{...reaction,emotion:'angry'},'怒る');assert.equal(tasks[0].cancelled,true);await tasks[0].fn();assert.equal(generated.length,0);await tasks[1].fn();assert.equal(generated[0].emotion,'angry');assert.equal(published[0][0],'最新の反応');queue.request({model:''},[],reaction,'未設定');assert.equal(published.at(-1)[0],'未設定');
});
test('a new touch aborts old generation and ignores its eventual reply',async()=>{
 const pending=[],{queue,tasks,published}=setup((_s,_h,_r,signal)=>new Promise(resolve=>pending.push({signal,resolve})));
 queue.request({model:'local'},[],reaction,'固定');const old=tasks[0].fn();queue.request({model:'local'},[],reaction,'固定');assert.equal(pending[0].signal.aborted,true);const latest=tasks[1].fn();pending[1].resolve('新しい返答');await latest;pending[0].resolve('古い返答');await old;assert.deepEqual(published.map(x=>x[0]),['新しい返答']);
});
test('failures fall back while explicitly cancelled requests stay silent',async()=>{
 const {queue,tasks,published}=setup(async()=>{throw Error('タイムアウト');});queue.request({model:'local'},[],reaction,'固定');await tasks[0].fn();assert.equal(published[0][0],'固定');queue.request({model:'local'},[],reaction,'出さない');queue.cancel();await tasks[1].fn();assert.equal(published.length,1);
});
