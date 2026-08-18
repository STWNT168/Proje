document.addEventListener("DOMContentLoaded",()=>{
  const $=id=>document.getElementById(id);
  let offices=[];
  function today(){return new Date().toISOString().slice(0,10);}
  function toast(msg,bad=false){const e=$("toast");e.textContent=msg;e.className=bad?"bad":"";setTimeout(()=>e.className="",3500);}
  function show(which){
    ["entry-screen","dashboard-screen","admin-screen"].forEach(id=>$(id).classList.add("hidden"));
    $(which).classList.remove("hidden");
  }
  async function loadOffices(){
    const s=Auth.getSession(), r=await Api.offices(s); offices=r.data||[];
    const select=$("office"); select.innerHTML='<option value="">Select Office</option>';
    offices.forEach(o=>{const op=document.createElement("option");op.value=o.officeId;op.textContent=o.officeName;select.appendChild(op);});
    if(s?.officeId){select.value=s.officeId;select.disabled=true;loadOpening();}
  }
  async function loadOpening(){
    const s=Auth.getSession(), office=$("office").value, date=$("report-date").value;
    if(!office||!date)return;
    try{
      const r=await Api.opening(s,office,date);
      $("opening-kits").textContent=r.data.openingKits;
      $("opening-articles").textContent=r.data.openingArticles;
      document.querySelector("#report-form").dataset.openingKits=r.data.openingKits;
      document.querySelector("#report-form").dataset.openingArticles=r.data.openingArticles;
      PMVCalc.compute(); PMVValidation.validate();
    }catch(e){toast(e.message,true);}
  }
  function setDefaults(){
    $("report-date").value=today(); $("report-date").max=today();
    ["received-kits","received-articles","redirected-kits","redirected-articles","rts-kits","rts-articles","delivered-kits","delivered-articles",
     "invalid-mobile-kits","invalid-mobile-articles","torn-kits","torn-articles","improper-details-kits","improper-details-articles",
     "deliverable-kits","deliverable-articles","incomplete-kits","incomplete-articles"].forEach(id=>$(id).value=0);
    $("validation-box").textContent=""; $("validation-box").className="validation";
    loadOpening();
  }
  function record(){
    const f=document.querySelector("#report-form"), s=Auth.getSession();
    return {
      id:crypto.randomUUID(),date:$("report-date").value,officeId:$("office").value,
      openingKits:Number(f.dataset.openingKits||0),openingArticles:Number(f.dataset.openingArticles||0),
      receivedKits:Number($("received-kits").value),receivedArticles:Number($("received-articles").value),
      redirectedKits:Number($("redirected-kits").value),redirectedArticles:Number($("redirected-articles").value),
      rtsKits:Number($("rts-kits").value),rtsArticles:Number($("rts-articles").value),
      deliveredKits:Number($("delivered-kits").value),deliveredArticles:Number($("delivered-articles").value),
      invalidMobileKits:Number($("invalid-mobile-kits").value),invalidMobileArticles:Number($("invalid-mobile-articles").value),
      tornKits:Number($("torn-kits").value),tornArticles:Number($("torn-articles").value),
      improperDetailsKits:Number($("improper-details-kits").value),improperDetailsArticles:Number($("improper-details-articles").value),
      deliverableKits:Number($("deliverable-kits").value),deliverableArticles:Number($("deliverable-articles").value),
      incompleteKits:Number($("incomplete-kits").value),incompleteArticles:Number($("incomplete-articles").value)
    };
  }
  $("login-form").onsubmit=async e=>{
    e.preventDefault();
    try{
      const r=await Api.login($("login-user-id").value.trim(),$("login-mobile").value.trim());
      Auth.setSession(r.data); $("login-view").classList.add("hidden");$("app-view").classList.remove("hidden");
      $("user-badge").textContent=`${r.data.name} · ${r.data.role} · ${r.data.officeName}`;
      $("nav-entry").classList.toggle("hidden",r.data.role!=="SPM");
      $("nav-dashboard").textContent=r.data.role==="SPM"?"Dashboard":"Consolidated Dashboard";
      setDefaults(); await loadOffices();
      show(r.data.role==="SPM"?"entry-screen":"admin-screen");
      if(r.data.role==="SPM")SpmDashboard.init(); else AdminDashboard.init();
    }catch(e){toast(e.message,true);}
  };
  $("logout").onclick=async()=>{try{await Api.logout(Auth.getSession())}catch(_){} Auth.clear();location.reload();};
  $("nav-entry").onclick=()=>{show("entry-screen");};
  $("nav-dashboard").onclick=()=>{const s=Auth.getSession();if(s.role==="SPM"){show("dashboard-screen");SpmDashboard.init();}else{show("admin-screen");AdminDashboard.init();}};
  $("office").onchange=loadOpening; $("report-date").onchange=loadOpening;
  document.querySelectorAll("#report-form input[type=number]").forEach(e=>e.addEventListener("input",PMVValidation.validate));
  $("report-form").onsubmit=async e=>{
    e.preventDefault();
    const v=PMVValidation.validate(); if(!v.valid)return toast("Please correct the validation errors.",true);
    try{
      $("submit-report").disabled=true;
      const r=await Api.submit(Auth.getSession(),record());
      toast(r.message||"Report saved."); setDefaults(); SpmDashboard.load();
    }catch(e){toast(e.message,true);$("submit-report").disabled=false;}
  };
  $("reset-report").onclick=setDefaults;
  if(Auth.getSession()){
    const s=Auth.getSession();$("login-view").classList.add("hidden");$("app-view").classList.remove("hidden");
    $("user-badge").textContent=`${s.name} · ${s.role} · ${s.officeName}`;
    $("nav-entry").classList.toggle("hidden",s.role!=="SPM");
    $("nav-dashboard").textContent=s.role==="SPM"?"Dashboard":"Consolidated Dashboard";
    setDefaults(); loadOffices().then(()=>{show(s.role==="SPM"?"entry-screen":"admin-screen");if(s.role==="SPM")SpmDashboard.init();else AdminDashboard.init();}).catch(e=>toast(e.message,true));
  }
});