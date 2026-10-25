'use strict';
// A fallback for servers/templates that return reasoning tags in message.content.
// Only leading blocks are metadata; quoted tags inside a normal answer stay intact.
function replyText(raw){
 if(typeof raw!=='string')return '';
 let value=raw.trim();
 while(/^<think>/i.test(value)){
  const end=/<\/think>/i.exec(value);if(!end)return '';
  value=value.slice(end.index+end[0].length).trim();
 }
 if(/^<\/think>/i.test(value))value=value.replace(/^<\/think>/i,'').trim();
 return value;
}
function historyText(history){
 const out=[];
 for(let i=0;i+1<history.length;i+=2){const user=history[i],assistant=history[i+1];if(user?.role!=='user'||assistant?.role!=='assistant')continue;
  const content=replyText(assistant.content);if(content)out.push({...user},{...assistant,content});
 }
 return out;
}
module.exports={replyText,historyText};
