(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 else root.companionLayout=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const TOP=8,BOTTOM=8,BASE_WIDTH=440,BASE_HEIGHT=518;
 function mascotBounds(scale,area,previous){
  const value=Number(scale),requested=Number.isFinite(value)?Math.max(.5,Math.min(1.8,value)):1;
  // Screen coordinates are DIPs, matching BrowserWindow bounds at any Windows DPI.
  const factor=Math.min(requested,Math.max(1,area.width)/BASE_WIDTH,Math.max(1,area.height-TOP-BOTTOM)/BASE_HEIGHT);
  const width=Math.min(area.width,Math.max(Math.min(280,area.width),Math.round(BASE_WIDTH*factor)));
  const height=Math.min(area.height,Math.round(BASE_HEIGHT*factor)+TOP+BOTTOM);
  const center=previous?previous.x+previous.width/2:area.x+area.width-width/2;
  const bottom=previous?previous.y+previous.height:area.y+area.height;
  return {x:Math.round(Math.max(area.x,Math.min(area.x+area.width-width,center-width/2))),y:Math.round(Math.max(area.y,Math.min(area.y+area.height-height,bottom-height))),width,height};
 }
 function fitDistance(size,fov,aspect){
  const tan=Math.tan(fov*Math.PI/360);
  // Include the front of the bounding box, not only its center plane.
  return Math.max((size.y||1.7)/(2*tan),size.x/(2*tan*Math.max(.01,aspect)))*1.23+Math.max(0,size.z)/2;
 }
 function clampPosition(bounds,area){return {...bounds,x:Math.round(Math.max(area.x,Math.min(area.x+area.width-bounds.width,bounds.x))),y:Math.round(Math.max(area.y,Math.min(area.y+area.height-bounds.height,bounds.y)))};}
 function popupBounds(m,width,height,area,kind='bubble'){
  width=Math.min(width,area.width);height=Math.min(height,area.height);
  const left=m.x-width-10,right=m.x+m.width+10;
  const x=left>=area.x?left:right+width<=area.x+area.width?right:area.x+area.width-width;
  const y=kind==='input'?m.y+m.height-height:m.y+Math.min(100,m.height*.16);
  return clampPosition({x,y,width,height},area);
 }
 return {TOP,BOTTOM,BASE_WIDTH,BASE_HEIGHT,mascotBounds,fitDistance,popupBounds,clampPosition};
});
