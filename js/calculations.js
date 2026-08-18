function n(id){return Math.max(0,Math.floor(Number(document.getElementById(id)?.value||0)))}
function calcValues(){
  const openingK=Number(document.getElementById("openK").textContent||0);
  const openingA=Number(document.getElementById("openA").textContent||0);
  const closeK=openingK+n("newKits")-n("redirectedKits")-n("rtsKits")-n("deliveredKits");
  const closeA=openingA+n("newArticles")-n("redirectedArticles")-n("rtsArticles")-n("deliveredArticles");
  const partsK=n("invalidKits")+n("tornKits")+n("deliverableKits")+n("incompleteKits");
  const partsA=n("invalidArticles")+n("tornArticles")+n("deliverableArticles")+n("incompleteArticles");
  return {openingK,openingA,closeK,closeA,partsK,partsA};
}
function updateClosing(){const c=calcValues();document.getElementById("closeK").textContent=c.closeK;document.getElementById("closeA").textContent=c.closeA;return c}
