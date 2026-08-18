const SESSION_KEY="pmv_session";
function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||"null")}catch(e){localStorage.removeItem(SESSION_KEY);return null}}
function saveSession(s){if(!s||!s.token||!s.userId)throw new Error("Invalid login session returned by server.");localStorage.setItem(SESSION_KEY,JSON.stringify(s))}
function clearSession(){localStorage.removeItem(SESSION_KEY)}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
async function apiPost(action,p={}){
  const payload={action,...p};
  const s=getSession();
  if(s) payload.session=s;
  const r=await fetch(APP_CONFIG.API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload),cache:"no-store"});
  const text=await r.text();
  let x; try{x=JSON.parse(text)}catch(e){throw new Error("API returned an invalid response. Check Apps Script deployment/access settings.")}
  if(!x.success)throw new Error(x.message||"Request failed.");
  return x.data;
}
async function apiGet(action,p={}){
  const q=new URLSearchParams({action,...p});
  const s=getSession(); if(s)q.set("session",JSON.stringify(s));
  const r=await fetch(APP_CONFIG.API_URL+"?"+q.toString(),{cache:"no-store"});
  const text=await r.text();
  let x; try{x=JSON.parse(text)}catch(e){throw new Error("API returned an invalid response. Check Apps Script deployment/access settings.")}
  if(!x.success)throw new Error(x.message||"Request failed.");
  return x.data;
}
