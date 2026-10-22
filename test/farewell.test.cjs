const {test}=require('node:test'),assert=require('node:assert/strict');
const {farewell}=require('../src/farewell.cjs');
test('farewell varies with random selection and reserves good night for local night hours',()=>{
 const at=hour=>new Date(2026,9,22,hour),day=Array.from({length:100},(_,i)=>farewell(at(12),()=>i/100));
 assert.equal(new Set(day).size,6);assert.ok(day.some(s=>s.includes('またね')));assert.ok(day.some(s=>s.includes('バイバイ')));assert.ok(day.every(s=>!s.includes('おやすみ')));
 for(const hour of [0,4,21,23])assert.match(farewell(at(hour),()=>.8),/おやすみ/);
 for(const hour of [5,20])assert.doesNotMatch(farewell(at(hour),()=>.8),/おやすみ/);
 for(const value of [-1,1,NaN,Infinity])assert.equal(typeof farewell(at(12),()=>value),'string');
});

test('startup greeting varies with local morning, afternoon and evening',()=>{
 const {greeting}=require('../src/farewell.cjs'),at=hour=>new Date(2026,9,22,hour);
 for(const hour of [5,10])assert.match(greeting(at(hour),()=>0),/おはよう/);
 for(const hour of [11,17])assert.match(greeting(at(hour),()=>0),/こんにちは/);
 for(const hour of [0,4,18,23])assert.match(greeting(at(hour),()=>0),/こんばんは/);
 for(const hour of [8,12,20])assert.equal(new Set([0,.4,.8].map(n=>greeting(at(hour),()=>n))).size,3);
});
