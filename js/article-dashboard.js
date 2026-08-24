(() => {
  const $ = id => document.getElementById(id);
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
  const mobile = x => {
    const s = String(x || '');
    return s.replace(/^(\d{2})\d{6}(\d{2})$/, '$1******$2');
  };

  const STATUSES = [
    'Pending', 'Delivered', 'Redirected', 'Return',
    'Torn/Without Address', 'Invalid OTP'
  ];

  let spmRows = [];
  let adminRows = [];

  const normStatus = value => {
    const s = String(value || '').trim().toLowerCase();
    if (!s) return 'Pending';
    if (s.includes('deliver')) return 'Delivered';
    if (s.includes('redirect')) return 'Redirected';
    if (s.includes('return') || s.includes('rts')) return 'Return';
    if (s.includes('torn') || s.includes('without')) return 'Torn/Without Address';
    if (s.includes('otp') || s.includes('invalid mobile')) return 'Invalid OTP';
    return 'Pending';
  };

  const statusOptions = selected => STATUSES.map(s =>
    `<option value="${esc(s)}" ${normStatus(selected) === s ? 'selected' : ''}>${esc(s)}</option>`
  ).join('');

  const filterRows = (rows, id) => {
    const f = String($(id)?.value || 'All');
    return f === 'All' ? rows : rows.filter(r => normStatus(r.presentStatus) === f);
  };

  function addBulkControls(tableId, type) {
    const table = $(tableId);
    if (!table) return;
    const thead = table.querySelector('thead');
    if (!thead) return;
    const row = thead.querySelector('tr');
    if (!row || row.querySelector('.article-select-all')) return;
    const th = document.createElement('th');
    th.className = 'article-select-all';
    th.innerHTML = '<input type="checkbox" aria-label="Select all visible articles">';
    row.prepend(th);
    th.querySelector('input').addEventListener('change', e => {
      table.querySelectorAll('tbody input.article-check').forEach(cb => cb.checked = e.target.checked);
      updateSelectionCount(type);
    });
  }

  function updateSelectionCount(type) {
    const tableId = type === 'spm' ? 'spmArticles' : 'adminArticles';
    const countId = type === 'spm' ? 'spm-selected-count' : 'admin-selected-count';
    const n = $(tableId)?.querySelectorAll('tbody input.article-check:checked').length || 0;
    if ($(countId)) $(countId).textContent = `${n} selected`;
  }

  function checkedKeys(type) {
    const tableId = type === 'spm' ? 'spmArticles' : 'adminArticles';
    return [...($(tableId)?.querySelectorAll('tbody input.article-check:checked') || [])]
      .map(x => x.dataset.key).filter(Boolean);
  }

  function renderSummary(rows, targetId) {
    const counts = { Pending:0, Delivered:0, Redirected:0, Return:0, 'Torn/Without Address':0, 'Invalid OTP':0 };
    rows.forEach(r => counts[normStatus(r.presentStatus)]++);
    const el = $(targetId);
    if (!el) return;
    el.innerHTML = Object.entries(counts)
      .map(([k,v]) => `<span class="pill">${esc(k)}: <b>${v}</b></span>`).join(' ');
  }

  function renderSpm(rows) {
    const view = filterRows(rows, 'article-status-filter');
    const table = $('spmArticles');
    if (!table) return;

    table.innerHTML =
      `<thead><tr>
        <th>Barcode</th><th>PMV Application</th><th>Artisan</th><th>PIN</th>
        <th>Address</th><th>Circle</th><th>Division</th><th>Delivery Staff</th>
        <th>Article Status</th><th>Remarks</th><th>Action</th>
      </tr></thead><tbody>` +
      view.map(r => `<tr>
        <td data-label="Barcode">${esc(r.barCodeId)}</td>
        <td data-label="PMV Application">${esc(r.pmvApplicationNumber)}</td>
        <td data-label="Artisan"><strong>${esc(r.artisanName)}</strong><small>${mobile(r.mobileNumber)}</small></td>
        <td data-label="PIN">${esc(r.pinCode)}</td>
        <td data-label="Address">${esc(r.address)}</td>
        <td data-label="Circle">${esc(r.circleName)}</td>
        <td data-label="Division">${esc(r.divisionName)}</td>
        <td data-label="Delivery Staff">${esc(r.deliveryStaff)}</td>
        <td data-label="Article Status">
          <select class="article-status" data-key="${esc(r.articleKey)}">${statusOptions(r.presentStatus)}</select>
        </td>
        <td data-label="Remarks"><input class="article-remarks" data-key="${esc(r.articleKey)}" value="${esc(r.remarks)}" placeholder="Remarks"></td>
        <td data-label="Action"><button type="button" class="btn btn-primary article-save" data-key="${esc(r.articleKey)}">SAVE</button></td>
      </tr>`).join('') + '</tbody>';

    addBulkControls('spmArticles', 'spm');
    table.querySelectorAll('.article-check').forEach(x => x.addEventListener('change', () => updateSelectionCount('spm')));
    table.querySelectorAll('.article-save').forEach(b => b.addEventListener('click', () => saveOneSpm(b.dataset.key)));
    $('spm-selected-count').textContent = '0 selected';
  }

  async function saveOneSpm(key) {
    const st = document.querySelector(`.article-status[data-key="${CSS.escape(key)}"]`);
    const rm = document.querySelector(`.article-remarks[data-key="${CSS.escape(key)}"]`);
    try {
      await PMVApi.updateArticleStatus({
        date: $('spm-date').value, articleKey: key,
        status: st?.value || 'Pending', remarks: rm?.value || ''
      });
      toast('Article status updated.');
      await loadSpm();
    } catch (e) { toast(e.message, 1); }
  }

  async function bulkSpm() {
    const keys = checkedKeys('spm');
    if (!keys.length) return toast('Select one or more articles first.', 1);
    const status = $('spm-bulk-status').value;
    const date = $('spm-date').value;
    const remarksByKey = {};
    keys.forEach(k => {
      const el = document.querySelector(`.article-remarks[data-key="${CSS.escape(k)}"]`);
      remarksByKey[k] = el?.value || '';
    });

    const button = $('spm-bulk-apply');
    if (button) { button.disabled = true; button.textContent = 'UPDATING…'; }
    try {
      const x = await PMVApi.bulkUpdateArticleStatus({ date, articleKeys: keys, status, remarksByKey });
      toast(`${x.updated} article status update(s) saved.`);
      await loadSpm();
    } catch (e) { toast(e.message, 1); }
    finally {
      if (button) { button.disabled = false; button.textContent = 'CHANGE SELECTED'; }
    }
  }

  async function loadSpm() {
    try {
      const date = $('spm-date').value;
      const q = $('article-search').value.trim();
      const x = await PMVApi.articles(date, q);
      spmRows = x.articles || [];
      window.__spmArticleRows = spmRows;

      $('article-scope').textContent =
        `Office: ${x.officeName || ''} · Assigned PIN codes: ${(x.pincodes || []).join(', ') || 'Not configured'} · ${x.totalVisible || spmRows.length} articles visible`;

      renderSpm(spmRows);
      injectSpmChecks();
      renderSummary(spmRows, 'spm-status-summary');
    } catch (e) {
      $('article-scope').textContent = e.message;
      toast(e.message, 1);
    }
  }

  function exportCsv() {
    const rows = filterRows(spmRows, 'article-status-filter');
    if (!rows.length) return toast('No articles available for export.', 1);

    const headers = [
      'Article Key','Barcode ID','PMV Application Number','Artisan Name',
      'Mobile Number','Address','Circle','Division','PIN Code',
      'Delivery Staff','Present Status','Remarks','Updated At'
    ];
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [headers.map(q).join(',')];

    rows.forEach(r => lines.push([
      r.articleKey,r.barCodeId,r.pmvApplicationNumber,r.artisanName,
      r.mobileNumber,r.address,r.circleName,r.divisionName,r.pinCode,
      r.deliveryStaff,normStatus(r.presentStatus),r.remarks,r.updatedAt
    ].map(q).join(',')));

    const blob = new Blob(['\ufeff' + lines.join('\r\n')], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = $('spm-date').value || 'date';
    a.href = url;
    a.download = `PMV_Articles_${date}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function renderAdmin(rows) {
    const view = filterRows(rows, 'admin-article-status-filter');
    const table = $('adminArticles');
    if (!table) return;

    table.innerHTML =
      `<thead><tr>
        <th>Barcode</th><th>PMV Application</th><th>Artisan</th><th>PIN</th>
        <th>Office</th><th>SPM</th><th>Present Status</th><th>Remarks</th>
        <th>Updated</th><th>Master Status</th><th>Sync</th>
      </tr></thead><tbody>` +
      view.map(r => {
        const changed = r.updatedAt ? 'Updated by SPM' : 'No update';
        const synced = normStatus(r.presentStatus) === normStatus(r.masterStatus);
        return `<tr>
          <td data-label="Barcode">${esc(r.barCodeId)}</td>
          <td data-label="PMV Application">${esc(r.pmvApplicationNumber)}</td>
          <td data-label="Artisan">${esc(r.artisanName)}<small>${mobile(r.mobileNumber)}</small></td>
          <td data-label="PIN">${esc(r.pinCode)}</td>
          <td data-label="Office">${esc(r.officeName)}</td>
          <td data-label="SPM">${esc(r.spmName)}<small>${esc(r.spmId)}</small></td>
          <td data-label="Present Status"><i class="pill ${normStatus(r.presentStatus)==='Delivered'?'green':'amber'}">${esc(normStatus(r.presentStatus))}</i></td>
          <td data-label="Remarks">${esc(r.remarks)}</td>
          <td data-label="Updated">${esc(r.updatedAt)}</td>
          <td data-label="Master Status">${esc(normStatus(r.masterStatus))}</td>
          <td data-label="Sync"><span class="pill ${synced ? 'green' : 'amber'}">${synced ? 'Synced' : changed}</span></td>
        </tr>`;
      }).join('') + '</tbody>';

    addBulkControls('adminArticles', 'admin');
    table.querySelectorAll('.article-check').forEach(x => x.addEventListener('change', () => updateSelectionCount('admin')));
    $('admin-selected-count').textContent = '0 selected';
  }

  // Rebuild table headers with checkboxes after the main render without duplicating the header.
  function injectCheckboxCells(tableId) {
    const table = $(tableId);
    if (!table) return;
    const all = table.querySelector('thead input.article-select-all');
    if (!all) {
      const th = document.createElement('th');
      th.className = 'article-select-all';
      th.innerHTML = '<input type="checkbox" aria-label="Select all visible articles">';
      table.querySelector('thead tr').prepend(th);
      th.querySelector('input').addEventListener('change', e => {
        table.querySelectorAll('tbody input.article-check').forEach(cb => cb.checked = e.target.checked);
        updateSelectionCount(tableId === 'spmArticles' ? 'spm' : 'admin');
      });
    }
    table.querySelectorAll('tbody tr').forEach(tr => {
      if (tr.querySelector('input.article-check')) return;
      const keyCell = document.createElement('td');
      const key = tr.querySelector('[data-label="Barcode"]')?.textContent || '';
      const source = tableId === 'spmArticles' ? spmRows : adminRows;
      const found = source.find(r => String(r.barCodeId || '') === key);
      keyCell.innerHTML = `<input type="checkbox" class="article-check" data-key="${esc(found?.articleKey || '')}">`;
      tr.prepend(keyCell);
    });
  }

  async function loadAdminArticles() {
    try {
      const date = $('admin-date').value;
      const q = $('admin-article-search').value.trim();
      const x = await PMVApi.adminArticles(date, q);
      adminRows = x.articles || [];
      window.__adminArticleRows = adminRows;

      $('admin-article-status').textContent =
        `${x.total || adminRows.length} records shown · ${x.updatedCount || 0} SPM status update(s) for ${date} · ${x.pendingSyncCount || 0} pending master synchronisation.`;

      renderAdmin(adminRows);
      injectCheckboxCells('adminArticles');
      renderSummary(adminRows, 'admin-status-summary');
    } catch (e) {
      $('admin-article-status').textContent = e.message;
      toast(e.message, 1);
    }
  }

  function injectSpmChecks() {
    injectCheckboxCells('spmArticles');
  }

  async function pushSelected() {
    const keys = checkedKeys('admin');
    if (!keys.length) return toast('Select one or more SPM-updated articles first.', 1);
    if (!confirm(`Authorise master update for ${keys.length} selected article(s)?`)) return;

    const button = $('admin-push-selected');
    if (button) { button.disabled = true; button.textContent = 'AUTHORISING…'; }
    try {
      const x = await PMVApi.pushArticleStatusToMaster({
        date: $('admin-date').value, articleKeys: keys
      });
      toast(`${x.pushed || 0} article(s) pushed to ARTICLE_MASTER; ${x.skipped || 0} skipped.`);
      await loadAdminArticles();
    } catch (e) { toast(e.message, 1); }
    finally {
      if (button) { button.disabled = false; button.textContent = 'AUTHORISE PUSH SELECTED'; }
    }
  }

  async function pushFiltered() {
    const rows = filterRows(adminRows, 'admin-article-status-filter');
    const keys = rows.filter(r =>
      r.updatedAt && normStatus(r.presentStatus) !== normStatus(r.masterStatus)
    ).map(r => r.articleKey);

    if (!keys.length) return toast('No pending SPM changes in the current filter.', 1);
    if (!confirm(`Authorise master update for all ${keys.length} filtered pending article(s)?`)) return;

    const button = $('admin-push-filtered');
    if (button) { button.disabled = true; button.textContent = 'AUTHORISING…'; }
    try {
      const x = await PMVApi.pushArticleStatusToMaster({
        date: $('admin-date').value, articleKeys: keys
      });
      toast(`${x.pushed || 0} filtered article(s) pushed to ARTICLE_MASTER.`);
      await loadAdminArticles();
    } catch (e) { toast(e.message, 1); }
    finally {
      if (button) { button.disabled = false; button.textContent = 'AUTHORISE PUSH FILTERED'; }
    }
  }

  function bind() {
    $('article-fetch')?.addEventListener('click', loadSpm);
    $('article-search')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadSpm(); });
    $('spm-date')?.addEventListener('change', loadSpm);
    $('article-status-filter')?.addEventListener('change', () => { renderSpm(spmRows); injectSpmChecks(); });

    $('spm-bulk-apply')?.addEventListener('click', bulkSpm);
    $('article-export-csv')?.addEventListener('click', exportCsv);

    $('admin-article-fetch')?.addEventListener('click', loadAdminArticles);
    $('admin-article-search')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadAdminArticles(); });
    $('admin-date')?.addEventListener('change', loadAdminArticles);
    $('admin-article-status-filter')?.addEventListener('change', () => { renderAdmin(adminRows); injectCheckboxCells('adminArticles'); });

    $('admin-push-selected')?.addEventListener('click', pushSelected);
    $('admin-push-filtered')?.addEventListener('click', pushFiltered);
  }

  window.PMVArticles = { bind, loadSpm, loadAdminArticles, exportCsv };
})();
