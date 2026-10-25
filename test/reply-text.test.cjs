const {test}=require('node:test'),assert=require('node:assert/strict');
const {replyText,historyText}=require('../src/reply-text.cjs');
test('leading reasoning blocks are removed while a normal answer and quoted tags stay intact',()=>{
 assert.equal(replyText(' \n<think>処理用のテストデータ</think>\nこんにちは。'),'こんにちは。');
 assert.equal(replyText('<think>一つ目</think>\n<think>二つ目</think>\n返答です。'),'返答です。');
 assert.equal(replyText('<think>\n</think>\n返答です。'),'返答です。');assert.equal(replyText('</think>\n返答です。'),'返答です。');
 for(const text of ['返答です。','文中の <think> は文字列です。','```xml\n<think>サンプル</think>\n```'])assert.equal(replyText(text),text);
});
test('incomplete reasoning never becomes visible conversation text',()=>{
 assert.equal(replyText('<think>途中で途切れたテストデータ'),'');assert.equal(replyText('<think>完了</think>'),'');assert.equal(replyText(null),'');
});
test('old assistant reasoning is omitted from outbound history without rewriting stored messages or user text',()=>{
 const history=[{role:'user',content:'<think>は何ですか？'},{role:'assistant',content:'<think>処理用データ</think>説明です。'},{role:'user',content:'途中の質問'},{role:'assistant',content:'<think>未完了'}],snapshot=structuredClone(history),clean=historyText(history);
 assert.deepEqual(clean,[{role:'user',content:history[0].content},{role:'assistant',content:'説明です。'}]);assert.deepEqual(history,snapshot);
});
