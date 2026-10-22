'use strict';
// Fixed unlit rendering; source materials remain owned by the VRM so material
// expressions can update them and model disposal can release them normally.
class UnlitMaterials{
 constructor(makeUnlit){this.makeUnlit=makeUnlit;this.entries=[];this.materials=new Map();}
 bind(root){
  this.clear();
  root?.traverse(o=>{
   if(!o.isMesh)return;
   const original=o.material,array=Array.isArray(original),items=array?original:[original];
   this.entries.push({object:o,original});
   const displayed=items.map(m=>{
    if(!m?.isMToonMaterial||m.isOutline)return m;
    if(!this.materials.has(m))this.materials.set(m,this.makeUnlit(m));
    return this.materials.get(m);
   });
   o.material=array?displayed:displayed[0];
  });
  this.apply();
 }
 apply(){
  for(const [source,displayed] of this.materials){displayed.color.copy(source.color);displayed.opacity=source.opacity;}
  return this.materials.size;
 }
 clear(){
  for(const e of this.entries)e.object.material=e.original;
  for(const m of this.materials.values())m.dispose();
  this.entries=[];this.materials.clear();
 }
}
module.exports={UnlitMaterials};
