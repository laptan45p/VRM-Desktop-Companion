'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const LIMIT=16*1024*1024;
async function catalog(folder){
 if(!folder)return [];
 let names=await fs.readdir(folder,{withFileTypes:true});
 return names.filter(f=>f.isFile()&&/\.vrma$/i.test(f.name)).map(f=>f.name).sort((a,b)=>a.localeCompare(b)).slice(0,64);
}
async function findFolder(folder){
 if((await catalog(folder)).length)return folder;
 const child=path.join(folder,'vrma');if((await catalog(child).catch(()=>[])).length)return child;
 throw new Error('.vrmaが入ったフォルダーを選んでください。');
}
function validate(bytes){
 if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a)throw new Error('VRMA形式のファイルではありません。');
 const n=bytes.readUInt32LE(12);if(n>bytes.length-20)throw new Error('VRMAのデータが破損しています。');
 const json=JSON.parse(bytes.subarray(20,20+n).toString('utf8'));
 if(!json.extensions?.VRMC_vrm_animation||!json.animations?.length)throw new Error('VRMアニメーションがありません。');
 for(const item of [...(json.buffers||[]),...(json.images||[])])if(item.uri&&!item.uri.startsWith('data:'))throw new Error('外部ファイル参照を含むVRMAは読み込めません。');
 return bytes;
}
async function readMotion(folder,name){
 if(typeof name!=='string'||!(await catalog(folder)).includes(name))throw new Error('登録されていないモーションです。');
 const file=path.join(folder,name),stat=await fs.stat(file);if(stat.size>LIMIT)throw new Error('モーションの上限は16MBです。');
 return new Uint8Array(validate(await fs.readFile(file)));
}
module.exports={catalog,findFolder,readMotion,validate};
