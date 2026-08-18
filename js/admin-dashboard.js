async function initAdmin(){
  const d=document.getElementById("admin-date");d.value=today();
  d.addEventListener("change",loadAdmin);
  document.getElementById("refresh").addEventListener("click",loadAdmin);
  await loadAdmin();
}
function stat(label,value){return `<div class="stat"><span>${escapeHtml(label)}</span><b>${Number(value||0).toLocaleString("en-IN")}</b></div>`}
async function loadAdmin(){
  const date=document.getElementById("admin-date").value||today();
  document.getElementById("monitoring").textContent=date;
  const status=document.getElementById("adminStatus");status.className="notice";status.textContent="Loading consolidated report...";
  try{
    const d=await apiGet("getAdminPmvDashboard",{date});
    const s=d.summary||{};
    document.getElementById("stats").innerHTML=[
      stat("New Kits",s.newKits),stat("New Articles",s.newArticles),
      stat("Redirected Kits",s.redirectedKits),stat("Redirected Articles",s.redirectedArticles),
      stat("RTS Kits",s.rtsKits),stat("RTS Articles",s.rtsArticles),
      stat("Delivered Kits Today",s.deliveredKitsToday),stat("Delivered Articles Today",s.deliveredArticlesToday),
      stat("Closing Pending Kits",s.closingPendingKits),stat("Closing Pending Articles",s.closingPendingArticles),
      stat("Invalid Mobile Kits",s.invalidMobileKits),stat("Incomplete Kits",s.incompleteKits)
    ].join("");
    renderOffice(d.officeWise||[]);
    renderPending(d.pendingSpms||[]);
    status.className="notice success";status.textContent=`Consolidated report loaded for ${date}.`;
  }catch(e){status.className="notice error";status.textContent=e.message;document.getElementById("stats").innerHTML="";document.getElementById("office").innerHTML="";document.getElementById("pending").innerHTML=""}
}
function renderOffice(rows){
  const h=["Office","Status","Opening Kits","New Kits","Redirected Kits","RTS Kits","Delivered Kits","Closing Pending Kits","Opening Articles","New Articles","Redirected Articles","RTS Articles","Delivered Articles","Closing Pending Articles"];
  document.getElementById("office").innerHTML="<thead><tr>"+h.map(x=>`<th>${x}</th>`).join("")+"</tr></thead><tbody>"+rows.map(r=>`<tr><td>${escapeHtml(r.officeName)}</td><td class="${r.status==="Updated"?"status-ok":"status-pending"}">${r.status}</td><td>${numf(r.openingKits)}</td><td>${numf(r.newKits)}</td><td>${numf(r.redirectedKits)}</td><td>${numf(r.rtsKits)}</td><td>${numf(r.deliveredKits)}</td><td>${numf(r.closingPendingKits)}</td><td>${numf(r.openingArticles)}</td><td>${numf(r.newArticles)}</td><td>${numf(r.redirectedArticles)}</td><td>${numf(r.rtsArticles)}</td><td>${numf(r.deliveredArticles)}</td><td>${numf(r.closingPendingArticles)}</td></tr>`).join("")+"</tbody>";
}
function renderPending(rows){
  document.getElementById("pending").innerHTML="<thead><tr><th>#</th><th>SPM Name</th><th>SPM ID</th><th>Office</th></tr></thead><tbody>"+rows.map((r,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(r.spmName)}</td><td>${escapeHtml(r.spmId)}</td><td>${escapeHtml(r.officeName)}</td></tr>`).join("")+"</tbody>";
}
function numf(v){return Number(v||0).toLocaleString("en-IN")}
