/***************************************************************
 * PMV TOOLKIT TRACKER - GOOGLE APPS SCRIPT API
 * Corrected Article + PINCODE + SPM Status Engine
 ***************************************************************/

const SPREADSHEET_ID = '1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8';
const TZ = 'Asia/Kolkata';

const S = {
  U: 'USER_MASTER',
  O: 'OFFICE_MASTER',
  R: 'PMV_REPORTS',
  SS: 'SESSIONS',
  A: 'AUDIT_LOG',
  P: 'PINCODE_MASTER',
  AS: 'ARTICLE_STATUS',
  AM: 'ARTICLE_MASTER'
};

const ROLE = {
  SPM: 'SPM',
  DPS: 'DPS',
  ADMIN: 'ADMIN'
};


/* =========================================================
   WEB API
   ========================================================= */

function doGet(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    const session = parseSession(p.session);

    switch (String(p.action || '')) {

      case 'getPmvOpeningBalance':
        return out(getOpeningBalance(p.date, session));

      case 'getOwnPmvDashboard':
        return out(getOwnDashboard(p.date, session));

      case 'getAdminPmvDashboard':
        return out(getAdminDashboard(p.date, session));

      case 'getSpmArticles':
        return out(getSpmArticles(p, session));

      case 'getAdminArticleStatus':
        return out(getAdminArticleStatus(p, session));

      case 'getArticleSourceDiagnostic':
        return out(getArticleSourceDiagnostic(p, session));

      case 'testArticleConnection':
        return out(testArticleConnection(session));

      default:
        return out(err('Unknown GET action: ' + p.action));
    }

  } catch (e2) {
    return out(err(e2.message || String(e2)));
  }
}


function doPost(e) {
  try {

    const body = JSON.parse(
      e && e.postData && e.postData.contents
        ? e.postData.contents
        : '{}'
    );

    switch (String(body.action || '')) {

      case 'login':
        return out(login(body.userId, body.mobile));

      case 'logout':
        return out(logout(parseSession(body.session)));

      case 'submitPmvReport':
        return out(submitPmvReport(
          body.record,
          parseSession(body.session)
        ));

      case 'updateArticleStatus':
        return out(updateArticleStatus(
          body.record,
          parseSession(body.session)
        ));

      case 'pushArticleStatusToMaster':
        return out(pushArticleStatusToMaster(
          body.record,
          parseSession(body.session)
        ));

      case 'updateArticleMaster':
        return out(updateArticleMaster(
          body.record,
          parseSession(body.session)
        ));

      default:
        return out(err('Unknown POST action: ' + body.action));
    }

  } catch (e2) {
    return out(err(e2.message || String(e2)));
  }
}


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function ss() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}


function sh(name) {
  const s = ss().getSheetByName(name);

  if (!s) {
    throw new Error('Sheet not found: ' + name);
  }

  return s;
}


function out(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


function ok(data, message) {
  return {
    success: true,
    data: data === undefined ? null : data,
    message: message || ''
  };
}


function err(message) {
  return {
    success: false,
    error: String(message || 'Unknown error')
  };
}


function num(v) {
  if (v === null || v === undefined || v === '') return 0;

  const n = Number(String(v).replace(/,/g, ''));

  return isNaN(n) ? 0 : n;
}


function active(v) {
  const x = String(v == null ? '' : v).trim().toUpperCase();

  return (
    x === 'TRUE' ||
    x === 'YES' ||
    x === 'Y' ||
    x === '1' ||
    x === 'ACTIVE'
  );
}


function dateOnly(v) {

  if (!v) return '';

  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  }

  const s = String(v).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  const d = new Date(s);

  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  }

  return s;
}


function today() {
  return Utilities.formatDate(
    new Date(),
    TZ,
    'yyyy-MM-dd'
  );
}


/* =========================================================
   IMPORTANT NORMALIZATION
   ========================================================= */

/*
 * This fixes the problem where:
 *
 * USER_MASTER OFFICE_ID
 * 18214301
 *
 * and
 *
 * PINCODE_MASTER OFFICE_ID
 * 18214301
 *
 * may be read differently by Apps Script.
 */

function normalizeId(v) {
  if (v === null || v === undefined) return '';

  return String(v)
    .trim()
    .replace(/\.0+$/, '')
    .replace(/\s+/g, '');
}


function normalizePin(v) {
  if (v === null || v === undefined) return '';

  return String(v)
    .trim()
    .replace(/\D/g, '');
}


function normalizeHeader(v) {
  return String(v == null ? '' : v)
    .trim()
    .toUpperCase()
    .replace(/[\r\n]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_');
}


/* =========================================================
   GENERIC SHEET READER
   ========================================================= */

function readSheet(sheetName) {

  const ws = ss().getSheetByName(sheetName);

  if (!ws) return [];

  const lastRow = ws.getLastRow();
  const lastColumn = ws.getLastColumn();

  if (lastRow < 2 || lastColumn < 1) {
    return [];
  }

  const values = ws
    .getRange(1, 1, lastRow, lastColumn)
    .getValues();

  const headers = values[0].map(normalizeHeader);

  const result = [];

  for (let i = 1; i < values.length; i++) {

    const row = values[i];
    const obj = {
      __row: i + 1,
      __sheet: sheetName
    };

    headers.forEach(function(h, j) {
      if (h) {
        obj[h] = row[j];
      }
    });

    result.push(obj);
  }

  return result;
}


function writeRow(sheetName, rowNumber, values) {
  sh(sheetName)
    .getRange(rowNumber, 1, 1, values.length)
    .setValues([values]);
}


/* =========================================================
   SETUP
   ========================================================= */

function setupSpreadsheet() {

  const spreadsheet = ss();

  const headers = {

    USER_MASTER: [
      'USER_ID',
      'NAME',
      'MOBILE',
      'ROLE',
      'OFFICE_ID',
      'OFFICE_NAME',
      'ACTIVE'
    ],

    OFFICE_MASTER: [
      'OFFICE_ID',
      'OFFICE_NAME',
      'DIVISION',
      'ACTIVE',
      'PINCODES'
    ],

    PMV_REPORTS: [
      'ID',
      'DATE',
      'OFFICE_ID',
      'OFFICE_NAME',
      'SPM_ID',
      'SPM_NAME',
      'OPENING_KITS',
      'NEW_KITS',
      'REDIRECTED_KITS',
      'RTS_KITS',
      'DELIVERED_KITS',
      'INVALID_MOBILE_KITS',
      'TORN_KITS',
      'DELIVERABLE_KITS',
      'INCOMPLETE_KITS',
      'CLOSING_PENDING_KITS',
      'OPENING_ARTICLES',
      'NEW_ARTICLES',
      'REDIRECTED_ARTICLES',
      'RTS_ARTICLES',
      'DELIVERED_ARTICLES',
      'INVALID_MOBILE_ARTICLES',
      'TORN_ARTICLES',
      'DELIVERABLE_ARTICLES',
      'INCOMPLETE_ARTICLES',
      'CLOSING_PENDING_ARTICLES',
      'SUBMITTED_AT',
      'UPDATED_AT',
      'STATUS'
    ],

    SESSIONS: [
      'TOKEN',
      'USER_ID',
      'CREATED_AT',
      'EXPIRES_AT',
      'ACTIVE'
    ],

    AUDIT_LOG: [
      'TIMESTAMP',
      'USER_ID',
      'ACTION',
      'DETAILS'
    ],

    PINCODE_MASTER: [
      'PINCODE',
      'OFFICE_ID',
      'OFFICE_NAME',
      'ACTIVE'
    ],

    ARTICLE_MASTER: [
      'BAR_CODE_ID',
      'PMV_APPLICATION_NUMBER',
      'ARTISAN_NAME',
      'MOBILE_NUMBER',
      'ARTISAN_CURRENT_ADDRESS',
      'CIRCLE_NAME',
      'DIVISION_NAME',
      'ARTISAN_PIN_CODE',
      'DELIVERY_STAFF_ASSIGNED_UNASSIGNED',
      'TOOLKIT_DELIVERY_STATUS'
    ],

    ARTICLE_STATUS: [
      'DATE',
      'ARTICLE_KEY',
      'BAR_CODE_ID',
      'PMV_APPLICATION_NUMBER',
      'OFFICE_ID',
      'OFFICE_NAME',
      'SPM_ID',
      'SPM_NAME',
      'STATUS',
      'REMARKS',
      'UPDATED_AT'
    ]
  };


  Object.keys(headers).forEach(function(name) {

    let ws = spreadsheet.getSheetByName(name);

    if (!ws) {
      ws = spreadsheet.insertSheet(name);
    }

    const required = headers[name];

    if (ws.getLastRow() === 0) {

      ws
        .getRange(1, 1, 1, required.length)
        .setValues([required]);

    } else {

      const existing = ws
        .getRange(
          1,
          1,
          1,
          Math.max(ws.getLastColumn(), required.length)
        )
        .getValues()[0]
        .map(normalizeHeader);

      required.forEach(function(header, index) {

        if (
          existing[index] !== normalizeHeader(header) &&
          existing.indexOf(normalizeHeader(header)) === -1
        ) {
          ws.getRange(1, index + 1).setValue(header);
        }

      });
    }

    ws.setFrozenRows(1);
  });


  return ok(null, 'Spreadsheet setup completed.');
}


/* =========================================================
   AUTHENTICATION
   ========================================================= */

function findUser(userId) {

  const id = normalizeId(userId);

  const users = readSheet(S.U);

  return users.find(function(u) {
    return normalizeId(u.USER_ID) === id;
  }) || null;
}


function login(userId, mobile) {

  const user = findUser(userId);

  if (!user) {
    return err('User ID not found.');
  }

  if (!active(user.ACTIVE)) {
    return err('This account is inactive.');
  }

  const registeredMobile =
    String(user.MOBILE || '').replace(/\D/g, '');

  const enteredMobile =
    String(mobile || '').replace(/\D/g, '');

  if (registeredMobile !== enteredMobile) {
    return err('Registered mobile number does not match.');
  }

  const role =
    String(user.ROLE || '').trim().toUpperCase();

  if (!Object.values(ROLE).includes(role)) {
    return err('Invalid user role.');
  }

  const token = Utilities.getUuid();
  const now = new Date();
  const expiry = new Date(
    now.getTime() + 7 * 24 * 60 * 60 * 1000
  );

  sh(S.SS).appendRow([
    token,
    normalizeId(user.USER_ID),
    now,
    expiry,
    true
  ]);

  audit(
    user.USER_ID,
    'LOGIN',
    'Successful login'
  );

  return ok({
    userId: normalizeId(user.USER_ID),
    name: String(user.NAME || ''),
    role: role,
    officeId: normalizeId(user.OFFICE_ID),
    officeName: String(user.OFFICE_NAME || ''),
    token: token,
    expiresAt: expiry.toISOString()
  });
}


function parseSession(token) {

  if (!token) return null;

  if (typeof token === 'object') {
    token = token.token || token.session || '';
  }

  return {
    token: String(token || '').trim()
  };
}


function auth(session) {

  if (!session || !session.token) {
    throw new Error('Session expired. Please login again.');
  }

  const sessions = readSheet(S.SS);

  const s = sessions.find(function(x) {
    return (
      String(x.TOKEN || '') === String(session.token) &&
      active(x.ACTIVE)
    );
  });

  if (!s) {
    throw new Error('Invalid or expired session.');
  }

  if (
    s.EXPIRES_AT &&
    new Date(s.EXPIRES_AT).getTime() < Date.now()
  ) {
    throw new Error('Session expired. Please login again.');
  }

  const user = findUser(s.USER_ID);

  if (!user || !active(user.ACTIVE)) {
    throw new Error('User account is inactive or unavailable.');
  }

  return {
    user: user,
    role: String(user.ROLE || '').toUpperCase()
  };
}


function logout(session) {

  if (!session || !session.token) {
    return ok(null, 'Logged out.');
  }

  const ws = sh(S.SS);
  const rows = readSheet(S.SS);

  rows.forEach(function(r) {

    if (String(r.TOKEN) === String(session.token)) {

      ws
        .getRange(r.__row, 5)
        .setValue(false);
    }
  });

  return ok(null, 'Logged out.');
}


/* =========================================================
   PINCODE ENGINE
   ========================================================= */

/*
 * THIS IS THE IMPORTANT FIX.
 *
 * It checks:
 *
 * 1. PINCODE_MASTER
 * 2. OFFICE_MASTER.PINCODES
 *
 * and normalizes OFFICE_ID and PINCODE.
 */

function assignedPincodes(officeId) {
  const oid = normalizeId(officeId);
  const pins = [];

  readSheet(S.P).forEach(r => {
    if (
      active(r.ACTIVE) &&
      normalizeId(r.OFFICE_ID) === oid
    ) {
      const pin = normalizePin(r.PINCODE);
      if (pin) pins.push(pin);
    }
  });

  // Fallback to OFFICE_MASTER
  if (!pins.length) {
    const office = readSheet(S.O).find(
      r => normalizeId(r.OFFICE_ID) === oid
    );

    if (office) {
      String(office.PINCODES || office.PINCODE || '')
        .split(/[,;\s|]+/)
        .map(normalizePin)
        .filter(Boolean)
        .forEach(pin => pins.push(pin));
    }
  }

  return [...new Set(pins)];
}


/* =========================================================
   ARTICLE SOURCE
   ========================================================= */

const ARTICLE_ALIASES = {

  BAR_CODE_ID: [
    'BAR_CODE_ID',
    'BARCODE_ID',
    'BARCODE',
    'BAR_CODE',
    'ARTICLE_BARCODE',
    'ARTICLE_BAR_CODE',
    'BAR_CODE_NO'
  ],

  PMV_APPLICATION_NUMBER: [
    'PMV_APPLICATION_NUMBER',
    'PMV_APPLICATION_NO',
    'PMV_APP_NUMBER',
    'PMV_APPLICATION',
    'APPLICATION_NUMBER',
    'PMV_NO',
    'PMV_NUMBER'
  ],

  ARTISAN_NAME: [
    'ARTISAN_NAME',
    'ARTISAN',
    'NAME_OF_ARTISAN',
    'BENEFICIARY_NAME'
  ],

  MOBILE_NUMBER: [
    'MOBILE_NUMBER',
    'MOBILE',
    'MOBILE_NO',
    'PHONE',
    'PHONE_NUMBER'
  ],

  ARTISAN_CURRENT_ADDRESS: [
    'ARTISAN_CURRENT_ADDRESS',
    'CURRENT_ADDRESS',
    'ADDRESS',
    'ARTISAN_ADDRESS'
  ],

  CIRCLE_NAME: [
    'CIRCLE_NAME',
    'CIRCLE'
  ],

  DIVISION_NAME: [
    'DIVISION_NAME',
    'DIVISION'
  ],

  ARTISAN_PIN_CODE: [
    'ARTISAN_PIN_CODE',
    'ARTISAN_PINCODE',
    'PIN_CODE',
    'PINCODE',
    'PIN',
    'ARTISAN_PIN'
  ],

  DELIVERY_STAFF_ASSIGNED_UNASSIGNED: [
    'DELIVERY_STAFF_ASSIGNED_UNASSIGNED',
    'DELIVERY_STAFF',
    'DELIVERY_STAFF_ASSIGNED',
    'DELIVERY_STAFF_STATUS'
  ],

  TOOLKIT_DELIVERY_STATUS: [
    'TOOLKIT_DELIVERY_STATUS',
    'DELIVERY_STATUS',
    'STATUS',
    'PRESENT_STATUS'
  ]
};


function aliasValue(row, field) {

  const aliases =
    ARTICLE_ALIASES[field] || [field];

  for (let i = 0; i < aliases.length; i++) {

    const key = normalizeHeader(aliases[i]);

    const value = row[key];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ''
    ) {
      return value;
    }
  }

  return '';
}


function normalizeSearchText(value) {
  return String(value == null ? '' : value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function articleKey(row) {
  // Prefer physical barcode so multiple barcodes under one PMV
  // application remain individually searchable and editable.
  const barcode = String(row.BAR_CODE_ID || '').trim();
  const app = String(row.PMV_APPLICATION_NUMBER || '').trim();
  return barcode || app;
}

function articleKeysForStatus(article) {
  const keys = [];
  const key = String(article.__articleKey || '').trim().toUpperCase();
  const app = String(article.PMV_APPLICATION_NUMBER || '').trim().toUpperCase();
  const barcode = String(article.BAR_CODE_ID || '').trim().toUpperCase();
  if (key) keys.push(key);
  if (barcode && keys.indexOf(barcode) === -1) keys.push(barcode);
  if (app && keys.indexOf(app) === -1) keys.push(app);
  return keys;
}


function canonicalArticle(row) {

  const article = {

    __row: row.__row,
    __sheet: row.__sheet,

    BAR_CODE_ID:
      aliasValue(row, 'BAR_CODE_ID'),

    PMV_APPLICATION_NUMBER:
      aliasValue(row, 'PMV_APPLICATION_NUMBER'),

    ARTISAN_NAME:
      aliasValue(row, 'ARTISAN_NAME'),

    MOBILE_NUMBER:
      aliasValue(row, 'MOBILE_NUMBER'),

    ARTISAN_CURRENT_ADDRESS:
      aliasValue(row, 'ARTISAN_CURRENT_ADDRESS'),

    CIRCLE_NAME:
      aliasValue(row, 'CIRCLE_NAME'),

    DIVISION_NAME:
      aliasValue(row, 'DIVISION_NAME'),

    ARTISAN_PIN_CODE:
      aliasValue(row, 'ARTISAN_PIN_CODE'),

    DELIVERY_STAFF_ASSIGNED_UNASSIGNED:
      aliasValue(
        row,
        'DELIVERY_STAFF_ASSIGNED_UNASSIGNED'
      ),

    TOOLKIT_DELIVERY_STATUS:
      aliasValue(
        row,
        'TOOLKIT_DELIVERY_STATUS'
      )
  };

  article.__articleKey =
    articleKey(article);

  return article;
}


function articleRowsFromSheet(sheetName) {

  return readSheet(sheetName)
    .map(canonicalArticle)
    .filter(function(row) {
      return String(row.__articleKey || '').trim() !== '';
    });
}


function articleSourceSheets() {

  const spreadsheet = ss();

  const names = spreadsheet
    .getSheets()
    .map(function(sheet) {
      return sheet.getName();
    });

  const preferred = [
    'ARTICLE_MASTER',
    'ARTICLE_MASTER_IMPORT',
    'ARTICLES',
    'ARTICLE_DATA',
    'ARTICLE_LIST',
    'PMV_ARTICLES'
  ];

  const excluded = [
    S.U,
    S.O,
    S.R,
    S.SS,
    S.A,
    S.P,
    S.AS
  ];

  const result = [];

  /* Preferred sources */

  preferred.forEach(function(name) {

    if (
      names.indexOf(name) !== -1 &&
      result.indexOf(name) === -1
    ) {
      result.push(name);
    }
  });


  /* Discover other compatible sheets */

  names.forEach(function(name) {

    if (
      result.indexOf(name) !== -1 ||
      excluded.indexOf(name) !== -1
    ) {
      return;
    }

    try {

      const rows = readSheet(name);

      if (!rows.length) return;

      const sample =
        rows.slice(0, Math.min(10, rows.length));

      const hasArticle =
        sample.some(function(row) {
          return (
            String(
              aliasValue(
                row,
                'BAR_CODE_ID'
              ) ||
              aliasValue(
                row,
                'PMV_APPLICATION_NUMBER'
              )
            ).trim() !== ''
          );
        });

      const hasPin =
        sample.some(function(row) {
          return (
            normalizePin(
              aliasValue(
                row,
                'ARTISAN_PIN_CODE'
              )
            ) !== ''
          );
        });

      if (hasArticle && hasPin) {
        result.push(name);
      }

    } catch (e) {
      // Ignore incompatible sheets.
    }
  });


  return result;
}


function allArticleRows() {
  const sheets = articleSourceSheets();
  const result = [];

  sheets.forEach(function(sheetName) {
    articleRowsFromSheet(sheetName).forEach(function(article) {
      // Keep every physical row. A PMV application may legitimately
      // contain multiple barcodes/articles; hiding them caused search
      // and master updates to miss records.
      result.push(article);
    });
  });

  return result;
}

/* =========================================================
   ARTICLE STATUS
   ========================================================= */

function articleStatusMap(dateValue) {
  const d = dateOnly(dateValue);
  const map = {};

  readSheet(S.AS)
    .filter(function(row) {
      return dateOnly(row.DATE) === d;
    })
    .forEach(function(row) {
      const key = String(row.ARTICLE_KEY || '').trim().toUpperCase();
      if (key) map[key] = row;
    });

  return map;
}

function statusForArticle(article, statuses) {
  const keys = articleKeysForStatus(article);
  for (let i = 0; i < keys.length; i++) {
    if (statuses[keys[i]]) return statuses[keys[i]];
  }
  return null;
}


/* =========================================================
   ARTICLE RESPONSE
   ========================================================= */

function articleClient(article, status) {

  return {

    articleKey:
      String(article.__articleKey || ''),

    barCodeId:
      String(article.BAR_CODE_ID || ''),

    pmvApplicationNumber:
      String(article.PMV_APPLICATION_NUMBER || ''),

    artisanName:
      String(article.ARTISAN_NAME || ''),

    mobileNumber:
      String(article.MOBILE_NUMBER || ''),

    address:
      String(article.ARTISAN_CURRENT_ADDRESS || ''),

    circleName:
      String(article.CIRCLE_NAME || ''),

    divisionName:
      String(article.DIVISION_NAME || ''),

    pinCode:
      normalizePin(article.ARTISAN_PIN_CODE),

    deliveryStaff:
      String(
        article.DELIVERY_STAFF_ASSIGNED_UNASSIGNED || ''
      ),

    sourceStatus:
      String(
        article.TOOLKIT_DELIVERY_STATUS || ''
      ),

    presentStatus:
      status
        ? String(status.STATUS || 'Pending')
        : String(
            article.TOOLKIT_DELIVERY_STATUS ||
            'Pending'
          ),

    remarks:
      status
        ? String(status.REMARKS || '')
        : '',

    updatedAt:
      status
        ? String(status.UPDATED_AT || '')
        : '',

    sourceSheet:
      String(article.__sheet || '')
  };
}


/* =========================================================
   GET SPM ARTICLES
   ========================================================= */

function getSpmArticles(params, session) {

  const a = auth(session);

  if (a.role !== ROLE.SPM) {
    throw new Error(
      'Only SPM users can access their articles.'
    );
  }

  const officeId =
    normalizeId(a.user.OFFICE_ID);

  const pins =
    assignedPincodes(officeId);


  /*
   * This is the exact diagnostic that was missing.
   */

  if (!pins.length) {

    return ok({
      officeId: officeId,

      officeName:
        String(a.user.OFFICE_NAME || ''),

      assignedPincodes: [],

      articles: [],

      count: 0,

      sourceSheets:
        articleSourceSheets(),

      message:
        'No PIN codes configured for this office.'
    });
  }


  const query =
    String(
      params.query ||
      params.search ||
      params.q ||
      ''
    )
    .trim()
    .toUpperCase();


  const dateValue =
    String(
      params.date ||
      today()
    );


  const statuses =
    articleStatusMap(dateValue);


  const pinSet = {};

  pins.forEach(function(pin) {
    pinSet[normalizePin(pin)] = true;
  });


  let articles =
    allArticleRows().filter(function(article) {

      const pin =
        normalizePin(
          article.ARTISAN_PIN_CODE
        );

      if (!pinSet[pin]) {
        return false;
      }

      if (!query) {
        return true;
      }


      /*
       * Refined search:
       * - Searches all important article fields.
       * - Supports multiple words in any order.
       * - Ignores case, spaces, punctuation and formatting differences.
       * - A result matches when every search term is found.
       */

      function normalizeSearchText(value) {
        return String(value == null ? '' : value)
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      const searchable = normalizeSearchText([
        article.BAR_CODE_ID,
        article.PMV_APPLICATION_NUMBER,
        article.ARTISAN_NAME,
        article.MOBILE_NUMBER,
        article.ARTISAN_CURRENT_ADDRESS,
        article.CIRCLE_NAME,
        article.DIVISION_NAME,
        article.ARTISAN_PIN_CODE,
        article.DELIVERY_STAFF_ASSIGNED_UNASSIGNED,
        article.TOOLKIT_DELIVERY_STATUS
      ].join(' '));

      const searchTerms =
        query
          .split(/\s+/)
          .map(function(term) {
            return normalizeSearchText(term);
          })
          .filter(function(term) {
            return term !== '';
          });

      return searchTerms.every(function(term) {
        return searchable.indexOf(term) !== -1;
      });
    });




  const result =
    articles.map(function(article) {

      const key =
        String(article.__articleKey || '')
          .trim()
          .toUpperCase();

      return articleClient(
        article,
        statusForArticle(article, statuses)
      );
    });


  return ok({

    date: dateValue,

    officeId: officeId,

    officeName:
      String(a.user.OFFICE_NAME || ''),

    assignedPincodes: pins,

    count: result.length,

    articles: result,

    sourceSheets:
      articleSourceSheets()
  });
}


/* =========================================================
   ARTICLE STATUS UPDATE
   ========================================================= */

function updateArticleStatus(record, session) {

  const a = auth(session);

  if (a.role !== ROLE.SPM) {
    throw new Error(
      'Only SPM users can update article status.'
    );
  }

  record = record || {};

  const articleKey =
    String(
      record.articleKey ||
      record.ARTICLE_KEY ||
      record.pmvApplicationNumber ||
      record.barCodeId ||
      ''
    ).trim();

  if (!articleKey) {
    throw new Error('Article key is required.');
  }


  const status =
    String(
      record.status ||
      record.presentStatus ||
      ''
    ).trim();

  if (!status) {
    throw new Error('Article status is required.');
  }


  const dateValue =
    String(
      record.date ||
      today()
    );


  const officeId =
    normalizeId(a.user.OFFICE_ID);

  const officeName =
    String(a.user.OFFICE_NAME || '');

  const ws = sh(S.AS);

  const rows =
    readSheet(S.AS);

  const existing =
    rows.find(function(row) {

      return (
        dateOnly(row.DATE) === dateValue &&
        String(row.ARTICLE_KEY || '').trim()
          .toUpperCase() ===
          articleKey.toUpperCase() &&
        normalizeId(row.OFFICE_ID) === officeId
      );
    });


  const now = new Date();


  const values = [
    dateValue,
    articleKey,
    String(record.barCodeId || ''),
    String(record.pmvApplicationNumber || ''),
    officeId,
    officeName,
    normalizeId(a.user.USER_ID),
    String(a.user.NAME || ''),
    status,
    String(record.remarks || ''),
    now
  ];


  if (existing) {

    ws
      .getRange(
        existing.__row,
        1,
        1,
        values.length
      )
      .setValues([values]);

  } else {

    ws.appendRow(values);
  }


  audit(
    a.user.USER_ID,
    'ARTICLE_STATUS_UPDATE',
    articleKey + ' = ' + status
  );


  return ok(
    {
      articleKey: articleKey,
      status: status,
      date: dateValue
    },
    'Article status updated.'
  );
}


/* =========================================================
   ADMIN ARTICLE STATUS
   ========================================================= */

function getAdminArticleStatus(params, session) {

  const a = auth(session);

  if (
    a.role !== ROLE.ADMIN &&
    a.role !== ROLE.DPS
  ) {
    throw new Error(
      'Only Admin/DPS can access article status.'
    );
  }

  const dateValue =
    String(
      params.date ||
      today()
    );

  const statuses =
    articleStatusMap(dateValue);


  /*
   * Search supports article number and artisan name too,
   * same refined multi-term matching used for SPM articles.
   */

  const query =
    String(
      params.query ||
      params.search ||
      params.q ||
      ''
    )
    .trim()
    .toUpperCase();


  function normalizeSearchText(value) {
    return String(value == null ? '' : value)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }


  let articles = allArticleRows();

  if (query) {

    const searchTerms =
      query
        .split(/\s+/)
        .map(normalizeSearchText)
        .filter(function(term) {
          return term !== '';
        });

    articles = articles.filter(function(article) {

      const searchable = normalizeSearchText([
        article.BAR_CODE_ID,
        article.PMV_APPLICATION_NUMBER,
        article.ARTISAN_NAME,
        article.MOBILE_NUMBER,
        article.ARTISAN_CURRENT_ADDRESS,
        article.CIRCLE_NAME,
        article.DIVISION_NAME,
        article.ARTISAN_PIN_CODE,
        article.DELIVERY_STAFF_ASSIGNED_UNASSIGNED,
        article.TOOLKIT_DELIVERY_STATUS
      ].join(' '));

      return searchTerms.every(function(term) {
        return searchable.indexOf(term) !== -1;
      });
    });
  }




  const result =
    articles.map(function(article) {
      const status = statusForArticle(article, statuses);
      const client = articleClient(article, status);

      client.date = dateValue;
      client.officeId = status ? normalizeId(status.OFFICE_ID) : '';
      client.officeName = status ? String(status.OFFICE_NAME || '') : '';
      client.spmId = status ? normalizeId(status.SPM_ID) : '';
      client.spmName = status ? String(status.SPM_NAME || '') : '';

      // Master is considered synced when its current source status
      // equals the SPM-recorded status for this date.
      client.masterSyncStatus = status
        ? (normalizeSearchText(client.sourceStatus) === normalizeSearchText(status.STATUS) ? 'Synced' : 'Pending Sync')
        : 'Not Updated';

      return client;
    });

  const statusCounts = {};
  result.forEach(function(r) {
    const s = String(r.presentStatus || 'Pending');
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  const syncCounts = {Synced:0, 'Pending Sync':0, 'Not Updated':0};
  result.forEach(function(r) {
    if (syncCounts[r.masterSyncStatus] === undefined) syncCounts[r.masterSyncStatus] = 0;
    syncCounts[r.masterSyncStatus]++;
  });

  return ok({
    date: dateValue,
    count: result.length,
    total: result.length,
    updatedCount: Object.keys(statuses).length,
    statusCounts: statusCounts,
    syncCounts: syncCounts,
    articles: result
  });
}


/* =========================================================
   PUSH SPM ARTICLE STATUS TO MASTER SHEET
   ========================================================= */

/*
 * Finds which column in a given source sheet corresponds to
 * a canonical article field, using the same alias list the
 * reader uses. Returns 1-based column index, or -1 if the
 * sheet has no matching column.
 */

function findColumnIndex(sheetName, canonicalField) {

  const ws = ss().getSheetByName(sheetName);

  if (!ws) return -1;

  const lastColumn = ws.getLastColumn();

  if (lastColumn < 1) return -1;

  const headers = ws
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(normalizeHeader);

  const aliases =
    (ARTICLE_ALIASES[canonicalField] || [canonicalField])
      .map(normalizeHeader);

  for (let i = 0; i < aliases.length; i++) {

    const idx = headers.indexOf(aliases[i]);

    if (idx !== -1) return idx + 1;
  }

  return -1;
}


/*
 * Admin/DPS reviews the article-wise table (with whatever
 * search/status filter they currently have applied) and
 * pushes the SPM-updated present status back into whichever
 * source sheet each article came from (ARTICLE_MASTER or
 * any other discovered article source). Only articles that
 * actually have an SPM-recorded status for the given date
 * are written; the rest are reported back as skipped.
 */

function pushArticleStatusToMaster(record, session) {

  const a = auth(session);

  if (
    a.role !== ROLE.ADMIN &&
    a.role !== ROLE.DPS
  ) {
    throw new Error(
      'Only Admin/DPS can push article status to the master sheet.'
    );
  }

  record = record || {};

  const dateValue =
    String(
      record.date ||
      today()
    );

  const keys =
    Array.isArray(record.articleKeys)
      ? record.articleKeys
      : [];

  const wanted = {};

  keys.forEach(function(k) {

    const key = String(k || '').trim().toUpperCase();

    if (key) wanted[key] = true;
  });

  if (!Object.keys(wanted).length) {
    throw new Error('No articles to push.');
  }

  const statuses = articleStatusMap(dateValue);
  const all = allArticleRows();

  const colCache = {};

  let pushed = 0;
  let skipped = 0;
  const details = [];

  all.forEach(function(article) {

    const key =
      String(article.__articleKey || '')
        .trim()
        .toUpperCase();

    if (!wanted[key]) return;

    const status = statusForArticle(article, statuses);

    if (!status || !String(status.STATUS || '').trim()) {

      skipped++;

      details.push({
        articleKey: key,
        result: 'skipped',
        reason: 'No SPM status update found for this date.'
      });

      return;
    }

    const sheetName = article.__sheet;

    if (colCache[sheetName] === undefined) {
      colCache[sheetName] =
        findColumnIndex(sheetName, 'TOOLKIT_DELIVERY_STATUS');
    }

    const col = colCache[sheetName];

    if (!col || col < 1) {

      skipped++;

      details.push({
        articleKey: key,
        result: 'skipped',
        reason: 'No status column found in ' + sheetName + '.'
      });

      return;
    }

    sh(sheetName)
      .getRange(article.__row, col)
      .setValue(status.STATUS);

    pushed++;

    details.push({
      articleKey: key,
      result: 'pushed',
      sheet: sheetName,
      status: status.STATUS
    });
  });

  audit(
    a.user.USER_ID,
    'PUSH_ARTICLE_STATUS_TO_MASTER',
    dateValue + ' pushed=' + pushed + ' skipped=' + skipped
  );

  return ok(
    {
      date: dateValue,
      pushed: pushed,
      skipped: skipped,
      details: details
    },
    pushed + ' article(s) pushed to master sheet' +
      (skipped ? ', ' + skipped + ' skipped.' : '.')
  );
}


/* =========================================================
   DIRECT ADMIN ARTICLE MASTER UPDATE
   ========================================================= */

function findArticleByKey(articleKeyValue) {
  const wanted = normalizeSearchText(articleKeyValue);
  if (!wanted) return null;

  const rows = allArticleRows();
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    const candidates = articleKeysForStatus(a).map(normalizeSearchText);
    if (candidates.indexOf(wanted) !== -1) return a;
  }
  return null;
}

function updateArticleMaster(record, session) {
  const a = auth(session);

  if (a.role !== ROLE.ADMIN && a.role !== ROLE.DPS) {
    throw new Error('Only Admin/DPS can update ARTICLE_MASTER.');
  }

  record = record || {};
  const key = String(record.articleKey || record.barCodeId || record.pmvApplicationNumber || '').trim();
  const status = String(record.status || record.presentStatus || '').trim();

  if (!key) throw new Error('Article key/barcode is required.');
  if (!status) throw new Error('Article status is required.');

  const article = findArticleByKey(key);
  if (!article) throw new Error('Article not found in the article master/source.');

  const col = findColumnIndex(article.__sheet, 'TOOLKIT_DELIVERY_STATUS');
  if (col < 1) {
    throw new Error('Status column not found in ' + article.__sheet + '.');
  }

  const ws = sh(article.__sheet);
  const oldStatus = String(article.TOOLKIT_DELIVERY_STATUS || '');
  ws.getRange(article.__row, col).setValue(status);

  // Record the direct master change as a first-class audit event.
  audit(
    a.user.USER_ID,
    'DIRECT_ARTICLE_MASTER_UPDATE',
    JSON.stringify({
      articleKey: key,
      sheet: article.__sheet,
      row: article.__row,
      oldStatus: oldStatus,
      newStatus: status
    })
  );

  return ok({
    articleKey: key,
    barcodeId: String(article.BAR_CODE_ID || ''),
    pmvApplicationNumber: String(article.PMV_APPLICATION_NUMBER || ''),
    sheet: article.__sheet,
    row: article.__row,
    oldStatus: oldStatus,
    newStatus: status,
    updatedAt: new Date().toISOString()
  }, 'Article master updated directly.');
}


/* =========================================================
   ARTICLE DIAGNOSTIC
   ========================================================= */

function getArticleSourceDiagnostic(params, session) {

  const a = auth(session);

  const officeId =
    normalizeId(a.user.OFFICE_ID);

  const pins =
    assignedPincodes(officeId);

  const sheets =
    articleSourceSheets();

  const all =
    allArticleRows();


  const matching =
    all.filter(function(article) {

      return pins.indexOf(
        normalizePin(
          article.ARTISAN_PIN_CODE
        )
      ) !== -1;
    });


  return ok({

    userId:
      normalizeId(a.user.USER_ID),

    role:
      a.role,

    officeId:
      officeId,

    officeName:
      String(a.user.OFFICE_NAME || ''),

    assignedPincodes:
      pins,

    sourceSheets:
      sheets,

    totalArticlesFound:
      all.length,

    articlesMatchingOfficePins:
      matching.length,

    sampleArticles:
      matching.slice(0, 10).map(function(article) {
        return articleClient(article, null);
      })
  });
}


/* =========================================================
   CONNECTION TEST
   ========================================================= */

function testArticleConnection(session) {

  const a = auth(session);

  const officeId =
    normalizeId(a.user.OFFICE_ID);

  const pins =
    assignedPincodes(officeId);

  const sheets =
    articleSourceSheets();

  const articles =
    allArticleRows();

  const matching =
    articles.filter(function(article) {

      return pins.indexOf(
        normalizePin(
          article.ARTISAN_PIN_CODE
        )
      ) !== -1;
    });


  return ok({

    status: 'OK',

    userId:
      normalizeId(a.user.USER_ID),

    officeId:
      officeId,

    officeName:
      String(a.user.OFFICE_NAME || ''),

    assignedPincodes:
      pins,

    articleSourceSheets:
      sheets,

    totalArticles:
      articles.length,

    officeArticles:
      matching.length
  });
}


/* =========================================================
   PMV REPORT FUNCTIONS
   ========================================================= */

function previousClosing(officeId, reportDate, type) {

  const oid =
    normalizeId(officeId);

  const d =
    String(reportDate);

  const reports =
    readSheet(S.R)
      .filter(function(row) {

        return (
          normalizeId(row.OFFICE_ID) === oid &&
          dateOnly(row.DATE) < d
        );
      })
      .sort(function(a, b) {

        return dateOnly(b.DATE)
          .localeCompare(
            dateOnly(a.DATE)
          );
      });


  if (!reports.length) return 0;

  const r = reports[0];

  return type === 'K'
    ? num(r.CLOSING_PENDING_KITS)
    : num(r.CLOSING_PENDING_ARTICLES);
}


function normalizeReport(x) {

  x = x || {};

  const r = {
    id:
      x.id ||
      Utilities.getUuid(),

    date:
      String(
        x.date ||
        today()
      )
  };


  const map = {

    newKits: 'nk',
    newArticles: 'na',

    redirectedKits: 'rk',
    redirectedArticles: 'ra',

    rtsKits: 'rt',
    rtsArticles: 'rta',

    deliveredKits: 'dk',
    deliveredArticles: 'da',

    invalidMobileKits: 'ik',
    invalidMobileArticles: 'ia',

    tornKits: 'tk',
    tornArticles: 'ta',

    deliverableKits: 'delk',
    deliverableArticles: 'dela',

    incompleteKits: 'incK',
    incompleteArticles: 'incA'
  };


  Object.keys(map).forEach(function(key) {

    r[map[key]] =
      Math.max(
        0,
        Math.floor(
          num(x[key])
        )
      );
  });


  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
    throw new Error('Invalid report date.');
  }


  return r;
}


function submitPmvReport(record, session) {

  const a = auth(session);

  if (a.role !== ROLE.SPM) {
    throw new Error(
      'Only SPM users can submit reports.'
    );
  }


  const r =
    normalizeReport(record);


  const officeId =
    normalizeId(a.user.OFFICE_ID);


  r.ok =
    previousClosing(
      officeId,
      r.date,
      'K'
    );

  r.oa =
    previousClosing(
      officeId,
      r.date,
      'A'
    );


  r.ck =
    r.ok +
    r.nk -
    r.rk -
    r.rt -
    r.dk;


  r.ca =
    r.oa +
    r.na -
    r.ra -
    r.rta -
    r.da;


  const kitClass =
    r.ik +
    r.tk +
    r.delk +
    r.incK;

  const articleClass =
    r.ia +
    r.ta +
    r.dela +
    r.incA;


  if (r.ck < 0 || r.ca < 0) {
    throw new Error(
      'Movement exceeds available stock.'
    );
  }


  if (r.ck !== kitClass) {
    throw new Error(
      'Kit validation failed.'
    );
  }


  if (r.ca !== articleClass) {
    throw new Error(
      'Article validation failed.'
    );
  }


  const row = [

    r.id,
    r.date,
    officeId,
    String(a.user.OFFICE_NAME || ''),
    normalizeId(a.user.USER_ID),
    String(a.user.NAME || ''),

    r.ok,
    r.nk,
    r.rk,
    r.rt,
    r.dk,

    r.ik,
    r.tk,
    r.delk,
    r.incK,
    r.ck,

    r.oa,
    r.na,
    r.ra,
    r.rta,
    r.da,

    r.ia,
    r.ta,
    r.dela,
    r.incA,
    r.ca,

    new Date(),
    new Date(),
    'FINAL'
  ];


  const reports =
    readSheet(S.R);


  const existing =
    reports.find(function(x) {

      return (
        normalizeId(x.SPM_ID) ===
          normalizeId(a.user.USER_ID) &&
        dateOnly(x.DATE) ===
          r.date
      );
    });


  if (existing) {

    sh(S.R)
      .getRange(
        existing.__row,
        1,
        1,
        row.length
      )
      .setValues([row]);

  } else {

    sh(S.R).appendRow(row);
  }


  audit(
    a.user.USER_ID,
    'SUBMIT',
    r.date
  );


  return ok({
    closingPendingKits: r.ck,
    closingPendingArticles: r.ca
  }, 'Report saved successfully.');
}


function getOpeningBalance(dateValue, session) {

  const a = auth(session);

  if (a.role !== ROLE.SPM) {
    throw new Error(
      'Only SPM users can access opening balance.'
    );
  }


  const d =
    String(
      dateValue ||
      today()
    );


  return ok({

    openingKits:
      previousClosing(
        a.user.OFFICE_ID,
        d,
        'K'
      ),

    openingArticles:
      previousClosing(
        a.user.OFFICE_ID,
        d,
        'A'
      )
  });
}


function reportClient(row) {

  return {

    date:
      dateOnly(row.DATE),

    openingKits:
      num(row.OPENING_KITS),

    openingArticles:
      num(row.OPENING_ARTICLES),

    newKits:
      num(row.NEW_KITS),

    newArticles:
      num(row.NEW_ARTICLES),

    redirectedKits:
      num(row.REDIRECTED_KITS),

    redirectedArticles:
      num(row.REDIRECTED_ARTICLES),

    rtsKits:
      num(row.RTS_KITS),

    rtsArticles:
      num(row.RTS_ARTICLES),

    deliveredKits:
      num(row.DELIVERED_KITS),

    deliveredArticles:
      num(row.DELIVERED_ARTICLES),

    invalidMobileKits:
      num(row.INVALID_MOBILE_KITS),

    invalidMobileArticles:
      num(row.INVALID_MOBILE_ARTICLES),

    tornKits:
      num(row.TORN_KITS),

    tornArticles:
      num(row.TORN_ARTICLES),

    deliverableKits:
      num(row.DELIVERABLE_KITS),

    deliverableArticles:
      num(row.DELIVERABLE_ARTICLES),

    incompleteKits:
      num(row.INCOMPLETE_KITS),

    incompleteArticles:
      num(row.INCOMPLETE_ARTICLES),

    closingPendingKits:
      num(row.CLOSING_PENDING_KITS),

    closingPendingArticles:
      num(row.CLOSING_PENDING_ARTICLES)
  };
}


function getOwnDashboard(dateValue, session) {

  const a = auth(session);

  if (a.role !== ROLE.SPM) {
    throw new Error(
      'Only SPM users can access own report.'
    );
  }


  const d =
    String(
      dateValue ||
      today()
    );


  const rows =
    readSheet(S.R);


  const row =
    rows.find(function(r) {

      return (
        normalizeId(r.SPM_ID) ===
          normalizeId(a.user.USER_ID) &&
        dateOnly(r.DATE) === d
      );
    });


  if (row) {
    return ok(reportClient(row));
  }


  return ok({

    date: d,

    openingKits:
      previousClosing(
        a.user.OFFICE_ID,
        d,
        'K'
      ),

    openingArticles:
      previousClosing(
        a.user.OFFICE_ID,
        d,
        'A'
      ),

    newKits: 0,
    newArticles: 0,
    redirectedKits: 0,
    redirectedArticles: 0,
    rtsKits: 0,
    rtsArticles: 0,
    deliveredKits: 0,
    deliveredArticles: 0,
    invalidMobileKits: 0,
    invalidMobileArticles: 0,
    tornKits: 0,
    tornArticles: 0,
    deliverableKits: 0,
    deliverableArticles: 0,
    incompleteKits: 0,
    incompleteArticles: 0,

    closingPendingKits:
      previousClosing(
        a.user.OFFICE_ID,
        d,
        'K'
      ),

    closingPendingArticles:
      previousClosing(
        a.user.OFFICE_ID,
        d,
        'A'
      )
  });
}


/* =========================================================
   ADMIN DASHBOARD
   ========================================================= */

function getAdminDashboard(dateValue, session) {

  const a = auth(session);

  if (
    a.role !== ROLE.ADMIN &&
    a.role !== ROLE.DPS
  ) {
    throw new Error(
      'Only Admin/DPS can access dashboard.'
    );
  }


  const d =
    String(
      dateValue ||
      today()
    );


  const users =
    readSheet(S.U)
      .filter(function(u) {

        return (
          active(u.ACTIVE) &&
          String(u.ROLE || '').toUpperCase() ===
            ROLE.SPM
        );
      });


  const reports =
    readSheet(S.R)
      .filter(function(r) {
        return dateOnly(r.DATE) === d;
      });


  const reportMap = {};

  reports.forEach(function(r) {
    reportMap[
      normalizeId(r.SPM_ID)
    ] = r;
  });


  const officeMap = {};


  users.forEach(function(u) {

    const oid =
      normalizeId(u.OFFICE_ID);


    if (!officeMap[oid]) {

      officeMap[oid] = {

        officeId: oid,

        officeName:
          String(u.OFFICE_NAME || ''),

        totalSpms: 0,
        updatedSpms: 0,
        pendingSpms: 0
      };
    }


    officeMap[oid].totalSpms++;

    if (reportMap[normalizeId(u.USER_ID)]) {
      officeMap[oid].updatedSpms++;
    } else {
      officeMap[oid].pendingSpms++;
    }
  });

  // Aggregate the actual submitted report values into the same
  // office-wise objects used by the UI. This prevents the dashboard
  // from showing zeros while the SPM-wise table has real values.
  Object.keys(officeMap).forEach(function(oid) {
    const o = officeMap[oid];
    const officeReports = reports.filter(function(r) {
      return normalizeId(r.OFFICE_ID) === oid;
    });

    const totals = {
      openingKits:0, newKits:0, redirectedKits:0, rtsKits:0,
      deliveredKits:0, closingPendingKits:0,
      openingArticles:0, newArticles:0, redirectedArticles:0,
      rtsArticles:0, deliveredArticles:0, closingPendingArticles:0
    };

    officeReports.forEach(function(r) {
      totals.openingKits += num(r.OPENING_KITS);
      totals.newKits += num(r.NEW_KITS);
      totals.redirectedKits += num(r.REDIRECTED_KITS);
      totals.rtsKits += num(r.RTS_KITS);
      totals.deliveredKits += num(r.DELIVERED_KITS);
      totals.closingPendingKits += num(r.CLOSING_PENDING_KITS);
      totals.openingArticles += num(r.OPENING_ARTICLES);
      totals.newArticles += num(r.NEW_ARTICLES);
      totals.redirectedArticles += num(r.REDIRECTED_ARTICLES);
      totals.rtsArticles += num(r.RTS_ARTICLES);
      totals.deliveredArticles += num(r.DELIVERED_ARTICLES);
      totals.closingPendingArticles += num(r.CLOSING_PENDING_ARTICLES);
    });

    Object.assign(o, totals);
  });


  const pending = [];


  users.forEach(function(u) {

    if (
      !reportMap[
        normalizeId(u.USER_ID)
      ]
    ) {

      pending.push({

        spmId:
          normalizeId(u.USER_ID),

        spmName:
          String(u.NAME || ''),

        officeId:
          normalizeId(u.OFFICE_ID),

        officeName:
          String(u.OFFICE_NAME || ''),

        status:
          'Not Updated'
      });
    }
  });


  let summary = {

    newKits: 0,
    newArticles: 0,

    redirectedKits: 0,
    redirectedArticles: 0,

    rtsKits: 0,
    rtsArticles: 0,

    deliveredKitsToday: 0,
    deliveredArticlesToday: 0,

    closingPendingKits: 0,
    closingPendingArticles: 0
  };


  reports.forEach(function(r) {

    summary.newKits +=
      num(r.NEW_KITS);

    summary.newArticles +=
      num(r.NEW_ARTICLES);

    summary.redirectedKits +=
      num(r.REDIRECTED_KITS);

    summary.redirectedArticles +=
      num(r.REDIRECTED_ARTICLES);

    summary.rtsKits +=
      num(r.RTS_KITS);

    summary.rtsArticles +=
      num(r.RTS_ARTICLES);

    summary.deliveredKitsToday +=
      num(r.DELIVERED_KITS);

    summary.deliveredArticlesToday +=
      num(r.DELIVERED_ARTICLES);

    summary.closingPendingKits +=
      num(r.CLOSING_PENDING_KITS);

    summary.closingPendingArticles +=
      num(r.CLOSING_PENDING_ARTICLES);
  });


  const articleRows = allArticleRows();
  const articleStatuses = articleStatusMap(d);
  const articleSummary = {
    totalArticles: articleRows.length,
    updatedArticles: 0,
    pendingArticles: 0,
    delivered: 0,
    redirected: 0,
    rtsReturn: 0,
    notReceived: 0,
    other: 0,
    masterSynced: 0,
    masterPendingSync: 0
  };

  articleRows.forEach(function(article) {
    const st = statusForArticle(article, articleStatuses);
    if (!st) {
      articleSummary.pendingArticles++;
      return;
    }

    articleSummary.updatedArticles++;
    const s = normalizeSearchText(st.STATUS);
    if (s === 'DELIVERED') articleSummary.delivered++;
    else if (s === 'REDIRECTED') articleSummary.redirected++;
    else if (s === 'RTS RETURN' || s === 'RTS') articleSummary.rtsReturn++;
    else if (s === 'NOT RECEIVED') articleSummary.notReceived++;
    else articleSummary.other++;

    const master = normalizeSearchText(article.TOOLKIT_DELIVERY_STATUS);
    const wanted = normalizeSearchText(st.STATUS);
    if (master === wanted) articleSummary.masterSynced++;
    else articleSummary.masterPendingSync++;
  });

  const spmWise = users.map(function(u) {
    const r = reportMap[normalizeId(u.USER_ID)] || null;
    const c = r ? reportClient(r) : {};
    return Object.assign({
      spmId: normalizeId(u.USER_ID),
      spmName: String(u.NAME || ''),
      officeId: normalizeId(u.OFFICE_ID),
      officeName: String(u.OFFICE_NAME || ''),
      status: r ? 'Updated' : 'Pending'
    }, c);
  });

  return ok({

    date: d,

    summary: summary,
    articleSummary: articleSummary,
    spmWise: spmWise,

    officeWise:
      Object.keys(officeMap)
        .map(function(k) {

          const o = officeMap[k];

          return Object.assign(
            {},
            o,
            {
              status:
                o.totalSpms > 0 &&
                o.updatedSpms === o.totalSpms
                  ? 'Updated'
                  : 'Pending'
            }
          );
        }),

    pendingSpms: pending,

    spmsUpdatedToday:
      reports.length,

    activeSpms:
      users.length,

    spmsPendingUpdate:
      pending.length,

    updatePercentage:
      users.length ? Math.round((reports.length / users.length) * 10000) / 100 : 0,

    lastSynchronization:
      latestArticleSyncTimestamp()
  });
}


function latestArticleSyncTimestamp() {
  const rows = readSheet(S.A).filter(function(r) {
    return /ARTICLE_MASTER_UPDATE|PUSH_ARTICLE_STATUS_TO_MASTER/.test(String(r.ACTION || ''));
  });
  if (!rows.length) return '';
  rows.sort(function(a, b) {
    return new Date(b.TIMESTAMP).getTime() - new Date(a.TIMESTAMP).getTime();
  });
  return rows[0].TIMESTAMP || '';
}


/* =========================================================
   AUDIT
   ========================================================= */

function audit(userId, action, details) {

  try {

    sh(S.A).appendRow([
      new Date(),
      normalizeId(userId),
      String(action || ''),
      String(details || '')
    ]);

  } catch (e) {
    // Audit failure must not break the main operation.
  }
}
