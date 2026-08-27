(() => {
'use strict';

/* PMV Toolkit Tracker V15 API
   - deterministic session selection
   - todayIndia() always available
   - retries alternate stored sessions when a stale token is rejected
   - GET transport compatible with the existing Apps Script backend
*/
const PRIMARY='pmv_session_v3';
const LEGACY=['pmv_session_v2','pmv_session','pmvSession','session','sessionData','currentSession','pmv_session_data'];
const ALL=[PRIMARY,...LEGACY];
const TIMEOUT=30000;

function parse(v){
  if(!v)return null;
  try{
    const x=typeof v==='string'?JSON.parse(v):v;
    if(!x||typeof x!=='object')return null;
    if(x.session)return parse(x.session);
    if(x.sessionData)return parse(x.sessionData);
    return x.token&&x.userId?x:null;
  }catch(_){return null}
}
function valid(s){return !!(s&&s.token&&s.userId)}
function sessionTime(s){
  for(const v of [s?.lastActive,s?.LAST_ACTIVE,s?.createdAt,s?.CREATED_AT,s?.created_at]){
    const n=Date.parse(String(v||''));if(Number.isFinite(n))return n;
  }
  return 0;
}
function candidates(){
  const out=[],seen=new Set();
  for(const storage of [window.localStorage,window.sessionStorage]){
    try{
      for(const key of ALL){
        const s=parse(storage.getItem(key));
        if(valid(s)&&!seen.has(String(s.token))){
          seen.add(String(s.token));out.push({key,session:s});
        }
      }
      for(let i=0;i<storage.length;i++){
        const key=storage.key(i);if(!key||ALL.includes(key))continue;
        const s=parse(storage.getItem(key));
        if(valid(s)&&!seen.has(String(s.token))){
          seen.add(String(s.token));out.push({key,session:s});
        }
      }
    }catch(_){}
  }
  out.sort((a,b)=>{
    const ap=a.key===PRIMARY?1:0,bp=b.key===PRIMARY?1:0;
    if(ap!==bp)return bp-ap;
    return sessionTime(b.session)-sessionTime(a.session);
  });
  return out;
}
function getSession(){const c=candidates();return c[0]?.session||null}
function clearSession(){
  for(const k of ALL){
    try{localStorage.removeItem(k)}catch(_){}
    try{sessionStorage.removeItem(k)}catch(_){}
  }
}
function saveSession(s){
  if(!valid(s))throw Error('Invalid login session returned by server.');
  clearSession();
  const raw=JSON.stringify(s);
  try{localStorage.setItem(PRIMARY,raw);sessionStorage.setItem(PRIMARY,raw)}catch(_){}
  return s;
}
function endpoint(){
  const u=String(window.APP_CONFIG?.API_URL||'').trim();
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(u))
    throw Error('Invalid Apps Script /exec URL in js/config.js.');
  return u;
}
function todayIndia(){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const g=t=>p.find(x=>x.type===t)?.value||'';
  return `${g('year')}-${g('month')}-${g('day')}`;
}
async function raw(action,params={},session=null){
  const q=new URLSearchParams({action});
  for(const [k,v] of Object.entries(params)){
    if(v!==undefined&&v!==null)q.set(k,typeof v==='object'?JSON.stringify(v):String(v));
  }
  if(session)q.set('session',JSON.stringify(session));
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),TIMEOUT);
  try{
    const r=await fetch(endpoint()+'?'+q.toString(),{method:'GET',cache:'no-store',redirect:'follow',credentials:'omit',signal:ctrl.signal});
    const text=await r.text();
    let j;try{j=JSON.parse(text)}catch(_){throw Error(`Backend returned non-JSON HTTP ${r.status}.`)}
    if(!j.success){
      const e=Error(String(j.error||'Request failed.'));
      e.sessionInvalid=/invalid session|session expired|session not found/i.test(e.message);
      throw e;
    }
    return j.data??{};
  }catch(e){
    if(e.name==='AbortError')throw Error('Failed to fetch: Apps Script request timed out.');
    throw e;
  }finally{clearTimeout(timer)}
}
async function request(action,params={}){
  if(action==='login')return raw(action,params,null);
  const cs=candidates();
  if(!cs.length)throw Error('Not authenticated. Please sign in again.');
  let last=null;
  for(const c of cs.slice(0,5)){
    try{return await raw(action,params,c.session)}
    catch(e){
      last=e;
      if(!e.sessionInvalid)break;
      try{removeToken(c.session.token)}catch(_){}
    }
  }
  if(last?.sessionInvalid){clearSession();window.dispatchEvent(new Event('pmv-session-expired'))}
  throw last||Error('Request failed.');
}
function removeToken(token){
  for(const storage of [window.localStorage,window.sessionStorage]){
    try{
      for(let i=storage.length-1;i>=0;i--){
        const k=storage.key(i),s=parse(storage.getItem(k));
        if(valid(s)&&String(s.token)===String(token))storage.removeItem(k);
      }
    }catch(_){}
  }
}

window.PMVApi={
  getSession,todayIndia,saveSession,clearSession,
  login:async(u,m)=>saveSession(await request('login',{userId:u,mobile:m})),
  logout:async()=>{try{return await request('logout')}finally{clearSession()}},
  opening:d=>request('getPmvOpeningBalance',{date:d}),
  own:d=>request('getOwnPmvDashboard',{date:d}),
  admin:d=>request('getAdminPmvDashboard',{date:d}),
  submit:r=>request('submitPmvReport',{record:r}),
  articles:(d,q)=>request('getSpmArticles',{date:d,search:q||'',limit:10000}),
  adminArticles:(d,q)=>request('getAdminArticleStatus',{date:d,search:q||'',limit:10000}),
  updateArticleStatus:r=>request('updateArticleStatus',{record:r}),
  updateArticleMaster:r=>request('updateArticleMaster',{record:r}),
  pushArticleStatusToMaster:r=>request('pushArticleStatusToMaster',{record:r}),
  diagnoseMaster:()=>request('diagnoseArticleMaster'),
  diagnoseStatus:d=>request('diagnoseArticleStatus',{date:d}),
  diagnosePinAccess:()=>request('diagnosePinAccess')
};
})();
