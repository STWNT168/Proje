function session(){try{return JSON.parse(localStorage.getItem("pmv_session")||"null")}catch(e){return null}}
function saveSession(x){localStorage.setItem("pmv_session",JSON.stringify(x))}
function clearSession(){localStorage.removeItem("pmv_session")}
function today(){let d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
async function apiGet(action,p={}){let q=new URLSearchParams({action,...p});let s=session();if(s)q.set("session",JSON.stringify(s));let r=await fetch(APP_CONFIG.API_URL+"?"+q,{cache:"no-store"});let x=await r.json();if(!x.success)throw Error(x.message||"Request failed");return x.data}
async function apiPost(action,p={}){let s=session();let r=await fetch(APP_CONFIG.API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,...p,session:p.session||s})});let x=await r.json();if(!x.success)throw Error(x.message||"Request failed");return x.data}