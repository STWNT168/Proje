/* PMV TOOLKIT TRACKER — ARTICLE DASHBOARD — FULL REPLACEMENT */
(()=> {
  'use strict';
  let spm=[],admin=[];
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const notice=(id,m,b)=>{if($(id)){$(id).textContent=m||'';$(id).className='notice'+(b?' '+b:'')}};
  const statusOptions=['Pending','Delivered','Redirected','RTS / Return','Not Received','Other'];

  function statusCell(r,adminMode){
    const current=String(r.presentStatus||r.status||'Pending')||'Pending';
    if(!adminMode)return `<span class="pill ${current==='Pending'?'amber':'green'}">${esc(current)}</span>`;
    return `<select class="article-master-status" data-key="${esc(r.articleKey||r.barCodeId||r.pmvApplicationNumber)}">${statusOptions.map(s=>`<option ${s===current?'selected':''}>${esc(s)}</option>`).join('')}</select>`;
  }
  function rows(data,adminMode){
    return data.map((r,i)=>`<tr>
      <td>${i+1}</td><td>${esc(r.barCodeId)}</td><td>${esc(r.pmvApplicationNumber)}</td>
      <td>${esc(r.artisanName)}</td><td>${esc(r.mobileNumber)}</td><td>${esc(r.pinCode)}</td>
      <td>${esc(r.officeName)}</td><td>${esc(r.deliveryStaff)}</td><td>${statusCell(r,adminMode)}</td>
      <td>${esc(r.remarks)}</td><td>${esc(r.updatedAt)}</td>
      ${adminMode?'<td><button type="button" class="btn btn-primary btn-small article-master-save">SAVE</button></td>':''}
    </tr>`).join('');
  }
  function renderSpm(){
    const t=$('spmArticles'); if(!t)return;
    const h=['#','Barcode','PMV Application','Artisan','Mobile','PIN','Office','Delivery Staff','Present Status','Remarks','Updated'];
    t.innerHTML='<thead><tr>'+h.map(x=>`<th>${x}</th>`).join('')+'</tr></thead><tbody>'+rows(spm,false)+'</tbody>';
  }
  function renderAdmin(){
    const t=$('adminArticles');if(!t)return;
    const h=['#','Barcode','PMV Application','Artisan','Mobile','PIN','Office','Delivery Staff','Present Status','Remarks','Updated','Action'];
    t.innerHTML='<thead><tr>'+h.map(x=>`<th>${x}</th>`).join('')+'</tr></thead><tbody>'+rows(admin,true)+'</tbody>';
  }
  function filter(data,q,status){
    q=String(q||'').trim().toLowerCase();
    return data.filter(r=>{
      const text=[r.barCodeId,r.pmvApplicationNumber,r.artisanName,r.mobileNumber,r.pinCode,r.officeName].join(' ').toLowerCase();
      return (!q||text.includes(q))&&(!status||status==='All'||String(r.presentStatus||'Pending')===status);
    });
  }
  async function loadSpm(){
    try{
      const d=$('spm-date')?.value||PMVApi.todayIndia(),q=$('article-search')?.value||'';
      spm=await PMVApi.articles(d,q)||[];
      const f=filter(spm,q,$('article-status-filter')?.value||'All');renderSpm();
      if($('article-scope'))notice('article-scope',`${f.length} of ${spm.length} articles loaded for your assigned PIN codes.`);
    }catch(e){notice('article-scope',e.message,true)}
  }
  async function loadAdminArticles(){
    try{
      const d=$('admin-date')?.value||PMVApi.todayIndia(),q=$('admin-article-search')?.value||'';
      admin=await PMVApi.adminArticles(d,q)||[];
      renderAdmin();
      if($('admin-article-status'))notice('admin-article-status',`${admin.length} articles loaded. Office and Present Status are resolved independently of daily status rows.`);
    }catch(e){notice('admin-article-status',e.message,true)}
  }
  async function saveMaster(btn){
    const tr=btn.closest('tr'),select=tr?.querySelector('.article-master-status');if(!select)return;
    const key=select.dataset.key;
    const r=admin.find(x=>String(x.articleKey||x.barCodeId||x.pmvApplicationNumber)===String(key));
    if(!r)return toast('Article record not found.',1);
    btn.disabled=true;btn.textContent='SAVING…';
    try{const x=await PMVApi.updateArticleMasterStatus({articleKey:r.articleKey,barCodeId:r.barCodeId,pmvApplicationNumber:r.pmvApplicationNumber,status:select.value,remarks:r.remarks||''});toast(x.message||'Master status updated.');await loadAdminArticles()}
    catch(e){toast(e.message,1)}
    finally{btn.disabled=false;btn.textContent='SAVE'}
  }
  function bind(){
    $('article-fetch')?.addEventListener('click',loadSpm);
    $('article-search')?.addEventListener('input',()=>renderSpm());
    $('article-status-filter')?.addEventListener('change',()=>{const q=$('article-search')?.value||'';const f=filter(spm,q,$('article-status-filter').value);const old=spm;spm=f;renderSpm();spm=old});
    $('admin-article-fetch')?.addEventListener('click',loadAdminArticles);
    $('admin-article-search')?.addEventListener('input',loadAdminArticles);
    $('adminArticles')?.addEventListener('click',e=>{const b=e.target.closest('.article-master-save');if(b)saveMaster(b)});
  }
  window.PMVArticles={bind,loadSpm,loadAdminArticles};
})();