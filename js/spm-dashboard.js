(()=>{
  const $=id=>document.getElementById(id),ids=['newKits','newArticles','redirectedKits','redirectedArticles','rtsKits','rtsArticles','deliveredKits','deliveredArticles','invalidKits','invalidArticles','tornKits','tornArticles','deliverableKits','deliverableArticles','incompleteKits','incompleteArticles'];
  const map={newKits:'newKits',newArticles:'newArticles',redirectedKits:'redirectedKits',redirectedArticles:'redirectedArticles',rtsKits:'rtsKits',rtsArticles:'rtsArticles',deliveredKits:'deliveredKits',deliveredArticles:'deliveredArticles',invalidKits:'invalidMobileKits',invalidArticles:'invalidMobileArticles',tornKits:'tornKits',tornArticles:'tornArticles',deliverableKits:'deliverableKits',deliverableArticles:'deliverableArticles',incompleteKits:'incompleteKits',incompleteArticles:'incompleteArticles'};
  const n=id=>Math.max(0,Number($(id)?.value||0));
  function setTable(id,rows){$(id).innerHTML=rows.map(r=>`<tr><th>${r[0]}</th><td><input id="${r[1]}" type="number" min="0" value="0" aria-label="${r[0]} Kits"></td><td><input id="${r[2]}" type="number" min="0" value="0" aria-label="${r[0]} Articles"></td></tr>`).join('')}
  function syncFields(){
    const r=window.__spmReport;
    ids.forEach(id=>{if($(id))$(id).value=r?(r[map[id]]||0):0});
  }
  async function load(d){
    let o=await PMVApi.opening(d);openK.textContent=o.openingKits||0;openA.textContent=o.openingArticles||0;
    let r=await PMVApi.own(d);window.__spmReport=r;syncFields();PMVCalc.render();
    const rowVals={
      came:[n('newKits'),n('newArticles')],delivered:[n('deliveredKits'),n('deliveredArticles')],redirected:[n('redirectedKits'),n('redirectedArticles')],rts:[n('rtsKits'),n('rtsArticles')]
    };
    ['came','delivered','redirected','rts'].forEach(k=>{const a=rowVals[k];const e=$('sum-'+k+'-k'),f=$('sum-'+k+'-a');if(e)e.textContent=a[0];if(f)f.textContent=a[1]});
  }
  function bind(){
    ids.forEach(id=>$(id)?.addEventListener('input',()=>{PMVCalc.render();const pair={newKits:'came',newArticles:'came',deliveredKits:'delivered',deliveredArticles:'delivered',redirectedKits:'redirected',redirectedArticles:'redirected',rtsKits:'rts',rtsArticles:'rts'}[id];if(pair){$('sum-'+pair+'-'+(id.endsWith('Kits')?'k':'a')).textContent=n(id)}}));
    $('spm-date').addEventListener('change',()=>load($('spm-date').value).catch(e=>toast(e.message,1)));
    $('spm-form').addEventListener('submit',async e=>{e.preventDefault();let v=PMVValidation.validate();if(!v.valid)return toast(v.message,1);let r={date:$('spm-date').value};ids.forEach(id=>r[map[id]]=n(id));let b=e.submitter;b.disabled=true;b.textContent='SAVING…';try{let x=await PMVApi.submit(r);toast(`Saved successfully. Closing Kits: ${x.closingPendingKits}; Articles: ${x.closingPendingArticles}.`);await load(r.date)}catch(err){toast(err.message,1)}finally{b.disabled=false;b.textContent='SUBMIT DAILY REPORT'}})
  }
  window.PMVSpm={bind,setToday:()=>$('spm-date').value=PMVApi.todayIndia(),load}
})();
