const AdminDashboard=(()=>{
  const n=v=>Number.isFinite(Number(v))?Number(v):0,session=()=>Auth.getSession();
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  function card(a,b){return `<article><span>${a}</span><b>${n(b)}</b></article>`;}
  function render(d){
    document.getElementById("admin-date-label").textContent=d.date;const t=d.totals||{};
    document.getElementById("admin-kpis").innerHTML=[["New Kits",t.kitsCameToday],["New Articles",t.articlesCameToday],["Redirected Kits",t.redirectedKits],["Redirected Articles",t.redirectedArticles],["RTS Kits",t.rtsKits],["RTS Articles",t.rtsArticles],["Delivered Kits Today",t.deliveredKits],["Delivered Articles Today",t.deliveredArticles],["Closing Pending Kits",t.pendingKits],["Closing Pending Articles",t.pendingArticles],["Invalid Mobile Kits",t.invalidMobileKits],["Incomplete Kits",t.incompleteKits]].map(x=>card(x[0],x[1])).join("");
    document.getElementById("admin-rows").innerHTML=(d.detailedSpmData||[]).map(r=>`<tr><td>${esc(r.officeName)}</td><td>${esc(r.status)}</td><td>${n(r.openingKits)}</td><td>${n(r.kitsCameToday)}</td><td>${n(r.redirectedKits)}</td><td>${n(r.rtsKits)}</td><td>${n(r.deliveredKits)}</td><td>${n(r.pendingKits)}</td><td>${n(r.openingArticles)}</td><td>${n(r.articlesCameToday)}</td><td>${n(r.redirectedArticles)}</td><td>${n(r.rtsArticles)}</td><td>${n(r.deliveredArticles)}</td><td>${n(r.pendingArticles)}</td><td>${n(r.invalidMobileKits)} / ${n(r.invalidMobileArticles)}</td><td>${n(r.tornKits)} / ${n(r.tornArticles)}</td><td>${n(r.improperDetailsKits)} / ${n(r.improperDetailsArticles)}</td><td>${n(r.deliverableKits)} / ${n(r.deliverableArticles)}</td><td>${n(r.incompleteKits)} / ${n(r.incompleteArticles)}</td></tr>`).join("");
    const p=d.pendingSpms||[];document.getElementById("admin-pending-rows").innerHTML=p.length?p.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.spmName)}</td><td>${esc(x.spmId)}</td><td>${esc(x.officeName)}</td></tr>`).join(""):`<tr><td colspan="4">All active SPMs updated.</td></tr>`;
  }
  async function load(){const d=document.getElementById("admin-date").value,st=document.getElementById("admin-status");st.textContent="Loading…";try{const r=await Api.adminDashboard(session(),d);render(r.data);st.textContent=`Consolidated report loaded for ${d}.`;st.className="status good";}catch(e){st.textContent=e.message;st.className="status bad";}}
  function init(){const d=document.getElementById("admin-date");d.value=new Date().toISOString().slice(0,10);d.max=d.value;document.getElementById("admin-refresh").onclick=load;d.onchange=load;load();}
  return {init,load};
})();
