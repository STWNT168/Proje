/************************************************************
 * PMV TOOLKIT TRACKER
 * COMPLETE GOOGLE APPS SCRIPT BACKEND
 * Version: Article Status + PMV Daily Reporting
 *
 * Sheets:
 *   DAILY_DATA
 *   OFFICE_MASTER
 *   USER_MASTER
 *   SESSIONS
 *   ARTICLE_MASTER
 *   ARTICLE_STATUS
 *
 * Roles:
 *   SPM
 *   DPS
 *   ADMIN
 ************************************************************/

const CONFIG = {
  SPREADSHEET_ID:
    '1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8',

  TIME_ZONE: 'Asia/Kolkata',

  SHEETS: {
    DAILY: 'DAILY_DATA',
    OFFICE: 'OFFICE_MASTER',
    USERS: 'USER_MASTER',
    SESSIONS: 'SESSIONS',
    ARTICLE_MASTER: 'ARTICLE_MASTER',
    ARTICLE_STATUS: 'ARTICLE_STATUS'
  },

  ROLES: {
    SPM: 'SPM',
    DPS: 'DPS',
    ADMIN: 'ADMIN'
  },

  SESSION_DAYS: 7,

  STATUS: [
    'Pending',
    'Delivered',
    'Redirected',
    'Return',
    'Torn/Without Address',
    'Invalid OTP'
  ]
};


/* ==========================================================
   BASIC HELPERS
   ========================================================== */

function getSS_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getSheet_(name) {
  const ss = getSS_();
  const sh = ss.getSheetByName(name);

  if (!sh) {
    throw new Error('Required sheet not found: ' + name);
  }

  return sh;
}

function now_() {
  return Utilities.formatDate(
    new Date(),
    CONFIG.TIME_ZONE,
    'yyyy-MM-dd HH:mm:ss'
  );
}

function today_() {
  return Utilities.formatDate(
    new Date(),
    CONFIG.TIME_ZONE,
    'yyyy-MM-dd'
  );
}

function clean_(v) {
  return String(v == null ? '' : v).trim();
}

function upper_(v) {
  return clean_(v).toUpperCase();
}

function number_(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : Math.max(0, Math.floor(n));
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      data: obj
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function error_(message) {
  return ContentService
    .createTextOutput(JSON.stringify({
      success: false,
      error: String(message)
    }))
    .setMimeType(ContentService.MimeType.JSON);
}


/* ==========================================================
   HTTP ENTRY POINTS
   ========================================================== */

function doGet(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    const action = clean_(p.action);

    if (!action) {
      return json_({
        status: 'OK',
        service: 'PMV Toolkit Tracker',
        version: 'Article Status V3',
        date: today_()
      });
    }

    /*
     * IMPORTANT:
     * Login intentionally supports GET.
     * This avoids the browser "Failed to fetch" problem
     * caused by cross-origin POST requests to Apps Script.
     */
    if (action === 'login') {
      return handleLogin_(
        clean_(p.userId),
        clean_(p.mobile)
      );
    }

    const session = parseSession_(p.session);

    authenticate_(session);

    switch (action) {

      case 'getPmvOpeningBalance':
        return json_(
          getPmvOpeningBalance_(
            session,
            clean_(p.date) || today_()
          )
        );

      case 'getOwnPmvDashboard':
        return json_(
          getOwnPmvDashboard_(
            session,
            clean_(p.date) || today_()
          )
        );

      case 'getAdminPmvDashboard':
        requireAdmin_(session);

        return json_(
          getAdminPmvDashboard_(
            session,
            clean_(p.date) || today_()
          )
        );

      case 'getSpmArticles':
        requireRole_(session, [
          CONFIG.ROLES.SPM,
          CONFIG.ROLES.DPS,
          CONFIG.ROLES.ADMIN
        ]);

        return json_(
          getSpmArticles_(
            session,
            clean_(p.date) || today_(),
            clean_(p.search || p.q),
            number_(p.limit) || 10000
          )
        );

      case 'getAdminArticleStatus':
        requireAdmin_(session);

        return json_(
          getAdminArticleStatus_(
            session,
            clean_(p.date) || today_(),
            clean_(p.search || p.q),
            number_(p.limit) || 10000
          )
        );

      default:
        throw new Error('Unknown action: ' + action);
    }

  } catch (err) {
    return error_(err.message || err);
  }
}


function doPost(e) {
  try {
    const body = parseBody_(e);
    const action = clean_(body.action);

    /*
     * Keep POST login supported as a compatibility fallback.
     */
    if (action === 'login') {
      return handleLogin_(
        clean_(body.userId),
        clean_(body.mobile)
      );
    }

    const session =
      body.session ||
      body.sessionData ||
      null;

    authenticate_(session);

    switch (action) {

      case 'logout':
        return json_(logout_(session));

      case 'submitPmvReport':
        return json_(
          submitPmvReport_(
            session,
            body.record || {}
          )
        );

      case 'updateArticleStatus':
        return json_(
          updateArticleStatus_(
            session,
            body.record || {}
          )
        );

      case 'pushArticleStatusToMaster':
        requireAdmin_(session);

        return json_(
          pushArticleStatusToMaster_(
            session,
            body.record || {}
          )
        );

      case 'updateArticleMaster':
        requireAdmin_(session);

        return json_(
          updateArticleMaster_(
            session,
            body.record || {}
          )
        );

      default:
        throw new Error('Unknown action: ' + action);
    }

  } catch (err) {
    return error_(err.message || err);
  }
}


/* ==========================================================
   SESSION
   ========================================================== */

function parseSession_(value) {

  if (!value) {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
}


function createSession_(user) {

  const token =
    Utilities.getUuid() +
    '-' +
    Utilities.getUuid();

  const createdAt = new Date().getTime();

  const session = {
    token: token,
    userId: clean_(user.userId),
    role: clean_(user.role),
    officeName: clean_(user.officeName),
    officeCode: clean_(user.officeCode),
    assignedPins: normalizePins_(user.assignedPins),
    createdAt: createdAt
  };

  const sh = getSheet_(CONFIG.SHEETS.SESSIONS);

  ensureHeaders_(sh, [
    'TOKEN',
    'USER_ID',
    'ROLE',
    'OFFICE_NAME',
    'OFFICE_CODE',
    'ASSIGNED_PINS',
    'CREATED_AT',
    'LAST_ACTIVE'
  ]);

  sh.appendRow([
    token,
    session.userId,
    session.role,
    session.officeName,
    session.officeCode,
    session.assignedPins.join(','),
    new Date(createdAt),
    new Date()
  ]);

  return session;
}


function authenticate_(session) {

  if (!session || !session.token || !session.userId) {
    throw new Error('Not authenticated. Please sign in again.');
  }

  const sh = getSheet_(CONFIG.SHEETS.SESSIONS);
  const data = sh.getDataRange().getValues();

  if (data.length < 2) {
    throw new Error('Invalid session. Please sign in again.');
  }

  const headers = headerMap_(data[0]);

  let found = null;

  for (let i = 1; i < data.length; i++) {

    const token =
      clean_(data[i][headers.TOKEN]);

    if (token === clean_(session.token)) {
      found = data[i];
      break;
    }
  }

  if (!found) {
    throw new Error('Invalid session. Please sign in again.');
  }

  const created =
    new Date(found[headers.CREATED_AT]).getTime();

  const age =
    Date.now() - created;

  if (
    age >
    CONFIG.SESSION_DAYS *
    24 *
    60 *
    60 *
    1000
  ) {
    throw new Error('Session expired. Please sign in again.');
  }

  const user = findUser_(
    clean_(session.userId),
    ''
  );

  if (!user || !user.active) {
    throw new Error('Account is inactive.');
  }

  return session;
}


function logout_(session) {

  if (!session || !session.token) {
    return {
      loggedOut: true
    };
  }

  const sh = getSheet_(CONFIG.SHEETS.SESSIONS);
  const data = sh.getDataRange().getValues();

  if (data.length < 2) {
    return {
      loggedOut: true
    };
  }

  const headers = headerMap_(data[0]);

  for (let i = data.length - 1; i >= 1; i--) {

    if (
      clean_(data[i][headers.TOKEN]) ===
      clean_(session.token)
    ) {
      sh.deleteRow(i + 1);
      break;
    }
  }

  return {
    loggedOut: true
  };
}


/* ==========================================================
   LOGIN
   ========================================================== */

function handleLogin_(userId, mobile) {

  userId = clean_(userId);
  mobile = clean_(mobile);

  if (!userId || !mobile) {
    throw new Error(
      'Enter User ID and registered mobile number.'
    );
  }

  const user =
    findUser_(userId, mobile);

  if (!user) {
    throw new Error(
      'Invalid User ID or registered mobile number.'
    );
  }

  if (!user.active) {
    throw new Error('Account is inactive.');
  }

  const session =
    createSession_(user);

  return json_(session);
}


function findUser_(userId, mobile) {

  const sh =
    getSheet_(CONFIG.SHEETS.USERS);

  const data =
    sh.getDataRange().getValues();

  if (data.length < 2) {
    return null;
  }

  const headers =
    headerMap_(data[0]);

  const idIndex =
    firstHeader_(
      headers,
      [
        'USER_ID',
        'USERID',
        'ID',
        'EMPLOYEE_ID',
        'EMP_ID'
      ]
    );

  const mobileIndex =
    firstHeader_(
      headers,
      [
        'MOBILE',
        'MOBILE_NUMBER',
        'PHONE',
        'PHONE_NUMBER'
      ]
    );

  const roleIndex =
    firstHeader_(
      headers,
      [
        'ROLE',
        'USER_ROLE'
      ]
    );

  const officeIndex =
    firstHeader_(
      headers,
      [
        'OFFICE_NAME',
        'OFFICE',
        'POST_OFFICE'
      ]
    );

  const officeCodeIndex =
    firstHeader_(
      headers,
      [
        'OFFICE_CODE',
        'SOL_ID',
        'SOLID',
        'OFFICE_ID'
      ]
    );

  const pinIndex =
    firstHeader_(
      headers,
      [
        'ASSIGNED_PINS',
        'PIN_CODES',
        'PINCODES',
        'PIN',
        'PIN_CODE'
      ]
    );

  const activeIndex =
    firstHeader_(
      headers,
      [
        'ACTIVE',
        'STATUS',
        'IS_ACTIVE'
      ]
    );

  for (let i = 1; i < data.length; i++) {

    const row = data[i];

    if (
      upper_(row[idIndex]) !==
      upper_(userId)
    ) {
      continue;
    }

    if (
      mobile &&
      digits_(row[mobileIndex]) !==
      digits_(mobile)
    ) {
      continue;
    }

    const activeValue =
      clean_(row[activeIndex]);

    const active =
      !activeValue ||
      !/^(NO|FALSE|INACTIVE|0|DISABLED)$/i
        .test(activeValue);

    return {
      userId: clean_(row[idIndex]),
      role: normalizeRole_(row[roleIndex]),
      officeName: clean_(row[officeIndex]),
      officeCode: clean_(row[officeCodeIndex]),
      assignedPins:
        normalizePins_(row[pinIndex]),
      active: active
    };
  }

  return null;
}


/* ==========================================================
   DAILY REPORT
   ========================================================== */

function getPmvOpeningBalance_(session, date) {

  const targetDate =
    parseDate_(date);

  const previousDate =
    new Date(targetDate.getTime());

  previousDate.setDate(
    previousDate.getDate() - 1
  );

  const previous =
    findDailyRecord_(
      session.userId,
      formatDate_(previousDate)
    );

  if (!previous) {

    return {
      openingKits: 0,
      openingArticles: 0
    };
  }

  return {
    openingKits:
      number_(
        previous.CLOSING_KITS
      ),

    openingArticles:
      number_(
        previous.CLOSING_ARTICLES
      )
  };
}


function getOwnPmvDashboard_(session, date) {

  const record =
    findDailyRecord_(
      session.userId,
      date
    );

  if (!record) {
    return {
      newKits: 0,
      newArticles: 0,

      deliveredKits: 0,
      deliveredArticles: 0,

      redirectedKits: 0,
      redirectedArticles: 0,

      rtsKits: 0,
      rtsArticles: 0,

      invalidMobileKits: 0,
      invalidMobileArticles: 0,

      tornKits: 0,
      tornArticles: 0,

      deliverableKits: 0,
      deliverableArticles: 0,

      incompleteKits: 0,
      incompleteArticles: 0
    };
  }

  return dailyRecordToClient_(record);
}


function submitPmvReport_(session, record) {

  if (
    session.role !== CONFIG.ROLES.SPM
  ) {
    throw new Error(
      'Only SPM users can submit daily reports.'
    );
  }

  const date =
    clean_(record.date) || today_();

  const opening =
    getPmvOpeningBalance_(
      session,
      date
    );

  const cameK =
    number_(record.newKits);

  const cameA =
    number_(record.newArticles);

  const deliveredK =
    number_(record.deliveredKits);

  const deliveredA =
    number_(record.deliveredArticles);

  const redirectK =
    number_(record.redirectedKits);

  const redirectA =
    number_(record.redirectedArticles);

  const returnK =
    number_(record.rtsKits);

  const returnA =
    number_(record.rtsArticles);

  const availableK =
    opening.openingKits + cameK;

  const availableA =
    opening.openingArticles + cameA;

  const closeK =
    availableK -
    deliveredK -
    redirectK -
    returnK;

  const closeA =
    availableA -
    deliveredA -
    redirectA -
    returnA;

  if (closeK < 0) {
    throw new Error(
      'Kits movement exceeds Opening + Came Today.'
    );
  }

  if (closeA < 0) {
    throw new Error(
      'Articles movement exceeds Opening + Came Today.'
    );
  }

  const partsK =
    number_(record.invalidKits) +
    number_(record.tornKits) +
    number_(record.deliverableKits) +
    number_(record.incompleteKits);

  const partsA =
    number_(record.invalidArticles) +
    number_(record.tornArticles) +
    number_(record.deliverableArticles) +
    number_(record.incompleteArticles);

  if (partsK !== closeK) {
    throw new Error(
      'Kits remaining classification must equal closing balance ' +
      closeK + '.'
    );
  }

  if (partsA !== closeA) {
    throw new Error(
      'Articles remaining classification must equal closing balance ' +
      closeA + '.'
    );
  }

  const sh =
    getSheet_(CONFIG.SHEETS.DAILY);

  const headers =
    ensureHeaders_(sh, DAILY_HEADERS_());

  const row =
    dailyClientToRow_(
      session,
      record,
      opening,
      closeK,
      closeA
    );

  const existing =
    findDailyRowNumber_(
      session.userId,
      date
    );

  if (existing) {

    sh.getRange(
      existing,
      1,
      1,
      headers.length
    ).setValues([row]);

  } else {

    sh.appendRow(row);
  }

  return {
    saved: true,
    date: date,
    closingPendingKits: closeK,
    closingPendingArticles: closeA
  };
}


/* ==========================================================
   ADMIN DAILY DASHBOARD
   ========================================================== */

function getAdminPmvDashboard_(session, date) {

  const sh =
    getSheet_(CONFIG.SHEETS.DAILY);

  const data =
    sh.getDataRange().getValues();

  if (data.length < 2) {
    return {
      date: date,
      rows: [],
      officeWise: [],
      pendingSpms: []
    };
  }

  const headers =
    headerMap_(data[0]);

  const rows = [];

  for (let i = 1; i < data.length; i++) {

    const row = data[i];

    if (
      clean_(row[headers.DATE]) !==
      date
    ) {
      continue;
    }

    rows.push(
      dailyRowToObject_(
        row,
        headers
      )
    );
  }

  return {
    date: date,
    rows: rows,
    officeWise:
      buildOfficeWise_(rows),
    pendingSpms:
      getPendingSpms_(date)
  };
}


/* ==========================================================
   ARTICLE MASTER
   ========================================================== */

function getSpmArticles_(
  session,
  date,
  search,
  limit
) {

  const master =
    readSheetObjects_(
      CONFIG.SHEETS.ARTICLE_MASTER
    );

  const statusRows =
    readSheetObjects_(
      CONFIG.SHEETS.ARTICLE_STATUS,
      true
    );

  const statusMap =
    buildArticleStatusMap_(
      statusRows,
      date
    );

  const pins =
    normalizePins_(
      session.assignedPins
    );

  /*
   * ADMIN/DPS can see all articles.
   * SPM can only see assigned PIN codes.
   */
  const isAdmin =
    session.role === CONFIG.ROLES.ADMIN ||
    session.role === CONFIG.ROLES.DPS;

  let articles = [];

  master.forEach(row => {

    const pin =
      articlePin_(row);

    if (
      !isAdmin &&
      pins.length &&
      !pins.includes(pin)
    ) {
      return;
    }

    /*
     * If an SPM has no configured PINs,
     * do not expose the complete master.
     */
    if (
      !isAdmin &&
      !pins.length
    ) {
      return;
    }

    const key =
      articleKey_(row);

    const status =
      statusMap[key] || {};

    const merged =
      mergeArticle_(
        row,
        status
      );

    if (
      search &&
      !articleMatchesSearch_(
        merged,
        search
      )
    ) {
      return;
    }

    articles.push(merged);
  });

  if (limit > 0) {
    articles =
      articles.slice(0, limit);
  }

  const counts =
    countArticleStatuses_(articles);

  return {
    date: date,
    articles: articles,
    total: articles.length,
    counts: counts,
    assignedPins: pins
  };
}


/* ==========================================================
   ADMIN ARTICLE STATUS
   ========================================================== */

function getAdminArticleStatus_(
  session,
  date,
  search,
  limit
) {

  const master =
    readSheetObjects_(
      CONFIG.SHEETS.ARTICLE_MASTER
    );

  const statusRows =
    readSheetObjects_(
      CONFIG.SHEETS.ARTICLE_STATUS,
      true
    );

  const statusMap =
    buildArticleStatusMap_(
      statusRows,
      date
    );

  const articles = [];

  master.forEach(row => {

    const key =
      articleKey_(row);

    const status =
      statusMap[key];

    /*
     * Admin review should primarily show
     * articles having ARTICLE_STATUS entries.
     */
    if (!status) {
      return;
    }

    const merged =
      mergeArticle_(
        row,
        status
      );

    if (
      search &&
      !articleMatchesSearch_(
        merged,
        search
      )
    ) {
      return;
    }

    articles.push(merged);
  });

  return {
    date: date,
    articles:
      limit > 0
        ? articles.slice(0, limit)
        : articles,

    total: articles.length,

    counts:
      countArticleStatuses_(articles)
  };
}


/* ==========================================================
   UPDATE ARTICLE STATUS
   ========================================================== */

function updateArticleStatus_(
  session,
  record
) {

  if (
    session.role !== CONFIG.ROLES.SPM
  ) {
    throw new Error(
      'Only SPM users can change article status.'
    );
  }

  const date =
    clean_(record.date) || today_();

  const key =
    clean_(
      record.articleKey ||
      record.barCodeId ||
      record.barcode
    );

  if (!key) {
    throw new Error(
      'Article key/barcode is required.'
    );
  }

  const status =
    canonicalStatus_(
      record.status ||
      record.presentStatus
    );

  const remarks =
    clean_(
      record.remarks
    );

  const masterArticle =
    findArticleByKey_(
      key
    );

  if (!masterArticle) {
    throw new Error(
      'Article not found in ARTICLE_MASTER.'
    );
  }

  /*
   * SECURITY:
   * SPM may only update an article whose
   * PIN belongs to the SPM.
   */
  const pin =
    articlePin_(masterArticle);

  const pins =
    normalizePins_(
      session.assignedPins
    );

  if (
    !pins.includes(pin)
  ) {
    throw new Error(
      'You are not authorised to update this article.'
    );
  }

  const sh =
    getSheet_(
      CONFIG.SHEETS.ARTICLE_STATUS
    );

  ensureHeaders_(
    sh,
    ARTICLE_STATUS_HEADERS_()
  );

  const headers =
    headerMap_(
      sh.getRange(
        1,
        1,
        1,
        sh.getLastColumn()
      ).getValues()[0]
    );

  /*
   * One status record per article/date.
   */
  const existing =
    findArticleStatusRow_(
      key,
      date
    );

  const values = [
    date,
    key,
    articleField_(masterArticle, 'BARCODE_ID'),
    articleField_(masterArticle, 'PMV_APPLICATION_NUMBER'),
    articleField_(masterArticle, 'ARTISAN_NAME'),
    articleField_(masterArticle, 'MOBILE_NUMBER'),
    articleField_(masterArticle, 'ADDRESS'),
    articleField_(masterArticle, 'CIRCLE_NAME'),
    articleField_(masterArticle, 'DIVISION_NAME'),
    pin,
    articleField_(masterArticle, 'DELIVERY_STAFF'),
    status,
    remarks,
    session.userId,
    session.officeName,
    now_(),
    'PENDING_REVIEW',
    '',
    ''
  ];

  if (existing) {

    sh.getRange(
      existing,
      1,
      1,
      values.length
    ).setValues([values]);

  } else {

    sh.appendRow(values);
  }

  return {
    saved: true,
    articleKey: key,
    status: status,
    date: date,
    reviewStatus: 'PENDING_REVIEW'
  };
}


/* ==========================================================
   ADMIN -> ARTICLE MASTER
   ========================================================== */

function pushArticleStatusToMaster_(
  session,
  record
) {

  requireAdmin_(session);

  const date =
    clean_(record.date) || today_();

  let keys =
    record.articleKeys ||
    record.keys ||
    [];

  if (!Array.isArray(keys)) {
    keys = [keys];
  }

  keys =
    keys
      .map(clean_)
      .filter(Boolean);

  if (!keys.length) {
    throw new Error(
      'No article records selected.'
    );
  }

  const master =
    getSheet_(
      CONFIG.SHEETS.ARTICLE_MASTER
    );

  const statusSheet =
    getSheet_(
      CONFIG.SHEETS.ARTICLE_STATUS
    );

  const masterObjects =
    readSheetObjects_(
      CONFIG.SHEETS.ARTICLE_MASTER
    );

  const statusObjects =
    readSheetObjects_(
      CONFIG.SHEETS.ARTICLE_STATUS,
      true
    );

  const statusMap =
    buildArticleStatusMap_(
      statusObjects,
      date
    );

  const masterHeaders =
    headerMap_(
      master
        .getRange(
          1,
          1,
          1,
          master.getLastColumn()
        )
        .getValues()[0]
    );

  let pushed = 0;
  let skipped = 0;

  keys.forEach(key => {

    const status =
      statusMap[key];

    if (!status) {
      skipped++;
      return;
    }

    const masterRow =
      findArticleRowNumber_(
        key
      );

    if (!masterRow) {
      skipped++;
      return;
    }

    const statusValue =
      canonicalStatus_(
        status.presentStatus
      );

    /*
     * Update the master Present Status.
     */
    const statusColumn =
      firstHeader_(
        masterHeaders,
        [
          'PRESENT_STATUS',
          'STATUS',
          'ARTICLE_STATUS'
        ]
      );

    if (
      statusColumn !== -1
    ) {
      master.getRange(
        masterRow,
        statusColumn + 1
      ).setValue(statusValue);
    }

    /*
     * Update remarks if master contains it.
     */
    const remarksColumn =
      firstHeader_(
        masterHeaders,
        [
          'REMARKS',
          'STATUS_REMARKS'
        ]
      );

    if (
      remarksColumn !== -1
    ) {
      master.getRange(
        masterRow,
        remarksColumn + 1
      ).setValue(
        clean_(status.remarks)
      );
    }

    /*
     * Update audit/master-sync fields if present.
     */
    const syncBy =
      firstHeader_(
        masterHeaders,
        [
          'STATUS_UPDATED_BY',
          'UPDATED_BY'
        ]
      );

    if (syncBy !== -1) {
      master.getRange(
        masterRow,
        syncBy + 1
      ).setValue(
        session.userId
      );
    }

    const syncAt =
      firstHeader_(
        masterHeaders,
        [
          'STATUS_UPDATED_AT',
          'UPDATED_AT'
        ]
      );

    if (syncAt !== -1) {
      master.getRange(
        masterRow,
        syncAt + 1
      ).setValue(
        now_()
      );
    }

    /*
     * Mark ARTICLE_STATUS as authorised.
     */
    const statusRow =
      findArticleStatusRow_(
        key,
        date
      );

    if (statusRow) {

      const statusHeaders =
        headerMap_(
          statusSheet
            .getRange(
              1,
              1,
              1,
              statusSheet.getLastColumn()
            )
            .getValues()[0]
        );

      const reviewColumn =
        firstHeader_(
          statusHeaders,
          [
            'REVIEW_STATUS',
            'AUTHORIZATION_STATUS',
            'AUTHORISATION_STATUS'
          ]
        );

      if (reviewColumn !== -1) {
        statusSheet
          .getRange(
            statusRow,
            reviewColumn + 1
          )
          .setValue(
            'AUTHORISED'
          );
      }

      const adminColumn =
        firstHeader_(
          statusHeaders,
          [
            'AUTHORISED_BY',
            'AUTHORIZED_BY'
          ]
        );

      if (adminColumn !== -1) {
        statusSheet
          .getRange(
            statusRow,
            adminColumn + 1
          )
          .setValue(
            session.userId
          );
      }

      const adminTimeColumn =
        firstHeader_(
          statusHeaders,
          [
            'AUTHORISED_AT',
            'AUTHORIZED_AT'
          ]
        );

      if (adminTimeColumn !== -1) {
        statusSheet
          .getRange(
            statusRow,
            adminTimeColumn + 1
          )
          .setValue(
            now_()
          );
      }
    }

    writeAudit_(
      'MASTER_PUSH',
      session,
      key,
      statusValue,
      date
    );

    pushed++;
  });

  return {
    pushed: pushed,
    skipped: skipped,
    date: date
  };
}


/* ==========================================================
   DIRECT ADMIN MASTER UPDATE
   ========================================================== */

function updateArticleMaster_(
  session,
  record
) {

  requireAdmin_(session);

  const key =
    clean_(
      record.articleKey ||
      record.barCodeId
    );

  if (!key) {
    throw new Error(
      'Article key is required.'
    );
  }

  const rowNumber =
    findArticleRowNumber_(
      key
    );

  if (!rowNumber) {
    throw new Error(
      'Article not found in ARTICLE_MASTER.'
    );
  }

  const sh =
    getSheet_(
      CONFIG.SHEETS.ARTICLE_MASTER
    );

  const headers =
    headerMap_(
      sh
        .getRange(
          1,
          1,
          1,
          sh.getLastColumn()
        )
        .getValues()[0]
    );

  const fields =
    record.fields ||
    record;

  Object.keys(fields).forEach(k => {

    const column =
      firstHeader_(
        headers,
        [upper_(k)]
      );

    if (
      column !== -1 &&
      ![
        'ARTICLEKEY',
        'BARCODEID'
      ].includes(
        upper_(k).replace(/_/g, '')
      )
    ) {

      sh.getRange(
        rowNumber,
        column + 1
      ).setValue(
        fields[k]
      );
    }
  });

  writeAudit_(
    'DIRECT_MASTER_UPDATE',
    session,
    key,
    '',
    today_()
  );

  return {
    updated: true,
    articleKey: key
  };
}


/* ==========================================================
   ARTICLE SEARCH
   ========================================================== */

function articleMatchesSearch_(
  row,
  search
) {

  const q =
    clean_(search)
      .toLowerCase();

  if (!q) {
    return true;
  }

  /*
   * Search EVERY available field.
   */
  const haystack =
    Object.keys(row)
      .map(k => {
        return String(
          row[k] == null
            ? ''
            : row[k]
        );
      })
      .join(' ')
      .toLowerCase();

  const tokens =
    q
      .split(/\s+/)
      .filter(Boolean);

  return tokens.every(
    token =>
      haystack.includes(token)
  );
}


/* ==========================================================
   ARTICLE STATUS HELPERS
   ========================================================== */

function canonicalStatus_(value) {

  const s =
    upper_(value);

  if (!s) {
    return 'Pending';
  }

  if (
    /DELIVER/.test(s)
  ) {
    return 'Delivered';
  }

  if (
    /REDIRECT/.test(s)
  ) {
    return 'Redirected';
  }

  if (
    /RTS|RETURN|RETUR/.test(s)
  ) {
    return 'Return';
  }

  if (
    /TORN|WITHOUT\s*(ADDRESS|PROPER|DETAIL)/
      .test(s)
  ) {
    return 'Torn/Without Address';
  }

  if (
    /INVALID\s*(OTP|MOBILE|PHONE)|\bOTP\b/
      .test(s)
  ) {
    return 'Invalid OTP';
  }

  if (
    /PENDING|NOT\s*RECEIVED|NOT\s*DELIVER/
      .test(s)
  ) {
    return 'Pending';
  }

  return clean_(value);
}


function buildArticleStatusMap_(
  rows,
  date
) {

  const map = {};

  rows.forEach(row => {

    const rowDate =
      articleStatusDate_(row);

    if (
      rowDate &&
      rowDate !== date
    ) {
      return;
    }

    const key =
      articleKey_(row);

    if (!key) {
      return;
    }

    map[key] = {
      presentStatus:
        articleStatusField_(
          row,
          'PRESENT_STATUS'
        ),

      remarks:
        articleStatusField_(
          row,
          'REMARKS'
        ),

      spmId:
        articleStatusField_(
          row,
          'UPDATED_BY'
        ),

      officeName:
        articleStatusField_(
          row,
          'OFFICE_NAME'
        ),

      updatedAt:
        articleStatusField_(
          row,
          'UPDATED_AT'
        ),

      reviewStatus:
        articleStatusField_(
          row,
          'REVIEW_STATUS'
        ),

      authorisedBy:
        articleStatusField_(
          row,
          'AUTHORISED_BY'
        ),

      authorisedAt:
        articleStatusField_(
          row,
          'AUTHORISED_AT'
        )
    };
  });

  return map;
}


function mergeArticle_(
  master,
  status
) {

  const result = {};

  Object.keys(master)
    .forEach(k => {
      result[k] = master[k];
    });

  result.articleKey =
    articleKey_(master);

  result.barCodeId =
    articleField_(
      master,
      'BARCODE_ID'
    );

  result.pmvApplicationNumber =
    articleField_(
      master,
      'PMV_APPLICATION_NUMBER'
    );

  result.artisanName =
    articleField_(
      master,
      'ARTISAN_NAME'
    );

  result.mobileNumber =
    articleField_(
      master,
      'MOBILE_NUMBER'
    );

  result.address =
    articleField_(
      master,
      'ADDRESS'
    );

  result.circleName =
    articleField_(
      master,
      'CIRCLE_NAME'
    );

  result.divisionName =
    articleField_(
      master,
      'DIVISION_NAME'
    );

  result.pinCode =
    articlePin_(master);

  result.deliveryStaff =
    articleField_(
      master,
      'DELIVERY_STAFF'
    );

  result.presentStatus =
    canonicalStatus_(
      status &&
      status.presentStatus
        ? status.presentStatus
        : articleField_(
            master,
            'PRESENT_STATUS'
          )
    );

  result.masterStatus =
    canonicalStatus_(
      articleField_(
        master,
        'PRESENT_STATUS'
      )
    );

  result.remarks =
    status
      ? clean_(status.remarks)
      : '';

  result.spmId =
    status
      ? clean_(status.spmId)
      : '';

  result.spmName =
    status
      ? clean_(status.spmId)
      : '';

  result.officeName =
    status
      ? clean_(status.officeName)
      : '';

  result.updatedAt =
    status
      ? clean_(status.updatedAt)
      : '';

  result.reviewStatus =
    status
      ? clean_(status.reviewStatus)
      : '';

  result.authorisedBy =
    status
      ? clean_(status.authorisedBy)
      : '';

  result.authorisedAt =
    status
      ? clean_(status.authorisedAt)
      : '';

  return result;
}


function countArticleStatuses_(rows) {

  const result = {
    Pending: 0,
    Delivered: 0,
    Redirected: 0,
    Return: 0,
    'Torn/Without Address': 0,
    'Invalid OTP': 0
  };

  rows.forEach(row => {

    const status =
      canonicalStatus_(
        row.presentStatus
      );

    if (
      result[status] === undefined
    ) {
      result[status] = 0;
    }

    result[status]++;
  });

  return result;
}


/* ==========================================================
   SHEET READING
   ========================================================== */

function readSheetObjects_(
  sheetName,
  includeBlank
) {

  const sh =
    getSheet_(sheetName);

  const data =
    sh.getDataRange().getValues();

  if (data.length < 2) {
    return [];
  }

  const headers =
    data[0].map(h =>
      upper_(h)
        .replace(/\s+/g, '_')
    );

  const rows = [];

  for (
    let r = 1;
    r < data.length;
    r++
  ) {

    const row = {};
    let hasValue = false;

    for (
      let c = 0;
      c < headers.length;
      c++
    ) {

      const value =
        data[r][c];

      if (
        clean_(value)
      ) {
        hasValue = true;
      }

      row[headers[c]] =
        value instanceof Date
          ? formatDateTime_(value)
          : value;
    }

    if (
      includeBlank ||
      hasValue
    ) {
      rows.push(row);
    }
  }

  return rows;
}


function ensureHeaders_(
  sh,
  required
) {

  let lastColumn =
    sh.getLastColumn();

  if (
    lastColumn === 0
  ) {

    sh.getRange(
      1,
      1,
      1,
      required.length
    ).setValues([required]);

    return headerMap_(
      required
    );
  }

  const existing =
    sh.getRange(
      1,
      1,
      1,
      lastColumn
    ).getValues()[0]
      .map(h => upper_(h));

  const additions =
    required.filter(
      h => !existing.includes(
        upper_(h)
      )
    );

  if (additions.length) {

    sh.getRange(
      1,
      lastColumn + 1,
      1,
      additions.length
    ).setValues([additions]);
  }

  return headerMap_(
    sh.getRange(
      1,
      1,
      1,
      sh.getLastColumn()
    ).getValues()[0]
  );
}


function headerMap_(headers) {

  const map = {};

  headers.forEach(
    (h, i) => {

      const key =
        upper_(h)
          .replace(/\s+/g, '_');

      map[key] = i;
    }
  );

  return map;
}


function firstHeader_(
  headers,
  names
) {

  for (
    let i = 0;
    i < names.length;
    i++
  ) {

    const key =
      upper_(names[i])
        .replace(/\s+/g, '_');

    if (
      Object.prototype.hasOwnProperty
        .call(headers, key)
    ) {
      return headers[key];
    }
  }

  return -1;
}


/* ==========================================================
   DAILY SHEET FIELD DEFINITIONS
   ========================================================== */

function DAILY_HEADERS_() {

  return [
    'DATE',
    'USER_ID',
    'OFFICE_NAME',
    'OFFICE_CODE',

    'OPENING_KITS',
    'OPENING_ARTICLES',

    'NEW_KITS',
    'NEW_ARTICLES',

    'DELIVERED_KITS',
    'DELIVERED_ARTICLES',

    'REDIRECTED_KITS',
    'REDIRECTED_ARTICLES',

    'RTS_KITS',
    'RTS_ARTICLES',

    'INVALID_MOBILE_KITS',
    'INVALID_MOBILE_ARTICLES',

    'TORN_KITS',
    'TORN_ARTICLES',

    'DELIVERABLE_KITS',
    'DELIVERABLE_ARTICLES',

    'INCOMPLETE_KITS',
    'INCOMPLETE_ARTICLES',

    'CLOSING_KITS',
    'CLOSING_ARTICLES',

    'UPDATED_AT'
  ];
}


function dailyClientToRow_(
  session,
  record,
  opening,
  closeK,
  closeA
) {

  return [
    clean_(record.date),
    session.userId,
    session.officeName,
    session.officeCode,

    opening.openingKits,
    opening.openingArticles,

    number_(record.newKits),
    number_(record.newArticles),

    number_(record.deliveredKits),
    number_(record.deliveredArticles),

    number_(record.redirectedKits),
    number_(record.redirectedArticles),

    number_(record.rtsKits),
    number_(record.rtsArticles),

    number_(record.invalidKits),
    number_(record.invalidArticles),

    number_(record.tornKits),
    number_(record.tornArticles),

    number_(record.deliverableKits),
    number_(record.deliverableArticles),

    number_(record.incompleteKits),
    number_(record.incompleteArticles),

    closeK,
    closeA,

    now_()
  ];
}


function dailyRecordToClient_(r) {

  return {
    newKits:
      number_(r.NEW_KITS),

    newArticles:
      number_(r.NEW_ARTICLES),

    deliveredKits:
      number_(r.DELIVERED_KITS),

    deliveredArticles:
      number_(r.DELIVERED_ARTICLES),

    redirectedKits:
      number_(r.REDIRECTED_KITS),

    redirectedArticles:
      number_(r.REDIRECTED_ARTICLES),

    rtsKits:
      number_(r.RTS_KITS),

    rtsArticles:
      number_(r.RTS_ARTICLES),

    invalidMobileKits:
      number_(r.INVALID_MOBILE_KITS),

    invalidMobileArticles:
      number_(r.INVALID_MOBILE_ARTICLES),

    tornKits:
      number_(r.TORN_KITS),

    tornArticles:
      number_(r.TORN_ARTICLES),

    deliverableKits:
      number_(r.DELIVERABLE_KITS),

    deliverableArticles:
      number_(r.DELIVERABLE_ARTICLES),

    incompleteKits:
      number_(r.INCOMPLETE_KITS),

    incompleteArticles:
      number_(r.INCOMPLETE_ARTICLES)
  };
}


function dailyRowToObject_(
  row,
  headers
) {

  const result = {};

  Object.keys(headers)
    .forEach(k => {

      result[k] =
        row[headers[k]];
    });

  return result;
}


/* ==========================================================
   DAILY RECORD LOOKUP
   ========================================================== */

function findDailyRecord_(
  userId,
  date
) {

  const rows =
    readSheetObjects_(
      CONFIG.SHEETS.DAILY
    );

  for (
    let i = rows.length - 1;
    i >= 0;
    i--
  ) {

    if (
      upper_(
        rows[i].USER_ID
      ) === upper_(userId) &&
      clean_(
        rows[i].DATE
      ) === clean_(date)
    ) {
      return rows[i];
    }
  }

  return null;
}


function findDailyRowNumber_(
  userId,
  date
) {

  const sh =
    getSheet_(
      CONFIG.SHEETS.DAILY
    );

  const data =
    sh.getDataRange().getValues();

  if (data.length < 2) {
    return 0;
  }

  const headers =
    headerMap_(data[0]);

  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    if (
      upper_(
        data[i][headers.USER_ID]
      ) === upper_(userId) &&
      clean_(
        data[i][headers.DATE]
      ) === clean_(date)
    ) {
      return i + 1;
    }
  }

  return 0;
}


/* ==========================================================
   OFFICE / PENDING SPM
   ========================================================== */

function buildOfficeWise_(rows) {

  const map = {};

  rows.forEach(r => {

    const key =
      clean_(r.OFFICE_NAME) ||
      clean_(r.OFFICE_CODE) ||
      'UNKNOWN';

    if (!map[key]) {

      map[key] = {
        officeName:
          clean_(r.OFFICE_NAME),

        officeCode:
          clean_(r.OFFICE_CODE),

        cameKits: 0,
        cameArticles: 0,

        deliveredKits: 0,
        deliveredArticles: 0,

        redirectedKits: 0,
        redirectedArticles: 0,

        rtsKits: 0,
        rtsArticles: 0,

        closingKits: 0,
        closingArticles: 0
      };
    }

    const o = map[key];

    o.cameKits +=
      number_(r.NEW_KITS);

    o.cameArticles +=
      number_(r.NEW_ARTICLES);

    o.deliveredKits +=
      number_(r.DELIVERED_KITS);

    o.deliveredArticles +=
      number_(r.DELIVERED_ARTICLES);

    o.redirectedKits +=
      number_(r.REDIRECTED_KITS);

    o.redirectedArticles +=
      number_(r.REDIRECTED_ARTICLES);

    o.rtsKits +=
      number_(r.RTS_KITS);

    o.rtsArticles +=
      number_(r.RTS_ARTICLES);

    o.closingKits +=
      number_(r.CLOSING_KITS);

    o.closingArticles +=
      number_(r.CLOSING_ARTICLES);
  });

  return Object.keys(map)
    .map(k => map[k]);
}


function getPendingSpms_(date) {

  const users =
    readSheetObjects_(
      CONFIG.SHEETS.USERS
    );

  const activeSpms =
    users.filter(
      u =>
        normalizeRole_(u.ROLE) ===
        CONFIG.ROLES.SPM &&
        !/^(NO|FALSE|INACTIVE|0|DISABLED)$/i
          .test(
            clean_(
              u.ACTIVE
            )
          )
    );

  return activeSpms
    .filter(
      user =>
        !findDailyRecord_(
          clean_(user.USER_ID),
          date
        )
    )
    .map(
      user => ({
        userId:
          clean_(user.USER_ID),

        officeName:
          clean_(user.OFFICE_NAME),

        officeCode:
          clean_(user.OFFICE_CODE)
      })
    );
}


/* ==========================================================
   ARTICLE FIELD HELPERS
   ========================================================== */

function articleKey_(row) {

  return clean_(
    articleField_(
      row,
      'ARTICLE_KEY'
    ) ||
    articleField_(
      row,
      'BARCODE_ID'
    ) ||
    articleField_(
      row,
      'BARCODE'
    ) ||
    articleField_(
      row,
      'ARTICLE_ID'
    ) ||
    articleField_(
      row,
      'ARTICLE_NUMBER'
    )
  );
}


function articlePin_(row) {

  return digits_(
    articleField_(
      row,
      'PIN_CODE'
    ) ||
    articleField_(
      row,
      'PIN'
    ) ||
    articleField_(
      row,
      'PINCODE'
    ) ||
    articleField_(
      row,
      'DELIVERY_PIN'
    )
  );
}


function articleField_(
  row,
  canonical
) {

  const aliases = {
    ARTICLE_KEY: [
      'ARTICLE_KEY',
      'ARTICLEKEY'
    ],

    BARCODE_ID: [
      'BARCODE_ID',
      'BARCODE',
      'BARCODEID',
      'ARTICLE_NUMBER'
    ],

    PMV_APPLICATION_NUMBER: [
      'PMV_APPLICATION_NUMBER',
      'PMV_APPLICATION',
      'PMV_APPLICATION_NO',
      'PMV_NO',
      'APPLICATION_NUMBER'
    ],

    ARTISAN_NAME: [
      'ARTISAN_NAME',
      'ARTISAN',
      'ARTISANNAME'
    ],

    MOBILE_NUMBER: [
      'MOBILE_NUMBER',
      'MOBILE',
      'PHONE',
      'PHONE_NUMBER'
    ],

    ADDRESS: [
      'ADDRESS',
      'DELIVERY_ADDRESS',
      'FULL_ADDRESS'
    ],

    CIRCLE_NAME: [
      'CIRCLE_NAME',
      'CIRCLE'
    ],

    DIVISION_NAME: [
      'DIVISION_NAME',
      'DIVISION'
    ],

    PIN_CODE: [
      'PIN_CODE',
      'PIN',
      'PINCODE',
      'DELIVERY_PIN'
    ],

    DELIVERY_STAFF: [
      'DELIVERY_STAFF',
      'DELIVERY_PERSON',
      'POSTMAN',
      'DELIVERY_BOY'
    ],

    PRESENT_STATUS: [
      'PRESENT_STATUS',
      'STATUS',
      'ARTICLE_STATUS',
      'PRESENTSTATUS'
    ]
  };

  const names =
    aliases[canonical] ||
    [canonical];

  for (
    let i = 0;
    i < names.length;
    i++
  ) {

    const key =
      upper_(names[i])
        .replace(/\s+/g, '_');

    if (
      Object.prototype.hasOwnProperty
        .call(row, key)
    ) {
      return row[key];
    }
  }

  return '';
}


function articleStatusField_(
  row,
  field
) {

  const aliases = {
    PRESENT_STATUS: [
      'PRESENT_STATUS',
      'STATUS',
      'ARTICLE_STATUS'
    ],

    REMARKS: [
      'REMARKS',
      'STATUS_REMARKS'
    ],

    UPDATED_BY: [
      'UPDATED_BY',
      'SPM_ID',
      'USER_ID'
    ],

    OFFICE_NAME: [
      'OFFICE_NAME',
      'OFFICE'
    ],

    UPDATED_AT: [
      'UPDATED_AT',
      'STATUS_UPDATED_AT'
    ],

    REVIEW_STATUS: [
      'REVIEW_STATUS',
      'AUTHORIZATION_STATUS',
      'AUTHORISATION_STATUS'
    ],

    AUTHORISED_BY: [
      'AUTHORISED_BY',
      'AUTHORIZED_BY'
    ],

    AUTHORISED_AT: [
      'AUTHORISED_AT',
      'AUTHORIZED_AT'
    ]
  };

  const names =
    aliases[field] ||
    [field];

  for (
    let i = 0;
    i < names.length;
    i++
  ) {

    const key =
      upper_(names[i])
        .replace(/\s+/g, '_');

    if (
      Object.prototype.hasOwnProperty
        .call(row, key)
    ) {
      return row[key];
    }
  }

  return '';
}


function articleStatusDate_(row) {

  const candidates = [
    'DATE',
    'STATUS_DATE',
    'UPDATED_DATE'
  ];

  for (
    let i = 0;
    i < candidates.length;
    i++
  ) {

    const key =
      candidates[i];

    if (
      Object.prototype.hasOwnProperty
        .call(row, key)
    ) {

      const value =
        row[key];

      if (value instanceof Date) {
        return formatDate_(value);
      }

      const s =
        clean_(value);

      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return s;
      }

      if (s) {
        const d =
          new Date(s);

        if (!isNaN(d.getTime())) {
          return formatDate_(d);
        }
      }
    }
  }

  return '';
}


/* ==========================================================
   ARTICLE LOOKUPS
   ========================================================== */

function findArticleByKey_(
  key
) {

  const rows =
    readSheetObjects_(
      CONFIG.SHEETS.ARTICLE_MASTER
    );

  const target =
    upper_(key);

  for (
    let i = 0;
    i < rows.length;
    i++
  ) {

    if (
      upper_(
        articleKey_(rows[i])
      ) === target
    ) {
      return rows[i];
    }
  }

  return null;
}


function findArticleRowNumber_(
  key
) {

  const sh =
    getSheet_(
      CONFIG.SHEETS.ARTICLE_MASTER
    );

  const data =
    sh.getDataRange().getValues();

  if (data.length < 2) {
    return 0;
  }

  const headers =
    headerMap_(data[0]);

  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    const row = {};

    Object.keys(headers)
      .forEach(
        k =>
          row[k] =
            data[i][headers[k]]
      );

    if (
      upper_(
        articleKey_(row)
      ) ===
      upper_(key)
    ) {
      return i + 1;
    }
  }

  return 0;
}


function findArticleStatusRow_(
  key,
  date
) {

  const sh =
    getSheet_(
      CONFIG.SHEETS.ARTICLE_STATUS
    );

  const data =
    sh.getDataRange().getValues();

  if (data.length < 2) {
    return 0;
  }

  const headers =
    headerMap_(data[0]);

  const dateColumn =
    firstHeader_(
      headers,
      [
        'DATE',
        'STATUS_DATE'
      ]
    );

  const keyColumn =
    firstHeader_(
      headers,
      [
        'ARTICLE_KEY',
        'BARCODE_ID',
        'BARCODE',
        'ARTICLE_ID'
      ]
    );

  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    const rowDate =
      dateColumn === -1
        ? ''
        : clean_(
            data[i][dateColumn]
          );

    const rowKey =
      keyColumn === -1
        ? ''
        : clean_(
            data[i][keyColumn]
          );

    if (
      upper_(rowKey) ===
      upper_(key) &&
      (
        !rowDate ||
        rowDate === date
      )
    ) {
      return i + 1;
    }
  }

  return 0;
}


/* ==========================================================
   ARTICLE STATUS HEADERS
   ========================================================== */

function ARTICLE_STATUS_HEADERS_() {

  return [
    'DATE',
    'ARTICLE_KEY',
    'BARCODE_ID',
    'PMV_APPLICATION_NUMBER',
    'ARTISAN_NAME',
    'MOBILE_NUMBER',
    'ADDRESS',
    'CIRCLE_NAME',
    'DIVISION_NAME',
    'PIN_CODE',
    'DELIVERY_STAFF',
    'PRESENT_STATUS',
    'REMARKS',
    'UPDATED_BY',
    'OFFICE_NAME',
    'UPDATED_AT',
    'REVIEW_STATUS',
    'AUTHORISED_BY',
    'AUTHORISED_AT'
  ];
}


/* ==========================================================
   AUDIT
   ========================================================== */

function writeAudit_(
  action,
  session,
  articleKey,
  status,
  date
) {

  const ss =
    getSS_();

  let sh =
    ss.getSheetByName(
      'ARTICLE_AUDIT'
    );

  if (!sh) {

    sh =
      ss.insertSheet(
        'ARTICLE_AUDIT'
      );

    sh.appendRow([
      'TIMESTAMP',
      'ACTION',
      'USER_ID',
      'ROLE',
      'OFFICE_NAME',
      'ARTICLE_KEY',
      'STATUS',
      'DATE'
    ]);
  }

  sh.appendRow([
    now_(),
    action,
    session.userId,
    session.role,
    session.officeName,
    articleKey,
    status,
    date
  ]);
}


/* ==========================================================
   SECURITY
   ========================================================== */

function requireAdmin_(session) {

  authenticate_(session);

  if (
    session.role !== CONFIG.ROLES.ADMIN &&
    session.role !== CONFIG.ROLES.DPS
  ) {
    throw new Error(
      'Administrator/DPS authorisation required.'
    );
  }
}


function requireRole_(
  session,
  roles
) {

  authenticate_(session);

  if (
    roles.indexOf(
      session.role
    ) === -1
  ) {
    throw new Error(
      'You are not authorised for this operation.'
    );
  }
}


/* ==========================================================
   GENERAL UTILITIES
   ========================================================== */

function parseBody_(e) {

  if (
    !e ||
    !e.postData ||
    !e.postData.contents
  ) {
    return {};
  }

  const text =
    e.postData.contents;

  try {
    return JSON.parse(text);
  } catch (err) {
    return {};
  }
}


function normalizeRole_(value) {

  const s =
    upper_(value);

  if (
    s === 'ADMIN' ||
    s === 'DPS'
  ) {
    return s;
  }

  return CONFIG.ROLES.SPM;
}


function normalizePins_(value) {

  if (
    Array.isArray(value)
  ) {
    return value
      .map(digits_)
      .filter(Boolean);
  }

  return clean_(value)
    .split(/[,\s;|]+/)
    .map(digits_)
    .filter(Boolean);
}


function digits_(value) {

  return clean_(value)
    .replace(/\D/g, '');
}


function parseDate_(value) {

  if (
    value instanceof Date
  ) {
    return new Date(
      value.getTime()
    );
  }

  const s =
    clean_(value);

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(s)
  ) {

    const parts =
      s.split('-')
        .map(Number);

    return new Date(
      parts[0],
      parts[1] - 1,
      parts[2]
    );
  }

  const d =
    new Date(value);

  if (isNaN(d.getTime())) {
    return new Date();
  }

  return d;
}


function formatDate_(date) {

  return Utilities.formatDate(
    date,
    CONFIG.TIME_ZONE,
    'yyyy-MM-dd'
  );
}


function formatDateTime_(date) {

  return Utilities.formatDate(
    date,
    CONFIG.TIME_ZONE,
    'yyyy-MM-dd HH:mm:ss'
  );
}


/* ==========================================================
   INITIALISATION
   Run this ONCE manually after installation.
   ========================================================== */

function setupPMVSheets() {

  const ss =
    getSS_();

  const definitions = {

    DAILY_DATA:
      DAILY_HEADERS_(),

    ARTICLE_STATUS:
      ARTICLE_STATUS_HEADERS_(),

    SESSIONS: [
      'TOKEN',
      'USER_ID',
      'ROLE',
      'OFFICE_NAME',
      'OFFICE_CODE',
      'ASSIGNED_PINS',
      'CREATED_AT',
      'LAST_ACTIVE'
    ],

    ARTICLE_AUDIT: [
      'TIMESTAMP',
      'ACTION',
      'USER_ID',
      'ROLE',
      'OFFICE_NAME',
      'ARTICLE_KEY',
      'STATUS',
      'DATE'
    ]
  };

  Object.keys(definitions)
    .forEach(name => {

      let sh =
        ss.getSheetByName(name);

      if (!sh) {
        sh =
          ss.insertSheet(name);
      }

      ensureHeaders_(
        sh,
        definitions[name]
      );
    });

  return {
    success: true,
    message:
      'PMV sheets initialised successfully.'
  };
}


/* ==========================================================
   TEST FUNCTIONS
   ========================================================== */

function testLogin() {

  const users =
    readSheetObjects_(
      CONFIG.SHEETS.USERS
    );

  if (!users.length) {
    throw new Error(
      'USER_MASTER is empty.'
    );
  }

  return {
    success: true,
    firstUser:
      users[0].USER_ID || ''
  };
}


function testArticleMaster() {

  const rows =
    readSheetObjects_(
      CONFIG.SHEETS.ARTICLE_MASTER
    );

  return {
    success: true,
    totalArticles:
      rows.length,

    sample:
      rows.slice(0, 3)
        .map(r => ({
          articleKey:
            articleKey_(r),

          barcode:
            articleField_(
              r,
              'BARCODE_ID'
            ),

          pin:
            articlePin_(r),

          artisan:
            articleField_(
              r,
              'ARTISAN_NAME'
            )
        }))
  };
}


function testArticleStatus() {

  const rows =
    readSheetObjects_(
      CONFIG.SHEETS.ARTICLE_STATUS,
      true
    );

  return {
    success: true,
    total:
      rows.length,

    sample:
      rows.slice(0, 3)
  };
}
