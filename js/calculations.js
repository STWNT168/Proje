const PMVCalc = (() => {
  const n=id=>Math.max(0,Math.floor(Number(document.getElementById(id)?.value)||0));
  const val=id=>document.getElementById(id);
  const set=(id,v)=>{const e=val(id);if(e)e.textContent=String(v);};
  function compute() {
    const ok=n("opening-kits"), oa=n("opening-articles");
    const rk=n("received-kits"), ra=n("received-articles");
    const redk=n("redirected-kits"), reda=n("redirected-articles");
    const rtsk=n("rts-kits"), rtsa=n("rts-articles");
    const dk=n("delivered-kits"), da=n("delivered-articles");
    const pk=Math.max(0,ok+rk-redk-rtsk-dk);
    const pa=Math.max(0,oa+ra-reda-rtsa-da);
    const sk=n("invalid-mobile-kits")+n("torn-kits")+n("improper-details-kits")+n("deliverable-kits")+n("incomplete-kits");
    const sa=n("invalid-mobile-articles")+n("torn-articles")+n("improper-details-articles")+n("deliverable-articles")+n("incomplete-articles");
    set("pending-kits",pk); set("pending-articles",pa);
    set("calc-pending-kits",pk); set("calc-pending-articles",pa);
    set("calc-delivered-kits",dk); set("calc-delivered-articles",da);
    set("status-total-kits",sk); set("status-total-articles",sa);
    return {pk,pa,sk,sa,availableKits:ok+rk,availableArticles:oa+ra,redk,reda,rtsk,rtsa,dk,da};
  }
  return {compute};
})();