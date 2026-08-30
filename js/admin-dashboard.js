(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  const esc = value =>
    String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));

  const num = value => {
    const n = Number(value);
    return Number.isFinite(n)
      ? n.toLocaleString('en-IN')
      : '0';
  };

  const text = value =>
    value === null || value === undefined ? '' : String(value);

  const statusClass = status =>
    String(status || '').toLowerCase() === 'updated'
      ? 'green'
      : 'amber';

  function showError(message) {
    const el = $('adminStatus');

    if (el) {
      el.textContent = message || 'Unable to load dashboard.';
    }

    if (typeof window.toast === 'function') {
      window.toast(message || 'Unable to load dashboard.', 1);
    }
  }

  function emptyRow(colspan, message = 'No records found.') {
    return `
      <tr>
        <td colspan="${colspan}" style="text-align:center;padding:20px;">
          ${esc(message)}
        </td>
      </tr>
    `;
  }

  function stats(s = {}) {
    const fields = [
      ['newKits', 'Came Today · Kits'],
      ['newArticles', 'Came Today · Articles'],

      ['deliveredKitsToday', 'Delivered · Kits'],
      ['deliveredArticlesToday', 'Delivered · Articles'],

      ['redirectedKits', 'Redirected · Kits'],
      ['redirectedArticles', 'Redirected · Articles'],

      ['rtsKits', 'RTS · Kits'],
      ['rtsArticles', 'RTS · Articles'],

      ['closingPendingKits', 'Closing Pending · Kits'],
      ['closingPendingArticles', 'Closing Pending · Articles'],

      ['invalidMobileKits', 'Invalid Mobile · Kits'],
      ['invalidMobileArticles', 'Invalid Mobile · Articles'],

      ['tornKits', 'Torn · Kits'],
      ['tornArticles', 'Torn · Articles'],

      ['deliverableKits', 'Deliverable · Kits'],
      ['deliverableArticles', 'Deliverable · Articles'],

      ['incompleteKits', 'Incomplete · Kits'],
      ['incompleteArticles', 'Incomplete · Articles']
    ];

    const el = $('stats');

    if (!el) return;

    el.innerHTML = fields.map(([key, label]) => `
      <div class="stat">
        <span>${esc(label)}</span>
        <b>${num(s[key])}</b>
      </div>
    `).join('');
  }

  function office(rows = []) {
    const el = $('office');

    if (!el) return;

    const headers = [
      'Office',
      'Status',
      'SPMs',
      'Updated',

      'Kits: Opening',
      'Kits: Came',
      'Kits: Redirect',
      'Kits: RTS',
      'Kits: Delivered',
      'Kits: Closing',

      'Articles: Opening',
      'Articles: Came',
      'Articles: Redirect',
      'Articles: RTS',
      'Articles: Delivered',
      'Articles: Closing'
    ];

    const thead = `
      <thead>
        <tr>
          ${headers.map(h => `<th>${esc(h)}</th>`).join('')}
        </tr>
      </thead>
    `;

    if (!Array.isArray(rows) || rows.length === 0) {
      el.innerHTML = thead + `<tbody>${emptyRow(headers.length)}</tbody>`;
      return;
    }

    const tbody = rows.map(r => `
      <tr>
        <td>${esc(r.officeName)}</td>

        <td>
          <i class="pill ${statusClass(r.status)}">
            ${esc(r.status || 'Pending')}
          </i>
        </td>

        <td>${num(r.totalSpms)}</td>
        <td>${num(r.updatedSpms)}</td>

        <td>${num(r.openingKits)}</td>
        <td>${num(r.newKits)}</td>
        <td>${num(r.redirectedKits)}</td>
        <td>${num(r.rtsKits)}</td>
        <td>${num(r.deliveredKits)}</td>
        <td>${num(r.closingPendingKits)}</td>

        <td>${num(r.openingArticles)}</td>
        <td>${num(r.newArticles)}</td>
        <td>${num(r.redirectedArticles)}</td>
        <td>${num(r.rtsArticles)}</td>
        <td>${num(r.deliveredArticles)}</td>
        <td>${num(r.closingPendingArticles)}</td>
      </tr>
    `).join('');

    el.innerHTML = thead + `<tbody>${tbody}</tbody>`;
  }

  function spmWise(rows = []) {
    const el = $('spmWise');

    if (!el) return;

    const headers = [
      'SPM',
      'Office',
      'Status',

      'Kits · Opening',
      'Kits · Came Today',
      'Kits · Delivered',
      'Kits · Redirect',
      'Kits · RTS',
      'Kits · Invalid Mobile',
      'Kits · Torn',
      'Kits · Deliverable',
      'Kits · Incomplete',
      'Kits · Closing',

      'Articles · Opening',
      'Articles · Came Today',
      'Articles · Delivered',
      'Articles · Redirect',
      'Articles · RTS',
      'Articles · Invalid Mobile',
      'Articles · Torn',
      'Articles · Deliverable',
      'Articles · Incomplete',
      'Articles · Closing'
    ];

    const thead = `
      <thead>
        <tr>
          ${headers.map(h => `<th>${esc(h)}</th>`).join('')}
        </tr>
      </thead>
    `;

    if (!Array.isArray(rows) || rows.length === 0) {
      el.innerHTML = thead + `<tbody>${emptyRow(headers.length)}</tbody>`;
      return;
    }

    const tbody = rows.map(r => `
      <tr>
        <td>
          <strong>${esc(r.spmName)}</strong>
          <small>${esc(r.spmId)}</small>
        </td>

        <td>${esc(r.officeName)}</td>

        <td>
          <i class="pill ${statusClass(r.status)}">
            ${esc(r.status || 'Pending')}
          </i>
        </td>

        <td>${num(r.openingKits)}</td>
        <td>${num(r.newKits)}</td>
        <td>${num(r.deliveredKits)}</td>
        <td>${num(r.redirectedKits)}</td>
        <td>${num(r.rtsKits)}</td>
        <td>${num(r.invalidMobileKits)}</td>
        <td>${num(r.tornKits)}</td>
        <td>${num(r.deliverableKits)}</td>
        <td>${num(r.incompleteKits)}</td>
        <td>${num(r.closingPendingKits)}</td>

        <td>${num(r.openingArticles)}</td>
        <td>${num(r.newArticles)}</td>
        <td>${num(r.deliveredArticles)}</td>
        <td>${num(r.redirectedArticles)}</td>
        <td>${num(r.rtsArticles)}</td>
        <td>${num(r.invalidMobileArticles)}</td>
        <td>${num(r.tornArticles)}</td>
        <td>${num(r.deliverableArticles)}</td>
        <td>${num(r.incompleteArticles)}</td>
        <td>${num(r.closingPendingArticles)}</td>
      </tr>
    `).join('');

    el.innerHTML = thead + `<tbody>${tbody}</tbody>`;
  }

  function pending(rows = []) {
    const el = $('pending');

    if (!el) return;

    const headers = [
      '#',
      'SPM Name',
      'SPM ID',
      'Office'
    ];

    const thead = `
      <thead>
        <tr>
          ${headers.map(h => `<th>${esc(h)}</th>`).join('')}
        </tr>
      </thead>
    `;

    if (!Array.isArray(rows) || rows.length === 0) {
      el.innerHTML =
        thead +
        `<tbody>${emptyRow(headers.length, 'All active SPMs have updated.')}</tbody>`;
      return;
    }

    const tbody = rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(r.spmName)}</td>
        <td>${esc(r.spmId)}</td>
        <td>${esc(r.officeName)}</td>
      </tr>
    `).join('');

    el.innerHTML = thead + `<tbody>${tbody}</tbody>`;
  }

  async function load(date) {
    const status = $('adminStatus');
    const monitoring = $('monitoring');

    try {
      if (!date) {
        throw new Error('Please select a valid date.');
      }

      if (!window.PMVApi ||
          typeof window.PMVApi.admin !== 'function') {
        throw new Error('PMVApi.admin() is not available.');
      }

      if (status) {
        status.textContent = 'Loading dashboard...';
      }

      const response = await window.PMVApi.admin(date);

      if (!response) {
        throw new Error('Empty response received from server.');
      }

      if (response.success === false) {
        throw new Error(
          response.error ||
          response.message ||
          'Server returned an error.'
        );
      }

      if (monitoring) {
        monitoring.textContent =
          response.date || date;
      }

      stats(response.summary || {});
      office(response.officeWise || []);
      spmWise(response.spmWise || []);
      pending(response.pendingSpms || []);

      if (status) {
        const updated = Number(response.spmsUpdatedToday || 0);
        const active = Number(response.activeSpms || 0);

        status.textContent =
          `${updated} of ${active} active SPMs updated for ${response.date || date}.`;
      }

    } catch (error) {
      console.error('PMV Admin Dashboard:', error);
      showError(error?.message || 'Failed to load admin dashboard.');
    }
  }

  function bind() {
    const refresh = $('refresh');
    const dateInput = $('admin-date');

    if (!dateInput) {
      console.error('admin-date element not found.');
      return;
    }

    if (refresh) {
      refresh.onclick = () => {
        load(dateInput.value);
      };
    }

    dateInput.onchange = () => {
      load(dateInput.value);
    };
  }

  window.PMVAdmin = {
    bind,
    load,

    setToday: () => {
      const input = $('admin-date');

      if (!input) return;

      if (
        window.PMVApi &&
        typeof window.PMVApi.todayIndia === 'function'
      ) {
        input.value = window.PMVApi.todayIndia();
      }
    }
  };

})();
