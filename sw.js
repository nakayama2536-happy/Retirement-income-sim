// Scope identifies this installation. Never sweep origin-wide or legacy caches.
const SCOPE=new URL(self.registration.scope);
const CACHE_PREFIX=`lifeplan-sim:${encodeURIComponent(SCOPE.href)}:`;
const CACHE=`${CACHE_PREFIX}v0.9.7-i08-backup-guidance-20261010`;
const ASSETS=['./','./index.html','./styles.css','./app.mjs','./calc.mjs','./calendar-mode.mjs','./calendar-workflow.mjs','./calendar-ui.mjs','./salary-life.mjs','./salary-workflow.mjs','./salary-ui.mjs','./storage.mjs','./state.mjs','./migration.mjs','./migration-ui.mjs','./pension.mjs','./pension-ui.mjs','./rules.mjs','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
ASSETS.push('./expense-display.mjs','./annual-cashflow.mjs','./annual-csv.mjs','./full-backup.mjs','./expense-ui.mjs','./expense-workflow.mjs','./expense-preview.mjs','./cashflow-sources.mjs','./cashflow-reconciliation.mjs');
ASSETS.push('./income-ui.mjs','./income-workflow.mjs','./income-preview.mjs');
ASSETS.push('./tax-social-audit.mjs');
ASSETS.push('./backup-compatibility.mjs','./write-access.mjs','./recovery-ui.mjs');
const URLS=ASSETS.map(path=>new URL(path,SCOPE).href);
const ALLOWED=new Set(URLS);
async function requireComplete(cache){
  const complete=await Promise.all(URLS.map(url=>cache.match(url)));
  if(complete.some(response=>!response||response.ok===false))throw new Error('更新用ファイルが不足しています。旧キャッシュを保持します。');
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  // addAll rejects a failed bundle; do not delete the still-active old version.
  await cache.addAll(URLS.map(url=>new Request(url,{cache:'reload',credentials:'same-origin'})));
  await requireComplete(cache);
  // No skipWaiting: allow existing pages to finish using their current version.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await requireComplete(cache);
  // Keep prior complete bundles. Activation is not evidence of successful
  // startup on this device. Automatic cleanup cannot safely discard rollback.
  // No deletion here, including partial/unknown bundles. Cleanup is a separate
  // explicitly reviewed operation, never part of activation.
  // No clients.claim: do not take over a page running another app version.
})()));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==SCOPE.origin||!ALLOWED.has(url.href))return;
  event.respondWith((async()=>{
    // Never use caches.match(), which can return another installation/version.
    const cache=await caches.open(CACHE);
    const response=await cache.match(request);
    // Network fallback could combine deployed newer files with this bundle.
    // Fail closed; do not silently fall back to another version's module.
    return response||new Response('この版の起動ファイルが不足しています。再取得、または旧本体と更新前バックアップによる復旧が必要です。保存データは変更していません。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  })());
});
