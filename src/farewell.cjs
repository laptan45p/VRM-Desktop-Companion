'use strict';
const GENERAL=[
 'またね〜。またお話ししようね。',
 'バイバイ〜。次も楽しみにしてるね。',
 '今日はありがとう。また会おうね。',
 'おつかれさま。ゆっくり休んでね。',
 'それじゃ、またね。いい時間を過ごしてね。',
 'また遊びに来てね。待ってるよ〜。',
];
const NIGHT=[
 'おやすみ〜。いい夢を見てね。',
 '今日もおつかれさま。おやすみなさい。',
 'ゆっくり休んでね。またお話ししよう。',
];
function farewell(date=new Date(),random=Math.random){
 const hour=date.getHours(),choices=hour>=21||hour<5?[...GENERAL,...NIGHT]:GENERAL;
 const n=Number(random()),index=Number.isFinite(n)?Math.floor(Math.max(0,Math.min(1-Number.EPSILON,n))*choices.length):0;
 return choices[index];
}
module.exports={farewell};
