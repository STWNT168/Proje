const SpmDashboard=(()=>{
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=String(v);};
  function render(d){
    const r=d?.report||{},s=Auth.getSession();set("dash-title","My Office Dashboard");set("dash-user",(s?.name||"—")+" · "+(s?.officeName||"—"));
    const cards=[["Opening Kits",r.openingKits],["New Kits Received",r.kitsCameToday],["Redirected Kits",r.redirectedKits],["RTS / Returned Kits",r.rtsKits],["Kits Delivered Today",r.deliveredKits],["Closing Pending Kits",r.pendingKits],["Opening Articles",r.openingArticles],["New Articles Received",r.articlesCameToday],["Redirected Articles",r.redirectedArticles],["RTS / Returned Articles",r.rtsArticles],["Articles Delivered Today",r.deliveredArticles],["Closing Pending Articles",r.pendingArticles]];
    document.getElementById("spm-kpis").innerHTML=cards.map(c=>`<article><span>${c[0]}</span><b>${n(c[1])}</b></article>`).join("");
    const rows=[["Invalid Mobile",r.invalidMobileKits,r.invalidMobileArticles],["Torn / Damaged",r.tornKits,r.tornArticles],["Without Proper Details / Address",r.improperDetailsKits,r.improperDetailsArticles],["Deliverable",r.deliverableKits,r.deliverableArticles],["Incomplete Sets",r.incompleteKits,r.incompleteArticles],["Closing Pending Total",r.pendingKits,r.pendingArticles]];
    document.getElementById("spm-dashboard-rows").innerHTML=rows.map((x,i)=>`<tr class="${i===rows.length-1?"strong":""}"><td>${x[0]}</td><td>${n(x[1])}</td><td>${n(x[2])}</td></tr>`).join("");
  }
  async function load(){const d=document.getElementById("dash-date").value,st=document.getElementById("dash-status");st.textContent="Loading…";try{const r=await Api.ownDashboard(Auth.getSession(),d);render(r.data);st.textContent=r.data?.report?`Report loaded for ${d}.`:`No report found for ${d}.`;st.className="status "+(r.data?.report?"good":"");}catch(e){st.textContent=e.message;st.className="status bad";}}
  function init(){const d=document.getElementById("dash-date");d.value=new Date().toISOString().slice(0,10);d.max=d.value;document.getElementById("dash-refresh").onclick=load;d.onchange=load;load();}
  return {init,load};
})();
