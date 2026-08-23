(()=>{
  const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),statuses=['Pending','Delivered','Redirected','RTS / Return','Not Received','Other'];
  const opts=v=>statuses.map(x=>`<option value="${esc(x)}" ${x===v?'selected':''}>${esc(x)}</option>`).join('');
  const mobile=x=>String(x||'').replace(/(\d{2})\d{6}(\d{2})/,'$1******$2');
  function spmTable(rows){
    $('spmArticles').innerHTML='<thead><tr><th>Barcode</th><th>PMV Application</th><th>Artisan</th><th>PIN</th><th>Source Status</th><th>Present Status</th><th>Remarks</th><th>Action</th></tr></thead><tbody>'+
      rows.map(r=>`<tr><td>${esc(r.barCodeId)}</td><td>${esc(r.pmvApplicationNumber)}</td><td><strong>${esc(r.artisanName)}</strong><small>${mobile(r.mobileNumber)}</small></td><td>${esc(r.pinCode)}</td><td>${esc(r.sourceStatus)}</td><td><select data-key="${esc(r.articleKey)}" class="article-status">${opts(r.presentStatus)}</select></td><td><input data-key="${esc(r.articleKey)}" class="article-remarks" value="${esc(r.remarks)}" placeholder="Remarks"></td><td><button type="button" class="btn btn-primary article-save" data-key="${esc(r.articleKey)}">SAVE</button></td></tr>`).join('')+'</tbody>';
    document.querySelectorAll('.article-save').forEach(b=>b.onclick=()=>saveSpm(b.dataset.key));
  }
  async function saveSpm(key){
    const st=document.querySelector(`.article-status[data-key="${CSS.escape(key)}"]`),rm=document.querySelector(`.article-remarks[data-key="${CSS.escape(key)}"]`),date=$('spm-date').value;
    try{await PMVApi.updateArticleStatus({date,articleKey:key,status:st.value,remarks:rm.value});toast('Article status updated.');await loadSpm();}catch(e){toast(e.message,1)}
  }
  async function loadSpm(){
    try{let d=$('spm-date').value,q=$('article-search').value.trim(),x=await PMVApi.articles(d,q);$('article-scope').textContent=`Office: ${x.officeName||''} · Assigned PIN codes: ${(x.pincodes||[]).join(', ')||'Not configured'} · ${x.totalVisible||0} articles visible`;spmTable(x.articles||[])}catch(e){$('article-scope').textContent=e.message;toast(e.message,1)}
  }
  function adminTable(rows){
    $('adminArticles').innerHTML='<thead><tr><th>Barcode</th><th>PMV Application</th><th>Artisan</th><th>PIN</th><th>Office</th><th>SPM</th><th>Present Status</th><th>Remarks</th><th>Updated</th></tr></thead><tbody>'+
      rows.map(r=>`<tr><td>${esc(r.barCodeId)}</td><td>${esc(r.pmvApplicationNumber)}</td><td>${esc(r.artisanName)}<small>${mobile(r.mobileNumber)}</small></td><td>${esc(r.pinCode)}</td><td>${esc(r.officeName)}</td><td>${esc(r.spmName)}<small>${esc(r.spmId)}</small></td><td><i class="pill ${r.presentStatus==='Delivered'?'green':'amber'}">${esc(r.presentStatus)}</i></td><td>${esc(r.remarks)}</td><td>${esc(r.updatedAt)}</td></tr>`).join('')+'</tbody>';
  }
  async function loadAdminArticles(){
    try{let d=$('admin-date').value,q=$('admin-article-search').value.trim(),x=await PMVApi.adminArticles(d,q);$('admin-article-status').textContent=`${x.total||0} records shown · ${x.updatedCount||0} status updates for ${d}.`;adminTable(x.articles||[])}catch(e){$('admin-article-status').textContent=e.message;toast(e.message,1)}
  }
  function bind(){
    $('article-fetch')?.addEventListener('click',loadSpm);$('article-search')?.addEventListener('keydown',e=>{if(e.key==='Enter')loadSpm()});$('spm-date')?.addEventListener('change',loadSpm);
    $('admin-article-fetch')?.addEventListener('click',loadAdminArticles);$('admin-article-search')?.addEventListener('keydown',e=>{if(e.key==='Enter')loadAdminArticles()});$('admin-date')?.addEventListener('change',loadAdminArticles);
  }
  window.PMVArticles={bind,loadSpm,loadAdminArticles};
})();
