'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {isCloud,llmBase}=require('./backend.cjs');
function scope(settings){if(!isCloud(settings.provider))throw new Error('クラウドLLMを選択してください。');return crypto.createHash('sha256').update(settings.provider+'\n'+llmBase(settings)).digest('hex');}
class ApiKeys{
 constructor(dir,safeStorage){this.file=path.join(dir,'api-keys.json');this.safe=safeStorage;this.entries={};}
 load(){if(!fs.existsSync(this.file))return;const data=JSON.parse(fs.readFileSync(this.file,'utf8'));if(data.version!==1||!data.entries||typeof data.entries!=='object'||Array.isArray(data.entries))throw new Error('APIキーの保存データを確認してください。');this.entries=Object.fromEntries(Object.entries(data.entries).filter(([k,v])=>/^[a-f0-9]{64}$/.test(k)&&typeof v==='string'));}
 available(){return !!this.safe?.isEncryptionAvailable()&&this.safe.getSelectedStorageBackend?.()!=='basic_text';}
 has(settings){return !!this.entries[scope(settings)];}
 get(settings){if(!isCloud(settings.provider))return '';const encrypted=this.entries[scope(settings)];if(!encrypted)throw new Error('この接続先のAPIキーを登録してください。');if(!this.available())throw new Error('APIキーの暗号化機能を利用できません。');try{return this.safe.decryptString(Buffer.from(encrypted,'base64'));}catch{throw new Error('APIキーを読み出せません。このPCで登録し直してください。');}}
 write(entries){fs.mkdirSync(path.dirname(this.file),{recursive:true});const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify({version:1,entries},null,2),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,this.file);this.entries=entries;}
 set(settings,key){const id=scope(settings);if(typeof key!=='string'||!key.trim()||key.length>4096||!/^[\x21-\x7e]+$/.test(key.trim()))throw new Error('APIキーを確認してください。');if(!this.available())throw new Error('OSの暗号化機能を利用できないため、APIキーを保存できません。');let encrypted;try{encrypted=this.safe.encryptString(key.trim()).toString('base64');}catch{throw new Error('APIキーを暗号化できませんでした。');}this.write({...this.entries,[id]:encrypted});}
 delete(settings){const entries={...this.entries};delete entries[scope(settings)];this.write(entries);}
}
module.exports={ApiKeys,scope};
