const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pixelRatio}=require('../src/render-quality.cjs');
const {cleanSettings,Store}=require('../src/backend.cjs');

test('quality presets supersample High and retain Medium at standard and high DPI',()=>{
 assert.equal(pixelRatio('high',440,518,1),2);
 assert.equal(pixelRatio('medium',440,518,1),1);
 assert.equal(pixelRatio('low',440,518,1),.75);
 assert.equal(pixelRatio('high',440,518,2),2);
 assert.equal(pixelRatio('medium',440,518,2),1.5);
 assert.equal(pixelRatio('high',440,518,4),3);
});
test('large, tall and wide viewports stay within pixel and GPU limits',()=>{
 for(const [mode,budget] of [['high',16000000],['medium',8000000],['low',2000000]]){
  for(const [width,height] of [[7680,4320],[100,20000],[20000,100]]){
   const ratio=pixelRatio(mode,width,height,3,4096);
   assert.ok(width*height*ratio*ratio<=budget+1);
   assert.ok(width*ratio<=4096&&height*ratio<=4096);
  }
 }
 assert.ok(Number.isFinite(pixelRatio('unknown',0,NaN,NaN)));
});
test('quality defaults, invalid settings and restart persistence',()=>{
 assert.equal(cleanSettings({}).renderQuality,'high');
 assert.equal(cleanSettings({renderQuality:'invalid'}).renderQuality,'high');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'quality-'));
 try{
  for(const mode of ['high','medium','low']){
   const store=new Store(dir);store.data.settings=cleanSettings({renderQuality:mode});store.save();
   const next=new Store(dir);next.load();assert.equal(next.data.settings.renderQuality,mode);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
