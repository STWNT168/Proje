(() => {
  'use strict';
  const KEY='pmv_session_v3', TIMEOUT=30000;
  const getSession=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){return null}};
  const clearSession=()=>{localStorage.removeItem(KEY);localStorage.removeItem('pmv_session_v2')};
  const saveSession=s=>{if(!s||!s.token||!s.userId)throw Error('Invalid login session returned by server.');localStorage.setItem(KEY,JSON.stringify(s));return s};
  const endpoint=()=>{
    const u=String((window.APP_CONFIG&&APP_CONFIG.API_URL)||'').trim();
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(u))throw Error('Invalid Apps Script /exec URL in js/config.js.');
    return u;
  };
  async function request(action,params={}){
    const q=new URLSearchParams();q.set('action',action);
    Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null)q.set(k,typeof v==='object'?JSON.stringify(v):String(v))});
    const s=getSession();if(s)q.set('session',JSON.stringify(s));
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),TIMEOUT);
    let res,text;
    try{res=await fetch(endpoint()+'?'+q.toString(),{method:'GET',redirect:'follow',cache:'no-store',credentials:'omit',signal:c.signal});text=await res.text();}
    catch(e){throw Error(e.name==='AbortError'?'Failed to fetch: Apps Script request timed out.':'Failed to fetch: browser could not reach the Apps Script /exec Web App. Verify deployment access and URL.');}
    finally{clearTimeout(timer)}
    let j;try{j=JSON.parse(text)}catch(e){throw Error(`Failed to fetch: backend returned non-JSON HTTP ${res.status}. Open the /exec URL directly to test deployment.`)}
    if(!j.success){if(/not authenticated|session expired|invalid session|inactive/i.test(j.error||''))clearSession();throw Error(j.error||'Request failed.')}
    return j.data??{};
  }
  window.PMVApi={
    getSession,saveSession,clearSession,
    login:(userId,mobile)=>request('login',{userId,mobile}),
    logout:()=>request('logout'),
    opening:d=>request('getPmvOpeningBalance',{date:d}),
    own:d=>request('getOwnPmvDashboard',{date:d}),
    admin:d=>request('getAdminPmvDashboard',{date:d}),
    submit:r=>request('submitPmvReport',{record:r}),
    articles:(d,q)=>request('getSpmArticles',{date:d,q:q||'',limit:10000}),
    adminArticles:(d,q)=>request('getAdminArticleStatus',{date:d,q:q||'',limit:10000}),
    updateArticleStatus:r=>request('updateArticleStatus',{record:r}),
    updateArticleMaster:r=>request('updateArticleMaster',{record:r}),
    pushArticleStatusToMaster:r=>request('pushArticleStatusToMaster',{record:r}),
    diagnoseMaster:()=>request('diagnoseArticleMaster'),
    diagnoseStatus:d=>request('diagnoseArticleStatus',{date:d})
  };
})();