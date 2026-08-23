(()=>{
  const $=id=>document.getElementById(id),
        esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
        statuses=['Pending','Delivered','Redirected','RTS / Return','Not Received','Other'];

  const mobile=x=>String(x||'').replace(/(\d{2})\d{6}(\d{2})/,'$1******$2');

  let lastSpmRows=[];

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
      scope.textContent += ` · Showing ${view.length} ${currentFilter()} article(s)`;
      if(!total) scope.textContent += ' · No articles found';
    }
  }

  async function saveSpm(key){
    const st=document.querySelector(`.article-status[data-key="${CSS.escape(key)}"]`);
    const rm=document.querySelector(`.article-remarks[data-key="${CSS.escape(key)}"]`);
    const date=$('spm-date').value;

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

      window.__spmArticleRows=x.articles||[];

      $('article-scope').textContent=
        `Office: ${x.officeName||''} · Assigned PIN codes: ${(x.pincodes||[]).join(', ')||'Not configured'} · ${x.totalVisible||0} articles visible`;

      spmTable(window.__spmArticleRows);
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
    $('adminArticles').innerHTML=
      '<thead><tr><th>Barcode</th><th>PMV Application</th><th>Artisan</th><th>PIN</th><th>Office</th><th>SPM</th><th>Present Status</th><th>Remarks</th><th>Updated</th></tr></thead>'+
      '<tbody>'+
      rows.map(r=>`<tr>
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

      $('admin-article-status').textContent=
        `${x.total||0} records shown · ${x.updatedCount||0} status updates for ${d}.`;

      adminTable(x.articles||[]);
    }catch(e){
      $('admin-article-status').textContent=e.message;
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
  }

  window.PMVArticles={bind,loadSpm,loadAdminArticles,exportCsv};
})();