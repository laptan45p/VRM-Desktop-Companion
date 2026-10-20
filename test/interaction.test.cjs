const {test}=require('node:test'),assert=require('node:assert/strict');
const {classifyPoint,gestureKind,ReactionCounter}=require('../src/interaction.cjs');
const joints={head:{x:0,y:1.65,z:0},hips:{x:0,y:.9,z:0},chest:{x:0,y:1.3,z:0},leftUpperArm:{x:.2,y:1.4,z:0},rightUpperArm:{x:-.2,y:1.4,z:0},leftFoot:{x:.1,y:.05,z:0},rightFoot:{x:-.1,y:.05,z:0}};
const rotate=(p,a)=>({x:p.x*Math.cos(a)+p.z*Math.sin(a),y:p.y,z:-p.x*Math.sin(a)+p.z*Math.cos(a)});
test('body regions follow rotation and distinguish front chest from rear buttocks',()=>{
 for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  const j=Object.fromEntries(Object.entries(joints).map(([k,p])=>[k,rotate(p,angle)]));
  for(const [p,want]of [[{x:0,y:1.74,z:.08},'head'],[{x:0,y:1.35,z:.1},'chest'],[{x:0,y:.82,z:-.1},'butt'],[{x:0,y:.82,z:.1},null],[{x:0,y:1.35,z:-.1},null],[{x:.4,y:1.35,z:.1},null]])assert.equal(classifyPoint(rotate(p,angle),j),want);
 }
 assert.equal(classifyPoint({x:0,y:0,z:0},{}),null);
});
test('gestures distinguish tap, stroke, ambiguous movement and long press',()=>{
 assert.equal(gestureKind(4,150),'poke');assert.equal(gestureKind(60,300),'stroke');assert.equal(gestureKind(12,300),null);assert.equal(gestureKind(0,900),null);assert.equal(gestureKind(40,20),null);assert.equal(gestureKind(NaN,100),null);
});
test('sensitive interactions count once per gesture, combine regions, and reset after head touch or timeout',()=>{
 const c=new ReactionCounter();assert.equal(c.perform('chest','poke',0).emotion,'shy');assert.equal(c.perform('butt','stroke',500).count,2);assert.equal(c.perform('chest','poke',1000).emotion,'angry');assert.equal(c.perform('butt','poke',1200).emotion,'angry');assert.equal(c.perform('chest','poke',12001).count,1);
 assert.equal(c.perform('head','poke',13000).emotion,'surprised');assert.equal(c.perform('chest','poke',13100).count,1);assert.equal(c.perform('head','stroke',13200).emotion,'shy');assert.equal(c.perform('unknown','poke',13300),null);c.reset();assert.equal(c.perform('butt','poke',14000).count,1);
});
