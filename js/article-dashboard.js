(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));

  const STATUSES = [
    'Pending', 'Delivered', 'Redirected', 'Return',
    'Torn/Without Address', 'Invalid OTP'
  ];

  let spmRows = [];
  let adminRows = [];

  const normalise = value => {
    const s = String(value || '').trim().toLowerCase();
    if (!s) return 'Pending';
    if (s.includes('deliver')) return 'Delivered';
    if (s.includes('redirect')) return 'Redirected';
    if (s.includes('return') || s.includes('rts')) return 'Return';
    if (s.includes('torn') || s.includes('without')) return 'Torn/Without Address';
    if (s.includes('otp') || s.includes('invalid mobile')) return 'Invalid OTP';
    return 'Pending';
  };

  const matches = (row, query) => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    // Search every field returned from ARTICLE_MASTER + ARTICLE_STATUS.
    const haystack = Object.values(row || {}).join(' ').toLowerCase();
    return q.split(/\s+/).filter(Boolean).every(token => haystack.includes(token));
  };

  const filtered = (rows, filterId, searchId) => {
    const filter = $(filterId)?.value || 'All';
    const q = $(searchId)?.value || '';
    return rows.filter(row =>
      (filter === 'All' || normalise(row.presentStatus) === filter) &&
      matches(row, q)
    );
  };

  function optionList(value) {
    return STATUSES.map(s =>
      `<option value="${esc(s)}" ${normalise(value) === s ? 'selected' : ''}>${esc(s)}</option>`
    ).join('');
  }

  function countSelected(tableId, outputId) {
    const n = $(tableId)?.querySelectorAll('tbody .article-check:checked').length || 0;
    if ($(outputId)) $(outputId).textContent = `${n} selected`;
  }

  function selectedKeys(tableId) {
    return [...($(tableId)?.querySelectorAll('tbody .article-check:checked') || [])]
      .map(cb => cb.dataset.key)
      .filter(Boolean);
  }

  function bindSelectAll(tableId, outputId) {
    const table = $(tableId);
    if (!table) return;

    const all = table.querySelector('.article-select-all');
    if (all) {
      all.addEventListener('change', e => {
        table.querySelectorAll('tbody .article-check')
          .forEach(cb => cb.checked = e.target.checked);
        countSelected(tableId, outputId);
      });
    }

    table.querySelectorAll('tbody .article-check')
      .forEach(cb => cb.addEventListener('change', () => countSelected(tableId, outputId)));
  }

  function summary(rows, targetId) {
    const counts = Object.fromEntries(STATUSES.map(s => [s, 0]));
    rows.forEach(r => counts[normalise(r.presentStatus)]++);
    const target = $(targetId);
    if (!target) return;
    target.innerHTML = Object.entries(counts)
      .map(([name, count]) => `<span class="pill">${esc(name)}: <b>${count}</b></span>`)
      .join(' ');
  }

  function renderSpm() {
    const rows = filtered(spmRows, 'article-status-filter', 'article-search');
    const table = $('spmArticles');
    if (!table) return;

    table.innerHTML = `
      <thead><tr>
        <th class="article-select-all"><input type="checkbox" aria-label="Select all"></th>
        <th>Barcode</th><th>PMV Application</th><th>Artisan</th><th>PIN</th>
        <th>Address</th><th>Circle</th><th>Division</th><th>Delivery Staff</th>
        <th>Present Status</th><th>Remarks</th><th>Action</th>
      </tr></thead>
      <tbody>
      ${rows.map(r => `
        <tr>
          <td><input class="article-check" type="checkbox" data-key="${esc(r.articleKey)}"></td>
          <td>${esc(r.barCodeId)}</td>
          <td>${esc(r.pmvApplicationNumber)}</td>
          <td><b>${esc(r.artisanName)}</b><small>${esc(r.mobileNumber)}</small></td>
          <td>${esc(r.pinCode)}</td>
          <td>${esc(r.address)}</td>
          <td>${esc(r.circleName)}</td>
          <td>${esc(r.divisionName)}</td>
          <td>${esc(r.deliveryStaff)}</td>
          <td><select class="article-status" data-key="${esc(r.articleKey)}">${optionList(r.presentStatus)}</select></td>
          <td><input class="article-remarks" data-key="${esc(r.articleKey)}" value="${esc(r.remarks)}"></td>
          <td><button type="button" class="btn btn-primary article-save" data-key="${esc(r.articleKey)}">SAVE</button></td>
        </tr>`).join('')}
      </tbody>`;

    bindSelectAll('spmArticles', 'spm-selected-count');
    $('spm-selected-count').textContent = '0 selected';

    table.querySelectorAll('.article-save').forEach(btn => {
      btn.addEventListener('click', () => saveOne(btn.dataset.key));
    });

    summary(rows, 'spm-status-summary');
  }

  async function saveOne(key) {
    const status = document.querySelector(`.article-status[data-key="${CSS.escape(key)}"]`)?.value || 'Pending';
    const remarks = document.querySelector(`.article-remarks[data-key="${CSS.escape(key)}"]`)?.value || '';

    try {
      await PMVApi.updateArticleStatus({
        date: $('spm-date').value,
        articleKey: key,
        status,
        remarks
      });
      toast('Article status updated.');
      await loadSpm();
    } catch (e) {
      toast(e.message, 1);
    }
  }

  async function bulkSpm() {
    const keys = selectedKeys('spmArticles');
    if (!keys.length) return toast('Select one or more articles first.', 1);

    const status = $('spm-bulk-status').value;
    const remarksByKey = {};
    keys.forEach(k => {
      remarksByKey[k] =
        document.querySelector(`.article-remarks[data-key="${CSS.escape(k)}"]`)?.value || '';
    });

    const button = $('spm-bulk-apply');
    if (button) {
      button.disabled = true;
      button.textContent = 'UPDATING…';
    }

    try {
      const result = await PMVApi.bulkUpdateArticleStatus({
        date: $('spm-date').value,
        articleKeys: keys,
        status,
        remarksByKey
      });
      toast(`${result.updated} article status update(s) saved.`);
      await loadSpm();
    } catch (e) {
      toast(e.message, 1);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'CHANGE SELECTED';
      }
    }
  }

  async function loadSpm() {
    try {
      const date = $('spm-date').value;
      const query = $('article-search').value.trim();
      const result = await PMVApi.articles(date, query);

      spmRows = result.articles || [];
      window.__spmArticleRows = spmRows;

      const pins = result.assignedPins || result.pincodes || [];
      const total = result.total ?? result.totalVisible ?? spmRows.length;

      $('article-scope').textContent =
        `Office: ${result.officeName || ''} · Assigned PIN codes: ${pins.join(', ') || 'Not configured'} · ${total} articles visible`;

      renderSpm();
    } catch (e) {
      $('article-scope').textContent = e.message;
      toast(e.message, 1);
    }
  }

  function exportCsv() {
    const rows = filtered(spmRows, 'article-status-filter', 'article-search');
    if (!rows.length) return toast('No articles available for export.', 1);

    const headers = [
      'Article Key','Barcode ID','PMV Application Number','Artisan Name',
      'Mobile Number','Address','Circle','Division','PIN Code',
      'Delivery Staff','Present Status','Remarks','Updated At'
    ];

    const quote = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [headers.map(quote).join(',')];

    rows.forEach(r => lines.push([
      r.articleKey,r.barCodeId,r.pmvApplicationNumber,r.artisanName,
      r.mobileNumber,r.address,r.circleName,r.divisionName,r.pinCode,
      r.deliveryStaff,normalise(r.presentStatus),r.remarks,r.updatedAt
    ].map(quote).join(',')));

    const url = URL.createObjectURL(
      new Blob(['\ufeff' + lines.join('\r\n')], {type:'text/csv;charset=utf-8'})
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `PMV_Articles_${$('spm-date').value || 'date'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderAdmin() {
    const rows = filtered(adminRows, 'admin-article-status-filter', 'admin-article-search');
    const table = $('adminArticles');
    if (!table) return;

    table.innerHTML = `
      <thead><tr>
        <th class="article-select-all"><input type="checkbox" aria-label="Select all"></th>
        <th>Barcode</th><th>PMV Application</th><th>Artisan</th><th>PIN</th>
        <th>Office</th><th>SPM</th><th>Present Status</th><th>Master Status</th>
        <th>Remarks</th><th>Updated</th><th>Review</th>
      </tr></thead>
      <tbody>
      ${rows.map(r => {
        const synced = normalise(r.presentStatus) === normalise(r.masterStatus);
        return `<tr>
          <td><input class="article-check" type="checkbox" data-key="${esc(r.articleKey)}"></td>
          <td>${esc(r.barCodeId)}</td>
          <td>${esc(r.pmvApplicationNumber)}</td>
          <td><b>${esc(r.artisanName)}</b><small>${esc(r.mobileNumber)}</small></td>
          <td>${esc(r.pinCode)}</td>
          <td>${esc(r.officeName)}</td>
          <td>${esc(r.spmName)}<small>${esc(r.spmId)}</small></td>
          <td>${esc(normalise(r.presentStatus))}</td>
          <td>${esc(normalise(r.masterStatus))}</td>
          <td>${esc(r.remarks)}</td>
          <td>${esc(r.updatedAt)}</td>
          <td>${synced ? 'SYNCED' : 'PENDING MASTER PUSH'}</td>
        </tr>`;
      }).join('')}
      </tbody>`;

    bindSelectAll('adminArticles', 'admin-selected-count');
    $('admin-selected-count').textContent = '0 selected';
    summary(rows, 'admin-status-summary');
  }

  async function loadAdminArticles() {
    try {
      const result = await PMVApi.adminArticles(
        $('admin-date').value,
        $('admin-article-search').value.trim()
      );

      adminRows = result.articles || [];
      window.__adminArticleRows = adminRows;

      $('admin-article-status').textContent =
        `${result.total ?? adminRows.length} records · ${result.updatedCount || 0} SPM updates · ${result.pendingSyncCount || 0} pending master synchronisations`;

      renderAdmin();
    } catch (e) {
      $('admin-article-status').textContent = e.message;
      toast(e.message, 1);
    }
  }

  async function pushSelected() {
    const keys = selectedKeys('adminArticles');
    if (!keys.length) return toast('Select article(s) first.', 1);
    if (!confirm(`Authorise master update for ${keys.length} selected article(s)?`)) return;

    try {
      const result = await PMVApi.pushArticleStatusToMaster({
        date: $('admin-date').value,
        articleKeys: keys
      });
      toast(`${result.pushed || 0} pushed; ${result.skipped || 0} skipped.`);
      await loadAdminArticles();
    } catch (e) {
      toast(e.message, 1);
    }
  }

  async function pushFiltered() {
    const rows = filtered(adminRows, 'admin-article-status-filter', 'admin-article-search');
    const keys = rows
      .filter(r => r.updatedAt && normalise(r.presentStatus) !== normalise(r.masterStatus))
      .map(r => r.articleKey);

    if (!keys.length) return toast('No pending master changes in the current filter.', 1);
    if (!confirm(`Authorise master update for ${keys.length} filtered article(s)?`)) return;

    try {
      const result = await PMVApi.pushArticleStatusToMaster({
        date: $('admin-date').value,
        articleKeys: keys
      });
      toast(`${result.pushed || 0} pushed; ${result.skipped || 0} skipped.`);
      await loadAdminArticles();
    } catch (e) {
      toast(e.message, 1);
    }
  }

  window.ArticleDashboard = {
    loadSpm,
    loadAdminArticles,
    bulkSpm,
    pushSelected,
    pushFiltered,
    exportCsv,
    renderSpm,
    renderAdmin
  };

  function bind() {
    $('article-fetch')?.addEventListener('click', loadSpm);
    $('article-export-csv')?.addEventListener('click', exportCsv);
    $('spm-bulk-apply')?.addEventListener('click', bulkSpm);
    $('article-status-filter')?.addEventListener('change', renderSpm);
    $('article-search')?.addEventListener('input', renderSpm);

    $('admin-article-fetch')?.addEventListener('click', loadAdminArticles);
    $('admin-article-status-filter')?.addEventListener('change', renderAdmin);
    $('admin-article-search')?.addEventListener('input', renderAdmin);
    $('admin-push-selected')?.addEventListener('click', pushSelected);
    $('admin-push-filtered')?.addEventListener('click', pushFiltered);

    $('spm-date')?.addEventListener('change', () => {
      if (!$('spmView')?.classList.contains('hidden')) loadSpm();
    });
    $('admin-date')?.addEventListener('change', () => {
      if (!$('adminView')?.classList.contains('hidden')) loadAdminArticles();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
