document.addEventListener("DOMContentLoaded",()=>{
  const $=id=>document.getElementById(id);
  function today(){return new Date().toISOString().slice(0,10);}
  function toast(msg,bad=false){const e=$("toast");e.textContent=msg;e.className=bad?"bad":"";setTimeout(()=>e.className="",3500);}
  function show(which){["entry-screen","dashboard-screen","admin-screen"].forEach(id=>$(id).classList.add("hidden"));$(which).classList.remove("hidden");}
  async function loadOffices(){
    const s=Auth.getSession(),r=await Api.offices(s),select=$("office");select.innerHTML='<option value="">Select Office</option>';
    (r.data||[]).forEach(o=>{const op=document.createElement("option");op.value=o.officeId;op.textContent=o.officeName;select.appendChild(op);});
    if(s?.officeId){select.value=s.officeId;select.disabled=true;loadOpening();}
  }
  async function loadOpening(){
    const s=Auth.getSession(),office=$("office").value,date=$("report-date").value;if(!office||!date)return;
    try{const r=await Api.opening(s,office,date);$("opening-kits").textContent=r.data.openingKits;$("opening-articles").textContent=r.data.openingArticles;const f=$("report-form");f.dataset.openingKits=r.data.openingKits;f.dataset.openingArticles=r.data.openingArticles;PMVValidation.validate();}catch(e){toast(e.message,true);}
  }
  function setDefaults(){
    $("report-date").value=today();$("report-date").max=today();
    ["received-kits","received-articles","redirected-kits","redirected-articles","rts-kits","rts-articles","delivered-kits","delivered-articles","invalid-mobile-kits","invalid-mobile-articles","torn-kits","torn-articles","improper-details-kits","improper-details-articles","deliverable-kits","deliverable-articles","incomplete-kits","incomplete-articles"].forEach(id=>$(id).value=0);
    $("validation-box").textContent="";$("validation-box").className="validation";loadOpening();
  }
  function record(){
    const f=$("report-form");const x={id:crypto.randomUUID(),date:$("report-date").value,officeId:$("office").value};
    ["openingKits","openingArticles","receivedKits","receivedArticles","redirectedKits","redirectedArticles","rtsKits","rtsArticles","deliveredKits","deliveredArticles","invalidMobileKits","invalidMobileArticles","tornKits","tornArticles","improperDetailsKits","improperDetailsArticles","deliverableKits","deliverableArticles","incompleteKits","incompleteArticles"].forEach(k=>{const id=k.replace(/[A-Z]/g,m=>"-"+m.toLowerCase());x[k]=k==="openingKits"?Number(f.dataset.openingKits||0):k==="openingArticles"?Number(f.dataset.openingArticles||0):Number($(id).value||0);});return x;
  }
  $("login-form").onsubmit=async e=>{e.preventDefault();try{const r=await Api.login($("login-user-id").value.trim(),$("login-mobile").value.trim());Auth.setSession(r.data);$("login-view").classList.add("hidden");$("app-view").classList.remove("hidden");$("user-badge").textContent=`${r.data.name} · ${r.data.role} · ${r.data.officeName}`;$("nav-entry").classList.toggle("hidden",r.data.role!=="SPM");$("nav-dashboard").textContent=r.data.role==="SPM"?"Dashboard":"Consolidated Dashboard";setDefaults();await loadOffices();show(r.data.role==="SPM"?"entry-screen":"admin-screen");if(r.data.role==="SPM")SpmDashboard.init();else AdminDashboard.init();}catch(e){toast(e.message,true);}};
  $("logout").onclick=async()=>{try{await Api.logout(Auth.getSession())}catch(_){}Auth.clear();location.reload();};
  $("nav-entry").onclick=()=>show("entry-screen");
  $("nav-dashboard").onclick=()=>{const s=Auth.getSession();if(s.role==="SPM"){show("dashboard-screen");SpmDashboard.init();}else{show("admin-screen");AdminDashboard.init();}};
  $("office").onchange=loadOpening;$("report-date").onchange=loadOpening;
  document.querySelectorAll("#report-form input[type=number]").forEach(e=>e.addEventListener("input",PMVValidation.validate));
  $("report-form").onsubmit=async e=>{e.preventDefault();const v=PMVValidation.validate();if(!v.valid)return toast("Please correct the validation errors.",true);try{$("submit-report").disabled=true;const r=await Api.submit(Auth.getSession(),record());toast(r.message||"Report saved.");setDefaults();SpmDashboard.load();}catch(e){toast(e.message,true);$("submit-report").disabled=false;}};
  $("reset-report").onclick=setDefaults;
  const s=Auth.getSession();if(s){$("login-view").classList.add("hidden");$("app-view").classList.remove("hidden");$("user-badge").textContent=`${s.name} · ${s.role} · ${s.officeName}`;$("nav-entry").classList.toggle("hidden",s.role!=="SPM");$("nav-dashboard").textContent=s.role==="SPM"?"Dashboard":"Consolidated Dashboard";setDefaults();loadOffices().then(()=>{show(s.role==="SPM"?"entry-screen":"admin-screen");if(s.role==="SPM")SpmDashboard.init();else AdminDashboard.init();}).catch(e=>toast(e.message,true));}
});