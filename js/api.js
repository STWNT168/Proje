(()=>{'use strict';
const KEY='pmv_session_v3',TIMEOUT=30000;
const sess=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){return null}};
async function req(action,p={}){
 const u=String(window.APP_CONFIG?.API_URL||'').trim();
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(u))throw Error('Invalid Apps Script /exec URL in js/config.js');
 const q=new URLSearchParams({action});Object.entries(p).forEach(([k,v])=>{if(v!=null)q.set(k,typeof v==='object'?JSON.stringify(v):String(v))});
 const s=sess();if(s)q.set('session',JSON.stringify(s));
 const c=new AbortController(),t=setTimeout(()=>c.abort(),TIMEOUT);let r;
 try{r=await fetch(u+'?'+q,{method:'GET',redirect:'follow',cache:'no-store',signal:c.signal})}catch(e){clearTimeout(t);throw Error(e.name==='AbortError'?'Failed to fetch: Apps Script timed out.':'Failed to fetch: browser cannot reach Apps Script /exec.')}
 clearTimeout(t);const txt=await r.text();let j;try{j=JSON.parse(txt)}catch(e){throw Error('Apps Script returned non-JSON HTTP '+r.status+'. Check Web App deployment.')}
 if(!j.success)throw Error(j.error||j.message||'Apps Script request failed');return j.data??{};
}
window.PMVApi={getSession:sess,articles:(date,q)=>req('getSpmArticles',{date,q:q||'',limit:10000}),updateArticleStatus:r=>req('updateArticleStatus',{record:r})};
})();