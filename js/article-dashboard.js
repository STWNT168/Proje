(()=> {
  const $=id=>document.getElementById(id);
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STATUS=['Pending','Delivered','Redirected','Return','Torn/Without Address','Invalid OTP'];
  let spmRows=[], adminRows=[], selectedSpm=new Set(), selectedAdmin=new Set();

  const canonical=v=>{
    const s=String(v||'').trim().toUpperCase().replace(/\s+/g,' ');
    if(!s) return 'Pending';
    if(/DELIVER/.test(s)) return 'Delivered';
    if(/REDIRECT/.test(s)) return 'Redirected';
    if(/RTS|RETURN|RETUR/.test(s)) return 'Return';
    if(/TORN|WITHOUT\s*(ADDRESS|PROPER|DETAIL)|WITHOUT\s*ADDR/.test(s)) return 'Torn/Without Address';
    if(/INVALID\s*(OTP|MOBILE|PHONE)|OTP/.test(s)) return 'Invalid OTP';
    if(/PENDING|NOT\s*RECEIVED|NOT\s*DELIVER/.test(s)) return 'Pending';
    return String(v||'Pending');
  };
  const statusPill=v=>{
    const n=canonical(v);
    const cls=n==='Delivered'?'green':n==='Redirected'?'blue':n==='Return'||n==='Torn/Without Address'||n==='Invalid OTP'?'red':'amber';
    return `<i class="pill ${cls}">${esc(n)}</i>`;
  };
  const options=v=>STATUS.map(s=>`<option value="${esc(s)}" ${canonical(v)===s?'selected':''}>${esc(s)}</option>`).join('');
  const queryValue=id=>String($(id)?.value||'').trim().toLowerCase();
  const matches=(r,q)=>{
    if(!q)return true;
    const hay=Object.values(r||{}).map(v=>String(v??'').toLowerCase()).join(' ');
    return q.split(/\s+/).filter(Boolean).every(t=>hay.includes(t));
  };
  const statusFilter=id=>String($(id)?.value||'All');
  const filtered=(rows,searchId,filterId)=>rows.filter(r=>matches(r,queryValue(searchId))&&(statusFilter(filterId)==='All'||canonical(r.presentStatus)===statusFilter(filterId)));

  function counts(rows){
    const c={Pending:0,Delivered:0,Redirected:0,Return:0,'Torn/Without Address':0,'Invalid OTP':0};
    rows.forEach(r=>{const s=canonical(r.presentStatus);c[s]=(c[s]||0)+1});
    return c;
  }
  function renderSpm(){
    const view=filtered(spmRows,'article-search','article-status-filter');
    $('spmArticles').innerHTML=
      '<thead><tr><th><input id="spm-select-all" type="checkbox"></th><th>Barcode</th><th>PMV Application</th><th>Artisan</th><th>Mobile</th><th>Address</th><th>Circle</th><th>Division</th><th>PIN</th><th>Delivery Staff</th><th>Present Status</th><th>Remarks</th></tr></thead>'+
      '<tbody>'+view.map(r=>`<tr>
      <td><input class="spm-select" type="checkbox" data-key="${esc(r.articleKey)}" ${selectedSpm.has(r.articleKey)?'checked':''}></td>
      <td><strong>${esc(r.barCodeId)}</strong></td><td>${esc(r.pmvApplicationNumber)}</td><td>${esc(r.artisanName)}</td>
      <td>${esc(r.mobileNumber)}</td><td title="${esc(r.address)}">${esc(r.address)}</td><td>${esc(r.circleName)}</td><td>${esc(r.divisionName)}</td>
      <td>${esc(r.pinCode)}</td><td>${esc(r.deliveryStaff)}</td><td><select class="article-status" data-key="${esc(r.articleKey)}">${options(r.presentStatus)}</select></td>
      <td><input class="article-remarks" data-key="${esc(r.articleKey)}" value="${esc(r.remarks)}" placeholder="Remarks"></td>
      </tr>`).join('')+'</tbody>';
    $('spm-select-all')?.addEventListener('change',e=>{
      view.forEach(r=>e.target.checked?selectedSpm.add(r.articleKey):selectedSpm.delete(r.articleKey)); renderSpm();
    });
    document.querySelectorAll('.spm-select').forEach(el=>el.addEventListener('change',e=>e.target.checked?selectedSpm.add(e.target.dataset.key):selectedSpm.delete(e.target.dataset.key)));
    const c=counts(spmRows);
    $('article-scope').innerHTML=`<strong>${spmRows.length}</strong> articles visible for assigned PIN codes · `+
      Object.entries(c).map(([k,v])=>`${esc(k)}: <b>${v}</b>`).join(' · ');
    $('spm-selected-count').textContent=`${selectedSpm.size} selected`;
  }

  async function loadSpm(){
    try{
      const d=$('spm-date').value;
      const x=await PMVApi.articles(d);
      spmRows=Array.isArray(x.articles)?x.articles:[];
      selectedSpm=new Set([...selectedSpm].filter(k=>spmRows.some(r=>r.articleKey===k)));
      window.__spmArticleMeta=x;
      renderSpm();
      if(!spmRows.length) $('article-scope').textContent='No articles found for your assigned PIN codes.';
    }catch(e){$('article-scope').textContent=e.message;toast(e.message,1)}
  }

  async function bulkSpm(){
    const keys=[...selectedSpm];
    if(!keys.length){toast('Select at least one article.',1);return}
    const status=$('spm-bulk-status').value;
    const date=$('spm-date').value;
    if(!confirm(`Change ${keys.length} selected article(s) to "${status}"?`))return;
    try{
      let done=0;
      for(const key of keys){
        const row=spmRows.find(r=>r.articleKey===key);
        const remark=document.querySelector(`.article-remarks[data-key="${CSS.escape(key)}"]`)?.value||row?.remarks||'';
        await PMVApi.updateArticleStatus({date,articleKey:key,status,remarks:remark});
        done++;
      }
      toast(`${done} article status update(s) saved.`);
      selectedSpm.clear();
      await loadSpm();
    }catch(e){toast(e.message,1)}
  }

  function renderAdmin(){
    const view=filtered(adminRows,'admin-article-search','admin-article-status-filter');
    $('adminArticles').innerHTML=
      '<thead><tr><th><input id="admin-select-all" type="checkbox"></th><th>Barcode</th><th>PMV Application</th><th>Artisan</th><th>Mobile</th><th>Address</th><th>PIN</th><th>Office</th><th>SPM / Updated</th><th>SPM Present Status</th><th>Master Status</th><th>Review</th></tr></thead>'+
      '<tbody>'+view.map(r=>`<tr>
      <td><input class="admin-select" type="checkbox" data-key="${esc(r.articleKey)}" ${selectedAdmin.has(r.articleKey)?'checked':''}></td>
      <td><strong>${esc(r.barCodeId)}</strong></td><td>${esc(r.pmvApplicationNumber)}</td><td>${esc(r.artisanName)}</td>
      <td>${esc(r.mobileNumber)}</td><td title="${esc(r.address)}">${esc(r.address)}</td><td>${esc(r.pinCode)}</td><td>${esc(r.officeName)}</td>
      <td>${esc(r.spmName)}<small>${esc(r.spmId)} · ${esc(r.updatedAt)}</small></td>
      <td>${statusPill(r.presentStatus)}${r.remarks?`<small>${esc(r.remarks)}</small>`:''}</td>
      <td>${statusPill(r.masterStatus)}</td>
      <td><button type="button" class="btn btn-light admin-direct-save" data-key="${esc(r.articleKey)}" data-status="${esc(canonical(r.presentStatus))}">PUSH THIS</button></td>
      </tr>`).join('')+'</tbody>';
    $('admin-select-all')?.addEventListener('change',e=>{view.forEach(r=>e.target.checked?selectedAdmin.add(r.articleKey):selectedAdmin.delete(r.articleKey));renderAdmin()});
    document.querySelectorAll('.admin-select').forEach(el=>el.addEventListener('change',e=>e.target.checked?selectedAdmin.add(e.target.dataset.key):selectedAdmin.delete(e.target.dataset.key)));
    document.querySelectorAll('.admin-direct-save').forEach(b=>b.addEventListener('click',async()=>pushSelected([b.dataset.key])));
    const c=counts(adminRows);
    const pendingSync=adminRows.filter(r=>r.presentStatus&&canonical(r.presentStatus)!==canonical(r.masterStatus)).length;
    $('admin-article-status').innerHTML=`<strong>${adminRows.length}</strong> records · `+
      Object.entries(c).map(([k,v])=>`${esc(k)}: <b>${v}</b>`).join(' · ')+
      ` · <b>${pendingSync}</b> pending master sync`;
    $('admin-selected-count').textContent=`${selectedAdmin.size} selected`;
  }

  async function loadAdminArticles(){
    try{
      const x=await PMVApi.adminArticles($('admin-date').value);
      adminRows=Array.isArray(x.articles)?x.articles:[];
      selectedAdmin=new Set([...selectedAdmin].filter(k=>adminRows.some(r=>r.articleKey===k)));
      renderAdmin();
    }catch(e){$('admin-article-status').textContent=e.message;toast(e.message,1)}
  }

  async function pushSelected(keys){
    keys=[...new Set(keys||[])].filter(Boolean);
    if(!keys.length){toast('Select at least one SPM update.',1);return}
    if(!confirm(`Authorise push of ${keys.length} selected SPM status update(s) into ARTICLE_MASTER?`))return;
    try{
      const x=await PMVApi.pushAdminArticlesToMaster($('admin-date').value,keys);
      toast(`${x.pushed||0} pushed to master${x.skipped?` · ${x.skipped} skipped`:''}.`);
      keys.forEach(k=>selectedAdmin.delete(k));
      await loadAdminArticles();
    }catch(e){toast(e.message,1)}
  }

  function bind(){
    $('article-fetch')?.addEventListener('click',loadSpm);
    $('article-search')?.addEventListener('input',renderSpm);
    $('article-status-filter')?.addEventListener('change',renderSpm);
    $('spm-date')?.addEventListener('change',loadSpm);
    $('spm-bulk-apply')?.addEventListener('click',bulkSpm);
    $('article-export-csv')?.addEventListener('click',()=>{
      const rows=filtered(spmRows,'article-search','article-status-filter');
      if(!rows.length){toast('No articles available for export.',1);return}
      const headers=['Article Key','Barcode ID','PMV Application Number','Artisan Name','Mobile Number','Address','Circle','Division','PIN Code','Delivery Staff','Present Status','Remarks','Updated At'];
      const csv=[headers,...rows.map(r=>[r.articleKey,r.barCodeId,r.pmvApplicationNumber,r.artisanName,r.mobileNumber,r.address,r.circleName,r.divisionName,r.pinCode,r.deliveryStaff,r.presentStatus,r.remarks,r.updatedAt])]
        .map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
      const a=document.createElement('a'),u=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
      a.href=u;a.download=`PMV_Articles_${$('spm-date').value||'date'}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u);
    });
    $('admin-article-fetch')?.addEventListener('click',loadAdminArticles);
    $('admin-article-search')?.addEventListener('input',renderAdmin);
    $('admin-article-status-filter')?.addEventListener('change',renderAdmin);
    $('admin-date')?.addEventListener('change',loadAdminArticles);
    $('admin-push-selected')?.addEventListener('click',()=>pushSelected([...selectedAdmin]));
    $('admin-push-filtered')?.addEventListener('click',()=>pushSelected(filtered(adminRows,'admin-article-search','admin-article-status-filter').map(r=>r.articleKey)));
  }

  window.PMVArticles={bind,loadSpm,loadAdminArticles,bulkSpm,pushSelected};
})();