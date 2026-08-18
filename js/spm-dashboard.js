let spmLoadedDate="";
async function loadSpmDate(){
  const date=document.getElementById("spm-date").value||today();
  document.getElementById("spm-date").value=date;
  try{
    const d=await apiGet("getPmvOpeningBalance",{date});
    document.getElementById("openK").textContent=Number(d.openingKits||0);
    document.getElementById("openA").textContent=Number(d.openingArticles||0);
    spmLoadedDate=date;
    updateClosing();validateForm(false);
    const own=await apiGet("getOwnPmvDashboard",{date});
    if(own)fillOwn(own);
  }catch(e){
    showLoginLikeMessage("loginMsg",e.message,"error");
  }
}
function fillOwn(r){
  const map={newKits:"newKits",newArticles:"newArticles",redirectedKits:"redirectedKits",redirectedArticles:"redirectedArticles",rtsKits:"rtsKits",rtsArticles:"rtsArticles",deliveredKits:"deliveredKits",deliveredArticles:"deliveredArticles",invalidMobileKits:"invalidKits",invalidMobileArticles:"invalidArticles",tornKits:"tornKits",tornArticles:"tornArticles",deliverableKits:"deliverableKits",deliverableArticles:"deliverableArticles",incompleteKits:"incompleteKits",incompleteArticles:"incompleteArticles"};
  Object.keys(map).forEach(k=>{const el=document.getElementById(map[k]);if(el)el.value=Number(r[k]||0)});
  updateClosing();validateForm(false);
}
function initSpm(){
  const d=document.getElementById("spm-date");d.value=today();
  d.addEventListener("change",loadSpmDate);
  document.querySelectorAll("#spm-form input").forEach(x=>x.addEventListener("input",()=>validateForm()));
  document.getElementById("spm-form").addEventListener("submit",submitSpm);
  loadSpmDate();
}
async function submitSpm(ev){
  ev.preventDefault();
  if(!validateForm())return;
  const date=document.getElementById("spm-date").value;
  const record={date};
  const map={newKits:"newKits",newArticles:"newArticles",redirectedKits:"redirectedKits",redirectedArticles:"redirectedArticles",rtsKits:"rtsKits",rtsArticles:"rtsArticles",deliveredKits:"deliveredKits",deliveredArticles:"deliveredArticles",invalidMobileKits:"invalidKits",invalidMobileArticles:"invalidArticles",tornKits:"tornKits",tornArticles:"tornArticles",deliverableKits:"deliverableKits",deliverableArticles:"deliverableArticles",incompleteKits:"incompleteKits",incompleteArticles:"incompleteArticles"};
  Object.keys(map).forEach(k=>record[k]=n(map[k]));
  const btn=document.getElementById("submitReport");btn.disabled=true;btn.textContent="Saving...";
  try{
    const r=await apiPost("submitPmvReport",{record});
    const el=document.getElementById("validation");el.className="validation-card ok";el.innerHTML="<b>Saved successfully.</b><br>"+(r.message||"Daily report saved.");
    await loadSpmDate();
  }catch(e){const el=document.getElementById("validation");el.className="validation-card bad";el.innerHTML="<b>Submission failed.</b><br>"+e.message}
  finally{btn.disabled=false;btn.textContent="SUBMIT DAILY REPORT"}
}
