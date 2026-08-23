(()=> {
  const K='pmv_session_v2';
  const sess=()=>{try{return JSON.parse(localStorage.getItem(K)||'null')}catch(e){localStorage.removeItem(K);return null}};
  const save=s=>{if(!s?.token||!s?.userId)throw Error('Invalid login session returned by server.');localStorage.setItem(K,JSON.stringify(s));return s};
  const clear=()=>localStorage.removeItem(K);
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:APP_CONFIG.TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const authErr=m=>/not authenticated|session expired|invalid session|account is inactive|sign in again|log in again/i.test(String(m||''));
  async function req(method,action,p={}){
    const s=sess(); let r;
    if(method==='GET'){
      const q=new URLSearchParams({action,...p});
      if(s)q.set('session',JSON.stringify(s));
      r=await fetch(APP_CONFIG.API_URL+'?'+q.toString(),{cache:'no-store'});
    }else{
      r=await fetch(APP_CONFIG.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...p,session:s||undefined}),cache:'no-store'});
    }
    const t=await r.text(); let x;
    try{x=JSON.parse(t)}catch(e){throw Error('Apps Script returned an invalid response. Check the deployed /exec URL.')}
    if(!x.success){
      if(authErr(x.message)){clear();window.dispatchEvent(new CustomEvent('pmv-session-expired',{detail:{message:x.message}}))}
      throw Error(x.message||'Request failed.');
    }
    return x.data??{};
  }
  window.PMVApi={
    getSession:sess,saveSession:save,clearSession:clear,todayIndia:today,
    login:(userId,mobile)=>req('POST','login',{userId,mobile}),
    logout:()=>req('POST','logout'),
    opening:d=>req('GET','getPmvOpeningBalance',{date:d}),
    own:d=>req('GET','getOwnPmvDashboard',{date:d}),
    admin:d=>req('GET','getAdminPmvDashboard',{date:d}),
    submit:r=>req('POST','submitPmvReport',{record:r}),
    articles:(date,q)=>req('GET','getSpmArticles',{date,q:q||'',limit:1000}),
    updateArticleStatus:r=>req('POST','updateArticleStatus',{record:r}),
    adminArticles:(date,q)=>req('GET','getAdminArticleStatus',{date,q:q||'',limit:2000}),
    updateArticleMasterStatus:r=>req('POST','updateArticleMasterStatus',{record:r}),
    articleDiagnostic:d=>req('GET','getArticleSourceDiagnostic',{date:d})
  };
})();