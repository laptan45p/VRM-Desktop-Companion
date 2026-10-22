const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pixelRatio}=require('../src/render-quality.cjs');
const {cleanSettings,Store}=require('../src/backend.cjs');

test('fixed high resolution supersamples on standard and high DPI screens',()=>{
 assert.equal(pixelRatio(440,518,1),2);
 assert.equal(pixelRatio(440,518,2),2);
 assert.equal(pixelRatio(440,518,4),3);
});
test('large, tall and wide viewports stay within pixel and GPU limits',()=>{
 for(const [width,height] of [[7680,4320],[100,20000],[20000,100]]){
  const ratio=pixelRatio(width,height,3,4096);
  assert.ok(width*height*ratio*ratio<=16000001);
  assert.ok(width*ratio<=4096&&height*ratio<=4096);
 }
 assert.ok(Number.isFinite(pixelRatio(0,NaN,NaN)));
});
test('previous Low and Medium preferences cannot reduce fixed high quality after restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'quality-'));
 try{
  for(const mode of ['high','medium','low']){
   assert.equal(cleanSettings({renderQuality:mode}).renderQuality,undefined);
   const store=new Store(dir);store.data.settings={...store.data.settings,renderQuality:mode};store.save();
   const next=new Store(dir);next.load();assert.equal(next.data.settings.renderQuality,undefined);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
