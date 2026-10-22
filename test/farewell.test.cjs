const {test}=require('node:test'),assert=require('node:assert/strict');
const {farewell}=require('../src/farewell.cjs');
test('farewell varies with random selection and reserves good night for local night hours',()=>{
 const at=hour=>new Date(2026,9,22,hour),day=Array.from({length:100},(_,i)=>farewell(at(12),()=>i/100));
 assert.equal(new Set(day).size,6);assert.ok(day.some(s=>s.includes('またね')));assert.ok(day.some(s=>s.includes('バイバイ')));assert.ok(day.every(s=>!s.includes('おやすみ')));
 for(const hour of [0,4,21,23])assert.match(farewell(at(hour),()=>.8),/おやすみ/);
 for(const hour of [5,20])assert.doesNotMatch(farewell(at(hour),()=>.8),/おやすみ/);
 for(const value of [-1,1,NaN,Infinity])assert.equal(typeof farewell(at(12),()=>value),'string');
});
