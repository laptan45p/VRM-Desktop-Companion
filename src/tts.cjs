'use strict';
const fs=require('node:fs/promises');
const {isIP}=require('node:net');
function ttsBase(endpoint){
 let u;try{u=new URL(endpoint);}catch{throw new Error('TTSの接続先URLを確認してください。');}
 const host=u.hostname,parts=host.split('.').map(Number);
 const lan=isIP(host)===4&&(parts[0]===10||parts[0]===172&&parts[1]>=16&&parts[1]<=31||parts[0]===192&&parts[1]===168);
 if(u.protocol!=='http:'||!(['localhost','127.0.0.1','[::1]'].includes(host)||lan)||u.username||u.password||u.search||u.hash)throw new Error('TTSの接続先は http://127.0.0.1:ポート番号 またはLAN内のIPv4アドレス（例：http://192.168.1.101:8088）を指定してください。');
 if(!['/','','/v1','/v1/'].includes(u.pathname))throw new Error('TTSの接続先にはAPIのルートURLを指定してください（例：http://192.168.1.101:8088）。');
 return u.origin;
}
async function checkEmbedding(file){
 if(typeof file!=='string'||!file.toLowerCase().endsWith('.speaker.safetensors'))throw new Error('Speaker Embedding（.speaker.safetensors）を選んでください。');
 const stat=await fs.stat(file).catch(()=>null);if(!stat?.isFile()||stat.size>32*1024*1024)throw new Error('Speaker Embeddingが見つからないか、32MBを超えています。');return file;
}
async function synthesize(settings,text,signal){
 const base=ttsBase(settings.ttsEndpoint);await checkEmbedding(settings.speakerPath);
 const response=await fetch(base+'/v1/audio/speech',{method:'POST',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(Math.round(settings.ttsTimeout*1000))]),headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'irodori-tts',input:text,voice:'none',response_format:'wav',speed:settings.ttsSpeed,irodori:{ref_embed:settings.speakerPath,caption:settings.ttsCaption||undefined,chunking_enabled:true}})});
 if(!response.ok){const message=(await response.text()).slice(0,600);throw new Error(`Irodori-TTS HTTP ${response.status}: ${message}`);}
 const reader=response.body.getReader(),chunks=[];let length=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>32*1024*1024)throw new Error('音声が32MBを超えています。発言を短くしてください。');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const bytes=Buffer.concat(chunks,length);if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw new Error('Irodori-TTSからWAV音声が返りませんでした。');return new Uint8Array(bytes);
}
class VoiceLane{
 constructor({generate=synthesize,publish,fail}){this.generate=generate;this.publish=publish;this.fail=fail;this.serial=0;this.controller=null;}
 cancel(){this.serial++;this.controller?.abort();this.controller=null;return this.serial;}
 async request(id,settings,text){
  if(id!==this.serial)return;const controller=new AbortController();this.controller=controller;
  try{const data=await this.generate(settings,text,controller.signal);if(id===this.serial&&!controller.signal.aborted)this.publish({id,data,text,volume:settings.ttsVolume});}
  catch(error){if(id===this.serial&&!controller.signal.aborted)this.fail(id,error.name==='TimeoutError'?'Irodori-TTSがタイムアウトしました。':error.message==='fetch failed'?'Irodori-TTSに接続できません。サーバーを起動してください。':error.message);}
  finally{if(this.controller===controller)this.controller=null;}
 }
}
module.exports={ttsBase,synthesize,checkEmbedding,VoiceLane};

