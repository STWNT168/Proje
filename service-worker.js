const CACHE='pmv-v16-20260827-session-fix';
const ASSETS=[
  './','./index.html','./styles.css','./css/article-status-v2.css',
  './js/api.js','./js/auth.js','./js/app.js','./js/spm-dashboard.js',
  './js/admin-dashboard.js','./js/article-dashboard.js','./js/calculations.js',
  './js/validation.js','./js/config.js','./manifest.json'
];

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS).catch(()=>{})));
});
self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin!==location.origin)return;

  /* Never serve application JavaScript from the old PWA cache. */
  if(/\/js\/(api|auth|app|spm-dashboard|admin-dashboard|article-dashboard|calculations|validation)\.js$|\/config\.js$/.test(u.pathname)){
    e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(fetch(e.request).then(r=>{
    const copy=r.clone();
    caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
    return r;
  }).catch(()=>caches.match(e.request)));
});