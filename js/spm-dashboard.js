const SpmDashboard = (() => {
  let initialized=false;
  const session=()=>Auth.getSession();
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=String(v);};
  function render(d) {
    const r=d?.report;
    const s=session();
    set("dash-title","My Office Dashboard");
    set("dash-user",(s?.name||"—")+" · "+(s?.officeName||"—"));
    const k=document.getElementById("spm-kpis");
    const t=r||{};
    const cards=[
      ["Opening Kits",t.openingKits],["New Kits Received",t.kitsCameToday],["Redirected Kits",t.redirectedKits],
      ["RTS / Returned Kits",t.rtsKits],["Kits Delivered Today",t.deliveredKits],["Closing Pending Kits",t.pendingKits],
      ["Opening Articles",t.openingArticles],["New Articles Received",t.articlesCameToday],["Redirected Articles",t.redirectedArticles],
      ["RTS / Returned Articles",t.rtsArticles],["Articles Delivered Today",t.deliveredArticles],["Closing Pending Articles",t.pendingArticles]
    ];
    k.innerHTML=cards.map(c=>`<article><span>${c[0]}</span><b>${n(c[1])}</b></article>`).join("");
    const rows=[
      ["Invalid Mobile",t.invalidMobileKits,t.invalidMobileArticles],
      ["Torn / Damaged",t.tornKits,t.tornArticles],
      ["Without Proper Details / Address",t.improperDetailsKits,t.improperDetailsArticles],
      ["Deliverable",t.deliverableKits,t.deliverableArticles],
      ["Incomplete Sets",t.incompleteKits,t.incompleteArticles],
      ["Closing Pending Total",t.pendingKits,t.pendingArticles]
    ];
    document.getElementById("spm-dashboard-rows").innerHTML=rows.map((x,i)=>`<tr class="${i===rows.length-1?'strong':''}"><td>${x[0]}</td><td>${n(x[1])}</td><td>${n(x[2])}</td></tr>`).join("");
  }
  async function load(){
    const d=document.getElementById("dash-date").value, st=document.getElementById("dash-status");
    st.textContent="Loading…";
    try{
      const r=await Api.ownDashboard(session(),d); render(r.data);
      st.textContent=r.data?.report?`Report loaded for ${d}.`:`No report found for ${d}.`;
      st.className="status "+(r.data?.report?"good":"");
    }catch(e){st.textContent=e.message;st.className="status bad";}
  }
  function init(){
    const d=document.getElementById("dash-date");
    d.value=new Date().toISOString().slice(0,10); d.max=d.value;
    document.getElementById("dash-refresh").onclick=load; d.onchange=load; initialized=true; load();
  }
  return {init,load};
})();