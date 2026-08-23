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

  const result = {};

  /* ---------- PINCODE_MASTER ---------- */

  const pincodeRows = readSheet(S.P);

  pincodeRows.forEach(function(row) {

    const rowOffice = normalizeId(row.OFFICE_ID);
    const pin = normalizePin(row.PINCODE);

    if (
      rowOffice === oid &&
      active(row.ACTIVE) &&
      pin
    ) {
      result[pin] = true;
    }
  });


  /* ---------- OFFICE_MASTER fallback ---------- */

  const officeRows = readSheet(S.O);

  officeRows.forEach(function(row) {

    const rowOffice = normalizeId(row.OFFICE_ID);

    if (rowOffice !== oid) return;

    const raw =
      row.PINCODES ||
      row.PINCODE ||
      '';

    String(raw)
      .split(/[,\s;|]+/)
      .forEach(function(value) {

        const pin = normalizePin(value);

        if (pin) {
          result[pin] = true;
        }
      });
  });


  return Object.keys(result);
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


function articleKey(row) {

  const app =
    String(row.PMV_APPLICATION_NUMBER || '').trim();

  const barcode =
    String(row.BAR_CODE_ID || '').trim();

  return app || barcode;
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

  const seen = {};
  const result = [];

  sheets.forEach(function(sheetName) {

    articleRowsFromSheet(sheetName)
      .forEach(function(article) {

        const key =
          String(article.__articleKey || '')
            .trim()
            .toUpperCase();

        if (!key) return;

        if (!seen[key]) {

          seen[key] = true;
          result.push(article);
        }
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

      const key =
        String(row.ARTICLE_KEY || '')
          .trim()
          .toUpperCase();

      if (key) {
        map[key] = row;
      }
    });

  return map;
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


  /*
   * Remove duplicates.
   */

  const seen = {};

  articles = articles.filter(function(article) {

    const key =
      String(article.__articleKey || '')
        .trim()
        .toUpperCase();

    if (!key) return false;

    if (seen[key]) return false;

    seen[key] = true;

    return true;
  });


  const result =
    articles.map(function(article) {

      const key =
        String(article.__articleKey || '')
          .trim()
          .toUpperCase();

      return articleClient(
        article,
        statuses[key]
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


  const result =
    readSheet(S.AS)
      .filter(function(row) {
        return dateOnly(row.DATE) === dateValue;
      })
      .map(function(row) {

        return {
          date: dateValue,
          articleKey:
            String(row.ARTICLE_KEY || ''),
          barCodeId:
            String(row.BAR_CODE_ID || ''),
          pmvApplicationNumber:
            String(
              row.PMV_APPLICATION_NUMBER || ''
            ),
          officeId:
            normalizeId(row.OFFICE_ID),
          officeName:
            String(row.OFFICE_NAME || ''),
          spmId:
            normalizeId(row.SPM_ID),
          spmName:
            String(row.SPM_NAME || ''),
          status:
            String(row.STATUS || ''),
          remarks:
            String(row.REMARKS || ''),
          updatedAt:
            String(row.UPDATED_AT || '')
        };
      });


  return ok({
    date: dateValue,
    count: result.length,
    statuses: result
  });
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


    if (
      reportMap[
        normalizeId(u.USER_ID)
      ]
    ) {
      officeMap[oid].updatedSpms++;
    } else {
      officeMap[oid].pendingSpms++;
    }
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


  return ok({

    date: d,

    summary: summary,

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
      pending.length
  });
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
