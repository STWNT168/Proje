(() => {
'use strict';

/* PMV Toolkit Tracker V13 - unified session bridge.
 * The article module must use the SAME session created by the existing login.
 * We accept the known legacy keys and also discover a valid PMV session object
 * in storage, then mirror it to pmv_session_v3 and pmv_session_v2.
 */
const PRIMARY='pmv_session_v3';
const LEGACY=['pmv_session_v2','pmv_session','pmvSession','session','sessionData','currentSession','pmv_session_data'];
const TIMEOUT=30000;

function parseStored(v){
  if(!v) return null;
  try{
    const x=typeof v==='string'?JSON.parse(v):v;
    if(x && typeof x==='object'){
      if(x.session && typeof x.session==='object') return parseStored(x.session);
      if(x.sessionData && typeof x.sessionData==='object') return parseStored(x.sessionData);
      if(x.token && x.userId) return x;
    }
  }catch(_e){}
  return null;
}
function valid(s){return !!(s && s.token && s.userId);}
function scanStorage(storage){
  if(!storage) return null;
  for(const k of LEGACY.concat([PRIMARY])){
    const s=parseStored(storage.getItem(k));
    if(valid(s)) return s;
  }
  for(let i=0;i<storage.length;i++){
    const k=storage.key(i),s=parseStored(storage.getItem(k));
    if(valid(s)) return s;
  }
  return null;
}
function getSession(){
  try{
    const s=scanStorage(window.localStorage)||scanStorage(window.sessionStorage);
    if(s){mirrorSession(s);return s;}
  }catch(_e){}
  /* Some older builds kept the session on window. */
  for(const k of ['PMV_SESSION','pmvSession','sessionData','currentSession']){
    try{const s=parseStored(window[k]);if(valid(s)){mirrorSession(s);return s;}}catch(_e){}
  }
  return null;
}
function mirrorSession(s){
  if(!valid(s)) return s;
  const raw=JSON.stringify(s);
  try{localStorage.setItem(PRIMARY,raw);localStorage.setItem('pmv_session_v2',raw)}catch(_e){}
  return s;
}
function saveSession(s){
  if(!valid(s)) throw Error('Invalid login session returned by server.');
  mirrorSession(s);
  try{sessionStorage.setItem(PRIMARY,JSON.stringify(s))}catch(_e){}
  window.dispatchEvent(new CustomEvent('pmv-session-ready',{detail:s}));
  return s;
}
function clearSession(){
  [PRIMARY,...LEGACY].forEach(k=>{try{localStorage.removeItem(k);sessionStorage.removeItem(k)}catch(_e){}});
  try{window.dispatchEvent(new Event('pmv-session-cleared'))}catch(_e){}
}
function endpoint(){
  const u=String((window.APP_CONFIG&&APP_CONFIG.API_URL)||'').trim();
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(u))
    throw Error('Invalid Apps Script /exec URL in js/config.js.');
  return u;
}
async function request(action,params={}){
  const q=new URLSearchParams({action});
  Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null)q.set(k,typeof v==='object'?JSON.stringify(v):String(v))});
  const s=getSession();
  if(s) q.set('session',JSON.stringify(s));
  else if(action!=='login') throw Error('Not authenticated. Please sign in again.');

  const c=new AbortController(),timer=setTimeout(()=>c.abort(),TIMEOUT);
  let res,text;
  try{
    res=await fetch(endpoint()+'?'+q.toString(),{method:'GET',redirect:'follow',cache:'no-store',credentials:'omit',signal:c.signal});
    text=await res.text();
  }catch(e){
    throw Error(e.name==='AbortError'?'Failed to fetch: Apps Script request timed out.':'Failed to fetch: browser could not reach the Apps Script /exec Web App. Verify deployment access and URL.');
  }finally{clearTimeout(timer)}
  let j;
  try{j=JSON.parse(text)}catch(_e){throw Error(`Failed to fetch: backend returned non-JSON HTTP ${res.status}. Open the /exec URL directly to test deployment.`)}
  if(!j.success){
    const msg=String(j.error||'Request failed.');
    /* Only clear storage when the SERVER confirms that this exact token is bad/expired. */
    if(/invalid session|session expired|session not found/i.test(msg)) clearSession();
    throw Error(msg);
  }
  return j.data??{};
}
window.PMVApi={
  getSession,saveSession,clearSession,
  login:async(userId,mobile)=>saveSession(await request('login',{userId,mobile})),
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

/* Give an already logged-in legacy page a chance to expose its session. */
setTimeout(()=>getSession(),0);
})();
