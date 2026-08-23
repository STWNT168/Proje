(()=>{
  const $=id=>document.getElementById(id);
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=x=>Number(x||0).toLocaleString('en-IN');
  const toastMsg=(m,b)=>typeof toast==='function'&&toast(m,b);

  function stats(s={}){const a=[
    ['newKits','Came Today · Kits'],['newArticles','Came Today · Articles'],
    ['deliveredKitsToday','Delivered · Kits'],['deliveredArticlesToday','Delivered · Articles'],
    ['redirectedKits','Redirected · Kits'],['redirectedArticles','Redirected · Articles'],
    ['rtsKits','RTS · Kits'],['rtsArticles','RTS · Articles'],
    ['closingPendingKits','Closing Pending · Kits'],['closingPendingArticles','Closing Pending · Articles'],
    ['invalidMobileKits','Invalid Mobile · Kits'],['invalidMobileArticles','Invalid Mobile · Articles'],
    ['incompleteKits','Incomplete · Kits'],['incompleteArticles','Incomplete · Articles']];
    if($('stats'))$('stats').innerHTML=a.map(x=>`<div class="stat"><span>${x[1]}</span><b>${num(s[x[0]])}</b></div>`).join('');
  }
  function office(rs=[]){const h=['Office','Status','SPMs','Updated','Kits Opening','Kits Came','Kits Redirect','Kits RTS','Kits Delivered','Kits Closing','Articles Opening','Articles Came','Articles Redirect','Articles RTS','Articles Delivered','Articles Closing'];
    if($('office'))$('office').innerHTML='<thead><tr>'+h.map(x=>`<th>${x}</th>`).join('')+'</tr></thead><tbody>'+rs.map(r=>`<tr><td>${esc(r.officeName)}</td><td><i class="pill ${r.status==='Updated'?'green':'amber'}">${esc(r.status)}</i></td><td>${r.totalSpms||0}</td><td>${r.updatedSpms||0}</td><td>${num(r.openingKits)}</td><td>${num(r.newKits)}</td><td>${num(r.redirectedKits)}</td><td>${num(r.rtsKits)}</td><td>${num(r.deliveredKits)}</td><td>${num(r.closingPendingKits)}</td><td>${num(r.openingArticles)}</td><td>${num(r.newArticles)}</td><td>${num(r.redirectedArticles)}</td><td>${num(r.rtsArticles)}</td><td>${num(r.deliveredArticles)}</td><td>${num(r.closingPendingArticles)}</td></tr>`).join('')+'</tbody>';
  }
  function spmWise(rs=[]){const h=['SPM','Office','Status','Kits Opening','Kits Came','Kits Delivered','Kits Redirect','Kits RTS','Kits Invalid','Kits Torn','Kits Deliverable','Kits Incomplete','Kits Closing','Articles Opening','Articles Came','Articles Delivered','Articles Redirect','Articles RTS','Articles Invalid','Articles Torn','Articles Deliverable','Articles Incomplete','Articles Closing'];
    if($('spmWise'))$('spmWise').innerHTML='<thead><tr>'+h.map(x=>`<th>${x}</th>`).join('')+'</tr></thead><tbody>'+rs.map(r=>`<tr><td><strong>${esc(r.spmName)}</strong><small>${esc(r.spmId)}</small></td><td>${esc(r.officeName)}</td><td><i class="pill ${r.status==='Updated'?'green':'amber'}">${esc(r.status)}</i></td><td>${num(r.openingKits)}</td><td>${num(r.newKits)}</td><td>${num(r.deliveredKits)}</td><td>${num(r.redirectedKits)}</td><td>${num(r.rtsKits)}</td><td>${num(r.invalidMobileKits)}</td><td>${num(r.tornKits)}</td><td>${num(r.deliverableKits)}</td><td>${num(r.incompleteKits)}</td><td>${num(r.closingPendingKits)}</td><td>${num(r.openingArticles)}</td><td>${num(r.newArticles)}</td><td>${num(r.deliveredArticles)}</td><td>${num(r.redirectedArticles)}</td><td>${num(r.rtsArticles)}</td><td>${num(r.invalidMobileArticles)}</td><td>${num(r.tornArticles)}</td><td>${num(r.deliverableArticles)}</td><td>${num(r.incompleteArticles)}</td><td>${num(r.closingPendingArticles)}</td></tr>`).join('')+'</tbody>';
  }
  function pending(rs=[]){if($('pending'))$('pending').innerHTML='<thead><tr><th>#</th><th>SPM Name</th><th>SPM ID</th><th>Office</th></tr></thead><tbody>'+rs.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.spmName)}</td><td>${esc(r.spmId)}</td><td>${esc(r.officeName)}</td></tr>`).join('')+'</tbody>'}
  async function load(d){try{const x=await PMVApi.admin(d);if($('monitoring'))$('monitoring').textContent=x.date;stats(x.summary);office(x.officeWise);spmWise(x.spmWise);pending(x.pendingSpms);if($('adminStatus'))$('adminStatus').textContent=`${x.spmsUpdatedToday} of ${x.activeSpms} active SPMs updated for ${x.date}.`;if(window.PMVArticles)await PMVArticles.loadAdminArticles()}catch(e){if($('adminStatus'))$('adminStatus').textContent=e.message;toastMsg(e.message,1)}}
  function bind(){$('refresh')?.addEventListener('click',()=>load($('admin-date').value));$('admin-date')?.addEventListener('change',()=>load($('admin-date').value))}
  window.PMVAdmin={bind,load,setToday:()=>{if($('admin-date'))$('admin-date').value=PMVApi.todayIndia()}};
})();