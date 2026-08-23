(()=>{
  const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),num=x=>Number(x||0).toLocaleString('en-IN');
  function stats(s, article){
    const a=[
      ['newKits','Came Today · Kits'],['newArticles','Came Today · Articles'],
      ['deliveredKitsToday','Delivered · Kits'],['deliveredArticlesToday','Delivered · Articles'],
      ['redirectedKits','Redirected · Kits'],['redirectedArticles','Redirected · Articles'],
      ['rtsKits','RTS · Kits'],['rtsArticles','RTS · Articles'],
      ['closingPendingKits','Closing Pending · Kits'],['closingPendingArticles','Closing Pending · Articles'],
      ['invalidMobileKits','Invalid Mobile · Kits'],['incompleteKits','Incomplete · Kits']
    ];
    const b=[
      ['totalArticles','Article Master'],['updatedArticles','Status Updated'],
      ['pendingArticles','Status Pending'],['delivered','Article Delivered'],
      ['redirected','Article Redirected'],['rtsReturn','Article RTS / Return'],
      ['notReceived','Not Received'],['masterSynced','Master Synced'],
      ['masterPendingSync','Master Pending Sync']
    ];
    $('stats').innerHTML=
      a.map(x=>`<div class="stat"><span>${x[1]}</span><b>${num(s[x[0]])}</b></div>`).join('')+
      b.map(x=>`<div class="stat article-stat"><span>${x[1]}</span><b>${num(article?.[x[0]])}</b></div>`).join('');
  }
  function office(rs){
    let h=['Office','Status','SPMs','Updated','Kits: Opening','Kits: Came','Kits: Redirect','Kits: RTS','Kits: Delivered','Kits: Closing','Articles: Opening','Articles: Came','Articles: Redirect','Articles: RTS','Articles: Delivered','Articles: Closing'];
    $('office').innerHTML='<thead><tr>'+h.map(x=>`<th>${x}</th>`).join('')+'</tr></thead><tbody>'+rs.map(r=>`<tr><td>${esc(r.officeName)}</td><td><i class="pill ${r.status==='Updated'?'green':'amber'}">${r.status}</i></td><td>${r.totalSpms}</td><td>${r.updatedSpms}</td><td>${num(r.openingKits)}</td><td>${num(r.newKits)}</td><td>${num(r.redirectedKits)}</td><td>${num(r.rtsKits)}</td><td>${num(r.deliveredKits)}</td><td>${num(r.closingPendingKits)}</td><td>${num(r.openingArticles)}</td><td>${num(r.newArticles)}</td><td>${num(r.redirectedArticles)}</td><td>${num(r.rtsArticles)}</td><td>${num(r.deliveredArticles)}</td><td>${num(r.closingPendingArticles)}</td></tr>`).join('')+'</tbody>'
  }
  function spmWise(rs){
    const h=['SPM','Office','Status','Kits · Opening','Kits · Came Today','Kits · Delivered','Kits · Redirect','Kits · RTS','Kits · Invalid Mobile','Kits · Torn','Kits · Deliverable','Kits · Incomplete','Kits · Closing','Articles · Opening','Articles · Came Today','Articles · Delivered','Articles · Redirect','Articles · RTS','Articles · Invalid Mobile','Articles · Torn','Articles · Deliverable','Articles · Incomplete','Articles · Closing'];
    $('spmWise').innerHTML='<thead><tr>'+h.map(x=>`<th>${x}</th>`).join('')+'</tr></thead><tbody>'+rs.map(r=>`<tr><td><strong>${esc(r.spmName)}</strong><small>${esc(r.spmId)}</small></td><td>${esc(r.officeName)}</td><td><i class="pill ${r.status==='Updated'?'green':'amber'}">${r.status}</i></td><td>${num(r.openingKits)}</td><td>${num(r.newKits)}</td><td>${num(r.deliveredKits)}</td><td>${num(r.redirectedKits)}</td><td>${num(r.rtsKits)}</td><td>${num(r.invalidMobileKits)}</td><td>${num(r.tornKits)}</td><td>${num(r.deliverableKits)}</td><td>${num(r.incompleteKits)}</td><td>${num(r.closingPendingKits)}</td><td>${num(r.openingArticles)}</td><td>${num(r.newArticles)}</td><td>${num(r.deliveredArticles)}</td><td>${num(r.redirectedArticles)}</td><td>${num(r.rtsArticles)}</td><td>${num(r.invalidMobileArticles)}</td><td>${num(r.tornArticles)}</td><td>${num(r.deliverableArticles)}</td><td>${num(r.incompleteArticles)}</td><td>${num(r.closingPendingArticles)}</td></tr>`).join('')+'</tbody>'
  }
  function pending(rs){$('pending').innerHTML='<thead><tr><th>#</th><th>SPM Name</th><th>SPM ID</th><th>Office</th></tr></thead><tbody>'+rs.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.spmName)}</td><td>${esc(r.spmId)}</td><td>${esc(r.officeName)}</td></tr>`).join('')+'</tbody>'}
  async function load(d){try{let x=await PMVApi.admin(d);monitoring.textContent=x.date;stats(x.summary,x.articleSummary);office(x.officeWise||[]);spmWise(x.spmWise||[]);pending(x.pendingSpms||[]);adminStatus.textContent=`${x.spmsUpdatedToday} of ${x.activeSpms} active SPMs updated (${x.updatePercentage||0}%) for ${x.date}. · Master sync: ${x.articleSummary?.masterSynced||0} synced / ${x.articleSummary?.masterPendingSync||0} pending.`}catch(e){adminStatus.textContent=e.message;toast(e.message,1)}}
  function bind(){refresh.onclick=()=>load($('admin-date').value);$('admin-date').onchange=()=>load($('admin-date').value)}
  window.PMVAdmin={bind,load,setToday:()=>$('admin-date').value=PMVApi.todayIndia()}
})();
