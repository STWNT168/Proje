(()=>{
  const $=id=>document.getElementById(id),
        esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
        statuses=['Pending','Delivered','Redirected','RTS / Return','Not Received','Other'];

  const mobile=x=>String(x||'').replace(/(\d{2})\d{6}(\d{2})/,'$1******$2');

  let lastSpmRows=[];
  let lastAdminRows=[];

  const opts=v=>statuses.map(x=>
    `<option value="${esc(x)}" ${x===v?'selected':''}>${esc(x)}</option>`
  ).join('');

  function currentFilter(){
    return String($('article-status-filter')?.value||'All');
  }

  function filtered(rows){
    const f=currentFilter();
    return f==='All' ? rows : rows.filter(r=>String(r.presentStatus||'Pending')===f);
  }

  function currentAdminFilter(){
    return String($('admin-article-status-filter')?.value||'All');
  }

  function filteredAdmin(rows){
    const f=currentAdminFilter();
    return f==='All' ? rows : rows.filter(r=>String(r.presentStatus||'Pending')===f);
  }

  function spmTable(rows){
    const view=filtered(rows);
    lastSpmRows=view;

    $('spmArticles').innerHTML=
      '<thead><tr><th>Barcode</th><th>PMV Application</th><th>Artisan</th><th>PIN</th><th>Source Status</th><th>Present Status</th><th>Remarks</th><th>Action</th></tr></thead>'+
      '<tbody>'+
      view.map(r=>`<tr>
        <td>${esc(r.barCodeId)}</td>
        <td>${esc(r.pmvApplicationNumber)}</td>
        <td><strong>${esc(r.artisanName)}</strong><small>${mobile(r.mobileNumber)}</small></td>
        <td>${esc(r.pinCode)}</td>
        <td>${esc(r.sourceStatus)}</td>
        <td><select data-key="${esc(r.articleKey)}" class="article-status">${opts(r.presentStatus)}</select></td>
        <td><input data-key="${esc(r.articleKey)}" class="article-remarks" value="${esc(r.remarks)}" placeholder="Remarks"></td>
        <td><button type="button" class="btn btn-primary article-save" data-key="${esc(r.articleKey)}">SAVE</button></td>
      </tr>`).join('')+
      '</tbody>';

    document.querySelectorAll('.article-save').forEach(
      b=>b.onclick=()=>saveSpm(b.dataset.key)
    );

    const scope=$('article-scope');
    if(scope){
      const total=rows.length;
      scope.textContent=`Office: ${window.__spmArticleMeta?.officeName||''} · Assigned PIN codes: ${(window.__spmArticleMeta?.pincodes||[]).join(', ')||'Not configured'} · ${total} articles visible`;
      if(!total) scope.textContent+=' · No articles found';
    }
  }

  async function saveSpm(key){
    const st=document.querySelector(`.article-status[data-key="${CSS.escape(key)}"]`);
    const rm=document.querySelector(`.article-remarks[data-key="${CSS.escape(key)}"]`);
    const date=$('spm-date').value;

    if(!st || !rm) return;

    try{
      await PMVApi.updateArticleStatus({
        date,
        articleKey:key,
        status:st.value,
        remarks:rm.value
      });
      toast('Article status updated.');
      await loadSpm();
    }catch(e){
      toast(e.message,1);
    }
  }

  async function loadSpm(){
    try{
      const d=$('spm-date').value;
      const q=$('article-search').value.trim();
      const x=await PMVApi.articles(d,q);

      window.__spmArticleRows=Array.isArray(x.articles)?x.articles:[];
      const returnedPins =
  Array.isArray(x.pincodes) ? x.pincodes :
  Array.isArray(x.assignedPincodes) ? x.assignedPincodes :
  Array.isArray(x.officePincodes) ? x.officePincodes :
  Array.isArray(x.PINCODES) ? x.PINCODES :
  [];

window.__spmArticleMeta = {
  officeName: String(
    x.officeName ||
    x.OFFICE_NAME ||
    x.office ||
    ''
  ),
  pincodes: [...new Set(
    returnedPins
      .map(v => String(v ?? '').replace(/\D/g, ''))
      .filter(Boolean)
  )]
};

      spmTable(window.__spmArticleRows);

      // If the user searched and nothing matched, give a clear result.
      if(q && !window.__spmArticleRows.length){
        $('article-scope').textContent=
          `No articles found for "${q}".`;
      }
    }catch(e){
      $('article-scope').textContent=e.message;
      toast(e.message,1);
    }
  }

  function csvEscape(v){
    const s=String(v??'');
    return `"${s.replace(/"/g,'""')}"`;
  }

  function exportCsv(){
    const rows=filtered(window.__spmArticleRows||[]);
    if(!rows.length){
      toast('No articles available for export.',1);
      return;
    }

    const headers=[
      'Article Key','Barcode ID','PMV Application Number','Artisan Name',
      'Mobile Number','Address','Circle','Division','PIN Code',
      'Delivery Staff','Source Status','Present Status','Remarks','Updated At'
    ];

    const lines=[headers.map(csvEscape).join(',')];

    rows.forEach(r=>{
      lines.push([
        r.articleKey,r.barCodeId,r.pmvApplicationNumber,r.artisanName,
        r.mobileNumber,r.address,r.circleName,r.divisionName,r.pinCode,
        r.deliveryStaff,r.sourceStatus,r.presentStatus,r.remarks,r.updatedAt
      ].map(csvEscape).join(','));
    });

    const blob=new Blob(
      ['\ufeff'+lines.join('\r\n')],
      {type:'text/csv;charset=utf-8;'}
    );

    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const d=$('spm-date').value||'date';
    const f=currentFilter().replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'')||'All';

    a.href=url;
    a.download=`PMV_Articles_${d}_${f}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function adminTable(rows){
    const view=filteredAdmin(rows);

    $('adminArticles').innerHTML=
      '<thead><tr><th>Barcode</th><th>PMV Application</th><th>Artisan</th><th>PIN</th><th>Office</th><th>SPM</th><th>Present Status</th><th>Remarks</th><th>Updated</th></tr></thead>'+
      '<tbody>'+
      view.map(r=>`<tr>
        <td>${esc(r.barCodeId)}</td>
        <td>${esc(r.pmvApplicationNumber)}</td>
        <td>${esc(r.artisanName)}<small>${mobile(r.mobileNumber)}</small></td>
        <td>${esc(r.pinCode)}</td>
        <td>${esc(r.officeName)}</td>
        <td>${esc(r.spmName)}<small>${esc(r.spmId)}</small></td>
        <td><i class="pill ${r.presentStatus==='Delivered'?'green':'amber'}">${esc(r.presentStatus)}</i></td>
        <td>${esc(r.remarks)}</td>
        <td>${esc(r.updatedAt)}</td>
      </tr>`).join('')+
      '</tbody>';
  }

  async function loadAdminArticles(){
    try{
      let d=$('admin-date').value,
          q=$('admin-article-search').value.trim(),
          x=await PMVApi.adminArticles(d,q);

      lastAdminRows=Array.isArray(x.articles)?x.articles:[];

      $('admin-article-status').textContent=
        `${x.total||x.count||0} records shown · ${x.updatedCount||0} status updates for ${d}.`;

      adminTable(lastAdminRows);
    }catch(e){
      $('admin-article-status').textContent=e.message;
      toast(e.message,1);
    }
  }

  async function pushAdminToMaster(){
    const rows=filteredAdmin(lastAdminRows);

    if(!rows.length){
      toast('No articles to push.',1);
      return;
    }

    const keys=[...new Set(rows.map(r=>r.articleKey).filter(Boolean))];
    const d=$('admin-date').value;

    if(!confirm(`Push present status for ${keys.length} article(s) shown here into the master sheet? SPM-recorded statuses will overwrite the status column at the source.`)){
      return;
    }

    try{
      const res=await PMVApi.pushAdminArticlesToMaster(d,keys);
      toast(`${res.pushed} pushed to master${res.skipped?`, ${res.skipped} skipped (no SPM update).`:'.'}`);
      await loadAdminArticles();
    }catch(e){
      toast(e.message,1);
    }
  }

  function bind(){
    $('article-fetch')?.addEventListener('click',loadSpm);
    $('article-search')?.addEventListener('keydown',e=>{
      if(e.key==='Enter')loadSpm();
    });
    $('spm-date')?.addEventListener('change',loadSpm);

    $('article-status-filter')?.addEventListener('change',()=>{
      spmTable(window.__spmArticleRows||[]);
    });

    $('article-export-csv')?.addEventListener('click',exportCsv);

    $('admin-article-fetch')?.addEventListener('click',loadAdminArticles);
    $('admin-article-search')?.addEventListener('keydown',e=>{
      if(e.key==='Enter')loadAdminArticles();
    });
    $('admin-date')?.addEventListener('change',loadAdminArticles);

    $('admin-article-status-filter')?.addEventListener('change',()=>{
      adminTable(lastAdminRows);
    });

    $('admin-article-push')?.addEventListener('click',pushAdminToMaster);
  }

  window.PMVArticles={bind,loadSpm,loadAdminArticles,exportCsv,pushAdminToMaster};
})();
