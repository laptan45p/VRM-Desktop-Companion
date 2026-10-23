'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const MODEL='companion-gguf';
function endpoint(settings){return `http://127.0.0.1:${settings.llamaPort}`;}
function launchArgs(s,key){
 const args=['--model',s.llamaModelPath,'--alias',MODEL,'--host','127.0.0.1','--port',String(s.llamaPort),'--ctx-size',String(s.llamaContext),'--n-gpu-layers',String(s.llamaGpuLayers),'--parallel','1','--api-key',key,'--dry-multiplier',String(s.llamaDryMultiplier),'--dry-base',String(s.llamaDryBase),'--dry-allowed-length',String(s.llamaDryAllowedLength),'--dry-penalty-last-n','-1','--repeat-penalty','1.0'];
 if(s.llamaTemplate!=='auto')args.push('--chat-template',s.llamaTemplate);
 return args;
}
async function checkFiles(executable,model){
 if(!path.isAbsolute(executable)||!/^llama-server(?:\.exe)?$/i.test(path.basename(executable))||!(await fs.stat(executable)).isFile())throw new Error('llama-serverの実行ファイルを選んでください。未導入の場合はinstall_llama_server.batを実行してください。');
 if(!path.isAbsolute(model)||!model.toLowerCase().endsWith('.gguf'))throw new Error('GGUFモデルファイルを選んでください。');
 const file=await fs.open(model,'r');try{const bytes=Buffer.alloc(4);const {bytesRead}=await file.read(bytes,0,4,0);if(bytesRead!==4||bytes.toString()!=='GGUF')throw new Error('選択したファイルはGGUFモデルではありません。');}finally{await file.close();}
}
function freePort(port){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(new Error(`ポート${port}は使用中です。設定で別のポートに変更してください。`)));server.listen({host:'127.0.0.1',port,exclusive:true},()=>server.close(resolve));});}
class LlamaServer{
 constructor({defaultExecutable,onState=()=>{},spawnProcess=spawn,fetchJSON=async(url,key,signal)=>{const r=await fetch(url,{headers:{Authorization:'Bearer '+key},signal,redirect:'error'});if(!r.ok)throw new Error('読み込み中');return r.json();},validate=checkFiles,checkPort=freePort,wait=ms=>new Promise(r=>setTimeout(r,ms)),startupTimeout=180000,stopTimeout=5000}={}){
  Object.assign(this,{defaultExecutable,onState,spawnProcess,fetchJSON,validate,checkPort,wait,startupTimeout,stopTimeout});this.phase='stopped';this.error='';this.log='';this.child=null;this.starting=null;this.stopping=null;this.controller=null;this.key='';
 }
 status(){return {phase:this.phase,error:this.error,log:this.log};}
 emit(phase,error=''){this.phase=phase;this.error=error;this.onState(this.status());}
 credentials(s){if(this.phase!=='running'||this.port!==s.llamaPort)throw new Error('設定の「llama-serverを起動」からモデルを読み込んでください。');return this.key;}
 start(settings){
  if(this.stopping)return Promise.reject(new Error('停止処理が終わってから起動してください。'));
  if(this.starting)return this.starting;
  if(this.child)return Promise.reject(new Error('設定を変更する場合は、一度llama-serverを停止してください。'));
  const controller=new AbortController();this.controller=controller;
  this.emit('starting');this.log='';
  this.starting=this.launch(settings,controller).finally(()=>{this.starting=null;if(this.controller===controller)this.controller=null;});return this.starting;
 }
 async launch(settings,controller){
  let child;
  try{
   const executable=settings.llamaExecutable||this.defaultExecutable;
   await this.validate(executable,settings.llamaModelPath);controller.signal.throwIfAborted();
   await this.checkPort(settings.llamaPort);controller.signal.throwIfAborted();
   this.key=randomBytes(32).toString('hex');this.port=settings.llamaPort;
   // Ignore inherited llama.cpp options; bind and authentication are owned here.
   const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^LLAMA_/i.test(k)));
   child=this.spawnProcess(executable,launchArgs(settings,this.key),{cwd:path.dirname(executable),env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});this.child=child;
   this.closed=new Promise(resolve=>child.once('close',resolve));
   let launchError='';child.once('error',e=>{launchError=e.message;});
   const append=data=>{this.log=(this.log+String(data).split(this.key||'\0').join('[認証情報非表示]')).slice(-6000);};child.stdout?.on('data',append);child.stderr?.on('data',append);
   child.once('close',code=>{if(this.child!==child)return;this.child=null;this.key='';if(this.phase==='running')this.emit('error',`llama-serverが終了しました（${code??'不明'}）。ログを確認してください。`);});
   const end=Date.now()+this.startupTimeout;
   while(Date.now()<end){
    controller.signal.throwIfAborted();
    if(launchError||this.child!==child)throw new Error(launchError||'llama-serverを起動できませんでした。ログを確認してください。');
    try{
     const data=await this.fetchJSON(endpoint(settings)+'/v1/models',this.key,AbortSignal.any([controller.signal,AbortSignal.timeout(2000)]));
     if(data.data?.some(m=>m.id===MODEL)&&this.child===child){controller.signal.throwIfAborted();this.emit('running');return this.status();}
    }catch(e){if(controller.signal.aborted)throw e;}
    await this.wait(300);
   }
   throw new Error('モデルの読み込みがタイムアウトしました。メモリ容量・GGUF・ログを確認してください。');
  }catch(e){
   if(child&&this.child===child)await this.terminate(child);
   if(!controller.signal.aborted){this.emit('error',e.code==='ENOENT'?'実行ファイルまたはGGUFが見つかりません。ファイルを選び直してください。':e.message);throw new Error(this.error);}
   throw new Error('llama-serverの起動を中止しました。');
  }
 }
 async terminate(child){
  if(this.child!==child)return;
  child.kill();
  let timer;const forceTimer=setTimeout(()=>{if(this.child===child)child.kill('SIGKILL');},Math.min(2000,this.stopTimeout/2));
  try{await Promise.race([this.closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('llama-serverの停止を確認できません。タスクマネージャーで確認してください。')),this.stopTimeout);})]);}
  finally{clearTimeout(timer);clearTimeout(forceTimer);}
 }
 stop(){
  if(this.stopping)return this.stopping;
  this.controller?.abort();this.emit('stopping');
  this.stopping=(async()=>{
   await Promise.resolve();
   try{if(this.starting)await this.starting.catch(()=>{});if(this.child)await this.terminate(this.child);this.key='';this.emit('stopped');return this.status();}
   catch(e){this.emit('error',e.message);throw e;}
   finally{this.stopping=null;}
  })();return this.stopping;
 }
}
module.exports={LlamaServer,endpoint,MODEL,launchArgs,checkFiles,freePort};
