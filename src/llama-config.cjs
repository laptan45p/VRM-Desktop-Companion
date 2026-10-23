'use strict';
// Shared by the launcher and settings preview so the displayed choice matches argv.
function resolveChatTemplate(settings={}){
 const selected=settings.llamaTemplate||'auto';
 if(selected!=='auto')return {template:selected,mode:'manual',label:'手動指定：'+selected,help:'指定した会話形式を優先します。別のモデルに変える場合は「自動」に戻すか、配布元の指定を確認してください。'};
 const file=String(settings.llamaModelPath||'').replace(/\\/g,'/').split('/').at(-1);
 if(/^nemomix[-_]unleashed[-_]12b(?:[-_.].*)?\.gguf$/i.test(file))return {template:'mistral-v1',mode:'known-model',label:'NemoMix向けの会話形式を自動適用（Mistral v1）',help:'このNemoMixのファイル名を認識しました。会話テンプレートの手動変更は不要です。以前の不自然な英文が続く場合は、会話タブの「履歴を消去」で履歴と要約をリセットしてお試しください。'};
 if(!file)return {template:null,mode:'model-metadata',label:'GGUFを選ぶと会話形式を自動設定します。',help:'配布元のモデル名が分かるファイル名のまま選んでください。'};
 return {template:null,mode:'model-metadata',label:'自動：GGUFに保存された会話形式を使用',help:'このモデルには個別の補正を適用しません。無関係な英文などが出る場合は、詳細設定の「会話テンプレート」を配布元の指定と照合してください。変更を保存して起動し直し、会話タブで履歴を消去して確認できます。'};
}
module.exports={resolveChatTemplate};
