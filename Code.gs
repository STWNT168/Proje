const SPREADSHEET_ID = '1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8';
const TZ = 'Asia/Kolkata';

const S = {
  U: 'USER_MASTER',
  O: 'OFFICE_MASTER',
  R: 'PMV_REPORTS',
  SS: 'SESSIONS',
  A: 'AUDIT_LOG',
  P: 'PINCODE_MASTER',
  AM: 'ARTICLE_MASTER',
  AS: 'ARTICLE_STATUS'
};

const ROLE = { SPM: 'SPM', DPS: 'DPS', ADMIN: 'ADMIN' };
const SESSION_DAYS = 7;
const MAX_VALUE = 1000000;

/* =========================================================
   SETUP
   ========================================================= */

function setupSpreadsheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var headers = {};
  headers[S.U] = ['USER_ID','NAME','MOBILE','ROLE','OFFICE_ID','OFFICE_NAME','ACTIVE'];
  headers[S.O] = ['OFFICE_ID','OFFICE_NAME','DIVISION','ACTIVE','PINCODES'];
  headers[S.R] = [
    'ID','DATE','OFFICE_ID','OFFICE_NAME','SPM_ID','SPM_NAME',
    'OPENING_KITS','NEW_KITS','REDIRECTED_KITS','RTS_KITS','DELIVERED_KITS',
    'INVALID_MOBILE_KITS','TORN_KITS','DELIVERABLE_KITS','INCOMPLETE_KITS','CLOSING_PENDING_KITS',
    'OPENING_ARTICLES','NEW_ARTICLES','REDIRECTED_ARTICLES','RTS_ARTICLES','DELIVERED_ARTICLES',
    'INVALID_MOBILE_ARTICLES','TORN_ARTICLES','DELIVERABLE_ARTICLES','INCOMPLETE_ARTICLES',
    'CLOSING_PENDING_ARTICLES','SUBMITTED_AT','UPDATED_AT','STATUS'
  ];
  headers[S.SS] = ['TOKEN','USER_ID','CREATED_AT','EXPIRES_AT','ACTIVE'];
  headers[S.A] = ['TIMESTAMP','USER_ID','ACTION','DETAILS'];
  headers[S.P] = ['PINCODE','OFFICE_ID','OFFICE_NAME','ACTIVE'];
  headers[S.AM] = [
    'BAR_CODE_ID','PMV_APPLICATION_NUMBER','ARTISAN_NAME','MOBILE_NUMBER',
    'ARTISAN_CURRENT_ADDRESS','CIRCLE_NAME','DIVISION_NAME','ARTISAN_PIN_CODE',
    'DELIVERY_STAFF_ASSIGNED_UNASSIGNED','TOOLKIT_DELIVERY_STATUS'
  ];
  headers[S.AS] = [
    'DATE','ARTICLE_KEY','BAR_CODE_ID','PMV_APPLICATION_NUMBER','OFFICE_ID',
    'OFFICE_NAME','SPM_ID','SPM_NAME','STATUS','REMARKS','UPDATED_AT'
  ];

  Object.keys(headers).forEach(function(name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    ensureHeaders(sh, headers[name]);
    sh.setFrozenRows(1);
  });

  return out(ok({
    spreadsheetId: SPREADSHEET_ID,
    sheets: Object.keys(headers)
  }, 'Setup complete. Populate USER_MASTER, OFFICE_MASTER and PINCODE_MASTER, then import article data into ARTICLE_MASTER.'));
}

function ensureHeaders(sh, required) {
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, required.length).setValues([required]);
    return;
  }

  var lastCol = Math.max(sh.getLastColumn(), required.length);
  var current = sh.getRange(1, 1, 1, lastCol).getValues()[0];

  required.forEach(function(h, i) {
    if (String(current[i] || '').trim() !== h) {
      var existing = current.indexOf(h);
      if (existing < 0) {
        sh.getRange(1, i + 1).setValue(h);
      }
    }
  });
}

/* =========================================================
   API ROUTING
   ========================================================= */

function doGet(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    var session = parseSession(p.session);

    if (p.action === 'getPmvOpeningBalance') {
      return out(opening(p.date, session));
    }
    if (p.action === 'getOwnPmvDashboard') {
      return out(own(p.date, session));
    }
    if (p.action === 'getAdminPmvDashboard') {
      return out(admin(p.date, session));
    }
    if (p.action === 'getSpmArticles') {
      return out(spmArticles(p, session));
    }
    if (p.action === 'getAdminArticleStatus') {
      return out(adminArticleStatus(p, session));
    }
    if (p.action === 'getArticleSourceDiagnostic') {
      return out(articleSourceDiagnostic(p, session));
    }

    return out(err('Unknown GET action.'));
  } catch (ex) {
    return out(err(errorMessage(ex)));
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    if (body.action === 'login') {
      return out(login(body.userId, body.mobile));
    }
    if (body.action === 'logout') {
      return out(logout(parseSession(body.session)));
    }
    if (body.action === 'submitPmvReport') {
      return out(submit(body.record, parseSession(body.session)));
    }
    if (body.action === 'updateArticleStatus') {
      return out(updateArticleStatus(body.record, parseSession(body.session)));
    }

    return out(err('Unknown POST action.'));
  } catch (ex) {
    return out(err(errorMessage(ex)));
  }
}

/* =========================================================
   AUTH / LOGIN
   ========================================================= */

function login(id, mobile) {
  var user = findUser(id);
  if (!user) return err('User ID not found.');
  if (!activeValue(user.ACTIVE)) return err('This account is inactive.');
  if (mobileNorm(user.MOBILE) !== mobileNorm(mobile)) {
    return err('Registered mobile number does not match.');
  }

  var role = String(user.ROLE || '').trim().toUpperCase();
  if ([ROLE.SPM, ROLE.DPS, ROLE.ADMIN].indexOf(role) < 0) {
    return err('Invalid user role.');
  }

  var token = Utilities.getUuid();
  var now = new Date();
  var expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  sheet(S.SS).appendRow([
    token, String(user.USER_ID), now, expires, true
  ]);

  audit(user.USER_ID, 'LOGIN', 'Successful login');

  return ok({
    userId: String(user.USER_ID),
    name: String(user.NAME || ''),
    role: role,
    officeId: String(user.OFFICE_ID || ''),
    officeName: String(user.OFFICE_NAME || ''),
    token: token,
    expiresAt: expires.toISOString()
  });
}

function logout(session) {
  if (!session || !session.token) return ok(null, 'Logged out.');

  var rows = read(S.SS);
  rows.forEach(function(r) {
    if (String(r.TOKEN) === String(session.token)) {
      sheet(S.SS).getRange(r.__row, 5).setValue(false);
    }
  });

  return ok(null, 'Logged out.');
}

function auth(session) {
  if (!session || !session.token) {
    throw new Error('Session required.');
  }

  var rows = read(S.SS);
  var found = null;

  rows.forEach(function(r) {
    if (String(r.TOKEN) === String(session.token) && activeValue(r.ACTIVE)) {
      found = r;
    }
  });

  if (!found) throw new Error('Invalid or inactive session.');

  var expires = new Date(found.EXPIRES_AT);
  if (isNaN(expires.getTime()) || expires.getTime() < Date.now()) {
    sheet(S.SS).getRange(found.__row, 5).setValue(false);
    throw new Error('Session expired. Please login again.');
  }

  var user = findUser(found.USER_ID);
  if (!user || !activeValue(user.ACTIVE)) {
    throw new Error('User account is inactive or missing.');
  }

  return {
    user: user,
    role: String(user.ROLE || '').toUpperCase(),
    token: String(found.TOKEN)
  };
}

/* =========================================================
   PMV REPORT
   ========================================================= */

function submit(x, session) {
  var a = auth(session);
  if (a.role !== ROLE.SPM) {
    throw new Error('Only SPM users can submit daily reports.');
  }

  var r = norm(x);
  var officeId = String(a.user.OFFICE_ID || '').trim();

  if (!officeId) throw new Error('SPM office is not configured.');

  r.openingKits = previousBalance(officeId, r.date, 'K');
  r.openingArticles = previousBalance(officeId, r.date, 'A');

  r.closingKits = r.openingKits + r.newKits - r.redirectedKits - r.rtsKits - r.deliveredKits;
  r.closingArticles = r.openingArticles + r.newArticles - r.redirectedArticles - r.rtsArticles - r.deliveredArticles;

  var kitBreakdown = r.invalidMobileKits + r.tornKits + r.deliverableKits + r.incompleteKits;
  var articleBreakdown = r.invalidMobileArticles + r.tornArticles + r.deliverableArticles + r.incompleteArticles;

  if (r.closingKits < 0 || r.closingArticles < 0) {
    throw new Error('Movement exceeds available stock.');
  }

  if (r.closingKits !== kitBreakdown) {
    throw new Error('Kit validation failed: Opening + New - Redirected - RTS - Delivered must equal Invalid Mobile + Torn + Deliverable + Incomplete.');
  }

  if (r.closingArticles !== articleBreakdown) {
    throw new Error('Article validation failed: Opening + New - Redirected - RTS - Delivered must equal Invalid Mobile + Torn + Deliverable + Incomplete.');
  }

  var row = [
    r.id, r.date, officeId, String(a.user.OFFICE_NAME || ''),
    String(a.user.USER_ID), String(a.user.NAME || ''),
    r.openingKits, r.newKits, r.redirectedKits, r.rtsKits, r.deliveredKits,
    r.invalidMobileKits, r.tornKits, r.deliverableKits, r.incompleteKits, r.closingKits,
    r.openingArticles, r.newArticles, r.redirectedArticles, r.rtsArticles, r.deliveredArticles,
    r.invalidMobileArticles, r.tornArticles, r.deliverableArticles, r.incompleteArticles, r.closingArticles,
    new Date(), new Date(), 'FINAL'
  ];

  var old = findReport(a.user.USER_ID, r.date);
  if (old) {
    sheet(S.R).getRange(old.__row, 1, 1, row.length).setValues([row]);
  } else {
    sheet(S.R).appendRow(row);
  }

  audit(a.user.USER_ID, 'SUBMIT', r.date);

  return ok({
    closingPendingKits: r.closingKits,
    closingPendingArticles: r.closingArticles
  }, 'Report saved successfully.');
}

function opening(d, session) {
  var a = auth(session);
  if (a.role !== ROLE.SPM) {
    throw new Error('Only SPM users can access opening balance.');
  }

  d = String(d || today());
  validateDate(d);

  return ok({
    openingKits: previousBalance(a.user.OFFICE_ID, d, 'K'),
    openingArticles: previousBalance(a.user.OFFICE_ID, d, 'A')
  });
}

function own(d, session) {
  var a = auth(session);
  if (a.role !== ROLE.SPM) {
    throw new Error('Only SPM users can access own report.');
  }

  d = String(d || today());
  validateDate(d);

  var r = findReport(a.user.USER_ID, d);
  return ok(r ? client(r) : emptyClient(d));
}

function admin(d, session) {
  var a = auth(session);
  if ([ROLE.ADMIN, ROLE.DPS].indexOf(a.role) < 0) {
    throw new Error('Only DPS/Admin users can access the consolidated dashboard.');
  }

  d = String(d || today());
  validateDate(d);

  var users = read(S.U).filter(function(u) {
    return activeValue(u.ACTIVE) &&
      String(u.ROLE || '').trim().toUpperCase() === ROLE.SPM;
  });

  var reports = read(S.R).filter(function(r) {
    return dateOnly(r.DATE) === d;
  });

  var bySpm = {};
  reports.forEach(function(r) {
    bySpm[String(r.SPM_ID)] = r;
  });

  var offices = {};
  read(S.O).filter(function(o) {
    return activeValue(o.ACTIVE);
  }).forEach(function(o) {
    offices[String(o.OFFICE_ID)] = officeBase(o);
  });

  var pending = [];
  var spmWise = [];

  users.forEach(function(u) {
    var oid = String(u.OFFICE_ID || '');
    var o = offices[oid] || (offices[oid] = officeBase(u));
    var r = bySpm[String(u.USER_ID)];

    o.totalSpms++;

    if (r) {
      o.updatedSpms++;

      var c = client(r);
      c.spmId = String(u.USER_ID || '');
      c.spmName = String(u.NAME || '');
      c.officeId = oid;
      c.officeName = String(o.officeName || u.OFFICE_NAME || '');
      c.status = 'Updated';
      spmWise.push(c);
    } else {
      o.pendingSpms++;

      pending.push({
        spmName: String(u.NAME || ''),
        spmId: String(u.USER_ID || ''),
        officeName: String(o.officeName || u.OFFICE_NAME || '')
      });

      var empty = emptyClient(d);
      empty.spmId = String(u.USER_ID || '');
      empty.spmName = String(u.NAME || '');
      empty.officeId = oid;
      empty.officeName = String(o.officeName || u.OFFICE_NAME || '');
      empty.status = 'Not Updated';
      spmWise.push(empty);
    }
  });

  var summary = {
    newKits: 0, newArticles: 0,
    redirectedKits: 0, redirectedArticles: 0,
    rtsKits: 0, rtsArticles: 0,
    deliveredKitsToday: 0, deliveredArticlesToday: 0,
    closingPendingKits: 0, closingPendingArticles: 0,
    invalidMobileKits: 0, invalidMobileArticles: 0,
    tornKits: 0, tornArticles: 0,
    deliverableKits: 0, deliverableArticles: 0,
    incompleteKits: 0, incompleteArticles: 0
  };

  reports.forEach(function(r) {
    summary.newKits += num(r.NEW_KITS);
    summary.newArticles += num(r.NEW_ARTICLES);
    summary.redirectedKits += num(r.REDIRECTED_KITS);
    summary.redirectedArticles += num(r.REDIRECTED_ARTICLES);
    summary.rtsKits += num(r.RTS_KITS);
    summary.rtsArticles += num(r.RTS_ARTICLES);
    summary.deliveredKitsToday += num(r.DELIVERED_KITS);
    summary.deliveredArticlesToday += num(r.DELIVERED_ARTICLES);
    summary.closingPendingKits += num(r.CLOSING_PENDING_KITS);
    summary.closingPendingArticles += num(r.CLOSING_PENDING_ARTICLES);
    summary.invalidMobileKits += num(r.INVALID_MOBILE_KITS);
    summary.invalidMobileArticles += num(r.INVALID_MOBILE_ARTICLES);
    summary.tornKits += num(r.TORN_KITS);
    summary.tornArticles += num(r.TORN_ARTICLES);
    summary.deliverableKits += num(r.DELIVERABLE_KITS);
    summary.deliverableArticles += num(r.DELIVERABLE_ARTICLES);
    summary.incompleteKits += num(r.INCOMPLETE_KITS);
    summary.incompleteArticles += num(r.INCOMPLETE_ARTICLES);

    var o = offices[String(r.OFFICE_ID)] || (offices[String(r.OFFICE_ID)] = officeBase(r));

    o.openingKits += num(r.OPENING_KITS);
    o.newKits += num(r.NEW_KITS);
    o.redirectedKits += num(r.REDIRECTED_KITS);
    o.rtsKits += num(r.RTS_KITS);
    o.deliveredKits += num(r.DELIVERED_KITS);
    o.closingPendingKits += num(r.CLOSING_PENDING_KITS);

    o.openingArticles += num(r.OPENING_ARTICLES);
    o.newArticles += num(r.NEW_ARTICLES);
    o.redirectedArticles += num(r.REDIRECTED_ARTICLES);
    o.rtsArticles += num(r.RTS_ARTICLES);
    o.deliveredArticles += num(r.DELIVERED_ARTICLES);
    o.closingPendingArticles += num(r.CLOSING_PENDING_ARTICLES);
  });

  var officeWise = Object.keys(offices).map(function(k) {
    var o = offices[k];
    o.status = o.totalSpms > 0 && o.updatedSpms === o.totalSpms ? 'Updated' : 'Pending';
    return o;
  });

  return ok({
    date: d,
    summary: summary,
    officeWise: officeWise,
    spmWise: spmWise,
    pendingSpms: pending,
    spmsUpdatedToday: reports.length,
    activeSpms: users.length,
    spmsPendingUpdate: pending.length
  });
}

/* =========================================================
   ARTICLE ENGINE
   ========================================================= */

var ARTICLE_HEADER_ALIASES = {
  BAR_CODE_ID: [
    'BAR_CODE_ID','BARCODE_ID','BARCODE','BAR_CODE',
    'ARTICLE_BARCODE','ARTICLE_BAR_CODE','BAR_CODE_NO'
  ],
  PMV_APPLICATION_NUMBER: [
    'PMV_APPLICATION_NUMBER','PMV_APPLICATION_NO','PMV_APP_NUMBER',
    'PMV_APPLICATION','APPLICATION_NUMBER','PMV_NO','PMV_NUMBER'
  ],
  ARTISAN_NAME: [
    'ARTISAN_NAME','ARTISAN','NAME_OF_ARTISAN','BENEFICIARY_NAME'
  ],
  MOBILE_NUMBER: [
    'MOBILE_NUMBER','MOBILE','MOBILE_NO','PHONE','PHONE_NUMBER'
  ],
  ARTISAN_CURRENT_ADDRESS: [
    'ARTISAN_CURRENT_ADDRESS','CURRENT_ADDRESS','ADDRESS','ARTISAN_ADDRESS'
  ],
  CIRCLE_NAME: ['CIRCLE_NAME','CIRCLE'],
  DIVISION_NAME: ['DIVISION_NAME','DIVISION'],
  ARTISAN_PIN_CODE: [
    'ARTISAN_PIN_CODE','ARTISAN_PINCODE','PIN_CODE','PINCODE','PIN','ARTISAN_PIN'
  ],
  DELIVERY_STAFF_ASSIGNED_UNASSIGNED: [
    'DELIVERY_STAFF_ASSIGNED_UNASSIGNED','DELIVERY_STAFF',
    'DELIVERY_STAFF_ASSIGNED','DELIVERY_STAFF_STATUS'
  ],
  TOOLKIT_DELIVERY_STATUS: [
    'TOOLKIT_DELIVERY_STATUS','DELIVERY_STATUS','STATUS','PRESENT_STATUS'
  ]
};

function normalizeHeader(v) {
  return String(v == null ? '' : v)
    .trim()
    .toUpperCase()
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizePin(v) {
  var s = String(v == null ? '' : v).trim();
  if (/^\d+\.0$/.test(s)) s = s.replace(/\.0$/, '');
  return s.replace(/\D/g, '');
}

function articleKey(r) {
  var pmv = String(r.PMV_APPLICATION_NUMBER || '').trim();
  var barcode = String(r.BAR_CODE_ID || '').trim();
  return pmv || barcode;
}

function articleReadSheet(name) {
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 1) return [];

  var values = sh.getDataRange().getDisplayValues();
  if (!values.length) return [];

  var headers = values.shift().map(normalizeHeader);

  return values.map(function(row, index) {
    var obj = { __row: index + 2, __sheet: name };
    headers.forEach(function(h, j) {
      if (h) obj[h] = row[j];
    });
    return obj;
  });
}

function getAliasValue(row, canonical) {
  var aliases = ARTICLE_HEADER_ALIASES[canonical] || [canonical];

  for (var i = 0; i < aliases.length; i++) {
    var v = row[normalizeHeader(aliases[i])];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return v;
    }
  }

  return '';
}

function canonicalArticleRow(row) {
  var o = {
    __row: row.__row,
    __sheet: row.__sheet,
    BAR_CODE_ID: getAliasValue(row, 'BAR_CODE_ID'),
    PMV_APPLICATION_NUMBER: getAliasValue(row, 'PMV_APPLICATION_NUMBER'),
    ARTISAN_NAME: getAliasValue(row, 'ARTISAN_NAME'),
    MOBILE_NUMBER: getAliasValue(row, 'MOBILE_NUMBER'),
    ARTISAN_CURRENT_ADDRESS: getAliasValue(row, 'ARTISAN_CURRENT_ADDRESS'),
    CIRCLE_NAME: getAliasValue(row, 'CIRCLE_NAME'),
    DIVISION_NAME: getAliasValue(row, 'DIVISION_NAME'),
    ARTISAN_PIN_CODE: getAliasValue(row, 'ARTISAN_PIN_CODE'),
    DELIVERY_STAFF_ASSIGNED_UNASSIGNED: getAliasValue(row, 'DELIVERY_STAFF_ASSIGNED_UNASSIGNED'),
    TOOLKIT_DELIVERY_STATUS: getAliasValue(row, 'TOOLKIT_DELIVERY_STATUS')
  };

  o.__articleKey = articleKey(o);
  return o;
}

function isArticleDataSheet(name) {
  var rows = articleReadSheet(name);
  if (!rows.length) return false;

  var sample = rows.slice(0, Math.min(rows.length, 20));
  var hasKey = sample.some(function(r) {
    return String(
      getAliasValue(r, 'BAR_CODE_ID') ||
      getAliasValue(r, 'PMV_APPLICATION_NUMBER')
    ).trim() !== '';
  });

  var hasPin = sample.some(function(r) {
    return normalizePin(getAliasValue(r, 'ARTISAN_PIN_CODE')) !== '';
  });

  return hasKey && hasPin;
}

function articleSourceSheetNames() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var names = ss.getSheets().map(function(sh) { return sh.getName(); });

  var excluded = [
    S.U,S.O,S.R,S.SS,S.A,S.P,S.AS,
    'SESSIONS','AUDIT_LOG','PMV_REPORTS','OFFICE_MASTER','USER_MASTER','PINCODE_MASTER'
  ];

  var preferred = [
    S.AM,
    'ARTICLE_MASTER_IMPORT',
    'ARTICLES',
    'ARTICLE_DATA',
    'ARTICLE_LIST',
    'PMV_ARTICLES'
  ];

  var ordered = [];

  preferred.forEach(function(n) {
    if (names.indexOf(n) >= 0 && ordered.indexOf(n) < 0) {
      ordered.push(n);
    }
  });

  names.forEach(function(n) {
    if (ordered.indexOf(n) >= 0 || excluded.indexOf(n) >= 0) return;

    try {
      if (isArticleDataSheet(n)) ordered.push(n);
    } catch (ignore) {}
  });

  return ordered;
}

function articleRowsFromSheet(name) {
  return articleReadSheet(name)
    .map(canonicalArticleRow)
    .filter(function(r) {
      return String(r.__articleKey || '').trim() !== '';
    });
}

function articleRowsForSource(source) {
  source = String(source || 'auto').trim().toLowerCase();

  var sheets = articleSourceSheetNames();
  if (!sheets.length) return [];

  if (source === 'master') {
    return sheets.indexOf(S.AM) >= 0 ? articleRowsFromSheet(S.AM) : [];
  }

  if (source === 'import') {
    var importName = sheets.indexOf('ARTICLE_MASTER_IMPORT') >= 0
      ? 'ARTICLE_MASTER_IMPORT'
      : sheets.find(function(n) { return n !== S.AM; });

    return importName ? articleRowsFromSheet(importName) : [];
  }

  var seen = {};
  var result = [];

  sheets.forEach(function(sheetName) {
    articleRowsFromSheet(sheetName).forEach(function(r) {
      var k = articleKey(r);
      if (!k || seen[k]) return;
      seen[k] = true;
      result.push(r);
    });
  });

  return result;
}

function articleMasterRows() {
  return articleRowsForSource('master');
}

function assignedPincodes(officeId) {
  var pins = [];

  read(S.P).forEach(function(r) {
    if (
      activeValue(r.ACTIVE) &&
      String(r.OFFICE_ID || '').trim() === String(officeId || '').trim()
    ) {
      var p = normalizePin(r.PINCODE);
      if (p) pins.push(p);
    }
  });

  if (!pins.length) {
    var office = read(S.O).find(function(r) {
      return String(r.OFFICE_ID || '').trim() === String(officeId || '').trim();
    });

    if (office) {
      String(office.PINCODES || '')
        .split(/[,;\s]+/)
        .map(normalizePin)
        .filter(Boolean)
        .forEach(function(p) { pins.push(p); });
    }
  }

  return unique(pins);
}

function statusMap(d) {
  var map = {};

  read(S.AS).forEach(function(r) {
    if (dateOnly(r.DATE) !== String(d)) return;

    var key = String(r.ARTICLE_KEY || '').trim();
    if (key) map[key] = r;
  });

  return map;
}

function articleClient(r, status, source) {
  return {
    articleKey: articleKey(r),
    barCodeId: String(r.BAR_CODE_ID || ''),
    pmvApplicationNumber: String(r.PMV_APPLICATION_NUMBER || ''),
    artisanName: String(r.ARTISAN_NAME || ''),
    mobileNumber: String(r.MOBILE_NUMBER || ''),
    address: String(r.ARTISAN_CURRENT_ADDRESS || ''),
    circleName: String(r.CIRCLE_NAME || ''),
    divisionName: String(r.DIVISION_NAME || ''),
    pinCode: normalizePin(r.ARTISAN_PIN_CODE),
    deliveryStaff: String(r.DELIVERY_STAFF_ASSIGNED_UNASSIGNED || ''),
    sourceStatus: String(r.TOOLKIT_DELIVERY_STATUS || ''),
    presentStatus: String(
      status && status.STATUS
        ? status.STATUS
        : (r.TOOLKIT_DELIVERY_STATUS || 'Pending')
    ),
    remarks: String(status && status.REMARKS ? status.REMARKS : ''),
    statusDate: status ? dateOnly(status.DATE) : '',
    updatedAt: status && status.UPDATED_AT ? String(status.UPDATED_AT) : '',
    sourceSheet: String(source || r.__sheet || '')
  };
}

/* =========================================================
   SPM ARTICLE API
   ========================================================= */

function spmArticles(params, session) {
  var a = auth(session);

  if (a.role !== ROLE.SPM) {
    throw new Error('Only SPM users can access articles.');
  }

  params = params || {};

  var d = String(params.date || today());
  validateDate(d);

  var pins = assignedPincodes(a.user.OFFICE_ID);

  if (!pins.length) {
    return ok({
      date: d,
      officeId: String(a.user.OFFICE_ID || ''),
      officeName: String(a.user.OFFICE_NAME || ''),
      assignedPincodes: [],
      count: 0,
      articles: [],
      message: 'No PIN codes are configured for this office.'
    });
  }

  var source = String(params.source || 'auto');
  var rows = articleRowsForSource(source);
  var statuses = statusMap(d);

  var articles = rows.filter(function(r) {
    return pins.indexOf(normalizePin(r.ARTISAN_PIN_CODE)) >= 0;
  }).map(function(r) {
    return articleClient(r, statuses[articleKey(r)], r.__sheet);
  });

  var search = String(params.search || '').trim().toLowerCase();

  if (search) {
    articles = articles.filter(function(a1) {
      return [
        a1.articleKey,
        a1.barCodeId,
        a1.pmvApplicationNumber,
        a1.artisanName,
        a1.mobileNumber,
        a1.pinCode,
        a1.presentStatus
      ].join(' ').toLowerCase().indexOf(search) >= 0;
    });
  }

  return ok({
    date: d,
    officeId: String(a.user.OFFICE_ID || ''),
    officeName: String(a.user.OFFICE_NAME || ''),
    assignedPincodes: pins,
    source: source,
    count: articles.length,
    articles: articles
  });
}

/* =========================================================
   ADMIN ARTICLE STATUS
   ========================================================= */

function adminArticleStatus(params, session) {
  var a = auth(session);

  if ([ROLE.ADMIN, ROLE.DPS].indexOf(a.role) < 0) {
    throw new Error('Only DPS/Admin users can access article status.');
  }

  params = params || {};

  var d = String(params.date || today());
  validateDate(d);

  var source = String(params.source || 'auto');
  var rows = articleRowsForSource(source);
  var statuses = statusMap(d);

  var filterOffice = String(params.officeId || '').trim();
  var filterPin = normalizePin(params.pinCode);
  var filterStatus = String(params.status || '').trim().toLowerCase();
  var search = String(params.search || '').trim().toLowerCase();

  var articles = rows.map(function(r) {
    return articleClient(r, statuses[articleKey(r)], r.__sheet);
  });

  if (filterOffice) {
    var officePins = assignedPincodes(filterOffice);
    articles = articles.filter(function(x) {
      return officePins.indexOf(x.pinCode) >= 0;
    });
  }

  if (filterPin) {
    articles = articles.filter(function(x) {
      return x.pinCode === filterPin;
    });
  }

  if (filterStatus) {
    articles = articles.filter(function(x) {
      return x.presentStatus.toLowerCase() === filterStatus;
    });
  }

  if (search) {
    articles = articles.filter(function(x) {
      return [
        x.articleKey,x.barCodeId,x.pmvApplicationNumber,x.artisanName,
        x.mobileNumber,x.pinCode,x.presentStatus,x.officeName
      ].join(' ').toLowerCase().indexOf(search) >= 0;
    });
  }

  var summary = {};
  articles.forEach(function(x) {
    var st = x.presentStatus || 'Pending';
    summary[st] = (summary[st] || 0) + 1;
  });

  return ok({
    date: d,
    source: source,
    count: articles.length,
    summary: summary,
    articles: articles
  });
}

/* =========================================================
   ARTICLE STATUS UPDATE
   ========================================================= */

function updateArticleStatus(record, session) {
  var a = auth(session);

  if (a.role !== ROLE.SPM && a.role !== ROLE.ADMIN && a.role !== ROLE.DPS) {
    throw new Error('You are not authorized to update article status.');
  }

  record = record || {};

  var d = String(record.date || today());
  validateDate(d);

  var key = String(
    record.articleKey ||
    record.pmvApplicationNumber ||
    record.barCodeId ||
    ''
  ).trim();

  if (!key) throw new Error('Article key is required.');

  var status = String(record.status || '').trim();
  if (!status) throw new Error('Present status is required.');
  if (status.length > 100) throw new Error('Present status is too long.');

  var remarks = String(record.remarks || '').trim();
  if (remarks.length > 500) throw new Error('Remarks are too long.');

  var rows = articleRowsForSource('auto');
  var article = rows.find(function(r) {
    return articleKey(r) === key ||
      String(r.BAR_CODE_ID || '').trim() === key ||
      String(r.PMV_APPLICATION_NUMBER || '').trim() === key;
  });

  if (!article) throw new Error('Article not found.');

  if (a.role === ROLE.SPM) {
    var pins = assignedPincodes(a.user.OFFICE_ID);
    var articlePin = normalizePin(article.ARTISAN_PIN_CODE);

    if (pins.indexOf(articlePin) < 0) {
      throw new Error('This article is not assigned to your office PIN code.');
    }
  }

  var officeId = a.role === ROLE.SPM
    ? String(a.user.OFFICE_ID || '')
    : String(record.officeId || a.user.OFFICE_ID || '');

  var officeName = a.role === ROLE.SPM
    ? String(a.user.OFFICE_NAME || '')
    : String(record.officeName || a.user.OFFICE_NAME || '');

  var values = [
    d,
    articleKey(article),
    String(article.BAR_CODE_ID || ''),
    String(article.PMV_APPLICATION_NUMBER || ''),
    officeId,
    officeName,
    String(a.user.USER_ID || ''),
    String(a.user.NAME || ''),
    status,
    remarks,
    new Date()
  ];

  var sh = sheet(S.AS);
  var existing = null;
  var data = read(S.AS);

  data.forEach(function(r) {
    if (
      dateOnly(r.DATE) === d &&
      String(r.ARTICLE_KEY || '').trim() === articleKey(article)
    ) {
      existing = r;
    }
  });

  if (existing) {
    sh.getRange(existing.__row, 1, 1, values.length).setValues([values]);
  } else {
    sh.appendRow(values);
  }

  audit(a.user.USER_ID, 'ARTICLE_STATUS_UPDATE', d + ' / ' + articleKey(article));

  return ok({
    date: d,
    articleKey: articleKey(article),
    status: status,
    remarks: remarks
  }, 'Article status updated successfully.');
}

/* =========================================================
   SOURCE DIAGNOSTIC
   ========================================================= */

function articleSourceDiagnostic(params, session) {
  var a = auth(session);

  if ([ROLE.ADMIN, ROLE.DPS].indexOf(a.role) < 0) {
    throw new Error('Only DPS/Admin users can run article diagnostics.');
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var names = ss.getSheets().map(function(sh) { return sh.getName(); });
  var sources = articleSourceSheetNames();

  var diagnostics = names.map(function(name) {
    var result = {
      sheet: name,
      rows: 0,
      compatible: false,
      usableArticles: 0,
      error: ''
    };

    try {
      var rows = articleReadSheet(name);
      result.rows = rows.length;

      if (rows.length) {
        result.compatible = isArticleDataSheet(name);
        if (result.compatible) {
          result.usableArticles = articleRowsFromSheet(name).length;
        }
      }
    } catch (ex) {
      result.error = errorMessage(ex);
    }

    return result;
  });

  var all = articleRowsForSource('auto');

  return ok({
    spreadsheetId: SPREADSHEET_ID,
    detectedSourceSheets: sources,
    totalUniqueArticles: all.length,
    diagnostics: diagnostics,
    aliases: ARTICLE_HEADER_ALIASES
  });
}

/* =========================================================
   HELPERS
   ========================================================= */

function findUser(userId) {
  var id = String(userId == null ? '' : userId).trim();
  if (!id) return null;

  var rows = read(S.U);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].USER_ID || '').trim() === id) return rows[i];
  }

  return null;
}

function findReport(spmId, d) {
  var id = String(spmId || '').trim();
  var dateValue = String(d || '');

  var rows = read(S.R);
  for (var i = 0; i < rows.length; i++) {
    if (
      String(rows[i].SPM_ID || '').trim() === id &&
      dateOnly(rows[i].DATE) === dateValue
    ) {
      return rows[i];
    }
  }

  return null;
}

function previousBalance(officeId, d, type) {
  var oid = String(officeId || '').trim();
  var target = String(d || '');

  var rows = read(S.R).filter(function(r) {
    return String(r.OFFICE_ID || '').trim() === oid &&
      dateOnly(r.DATE) < target;
  });

  rows.sort(function(a, b) {
    return dateOnly(b.DATE).localeCompare(dateOnly(a.DATE));
  });

  if (!rows.length) return 0;

  return type === 'K'
    ? num(rows[0].CLOSING_PENDING_KITS)
    : num(rows[0].CLOSING_PENDING_ARTICLES);
}

function norm(x) {
  x = x || {};

  var r = {
    id: String(x.id || Utilities.getUuid()),
    date: String(x.date || today()),

    newKits: cleanCount(x.newKits),
    newArticles: cleanCount(x.newArticles),
    redirectedKits: cleanCount(x.redirectedKits),
    redirectedArticles: cleanCount(x.redirectedArticles),
    rtsKits: cleanCount(x.rtsKits),
    rtsArticles: cleanCount(x.rtsArticles),
    deliveredKits: cleanCount(x.deliveredKits),
    deliveredArticles: cleanCount(x.deliveredArticles),

    invalidMobileKits: cleanCount(x.invalidMobileKits),
    invalidMobileArticles: cleanCount(x.invalidMobileArticles),
    tornKits: cleanCount(x.tornKits),
    tornArticles: cleanCount(x.tornArticles),
    deliverableKits: cleanCount(x.deliverableKits),
    deliverableArticles: cleanCount(x.deliverableArticles),
    incompleteKits: cleanCount(x.incompleteKits),
    incompleteArticles: cleanCount(x.incompleteArticles)
  };

  validateDate(r.date);
  return r;
}

function emptyClient(d) {
  return {
    date: d,
    openingKits: 0,
    openingArticles: 0,
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
    closingPendingKits: 0,
    closingPendingArticles: 0
  };
}

function client(r) {
  return {
    date: dateOnly(r.DATE),
    openingKits: num(r.OPENING_KITS),
    openingArticles: num(r.OPENING_ARTICLES),
    newKits: num(r.NEW_KITS),
    newArticles: num(r.NEW_ARTICLES),
    redirectedKits: num(r.REDIRECTED_KITS),
    redirectedArticles: num(r.REDIRECTED_ARTICLES),
    rtsKits: num(r.RTS_KITS),
    rtsArticles: num(r.RTS_ARTICLES),
    deliveredKits: num(r.DELIVERED_KITS),
    deliveredArticles: num(r.DELIVERED_ARTICLES),
    invalidMobileKits: num(r.INVALID_MOBILE_KITS),
    invalidMobileArticles: num(r.INVALID_MOBILE_ARTICLES),
    tornKits: num(r.TORN_KITS),
    tornArticles: num(r.TORN_ARTICLES),
    deliverableKits: num(r.DELIVERABLE_KITS),
    deliverableArticles: num(r.DELIVERABLE_ARTICLES),
    incompleteKits: num(r.INCOMPLETE_KITS),
    incompleteArticles: num(r.INCOMPLETE_ARTICLES),
    closingPendingKits: num(r.CLOSING_PENDING_KITS),
    closingPendingArticles: num(r.CLOSING_PENDING_ARTICLES)
  };
}

function officeBase(x) {
  return {
    officeId: String(x.OFFICE_ID || ''),
    officeName: String(x.OFFICE_NAME || ''),
    totalSpms: 0,
    updatedSpms: 0,
    pendingSpms: 0,

    openingKits: 0,
    newKits: 0,
    redirectedKits: 0,
    rtsKits: 0,
    deliveredKits: 0,
    closingPendingKits: 0,

    openingArticles: 0,
    newArticles: 0,
    redirectedArticles: 0,
    rtsArticles: 0,
    deliveredArticles: 0,
    closingPendingArticles: 0
  };
}

function read(sheetName) {
  var sh = sheet(sheetName);

  if (sh.getLastRow() < 2 || sh.getLastColumn() < 1) {
    return [];
  }

  var values = sh.getDataRange().getValues();
  var headers = values.shift();

  return values.map(function(row, i) {
    var obj = { __row: i + 2 };

    headers.forEach(function(h, j) {
      var key = String(h == null ? '' : h).trim();
      if (key) obj[key] = row[j];
    });

    return obj;
  });
}

function sheet(name) {
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if (!sh) throw new Error('Sheet not found: ' + name);
  return sh;
}

function audit(userId, action, details) {
  try {
    sheet(S.A).appendRow([
      new Date(),
      String(userId || ''),
      String(action || ''),
      String(details || '')
    ]);
  } catch (ignore) {}
}

function out(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
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

function parseSession(value) {
  if (!value) return null;

  if (typeof value === 'object') return value;

  var s = String(value).trim();

  try {
    var parsed = JSON.parse(s);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (ignore) {}

  return { token: s };
}

function activeValue(v) {
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return v === true || s === 'TRUE' || s === 'YES' || s === 'Y' || s === '1' || s === 'ACTIVE';
}

function mobileNorm(v) {
  return String(v == null ? '' : v).replace(/\D/g, '').slice(-10);
}

function num(v) {
  if (typeof v === 'number') {
    if (!isFinite(v)) return 0;
    return Math.min(MAX_VALUE, Math.max(0, v));
  }

  var s = String(v == null ? '' : v).replace(/,/g, '').trim();
  if (!s) return 0;

  var n = Number(s);
  if (!isFinite(n)) return 0;

  return Math.min(MAX_VALUE, Math.max(0, n));
}

function cleanCount(v) {
  return Math.floor(num(v));
}

function dateOnly(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  }

  var s = String(v == null ? '' : v).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  var m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    return m[1] + '-' +
      ('0' + m[2]).slice(-2) + '-' +
      ('0' + m[3]).slice(-2);
  }

  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  }

  return '';
}

function today() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function validateDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) {
    throw new Error('Invalid date. Expected YYYY-MM-DD.');
  }

  var parts = String(d).split('-');
  var dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

  if (
    dt.getFullYear() !== Number(parts[0]) ||
    dt.getMonth() !== Number(parts[1]) - 1 ||
    dt.getDate() !== Number(parts[2])
  ) {
    throw new Error('Invalid calendar date.');
  }
}

function unique(arr) {
  var seen = {};
  var result = [];

  arr.forEach(function(v) {
    var k = String(v);
    if (!seen[k]) {
      seen[k] = true;
      result.push(v);
    }
  });

  return result;
}

function errorMessage(ex) {
  if (!ex) return 'Unknown error.';
  return ex.message ? String(ex.message) : String(ex);
}
