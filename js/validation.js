const PMVValidation = (() => {
  const ids=[
    "received-kits","received-articles","redirected-kits","redirected-articles","rts-kits","rts-articles",
    "delivered-kits","delivered-articles","invalid-mobile-kits","invalid-mobile-articles","torn-kits","torn-articles",
    "improper-details-kits","improper-details-articles","deliverable-kits","deliverable-articles","incomplete-kits","incomplete-articles"
  ];
  function validate() {
    const c=PMVCalc.compute(), errors=[];
    ids.forEach(id=>{
      const e=document.getElementById(id), n=Number(e?.value);
      if(!Number.isInteger(n)||n<0) errors.push(id+" must be a non-negative whole number.");
    });
    if(c.redk+c.rtsk+c.dk>c.availableKits) errors.push("Kits: Redirected + RTS/Returned + Delivered cannot exceed Opening + New Received.");
    if(c.reda+c.rtsa+c.da>c.availableArticles) errors.push("Articles: Redirected + RTS/Returned + Delivered cannot exceed Opening + New Received.");
    if(c.sk!==c.pk) errors.push(`Kits mismatch: status total is ${c.sk}, but closing pending is ${c.pk}.`);
    if(c.sa!==c.pa) errors.push(`Articles mismatch: status total is ${c.sa}, but closing pending is ${c.pa}.`);
    const box=document.getElementById("validation-box");
    if(box){
      box.innerHTML=errors.length?errors.map(x=>`<div>⚠ ${escapeHtml(x)}</div>`).join(""):"✓ All kit/article balances are valid.";
      box.className="validation "+(errors.length?"bad":"good");
    }
    const submit=document.getElementById("submit-report");
    if(submit) submit.disabled=errors.length>0;
    return {valid:errors.length===0,errors};
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
  return {validate};
})();