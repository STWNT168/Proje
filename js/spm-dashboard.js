(() => {
'use strict';
const $=id=>document.getElementById(id);
const ids=['newKits','newArticles','redirectedKits','redirectedArticles','rtsKits','rtsArticles',
  'deliveredKits','deliveredArticles','invalidKits','invalidArticles','tornKits','tornArticles',
  'deliverableKits','deliverableArticles','incompleteKits','incompleteArticles'];
const map={
  newKits:'newKits',newArticles:'newArticles',
  redirectedKits:'redirectedKits',redirectedArticles:'redirectedArticles',
  rtsKits:'rtsKits',rtsArticles:'rtsArticles',
  deliveredKits:'deliveredKits',deliveredArticles:'deliveredArticles',
  invalidKits:'invalidMobileKits',invalidArticles:'invalidMobileArticles',
  tornKits:'tornKits',tornArticles:'tornArticles',
  deliverableKits:'deliverableKits',deliverableArticles:'deliverableArticles',
  incompleteKits:'incompleteKits',incompleteArticles:'incompleteArticles'
};
const zeroReport=()=>Object.fromEntries(Object.values(map).map(k=>[k,0]));
const n=id=>Math.max(0,Math.floor(Number($(id)?.value||0)));
function syncFields(report){
  const r=report&&typeof report==='object'?report:zeroReport();
  ids.forEach(id=>{const el=$(id);if(el)el.value=Number(r[map[id]]??0);});
}
function updateSummary(){
  const pairs={came:['newKits','newArticles'],delivered:['deliveredKits','deliveredArticles'],
    redirected:['redirectedKits','redirectedArticles'],rts:['rtsKits','rtsArticles']};
  Object.entries(pairs).forEach(([name,[k,a]])=>{
    const ek=$('sum-'+name+'-k'),ea=$('sum-'+name+'-a');
    if(ek)ek.textContent=n(k);if(ea)ea.textContent=n(a);
  });
}
async function load(d){
  const date=d||PMVApi.todayIndia();
  const opening=await PMVApi.opening(date)||{openingKits:0,openingArticles:0};
  if($('openK'))$('openK').textContent=Number(opening.openingKits||0);
  if($('openA'))$('openA').textContent=Number(opening.openingArticles||0);
  const report=await PMVApi.own(date)||zeroReport();
  window.__spmReport=report;syncFields(report);PMVCalc.render();updateSummary();
}
function bind(){
  ids.forEach(id=>$(id)?.addEventListener('input',()=>{PMVCalc.render();updateSummary();}));
  $('spm-date')?.addEventListener('change',()=>load($('spm-date').value).catch(e=>toast(e.message,true)));
  $('spm-form')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const v=PMVValidation.validate();if(!v.valid)return toast(v.message,true);
    const session=PMVApi.ensureSession();
    const record={date:$('spm-date').value,userId:session.userId};
    ids.forEach(id=>{
  const field =
    id==='invalidKits' ? 'invalidKits' :
    id==='invalidArticles' ? 'invalidArticles' :
    map[id];

  record[field]=n(id);
});;
    const b=e.submitter||$('submit-report');
    if(b){b.disabled=true;b.textContent='SAVING…';}
    try{
      const x=await PMVApi.submit(record);
      toast(`Saved successfully. Closing Kits: ${Number(x?.closingPendingKits||0)}; Articles: ${Number(x?.closingPendingArticles||0)}.`);
      await load(record.date);
    }catch(err){
      toast(err.message||'Unable to save daily report.',true);
    }finally{
      if(b){b.disabled=false;b.textContent='SUBMIT DAILY REPORT';}
    }
  });
}
window.PMVSpm={bind,setToday:()=>{if($('spm-date'))$('spm-date').value=PMVApi.todayIndia();},load};
})();
