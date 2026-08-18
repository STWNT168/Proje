function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function showLoginLikeMessage(id,text,cls){const el=document.getElementById(id);if(el){el.textContent=text||"";el.className="notice "+(cls||"")}}
document.addEventListener("DOMContentLoaded",async()=>{
  const loginView=document.getElementById("loginView"),spmView=document.getElementById("spmView"),adminView=document.getElementById("adminView"),logout=document.getElementById("logout");
  const s=getSession();
  if(!s){
    loginView.classList.remove("hidden");
    document.getElementById("login").addEventListener("click",login);
    document.getElementById("mobile").addEventListener("keydown",e=>{if(e.key==="Enter")login()});
    document.getElementById("uid").addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("mobile").focus()});
    return;
  }
  loginView.classList.add("hidden");logout.classList.remove("hidden");
  document.getElementById("who").textContent=`${s.name||""} · ${s.role||""} · ${s.officeName||""}`;
  logout.addEventListener("click",async()=>{try{await apiPost("logout",{});}catch(e){}clearSession();location.reload()});
  if(String(s.role).toUpperCase()==="SPM"){spmView.classList.remove("hidden");initSpm()}
  else{adminView.classList.remove("hidden");initAdmin()}
});
async function login(){
  const uid=document.getElementById("uid").value.trim(),mobile=document.getElementById("mobile").value.trim(),btn=document.getElementById("login");
  if(!uid||!mobile){showLoginLikeMessage("loginMsg","Enter both User ID and registered mobile number.","error");return}
  btn.disabled=true;btn.textContent="SIGNING IN...";
  try{
    const s=await apiPost("login",{userId:uid,mobile});
    saveSession(s);location.reload();
  }catch(e){showLoginLikeMessage("loginMsg",e.message,"error")}
  finally{btn.disabled=false;btn.textContent="SIGN IN"}
});
