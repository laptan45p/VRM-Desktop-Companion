const {test}=require('node:test'),assert=require('node:assert/strict');
const THREE=require('three'),{MToonMaterial}=require('@pixiv/three-vrm');
const {UnlitMaterials}=require('../src/unlit-materials.cjs');
function fixture(){
 const front=new MToonMaterial({name:'前髪'}),body=new MToonMaterial({name:'Material001'}),texture=new THREE.Texture();front.map=texture;
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),[front,body]),root=new THREE.Group();root.add(mesh);
 let disposed=0;const lab=new UnlitMaterials(m=>{const b=new THREE.MeshBasicMaterial({color:m.color.clone(),map:m.map,opacity:m.opacity});b.addEventListener('dispose',()=>disposed++);return b;});
 lab.bind(root);return {lab,front,body,mesh,texture,root,get disposed(){return disposed;}};
}
test('every MToon surface is unlit without settings, regardless of material name',()=>{
 const f=fixture();assert.equal(f.lab.apply(),2);
 assert.ok(f.mesh.material.every(m=>m.isMeshBasicMaterial));assert.equal(f.mesh.material[0].map,f.texture);
 const array=f.mesh.material;f.lab.apply();assert.equal(f.mesh.material,array);
});
test('expression-driven colors and opacity continue to update',()=>{
 const f=fixture();f.front.color.setRGB(.2,.4,.6);f.front.opacity=.4;f.lab.apply();
 assert.ok(f.mesh.material[0].color.equals(f.front.color));assert.equal(f.mesh.material[0].opacity,.4);
});
test('cleanup restores sources and frees temporary materials without touching shared textures',()=>{
 const f=fixture(),geometry=f.mesh.geometry;let texDisposed=0;f.texture.addEventListener('dispose',()=>texDisposed++);
 f.lab.bind(new THREE.Group());assert.equal(f.mesh.material[0],f.front);assert.equal(f.mesh.geometry,geometry);assert.equal(f.disposed,2);assert.equal(texDisposed,0);
});
test('old trial settings cannot reactivate shading',()=>{
 const {cleanSettings}=require('../src/backend.cjs');
 const s=cleanSettings({shadeMode:'original',shadeScope:'front',shadeDirect:0});
 assert.equal(s.shadeMode,undefined);assert.equal(s.shadeScope,undefined);assert.equal(s.shadeDirect,undefined);
});
