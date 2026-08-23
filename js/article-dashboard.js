/* ============================================================
   PMV TOOLKIT TRACKER
   ARTICLE DASHBOARD
   Version 6
   ============================================================ */

(function () {

  "use strict";

  /* ==========================================================
     GLOBAL STATE
     ========================================================== */

  let spmArticleData = [];
  let adminArticleData = [];


  /* ==========================================================
     BASIC HELPERS
     ========================================================== */

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {

    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  }


  function showNotice(id, message, type) {

    const el = $(id);

    if (!el) return;

    el.textContent = message || "";

    el.className = "notice";

    if (type) {
      el.classList.add(type);
    }

  }


  function getSession() {

    /*
      Your existing auth.js normally maintains the session.
      Try the common global names first.
    */

    if (window.currentSession) {
      return window.currentSession;
    }

    if (window.session) {
      return window.session;
    }

    if (window.PMV_SESSION) {
      return window.PMV_SESSION;
    }

    /*
      Fallback to localStorage.
    */

    const keys = [
      "pmvSession",
      "PMV_SESSION",
      "session",
      "pmv_session"
    ];

    for (const key of keys) {

      try {

        const value = localStorage.getItem(key);

        if (value) {
          return JSON.parse(value);
        }

      } catch (e) {}

    }

    return null;
  }


  function currentDate() {

    const el = $("spm-date");

    if (el && el.value) {
      return el.value;
    }

    const d = new Date();

    const y = d.getFullYear();

    const m = String(d.getMonth() + 1).padStart(2, "0");

    const day = String(d.getDate()).padStart(2, "0");

    return y + "-" + m + "-" + day;

  }


  /* ==========================================================
     API HELPER
     ========================================================== */

  async function apiPost(action, record) {

    /*
      Prefer your existing API helper if available.
    */

    if (typeof window.apiPost === "function") {

      return await window.apiPost(
        action,
        record
      );

    }

    if (typeof window.postApi === "function") {

      return await window.postApi(
        action,
        record
      );

    }


    /*
      Fallback implementation.

      config.js should expose API_URL / GAS_URL / SCRIPT_URL.
    */

    const apiUrl =
      window.API_URL ||
      window.GAS_URL ||
      window.SCRIPT_URL ||
      window.CONFIG?.API_URL ||
      window.CONFIG?.GAS_URL;


    if (!apiUrl) {

      throw new Error(
        "API URL not found in config.js."
      );

    }


    const session = getSession();


    const response = await fetch(apiUrl, {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({

        action: action,

        record: record,

        session: session

      })

    });


    return await response.json();

  }


  /* ==========================================================
     API GET
     ========================================================== */

  async function apiGet(action, params) {

    if (typeof window.apiGet === "function") {

      return await window.apiGet(
        action,
        params || {}
      );

    }


    const apiUrl =
      window.API_URL ||
      window.GAS_URL ||
      window.SCRIPT_URL ||
      window.CONFIG?.API_URL ||
      window.CONFIG?.GAS_URL;


    if (!apiUrl) {

      throw new Error(
        "API URL not found in config.js."
      );

    }


    const session = getSession();


    const query = new URLSearchParams();

    query.set(
      "action",
      action
    );


    Object.keys(params || {}).forEach(key => {

      if (
        params[key] !== undefined &&
        params[key] !== null
      ) {

        query.set(
          key,
          String(params[key])
        );

      }

    });


    query.set(
      "session",
      JSON.stringify(session || {})
    );


    const response = await fetch(
      apiUrl + "?" + query.toString()
    );


    return await response.json();

  }


  /* ==========================================================
     SPM ARTICLE FETCH
     ========================================================== */

  async function fetchSpmArticles() {

    const search =
      $("article-search")?.value.trim() || "";

    const date =
      currentDate();


    showNotice(
      "article-scope",
      "Fetching articles...",
      ""
    );


    try {

      const result =
        await apiGet(
          "getSpmArticles",
          {
            date: date,
            q: search,
            limit: 500
          }
        );


      if (!result || !result.success) {

        throw new Error(
          result?.message ||
          "Unable to fetch articles."
        );

      }


      spmArticleData =
        result.data?.articles || [];


      renderSpmArticles();


      const scope =
        result.data?.pincodes || [];


      showNotice(
        "article-scope",

        "Showing " +
        spmArticleData.length +
        " article(s)" +
        (
          scope.length
            ? " for PIN code(s): " +
              scope.join(", ")
            : ""
        ),

        ""
      );

    } catch (error) {

      console.error(
        "SPM article fetch error:",
        error
      );


      showNotice(
        "article-scope",
        error.message ||
        "Unable to fetch articles.",
        "error"
      );

    }

  }


  /* ==========================================================
     SPM FILTER
     ========================================================== */

  function filteredSpmArticles() {

    const search =
      $("article-search")?.value
        .trim()
        .toLowerCase() || "";


    const filter =
      $("article-status-filter")?.value ||
      "All";


    return spmArticleData.filter(article => {

      const haystack = [

        article.barCodeId,

        article.pmvApplicationNumber,

        article.artisanName,

        article.pinCode,

        article.address,

        article.deliveryStaff,

        article.presentStatus

      ]
        .join(" ")
        .toLowerCase();


      if (
        search &&
        !haystack.includes(search)
      ) {

        return false;

      }


      if (
        filter !== "All" &&
        String(
          article.presentStatus || "Pending"
        ).trim() !== filter
      ) {

        return false;

      }


      return true;

    });

  }


  /* ==========================================================
     SPM ARTICLE TABLE
     ========================================================== */

  function renderSpmArticles() {

    const table =
      $("spmArticles");

    if (!table) return;


    const rows =
      filteredSpmArticles();


    table.innerHTML = `

      <thead>

        <tr>

          <th>Barcode</th>

          <th>PMV Application</th>

          <th>Artisan</th>

          <th>PIN</th>

          <th>Mobile</th>

          <th>Current Status</th>

          <th>Remarks</th>

          <th>Action</th>

        </tr>

      </thead>

      <tbody>

        ${
          rows.length
            ? rows.map(
                renderSpmArticleRow
              ).join("")
            : `
              <tr>
                <td colspan="8">
                  No articles found.
                </td>
              </tr>
            `
        }

      </tbody>

    `;


    bindSpmSaveButtons();

  }


  function renderSpmArticleRow(article) {

    const key =
      escapeHtml(
        article.articleKey
      );


    const status =
      escapeHtml(
        article.presentStatus ||
        "Pending"
      );


    const remarks =
      escapeHtml(
        article.remarks || ""
      );


    return `

      <tr>

        <td>
          ${escapeHtml(article.barCodeId)}
        </td>

        <td>
          ${escapeHtml(
            article.pmvApplicationNumber
          )}
        </td>

        <td>
          ${escapeHtml(
            article.artisanName
          )}
        </td>

        <td>
          ${escapeHtml(
            article.pinCode
          )}
        </td>

        <td>
          ${escapeHtml(
            article.mobileNumber
          )}
        </td>

        <td>

          <select
            class="spm-status"
            data-key="${key}">

            ${statusOptions(status)}

          </select>

        </td>

        <td>

          <input
            class="spm-remarks"
            data-key="${key}"
            value="${remarks}"
            placeholder="Remarks">

        </td>

        <td>

          <button
            type="button"
            class="btn btn-primary spm-save-status"
            data-key="${key}">

            SAVE

          </button>

        </td>

      </tr>

    `;

  }


  function statusOptions(selected) {

    const statuses = [

      "Pending",
      "Delivered",
      "Redirected",
      "RTS / Return",
      "Not Received",
      "Other"

    ];


    return statuses.map(status => `

      <option
        value="${escapeHtml(status)}"
        ${status === selected ? "selected" : ""}>

        ${escapeHtml(status)}

      </option>

    `).join("");

  }


  /* ==========================================================
     SPM SAVE
     ========================================================== */

  function bindSpmSaveButtons() {

    document
      .querySelectorAll(
        ".spm-save-status"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          async function () {

            const key =
              this.dataset.key;


            const statusEl =
              document.querySelector(
                `.spm-status[data-key="${CSS.escape(key)}"]`
              );


            const remarksEl =
              document.querySelector(
                `.spm-remarks[data-key="${CSS.escape(key)}"]`
              );


            const status =
              statusEl?.value || "Pending";


            const remarks =
              remarksEl?.value || "";


            this.disabled = true;

            const original =
              this.textContent;

            this.textContent =
              "Saving...";


            try {

              const result =
                await apiPost(
                  "updateArticleStatus",
                  {

                    date:
                      currentDate(),

                    articleKey:
                      key,

                    status:
                      status,

                    remarks:
                      remarks

                  }
                );


              if (
                !result ||
                !result.success
              ) {

                throw new Error(
                  result?.message ||
                  "Unable to update status."
                );

              }


              const article =
                spmArticleData.find(
                  x =>
                    String(
                      x.articleKey
                    ) === String(key)
                );


              if (article) {

                article.presentStatus =
                  status;

                article.remarks =
                  remarks;

              }


              renderSpmArticles();


              if (typeof window.showToast === "function") {

                window.showToast(
                  "Article status updated."
                );

              }

            } catch (error) {

              alert(
                error.message ||
                "Unable to update article status."
              );


              this.disabled = false;

              this.textContent =
                original;

            }

          }
        );

      });

  }


  /* ==========================================================
     CSV EXPORT
     ========================================================== */

  function exportSpmCsv() {

    const rows =
      filteredSpmArticles();


    if (!rows.length) {

      alert(
        "There are no articles to export."
      );

      return;

    }


    const headers = [

      "Barcode",

      "PMV Application Number",

      "Artisan Name",

      "Mobile Number",

      "Address",

      "Circle",

      "Division",

      "PIN Code",

      "Delivery Staff",

      "Source Status",

      "Present Status",

      "Remarks",

      "Updated At"

    ];


    const csvRows = [

      headers,

      ...rows.map(a => [

        a.barCodeId,

        a.pmvApplicationNumber,

        a.artisanName,

        a.mobileNumber,

        a.address,

        a.circleName,

        a.divisionName,

        a.pinCode,

        a.deliveryStaff,

        a.sourceStatus,

        a.presentStatus,

        a.remarks,

        a.updatedAt

      ])

    ];


    const csv =
      csvRows.map(row =>
        row.map(csvEscape).join(",")
      ).join("\r\n");


    const blob =
      new Blob(
        ["\ufeff" + csv],
        {
          type:
            "text/csv;charset=utf-8;"
        }
      );


    const url =
      URL.createObjectURL(blob);


    const link =
      document.createElement("a");


    link.href = url;


    link.download =
      "PMV_Articles_" +
      currentDate() +
      ".csv";


    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);

  }


  function csvEscape(value) {

    const text =
      String(value == null ? "" : value);


    return '"' +
      text.replace(/"/g, '""') +
      '"';

  }


  /* ==========================================================
     ADMIN ARTICLE FETCH
     ========================================================== */

  async function fetchAdminArticles() {

    const search =
      $("admin-article-search")?.value
        .trim() || "";


    showNotice(
      "admin-article-status",
      "Fetching article status...",
      ""
    );


    try {

      const result =
        await apiGet(
          "getAdminArticleStatus",
          {

            date:
              currentDate(),

            q:
              search,

            limit:
              1000

          }
        );


      if (
        !result ||
        !result.success
      ) {

        throw new Error(
          result?.message ||
          "Unable to fetch Admin article status."
        );

      }


      adminArticleData =
        result.data?.articles || [];


      renderAdminArticles();


      showNotice(
        "admin-article-status",

        adminArticleData.length +
        " article(s) loaded.",

        ""
      );

    } catch (error) {

      console.error(
        "Admin article fetch error:",
        error
      );


      showNotice(
        "admin-article-status",

        error.message ||
        "Unable to fetch article status.",

        "error"
      );

    }

  }


  /* ==========================================================
     ADMIN TABLE
     ========================================================== */

  function renderAdminArticles() {

    const table =
      $("adminArticles");

    if (!table) return;


    table.innerHTML = `

      <thead>

        <tr>

          <th>Barcode</th>

          <th>PMV Application</th>

          <th>Artisan</th>

          <th>PIN</th>

          <th>Master / Source Status</th>

          <th>Present Status</th>

          <th>SPM</th>

          <th>Remarks</th>

          <th>Action</th>

        </tr>

      </thead>

      <tbody>

        ${
          adminArticleData.length
            ? adminArticleData
                .map(
                  renderAdminArticleRow
                )
                .join("")
            : `
              <tr>
                <td colspan="9">
                  No articles found.
                </td>
              </tr>
            `
        }

      </tbody>

    `;


    bindAdminMasterButtons();

  }


  function renderAdminArticleRow(article) {

    const key =
      escapeHtml(
        article.articleKey
      );


    const status =
      article.presentStatus ||
      "Pending";


    const masterStatus =
      article.sourceStatus ||
      "Pending";


    return `

      <tr>

        <td>
          ${escapeHtml(
            article.barCodeId
          )}
        </td>

        <td>
          ${escapeHtml(
            article.pmvApplicationNumber
          )}
        </td>

        <td>
          ${escapeHtml(
            article.artisanName
          )}
        </td>

        <td>
          ${escapeHtml(
            article.pinCode
          )}
        </td>

        <td>
          ${escapeHtml(
            masterStatus
          )}
        </td>

        <td>

          <select
            class="admin-master-status"
            data-key="${key}">

            ${statusOptions(status)}

          </select>

        </td>

        <td>

          ${escapeHtml(
            article.spmName ||
            ""
          )}

        </td>

        <td>

          ${escapeHtml(
            article.remarks ||
            ""
          )}

        </td>

        <td>

          <button
            type="button"
            class="btn btn-primary admin-update-master"
            data-key="${key}">

            UPDATE MASTER

          </button>

        </td>

      </tr>

    `;

  }


  /* ==========================================================
     ADMIN UPDATE MASTER
     ========================================================== */

  function bindAdminMasterButtons() {

    document
      .querySelectorAll(
        ".admin-update-master"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          async function () {

            const key =
              this.dataset.key;


            const statusEl =
              document.querySelector(
                `.admin-master-status[data-key="${CSS.escape(key)}"]`
              );


            const status =
              statusEl?.value || "";


            const article =
              adminArticleData.find(
                x =>
                  String(
                    x.articleKey
                  ) === String(key)
              );


            if (!article) {

              alert(
                "Article information not found."
              );

              return;

            }


            const previous =
              article.sourceStatus ||
              "Pending";


            const confirmed =
              confirm(

                "Update ARTICLE_MASTER?\n\n" +

                "Article: " +
                (
                  article.pmvApplicationNumber ||
                  article.barCodeId ||
                  key
                ) +

                "\n\nPrevious master status: " +
                previous +

                "\nNew master status: " +
                status +

                "\n\nThis will change the " +
                "TOOLKIT_DELIVERY_STATUS " +
                "in ARTICLE_MASTER."

              );


            if (!confirmed) {

              return;

            }


            this.disabled = true;

            const original =
              this.textContent;

            this.textContent =
              "Updating...";


            try {

              const result =
                await apiPost(
                  "updateArticleMasterStatus",
                  {

                    articleKey:
                      key,

                    pmvApplicationNumber:
                      article.pmvApplicationNumber,

                    barCodeId:
                      article.barCodeId,

                    status:
                      status

                  }
                );


              if (
                !result ||
                !result.success
              ) {

                throw new Error(
                  result?.message ||
                  "ARTICLE_MASTER update failed."
                );

              }


              /*
                Update local display immediately.
              */

              article.sourceStatus =
                status;


              article.presentStatus =
                status;


              renderAdminArticles();


              showNotice(

                "admin-article-status",

                "✓ ARTICLE_MASTER updated successfully. " +
                "Previous: " +
                (
                  result.data?.previousStatus ||
                  previous
                ) +
                " → New: " +
                (
                  result.data?.newStatus ||
                  status
                ),

                "success"

              );


            } catch (error) {

              console.error(
                "ARTICLE_MASTER update error:",
                error
              );


              alert(
                error.message ||
                "Unable to update ARTICLE_MASTER."
              );


              this.disabled = false;

              this.textContent =
                original;

            }

          }
        );

      });

  }


  /* ==========================================================
     EVENT BINDING
     ========================================================== */

  function bindEvents() {


    /*
      SPM FETCH
    */

    const spmFetch =
      $("article-fetch");

    if (spmFetch) {

      spmFetch.addEventListener(
        "click",
        fetchSpmArticles
      );

    }


    /*
      SPM SEARCH
    */

    const search =
      $("article-search");

    if (search) {

      search.addEventListener(
        "input",
        renderSpmArticles
      );

    }


    /*
      STATUS FILTER
    */

    const filter =
      $("article-status-filter");

    if (filter) {

      filter.addEventListener(
        "change",
        renderSpmArticles
      );

    }


    /*
      CSV
    */

    const exportButton =
      $("article-export-csv");

    if (exportButton) {

      exportButton.addEventListener(
        "click",
        exportSpmCsv
      );

    }


    /*
      ADMIN FETCH
    */

    const adminFetch =
      $("admin-article-fetch");

    if (adminFetch) {

      adminFetch.addEventListener(
        "click",
        fetchAdminArticles
      );

    }


    /*
      ADMIN SEARCH
    */

    const adminSearch =
      $("admin-article-search");

    if (adminSearch) {

      adminSearch.addEventListener(
        "keydown",
        function (event) {

          if (
            event.key === "Enter"
          ) {

            event.preventDefault();

            fetchAdminArticles();

          }

        }
      );

    }


    /*
      Automatically fetch articles when
      SPM date changes.
    */

    const spmDate =
      $("spm-date");

    if (spmDate) {

      spmDate.addEventListener(
        "change",
        function () {

          fetchSpmArticles();

        }
      );

    }


    /*
      Automatically refresh Admin articles
      when Admin date changes.
    */

    const adminDate =
      $("admin-date");

    if (adminDate) {

      adminDate.addEventListener(
        "change",
        function () {

          fetchAdminArticles();

        }
      );

    }

  }


  /* ==========================================================
     INITIALIZATION
     ========================================================== */

  function init() {

    bindEvents();

  }


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      init
    );

  } else {

    init();

  }


  /* ==========================================================
     PUBLIC API
     ========================================================== */

  window.PMVArticleDashboard = {

    fetchSpmArticles:
      fetchSpmArticles,

    fetchAdminArticles:
      fetchAdminArticles,

    renderSpmArticles:
      renderSpmArticles,

    renderAdminArticles:
      renderAdminArticles,

    exportSpmCsv:
      exportSpmCsv

  };

})();
