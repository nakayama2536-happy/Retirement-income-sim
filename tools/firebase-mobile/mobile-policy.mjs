// Diagnostic-only policy. No secrets, browser storage or app state are read here.
export const BUILD='sandbox-mobile-20261019';
export const PROJECT='lifeplan-sync-sandbox';
export const CHANNEL='encrypted-mobile';
export const MARKER='lifeplan-mobile-sandbox-incomplete-v1';
export const LOCK='lifeplan-mobile-sandbox-diagnostic-v1';
export const SDK_ROOT='https://www.gstatic.com/firebasejs/12.19.0/';
export function failure(code){throw Object.assign(new Error(code),{code});}
export function assertMobileLocation(location){
 const url=new URL(location.href);
 // Only the proposed sandbox preview channel; never the main app or Hosting live channel.
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.search||url.hash||
   !/^lifeplan-sync-sandbox--encrypted-mobile-[a-z0-9-]+\.web\.app$/.test(url.hostname))failure('wrong-origin');
}
export function checkedConfig(raw){
 if(!raw||Array.isArray(raw)||typeof raw!=='object')failure('config-invalid');
 const value=Object.fromEntries(['apiKey','authDomain','projectId','appId'].map(key=>[key,raw[key]]));
 if(value.projectId!==PROJECT||value.authDomain!==PROJECT+'.firebaseapp.com')failure('wrong-project');
 if(typeof value.apiKey!=='string'||!value.apiKey||value.apiKey.length>256||
    typeof value.appId!=='string'||!value.appId||value.appId.length>256)failure('config-invalid');
 return Object.freeze(value); // Discard unknown endpoints and every non-required field.
}
export async function loadHostingConfig(fetcher,{signal}={}){
 const response=await fetcher('/__/firebase/init.json',{cache:'no-store',credentials:'omit',redirect:'error',signal});
 if(!response.ok||response.redirected)failure('config-unavailable');
 if(!/application\/json/i.test(response.headers.get('content-type')??''))failure('config-invalid');
 const text=await response.text();if(text.length>16384)failure('config-invalid');
 let parsed;try{parsed=JSON.parse(text);}catch{failure('config-invalid');}
 return checkedConfig(parsed);
}
export function assertIdentity(user,claims){
 if(!user?.uid||typeof user.uid!=='string'||user.uid.includes('/')||
  claims?.aud!==PROJECT||claims?.iss!=='https://securetoken.google.com/'+PROJECT||claims?.sub!==user.uid)failure('wrong-identity');
 return user.uid;
}
export function safeMessage(error){
 const messages={
  'wrong-origin':'検証専用のHTTPSプレビューURLで開いてください。接続・書込みはしていません。',
  'wrong-project':'接続設定が検証専用プロジェクトと一致しないため停止しました。',
  'wrong-identity':'認証先が検証プロジェクトと一致しないため停止しました。',
  'config-invalid':'公開側の検証用接続設定を確認してください。設定値は手入力・送信しないでください。',
  'config-unavailable':'検証用接続設定を取得できません。公開側の準備を確認してください。',
  'unsupported':'必要なブラウザ機能を確認できません。通常のSafariで開いてください。',
  'unfinished':'前回の終了状態が未確認です。再実行せず、検証用文書の残存確認が必要です。',
  'locked':'別の診断画面が実行中です。同時実行せず、先の結果を確認してください。',
  'permission-denied':'検証用ルールの許可を確認できません。再実行せず結果を確認してください。',
  'auth/invalid-credential':'検証用のログイン情報を確認してください。書込みテストは開始していません。',
  'auth/too-many-requests':'認証の試行が制限されています。再実行しないでください。',
  'auth/network-request-failed':'認証中の通信を確認できません。再実行せず状態を確認してください。',
  'confirmation-required':'検証対象と架空データでの実行を確認してください。',
  'unavailable':'通信結果が未確認です。再実行せず状態を確認してください。'
 };
 return messages[error?.code]??'診断を停止しました。再実行せず結果欄を確認してください。';
}
export function summary(result,sessionClosed){
 // Return only allowlisted non-identifying fields. Never serialize the result object.
 const count=Array.isArray(result?.steps)?result.steps.filter(n=>Number.isInteger(n)&&n>=1&&n<=12).length:0;
 const cleanup={confirmed:'削除・不存在確認済み','not-needed':'書込み試行なし',unconfirmed:'未確認'}[result?.cleanup]??'未確認';
 return ['ライフプラン：検証専用の暗号化診断',`版：${BUILD}`,
  `結果：${result?.ok===true?'12/12 成功':`${count}/12で停止`}`,`後片付け：${cleanup}`,
  `認証・接続の終了：${sessionClosed?'確認済み':'未確認'}`,
  '入力：自動生成した架空データのみ','本人データの同期：未実施','PC・iPhone間の同期確認：未実施'].join('\n');
}
