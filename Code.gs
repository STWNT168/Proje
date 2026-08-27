
/************************************************************
 * PMV TOOLKIT TRACKER - COMPLETE REFINED BACKEND V8
 * Fixes:
 *  - ARTICLE_MASTER dynamic header detection
 *  - all-field article search
 *  - SPM PIN-code visibility
 *  - ARTICLE_STATUS overlay and date handling
 *  - bulk SPM status workflow
 *  - Admin authorisation -> ARTICLE_MASTER
 *  - diagnostic endpoints
 *  - GET transport to avoid browser Failed-to-fetch/CORS issues
 ************************************************************/

const CONFIG = {
  SPREADSHEET_ID: '1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8',
  TIME_ZONE: 'Asia/Kolkata',
  SESSION_DAYS: 7,
  SHEETS: {
    DAILY: 'DAILY_DATA',
    OFFICE: 'OFFICE_MASTER',
    USERS: 'USER_MASTER',
    SESSIONS: 'SESSIONS',
    ARTICLE_MASTER: 'ARTICLE_MASTER',
    ARTICLE_STATUS: 'ARTICLE_STATUS',
    AUDIT: 'ARTICLE_AUDIT'
  },
  ROLES: { SPM:'SPM', DPS:'DPS', ADMIN:'ADMIN' },
  STATUS: ['Pending','Delivered','Redirected','Return','Torn/Without Address','Invalid OTP']
};

function getSS_(){ return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); }
function getSheet_(name){
  const sh=getSS_().getSheetByName(name);
  if(!sh) throw new Error('Required sheet not found: '+name);
  return sh;
}
function clean_(v){ return String(v==null?'':v).trim(); }
function upper_(v){ return clean_(v).toUpperCase(); }
function digits_(v){ return clean_(v).replace(/\D/g,''); }
function number_(v){ const n=Number(v); return isNaN(n)?0:Math.max(0,Math.floor(n)); }
function now_(){ return Utilities.formatDate(new Date(),CONFIG.TIME_ZONE,'yyyy-MM-dd HH:mm:ss'); }
function today_(){ return Utilities.formatDate(new Date(),CONFIG.TIME_ZONE,'yyyy-MM-dd'); }
function json_(obj){ return ContentService.createTextOutput(JSON.stringify({success:true,data:obj})).setMimeType(ContentService.MimeType.JSON); }
function error_(message){ return ContentService.createTextOutput(JSON.stringify({success:false,error:String(message)})).setMimeType(ContentService.MimeType.JSON); }

function normHeader_(v){
  return upper_(v)
    .replace(/[\u00A0]+/g,' ')
    .replace(/[^A-Z0-9]+/g,'_')
    .replace(/^_+|_+$/g,'');
}
function parseSession_(v){
  if(!v) return null;
  if(typeof v==='object') return v;
  try{return JSON.parse(v);}catch(e){return null;}
}
function parseBody_(e){
  try{return JSON.parse(e.postData.contents||'{}');}catch(err){return {};}
}
function parseDate_(v){
  if(v instanceof Date) return new Date(v.getTime());
  const s=clean_(v);
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m) return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
  m=s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if(m) return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));
  const d=new Date(s); return isNaN(d.getTime())?new Date():d;
}
function formatDate_(d){ return Utilities.formatDate(d,CONFIG.TIME_ZONE,'yyyy-MM-dd'); }
function formatDateTime_(d){ return Utilities.formatDate(d,CONFIG.TIME_ZONE,'yyyy-MM-dd HH:mm:ss'); }
function dateOnly_(v){
  if(v instanceof Date) return formatDate_(v);
  const s=clean_(v);
  if(!s) return '';
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return m[0];
  m=s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if(m) return m[3]+'-'+m[2]+'-'+m[1];
  const d=new Date(s); return isNaN(d.getTime())?'':formatDate_(d);
}
function normalizePins_(v){
  if(Array.isArray(v)) return [...new Set(v.flatMap(x=>normalizePins_(x)))];
  return [...new Set(clean_(v).split(/[,;\s|]+/).map(digits_).filter(x=>x.length>=4))];
}
function normalizeRole_(v){
  const s=upper_(v);
  if(s==='ADMIN') return CONFIG.ROLES.ADMIN;
  if(s==='DPS') return CONFIG.ROLES.DPS;
  return CONFIG.ROLES.SPM;
}

/* ---------- generic sheet reader ---------- */
function readSheetObjects_(sheetName, includeBlank){
  const sh=getSheet_(sheetName), range=sh.getDataRange(), data=range.getValues();
  if(!data.length) return [];
  const rawHeaders=data[0];
  const headers=rawHeaders.map((h,i)=>normHeader_(h)||('COLUMN_'+(i+1)));
  const rows=[];
  for(let r=1;r<data.length;r++){
    const obj={}; let has=false;
    for(let c=0;c<headers.length;c++){
      const value=data[r][c];
      if(clean_(value)) has=true;
      obj[headers[c]]=value instanceof Date?formatDateTime_(value):value;
    }
    if(includeBlank||has) rows.push(obj);
  }
  return rows;
}
function headerMap_(headers){
  const m={}; (headers||[]).forEach((h,i)=>{const k=normHeader_(h); if(k && m[k]===undefined)m[k]=i;}); return m;
}
function firstHeader_(headers,names){
  for(const n of names){const k=normHeader_(n); if(Object.prototype.hasOwnProperty.call(headers,k)) return headers[k];}
  return -1;
}
function ensureHeaders_(sh,required){
  let last=sh.getLastColumn();
  if(!last){sh.getRange(1,1,1,required.length).setValues([required]); return headerMap_(required);}
  const existing=sh.getRange(1,1,1,last).getValues()[0].map(normHeader_);
  const add=required.filter(x=>!existing.includes(normHeader_(x)));
  if(add.length) sh.getRange(1,last+1,1,add.length).setValues([add]);
  return headerMap_(sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]);
}

/* ---------- robust article fields ---------- */
const ARTICLE_ALIASES_ = {
  ARTICLE_KEY:['ARTICLE_KEY','ARTICLEKEY','ARTICLE_KEY_ID','UNIQUE_ARTICLE_KEY','UNIQUE_ID'],
  BARCODE_ID:['BARCODE_ID','BARCODE','BARCODEID','BAR_CODE','ARTICLE_NUMBER','ARTICLE_NO','ARTICLE_NO_','ARTICLE_ID','TRACKING_NUMBER','TRACKING_NO','ARTICLE_REFERENCE'],
  PMV_APPLICATION_NUMBER:['PMV_APPLICATION_NUMBER','PMV_APPLICATION','PMV_APPLICATION_NO','PMV_NO','PMV_APP_NO','PMV_APPLICATION_ID','APPLICATION_NUMBER','APPLICATION_NO','APPLICATION_ID'],
  ARTISAN_NAME:['ARTISAN_NAME','ARTISAN','ARTISANNAME','ARTISAN_FULL_NAME','BENEFICIARY_NAME','CUSTOMER_NAME','NAME'],
  MOBILE_NUMBER:['MOBILE_NUMBER','MOBILE','MOBILE_NO','PHONE','PHONE_NUMBER','CONTACT_NUMBER','CONTACT_NO'],
  ADDRESS:['ADDRESS','DELIVERY_ADDRESS','FULL_ADDRESS','DELIVERY_FULL_ADDRESS','ARTISAN_ADDRESS','CUSTOMER_ADDRESS'],
  CIRCLE_NAME:['CIRCLE_NAME','CIRCLE','POSTAL_CIRCLE','CIRCLENAME'],
  DIVISION_NAME:['DIVISION_NAME','DIVISION','POSTAL_DIVISION','DIVISIONNAME'],
  PIN_CODE:['PIN_CODE','PIN','PINCODE','PIN_CODE_','DELIVERY_PIN','DELIVERY_PINCODE','DESTINATION_PIN','DESTINATION_PINCODE','POST_OFFICE_PIN','POSTAL_CODE','PIN_NO','PIN_NUMBER'],
  DELIVERY_STAFF:['DELIVERY_STAFF','DELIVERY_PERSON','DELIVERY_BOY','POSTMAN','POSTMAN_NAME','DELIVERY_EXECUTIVE','DELIVERY_STAFF_NAME'],
  PRESENT_STATUS:['PRESENT_STATUS','PRESENTSTATUS','STATUS','ARTICLE_STATUS','CURRENT_STATUS','DELIVERY_STATUS'],
  REMARKS:['REMARKS','STATUS_REMARKS','REMARK','COMMENTS','COMMENT']
};
function articleField_(row,canonical){
  const aliases=ARTICLE_ALIASES_[canonical]||[canonical];
  for(const a of aliases){const k=normHeader_(a); if(Object.prototype.hasOwnProperty.call(row,k) && clean_(row[k])) return row[k];}
  /* fuzzy fallback for badly named columns */
  const keys=Object.keys(row);
  const wanted=aliases.map(normHeader_);
  for(const k of keys){
    if(wanted.some(w=>k===w || k.includes(w) || w.includes(k))) return row[k];
  }
  return '';
}
function articleKey_(row){
  return clean_(articleField_(row,'ARTICLE_KEY') || articleField_(row,'BARCODE_ID') ||
                articleField_(row,'PMV_APPLICATION_NUMBER'));
}
function articlePin_(row){ return digits_(articleField_(row,'PIN_CODE')); }

function articleMatchesSearch_(row,search){
  const q=clean_(search).toLowerCase(); if(!q) return true;
  const hay=Object.values(row||{}).map(v=>clean_(v)).join(' ').toLowerCase();
  return q.split(/\s+/).filter(Boolean).every(t=>hay.includes(t));
}
/* ---------- users / sessions ---------- */
function findUser_(userId,mobile){
  const rows=readSheetObjects_(CONFIG.SHEETS.USERS);
  for(const r of rows){
    const id=clean_(r.USER_ID||r.USERID||r.ID||r.EMPLOYEE_ID||r.EMP_ID);
    if(upper_(id)!==upper_(userId)) continue;
    const rm=digits_(r.MOBILE||r.MOBILE_NUMBER||r.PHONE||r.PHONE_NUMBER||r.CONTACT_NUMBER);
    if(mobile && rm!==digits_(mobile)) continue;
    const active=clean_(r.ACTIVE||r.IS_ACTIVE||r.STATUS);
    if(/^(NO|FALSE|INACTIVE|0|DISABLED)$/i.test(active)) return null;
    const pinSource=r.ASSIGNED_PINS||r.PIN_CODES||r.PINCODES||r.ASSIGNED_PIN_CODES||r.PIN_CODE||r.PIN;
    return {userId:id,role:normalizeRole_(r.ROLE||r.USER_ROLE),officeName:clean_(r.OFFICE_NAME||r.OFFICE||r.POST_OFFICE),officeCode:clean_(r.OFFICE_CODE||r.SOL_ID||r.SOLID||r.OFFICE_ID),assignedPins:normalizePins_(pinSource),active:true};
  }
  return null;
}
function createSession_(u){
  const token=Utilities.getUuid()+'-'+Utilities.getUuid(), created=Date.now();
  const s={token,userId:u.userId,role:u.role,officeName:u.officeName,officeCode:u.officeCode,assignedPins:normalizePins_(u.assignedPins),createdAt:created};
  const sh=getSheet_(CONFIG.SHEETS.SESSIONS);
  ensureHeaders_(sh,['TOKEN','USER_ID','ROLE','OFFICE_NAME','OFFICE_CODE','ASSIGNED_PINS','CREATED_AT','LAST_ACTIVE']);
  sh.appendRow([token,s.userId,s.role,s.officeName,s.officeCode,s.assignedPins.join(','),new Date(created),new Date()]);
  return s;
}
function authenticate_(s){
  if(!s||!s.token||!s.userId) throw new Error('Not authenticated. Please sign in again.');
  const rows=readSheetObjects_(CONFIG.SHEETS.SESSIONS,true);
  const found=rows.find(r=>clean_(r.TOKEN)===clean_(s.token));
  if(!found) throw new Error('Invalid session. Please sign in again.');
  const created=new Date(found.CREATED_AT).getTime();
  if(!isNaN(created) && Date.now()-created>CONFIG.SESSION_DAYS*86400000) throw new Error('Session expired. Please sign in again.');
  const u=findUser_(s.userId,''); if(!u||!u.active) throw new Error('Account is inactive.');
  /* Refresh assigned pins from USER_MASTER so changes apply without re-login. */
  s.role=u.role; s.officeName=u.officeName; s.officeCode=u.officeCode; s.assignedPins=normalizePins_(u.assignedPins);
  if(!s.assignedPins.length) s.assignedPins=getEffectivePins_(s);
  return s;
}
function handleLogin_(userId,mobile){
  const u=findUser_(userId,mobile);
  if(!u) throw new Error('Invalid User ID or registered mobile number.');
  return json_(createSession_(u));
}
function logout_(s){
  if(!s||!s.token) return {loggedOut:true};
  const sh=getSheet_(CONFIG.SHEETS.SESSIONS), data=sh.getDataRange().getValues(); if(data.length<2)return {loggedOut:true};
  const h=headerMap_(data[0]);
  for(let i=data.length-1;i>=1;i--) if(clean_(data[i][h.TOKEN])===clean_(s.token)){sh.deleteRow(i+1);break;}
  return {loggedOut:true};
}
function requireAdmin_(s){authenticate_(s);if(s.role!==CONFIG.ROLES.ADMIN&&s.role!==CONFIG.ROLES.DPS)throw new Error('Administrator/DPS authorisation required.');}
function requireRole_(s,roles){authenticate_(s);if(!roles.includes(s.role))throw new Error('You are not authorised for this operation.');}

/* ---------- robust SPM PIN resolution ---------- */
function pinValuesFromObject_(row){
  const out=[];
  Object.keys(row||{}).forEach(k=>{
    const n=normHeader_(k);
    if(/PIN|POSTAL_CODE|ZIP/.test(n)) out.push(...normalizePins_(row[k]));
  });
  return [...new Set(out)];
}
function officeMatches_(row,officeName,officeCode){
  const code=clean_(row.OFFICE_CODE||row.SOL_ID||row.SOLID||row.OFFICE_ID||row.CODE||row.SOL);
  const name=clean_(row.OFFICE_NAME||row.OFFICE||row.POST_OFFICE||row.POSTOFFICE||row.NAME||row.SO_NAME);
  const wantCode=upper_(officeCode), wantName=upper_(officeName);
  if(wantCode && upper_(code)===wantCode) return true;
  if(wantName && upper_(name)===wantName) return true;
  if(wantName && name && (upper_(name).includes(wantName)||wantName.includes(upper_(name)))) return true;
  return false;
}
function getOfficePins_(officeName,officeCode){
  const out=[];
  try{
    const rows=readSheetObjects_(CONFIG.SHEETS.OFFICE);
    rows.forEach(r=>{if(officeMatches_(r,officeName,officeCode))out.push(...pinValuesFromObject_(r));});
  }catch(e){}
  return [...new Set(out)];
}
function getUserPins_(userId){
  const out=[];
  try{
    const rows=readSheetObjects_(CONFIG.SHEETS.USERS);
    rows.forEach(r=>{
      const id=clean_(r.USER_ID||r.USERID||r.ID||r.EMPLOYEE_ID||r.EMP_ID);
      if(upper_(id)===upper_(userId)) out.push(...pinValuesFromObject_(r));
    });
  }catch(e){}
  return [...new Set(out)];
}
function getEffectivePins_(session){
  let pins=normalizePins_(session&&session.assignedPins);
  if(!pins.length) pins=getUserPins_(session&&session.userId);
  if(!pins.length) pins=getOfficePins_(session&&session.officeName,session&&session.officeCode);
  return [...new Set(pins)];
}
function diagnosePinAccess_(session){
  requireRole_(session,[CONFIG.ROLES.SPM,CONFIG.ROLES.DPS,CONFIG.ROLES.ADMIN]);
  const userPins=getUserPins_(session.userId);
  const officePins=getOfficePins_(session.officeName,session.officeCode);
  const effective=getEffectivePins_(session);
  const master=readSheetObjects_(CONFIG.SHEETS.ARTICLE_MASTER);
  const pinCounts={};
  master.forEach(r=>{const p=articlePin_(r);if(p)pinCounts[p]=(pinCounts[p]||0)+1;});
  const matching=master.filter(r=>effective.includes(articlePin_(r))).length;
  return {
    userId:session.userId,officeName:session.officeName,officeCode:session.officeCode,
    sessionPins:normalizePins_(session.assignedPins),userPins,officePins,effectivePins:effective,
    masterRows:master.length,matchingArticles:matching,
    matchingByPin:effective.reduce((o,p)=>(o[p]=pinCounts[p]||0,o),{})
  };
}

/* ---------- daily ---------- */
function DAILY_HEADERS_(){return ['DATE','USER_ID','OFFICE_NAME','OFFICE_CODE','OPENING_KITS','OPENING_ARTICLES','NEW_KITS','NEW_ARTICLES','DELIVERED_KITS','DELIVERED_ARTICLES','REDIRECTED_KITS','REDIRECTED_ARTICLES','RTS_KITS','RTS_ARTICLES','INVALID_MOBILE_KITS','INVALID_MOBILE_ARTICLES','TORN_KITS','TORN_ARTICLES','DELIVERABLE_KITS','DELIVERABLE_ARTICLES','INCOMPLETE_KITS','INCOMPLETE_ARTICLES','CLOSING_KITS','CLOSING_ARTICLES','UPDATED_AT'];}
function findDailyRecord_(uid,date){
  const rows=readSheetObjects_(CONFIG.SHEETS.DAILY);
  for(let i=rows.length-1;i>=0;i--) if(upper_(rows[i].USER_ID)===upper_(uid)&&dateOnly_(rows[i].DATE)===date)return rows[i];
  return null;
}
function findDailyRowNumber_(uid,date){
  const sh=getSheet_(CONFIG.SHEETS.DAILY), data=sh.getDataRange().getValues(); if(data.length<2)return 0; const h=headerMap_(data[0]);
  for(let i=1;i<data.length;i++) if(upper_(data[i][h.USER_ID])===upper_(uid)&&dateOnly_(data[i][h.DATE])===date)return i+1;
  return 0;
}
function getPmvOpeningBalance_(session,date){
  const d=parseDate_(date); d.setDate(d.getDate()-1); const prev=findDailyRecord_(session.userId,formatDate_(d));
  return {openingKits:prev?number_(prev.CLOSING_KITS):0,openingArticles:prev?number_(prev.CLOSING_ARTICLES):0};
}
function getOwnPmvDashboard_(session,date){
  const r=findDailyRecord_(session.userId,date);
  if(!r)return {newKits:0,newArticles:0,deliveredKits:0,deliveredArticles:0,redirectedKits:0,redirectedArticles:0,rtsKits:0,rtsArticles:0,invalidMobileKits:0,invalidMobileArticles:0,tornKits:0,tornArticles:0,deliverableKits:0,deliverableArticles:0,incompleteKits:0,incompleteArticles:0};
  return {newKits:number_(r.NEW_KITS),newArticles:number_(r.NEW_ARTICLES),deliveredKits:number_(r.DELIVERED_KITS),deliveredArticles:number_(r.DELIVERED_ARTICLES),redirectedKits:number_(r.REDIRECTED_KITS),redirectedArticles:number_(r.REDIRECTED_ARTICLES),rtsKits:number_(r.RTS_KITS),rtsArticles:number_(r.RTS_ARTICLES),invalidMobileKits:number_(r.INVALID_MOBILE_KITS),invalidMobileArticles:number_(r.INVALID_MOBILE_ARTICLES),tornKits:number_(r.TORN_KITS),tornArticles:number_(r.TORN_ARTICLES),deliverableKits:number_(r.DELIVERABLE_KITS),deliverableArticles:number_(r.DELIVERABLE_ARTICLES),incompleteKits:number_(r.INCOMPLETE_KITS),incompleteArticles:number_(r.INCOMPLETE_ARTICLES)};
}
function submitPmvReport_(s,r){
  if(s.role!==CONFIG.ROLES.SPM)throw new Error('Only SPM users can submit daily reports.');
  const date=clean_(r.date)||today_(),o=getPmvOpeningBalance_(s,date);
  const cameK=number_(r.newKits),cameA=number_(r.newArticles),delK=number_(r.deliveredKits),delA=number_(r.deliveredArticles),redK=number_(r.redirectedKits),redA=number_(r.redirectedArticles),rtsK=number_(r.rtsKits),rtsA=number_(r.rtsArticles);
  const closeK=o.openingKits+cameK-delK-redK-rtsK,closeA=o.openingArticles+cameA-delA-redA-rtsA;
  if(closeK<0||closeA<0)throw new Error('Movement exceeds Opening + Came Today.');
  const classK=number_(r.invalidKits)+number_(r.tornKits)+number_(r.deliverableKits)+number_(r.incompleteKits),classA=number_(r.invalidArticles)+number_(r.tornArticles)+number_(r.deliverableArticles)+number_(r.incompleteArticles);
  if(classK!==closeK)throw new Error('Kits remaining classification must equal closing balance '+closeK+'.');
  if(classA!==closeA)throw new Error('Articles remaining classification must equal closing balance '+closeA+'.');
  const sh=getSheet_(CONFIG.SHEETS.DAILY),h=ensureHeaders_(sh,DAILY_HEADERS_());
  const row=[date,s.userId,s.officeName,s.officeCode,o.openingKits,o.openingArticles,cameK,cameA,delK,delA,redK,redA,rtsK,rtsA,number_(r.invalidKits),number_(r.invalidArticles),number_(r.tornKits),number_(r.tornArticles),number_(r.deliverableKits),number_(r.deliverableArticles),number_(r.incompleteKits),number_(r.incompleteArticles),closeK,closeA,now_()];
  const existing=findDailyRowNumber_(s.userId,date);
  if(existing)sh.getRange(existing,1,1,h.length).setValues([row]);else sh.appendRow(row);
  return {saved:true,date,closingPendingKits:closeK,closingPendingArticles:closeA};
}
function buildOfficeWise_(rows){
  const m={}; rows.forEach(r=>{const k=clean_(r.OFFICE_NAME)||clean_(r.OFFICE_CODE)||'UNKNOWN';if(!m[k])m[k]={officeName:clean_(r.OFFICE_NAME),officeCode:clean_(r.OFFICE_CODE),cameKits:0,cameArticles:0,deliveredKits:0,deliveredArticles:0,redirectedKits:0,redirectedArticles:0,rtsKits:0,rtsArticles:0,closingKits:0,closingArticles:0};const o=m[k];o.cameKits+=number_(r.NEW_KITS);o.cameArticles+=number_(r.NEW_ARTICLES);o.deliveredKits+=number_(r.DELIVERED_KITS);o.deliveredArticles+=number_(r.DELIVERED_ARTICLES);o.redirectedKits+=number_(r.REDIRECTED_KITS);o.redirectedArticles+=number_(r.REDIRECTED_ARTICLES);o.rtsKits+=number_(r.RTS_KITS);o.rtsArticles+=number_(r.RTS_ARTICLES);o.closingKits+=number_(r.CLOSING_KITS);o.closingArticles+=number_(r.CLOSING_ARTICLES);});return Object.values(m);
}
function getPendingSpms_(date){
  return readSheetObjects_(CONFIG.SHEETS.USERS).filter(u=>normalizeRole_(u.ROLE)===CONFIG.ROLES.SPM&&!/^(NO|FALSE|INACTIVE|0|DISABLED)$/i.test(clean_(u.ACTIVE))).filter(u=>!findDailyRecord_(clean_(u.USER_ID),date)).map(u=>({userId:clean_(u.USER_ID),officeName:clean_(u.OFFICE_NAME),officeCode:clean_(u.OFFICE_CODE)}));
}
function getAdminPmvDashboard_(s,date){
  const rows=readSheetObjects_(CONFIG.SHEETS.DAILY).filter(r=>dateOnly_(r.DATE)===date);
  return {date,rows,officeWise:buildOfficeWise_(rows),pendingSpms:getPendingSpms_(date)};
}

/* ---------- article status ---------- */
function canonicalStatus_(v){
  const s=upper_(v); if(!s)return 'Pending';
  if(/DELIVER/.test(s))return 'Delivered';
  if(/REDIRECT/.test(s))return 'Redirected';
  if(/RTS|RETURN|RETUR/.test(s))return 'Return';
  if(/TORN|WITHOUT.*(ADDRESS|PROPER|DETAIL)/.test(s))return 'Torn/Without Address';
  if(/INVALID.*(OTP|MOBILE|PHONE)|\bOTP\b/.test(s))return 'Invalid OTP';
  if(/PENDING|NOT.*DELIVER|NOT.*RECEIV/.test(s))return 'Pending';
  return clean_(v);
}
function articleStatusDate_(r){return dateOnly_(r.DATE||r.STATUS_DATE||r.STATUSDATE||r.UPDATED_DATE||r.UPDATED_AT);}
function articleStatusKeys_(r){
  const vals = [
    r.ARTICLE_KEY,r.ARTICLEKEY,r.BARCODE_ID,r.BARCODE,r.ARTICLE_ID,
    r.ARTICLE_NUMBER,r.ARTICLE_NO,r.TRACKING_NUMBER,r.TRACKING_NO,
    r.PMV_APPLICATION_NUMBER,r.PMV_APPLICATION_NO,r.PMV_APPLICATION,
    r.APPLICATION_NUMBER,r.APPLICATION_NO
  ];
  const out=[];
  vals.forEach(v=>{
    const s=clean_(v);
    if(!s)return;
    const u=upper_(s);
    if(!out.includes(u))out.push(u);
    const d=digits_(s);
    if(d && !out.includes(d))out.push(d);
  });
  return out;
}
function articleStatusKey_(r){
  const keys=articleStatusKeys_(r);
  return keys.length?keys[0]:'';
}
function buildArticleStatusMap_(rows,date){
  const map={};
  rows.forEach((r,rowIndex)=>{
    const rd=articleStatusDate_(r);
    if(rd && date && rd!==date)return;
    const keys=articleStatusKeys_(r);
    if(!keys.length)return;

    const rawStamp=clean_(r.UPDATED_AT||r.STATUS_UPDATED_AT||r.AUTHORISED_AT||'');
    const stamp=rawStamp || (rd||'') || String(rowIndex).padStart(10,'0');
    const item={
      presentStatus:clean_(r.PRESENT_STATUS||r.STATUS||r.ARTICLE_STATUS||r.CURRENT_STATUS||r.DELIVERY_STATUS),
      remarks:clean_(r.REMARKS||r.STATUS_REMARKS||r.REMARK||r.COMMENTS),
      spmId:clean_(r.UPDATED_BY||r.SPM_ID||r.USER_ID||r.UPDATED_BY_USER),
      officeName:clean_(r.OFFICE_NAME||r.OFFICE),
      updatedAt:rawStamp,
      reviewStatus:clean_(r.REVIEW_STATUS||r.AUTHORIZATION_STATUS||r.AUTHORISATION_STATUS||r.REVIEW),
      authorisedBy:clean_(r.AUTHORISED_BY||r.AUTHORIZED_BY),
      authorisedAt:clean_(r.AUTHORISED_AT||r.AUTHORIZED_AT),
      _stamp:stamp,
      _rowIndex:rowIndex
    };

    keys.forEach(k=>{
      const old=map[k];
      if(!old || item._stamp>old._stamp || (item._stamp===old._stamp && item._rowIndex>old._rowIndex)){
        map[k]=item;
      }
    });
  });
  return map;
}
function mergeArticle_(master,status){
  const r={...master};
  r.articleKey=articleKey_(master);r.barCodeId=clean_(articleField_(master,'BARCODE_ID'));r.pmvApplicationNumber=clean_(articleField_(master,'PMV_APPLICATION_NUMBER'));r.artisanName=clean_(articleField_(master,'ARTISAN_NAME'));r.mobileNumber=clean_(articleField_(master,'MOBILE_NUMBER'));r.address=clean_(articleField_(master,'ADDRESS'));r.circleName=clean_(articleField_(master,'CIRCLE_NAME'));r.divisionName=clean_(articleField_(master,'DIVISION_NAME'));r.pinCode=articlePin_(master);r.deliveryStaff=clean_(articleField_(master,'DELIVERY_STAFF'));
  r.presentStatus=canonicalStatus_(status&&status.presentStatus||articleField_(master,'PRESENT_STATUS')||'Pending');
  r.masterStatus=canonicalStatus_(articleField_(master,'PRESENT_STATUS')||'Pending');
  r.statusSource=status?'ARTICLE_STATUS':'ARTICLE_MASTER';
  r.remarks=status?status.remarks:clean_(articleField_(master,'REMARKS'));r.spmId=status?status.spmId:'';r.spmName=status?status.spmId:'';r.officeName=status?status.officeName:clean_(master.OFFICE_NAME||master.OFFICE);r.updatedAt=status?status.updatedAt:'';r.reviewStatus=status?status.reviewStatus:'';r.authorisedBy=status?status.authorisedBy:'';r.authorisedAt=status?status.authorisedAt:'';
  return r;
}
function countArticleStatuses_(rows){const c={Pending:0,Delivered:0,Redirected:0,Return:0,'Torn/Without Address':0,'Invalid OTP':0};rows.forEach(r=>{const s=canonicalStatus_(r.presentStatus);c[s]=(c[s]||0)+1;});return c;}

/* ---------- article retrieval: corrected ---------- */
function getSpmArticles_(session,date,search,limit){
  const master=readSheetObjects_(CONFIG.SHEETS.ARTICLE_MASTER);
  const status=readSheetObjects_(CONFIG.SHEETS.ARTICLE_STATUS,true);
  const statusMap=buildArticleStatusMap_(status,date);
  const isAdmin=session.role===CONFIG.ROLES.ADMIN||session.role===CONFIG.ROLES.DPS;
  const pins=getEffectivePins_(session);
  const diagnostics={masterRows:master.length,statusRows:status.length,assignedPins:pins,masterSheet:CONFIG.SHEETS.ARTICLE_MASTER};
  if(!master.length) throw new Error('ARTICLE_MASTER contains no data rows. '+JSON.stringify(diagnostics));
  if(!isAdmin&&!pins.length) throw new Error('No PIN codes are configured for this SPM. Update ASSIGNED_PINS/PIN_CODES in USER_MASTER or OFFICE_MASTER.');
  const articles=[];
  for(const row of master){
    const pin=articlePin_(row);
    if(!isAdmin&&!pins.includes(pin))continue;
    const key=articleKey_(row);
    if(!key)continue;
    const merged=mergeArticle_(row,statusMap[upper_(key)]||null);
    if(search&&!articleMatchesSearch_(merged,search))continue;
    articles.push(merged);
    if(limit>0&&articles.length>=limit)break;
  }
  return {date,articles,total:articles.length,counts:countArticleStatuses_(articles),assignedPins:pins,diagnostics};
}
function getAdminArticleStatus_(session,date,search,limit){
  const master=readSheetObjects_(CONFIG.SHEETS.ARTICLE_MASTER),status=readSheetObjects_(CONFIG.SHEETS.ARTICLE_STATUS,true),map=buildArticleStatusMap_(status,date),articles=[];
  for(const row of master){const key=articleKey_(row);if(!key)continue;const merged=mergeArticle_(row,map[upper_(key)]||null);if(search&&!articleMatchesSearch_(merged,search))continue;articles.push(merged);if(limit>0&&articles.length>=limit)break;}
  const matchedStatus=articles.filter(a=>a.statusSource==='ARTICLE_STATUS').length;
  return {
    date,articles,total:articles.length,counts:countArticleStatuses_(articles),
    diagnostics:{masterRows:master.length,statusRows:status.length,matchedStatusRows:matchedStatus}
  };
}
function findArticleByKey_(key){
  const wanted=new Set(articleStatusKeys_({ARTICLE_KEY:key}));
  const rows=readSheetObjects_(CONFIG.SHEETS.ARTICLE_MASTER);
  return rows.find(r=>articleStatusKeys_(r).some(k=>wanted.has(k)))||null;
}
function findArticleRowNumber_(key){
  const wanted=new Set(articleStatusKeys_({ARTICLE_KEY:key}));
  const sh=getSheet_(CONFIG.SHEETS.ARTICLE_MASTER),data=sh.getDataRange().getValues();
  if(data.length<2)return 0;
  const hs=data[0].map(normHeader_);
  for(let i=1;i<data.length;i++){
    const r={};for(let c=0;c<hs.length;c++)r[hs[c]]=data[i][c];
    if(articleStatusKeys_(r).some(k=>wanted.has(k)))return i+1;
  }
  return 0;
}
function findArticleStatusRow_(key,date){
  const wanted=new Set(articleStatusKeys_({ARTICLE_KEY:key}));
  const sh=getSheet_(CONFIG.SHEETS.ARTICLE_STATUS),data=sh.getDataRange().getValues();
  if(data.length<2)return 0;
  const hs=data[0].map(normHeader_);
  for(let i=data.length-1;i>=1;i--){
    const r={};for(let c=0;c<hs.length;c++)r[hs[c]]=data[i][c];
    const rd=articleStatusDate_(r);
    if(articleStatusKeys_(r).some(k=>wanted.has(k)) && (!rd||!date||rd===date))return i+1;
  }
  return 0;
}

/* ---------- status update and master authorisation ---------- */
function ARTICLE_STATUS_HEADERS_(){return ['DATE','ARTICLE_KEY','BARCODE_ID','PMV_APPLICATION_NUMBER','ARTISAN_NAME','MOBILE_NUMBER','ADDRESS','CIRCLE_NAME','DIVISION_NAME','PIN_CODE','DELIVERY_STAFF','PRESENT_STATUS','REMARKS','UPDATED_BY','OFFICE_NAME','UPDATED_AT','REVIEW_STATUS','AUTHORISED_BY','AUTHORISED_AT'];}
function updateArticleStatus_(s,r){
  if(s.role!==CONFIG.ROLES.SPM)throw new Error('Only SPM users can change article status.');
  const date=clean_(r.date)||today_(),key=clean_(r.articleKey||r.barCodeId||r.barcode||r.pmvApplicationNumber);if(!key)throw new Error('Article key/barcode is required.');
  const master=findArticleByKey_(key);if(!master)throw new Error('Article not found in ARTICLE_MASTER: '+key);
  const pin=articlePin_(master),pins=getEffectivePins_(s);if(!pins.includes(pin))throw new Error('You are not authorised to update this article. Article PIN '+pin+' is outside your assigned PIN codes.');
  const status=canonicalStatus_(r.status||r.presentStatus),remarks=clean_(r.remarks),sh=getSheet_(CONFIG.SHEETS.ARTICLE_STATUS);ensureHeaders_(sh,ARTICLE_STATUS_HEADERS_());
  const values=[date,articleKey_(master),articleField_(master,'BARCODE_ID'),articleField_(master,'PMV_APPLICATION_NUMBER'),articleField_(master,'ARTISAN_NAME'),articleField_(master,'MOBILE_NUMBER'),articleField_(master,'ADDRESS'),articleField_(master,'CIRCLE_NAME'),articleField_(master,'DIVISION_NAME'),pin,articleField_(master,'DELIVERY_STAFF'),status,remarks,s.userId,s.officeName,now_(),'PENDING_REVIEW','',''];
  const row=findArticleStatusRow_(key,date);if(row)sh.getRange(row,1,1,values.length).setValues([values]);else sh.appendRow(values);
  return {saved:true,articleKey:articleKey_(master),status,date,reviewStatus:'PENDING_REVIEW'};
}
function pushArticleStatusToMaster_(s,r){
  requireAdmin_(s);const date=clean_(r.date)||today_();let keys=r.articleKeys||r.keys||[];if(!Array.isArray(keys))keys=[keys];keys=keys.map(clean_).filter(Boolean);if(!keys.length)throw new Error('No article records selected.');
  const master=getSheet_(CONFIG.SHEETS.ARTICLE_MASTER),statusSheet=getSheet_(CONFIG.SHEETS.ARTICLE_STATUS),statusRows=readSheetObjects_(CONFIG.SHEETS.ARTICLE_STATUS,true),map=buildArticleStatusMap_(statusRows,date),mh=headerMap_(master.getRange(1,1,1,master.getLastColumn()).getValues()[0]);
  const sc=firstHeader_(mh,['PRESENT_STATUS','STATUS','ARTICLE_STATUS','CURRENT_STATUS']),rc=firstHeader_(mh,['REMARKS','STATUS_REMARKS','REMARK']),ub=firstHeader_(mh,['STATUS_UPDATED_BY','UPDATED_BY']),ua=firstHeader_(mh,['STATUS_UPDATED_AT','UPDATED_AT']);
  let pushed=0,skipped=0;
  for(const key of keys){const st=(map[upper_(key)]||map[digits_(key)]);if(!st||!st.presentStatus){skipped++;continue;}if(upper_(st.reviewStatus)!=='PENDING_REVIEW'&&upper_(st.reviewStatus)!=='AUTHORISED'&&st.reviewStatus!==''){skipped++;continue;}const row=findArticleRowNumber_(key);if(!row){skipped++;continue;}
    const sv=canonicalStatus_(st.presentStatus);if(sc!==-1)master.getRange(row,sc+1).setValue(sv);if(rc!==-1)master.getRange(row,rc+1).setValue(st.remarks||'');if(ub!==-1)master.getRange(row,ub+1).setValue(s.userId);if(ua!==-1)master.getRange(row,ua+1).setValue(now_());
    const sr=findArticleStatusRow_(key,date);if(sr){const sh=headerMap_(statusSheet.getRange(1,1,1,statusSheet.getLastColumn()).getValues()[0]);const rr=firstHeader_(sh,['REVIEW_STATUS','AUTHORIZATION_STATUS','AUTHORISATION_STATUS']);const ab=firstHeader_(sh,['AUTHORISED_BY','AUTHORIZED_BY']);const at=firstHeader_(sh,['AUTHORISED_AT','AUTHORIZED_AT']);if(rr!==-1)statusSheet.getRange(sr,rr+1).setValue('AUTHORISED');if(ab!==-1)statusSheet.getRange(sr,ab+1).setValue(s.userId);if(at!==-1)statusSheet.getRange(sr,at+1).setValue(now_());}
    writeAudit_('MASTER_PUSH',s,key,sv,date);pushed++;
  }
  return {pushed,skipped,date};
}
function updateArticleMaster_(s,r){
  requireAdmin_(s);const key=clean_(r.articleKey||r.barCodeId);if(!key)throw new Error('Article key is required.');const row=findArticleRowNumber_(key);if(!row)throw new Error('Article not found in ARTICLE_MASTER.');
  const sh=getSheet_(CONFIG.SHEETS.ARTICLE_MASTER),h=headerMap_(sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]),fields=r.fields||r;
  Object.keys(fields).forEach(k=>{const c=firstHeader_(h,[k]);if(c!==-1&&!['ARTICLEKEY','BARCODEID'].includes(normHeader_(k).replace(/_/g,'')))sh.getRange(row,c+1).setValue(fields[k]);});
  writeAudit_('DIRECT_MASTER_UPDATE',s,key,'',today_());return {updated:true,articleKey:key};
}
function writeAudit_(action,s,key,status,date){
  let sh=getSS_().getSheetByName(CONFIG.SHEETS.AUDIT);if(!sh){sh=getSS_().insertSheet(CONFIG.SHEETS.AUDIT);sh.appendRow(['TIMESTAMP','ACTION','USER_ID','ROLE','OFFICE_NAME','ARTICLE_KEY','STATUS','DATE']);}
  sh.appendRow([now_(),action,s.userId,s.role,s.officeName,key,status,date]);
}

/* ---------- diagnostics ---------- */
function diagnoseArticleMaster_(session){
  requireRole_(session,[CONFIG.ROLES.SPM,CONFIG.ROLES.DPS,CONFIG.ROLES.ADMIN]);
  const sh=getSheet_(CONFIG.SHEETS.ARTICLE_MASTER),data=sh.getDataRange().getValues(),headers=data.length?data[0]:[],rows=data.length>1?data.length-1:0,pins=getEffectivePins_(session),sample=[];
  const normalized=headers.map(normHeader_);
  for(let i=1;i<Math.min(data.length,6);i++){const r={};for(let c=0;c<normalized.length;c++)r[normalized[c]]=data[i][c];sample.push({articleKey:articleKey_(r),pin:articlePin_(r),barcode:articleField_(r,'BARCODE_ID'),pmv:articleField_(r,'PMV_APPLICATION_NUMBER'),artisan:articleField_(r,'ARTISAN_NAME')});}
  const pinCounts={};let matching=0,missingKey=0,missingPin=0;
  for(let i=1;i<data.length;i++){const r={};for(let c=0;c<normalized.length;c++)r[normalized[c]]=data[i][c];const p=articlePin_(r),k=articleKey_(r);if(p)pinCounts[p]=(pinCounts[p]||0)+1;if(!k)missingKey++;if(!p)missingPin++;if(p&&pins.includes(p))matching++;}
  return {sheet:CONFIG.SHEETS.ARTICLE_MASTER,totalRows:rows,headers,normalizedHeaders:normalized,detected:{articleKey:'dynamic aliases',pin:'dynamic aliases',barcode:articleField_(sample[0]||{},'BARCODE_ID')},session:{userId:session.userId,role:session.role,officeName:session.officeName,assignedPins:pins},matchingPinRows:matching,missingKeyRows:missingKey,missingPinRows:missingPin,pinCounts,sample};
}
function diagnoseArticleStatus_(session,date){
  requireRole_(session,[CONFIG.ROLES.SPM,CONFIG.ROLES.DPS,CONFIG.ROLES.ADMIN]);
  const rows=readSheetObjects_(CONFIG.SHEETS.ARTICLE_STATUS,true),map=buildArticleStatusMap_(rows,date);
  return {sheet:CONFIG.SHEETS.ARTICLE_STATUS,totalRows:rows.length,date,statusEntriesForDate:Object.keys(map).length,sample:Object.keys(map).slice(0,10).map(k=>({articleKey:k,status:map[k].presentStatus,review:map[k].reviewStatus}))};
}
function testArticleMaster(){const rows=readSheetObjects_(CONFIG.SHEETS.ARTICLE_MASTER);return {success:true,totalArticles:rows.length,sample:rows.slice(0,5).map(r=>({articleKey:articleKey_(r),barcode:articleField_(r,'BARCODE_ID'),pin:articlePin_(r),artisan:articleField_(r,'ARTISAN_NAME')}))};}
function diagnoseArticleSync_(date,search){
  const master=readSheetObjects_(CONFIG.SHEETS.ARTICLE_MASTER);
  const status=readSheetObjects_(CONFIG.SHEETS.ARTICLE_STATUS,true);
  const map=buildArticleStatusMap_(status,date||today_());
  const q=clean_(search).toLowerCase();
  const rows=[];
  master.forEach(r=>{
    const merged=mergeArticle_(r,map[upper_(articleKey_(r))]||map[digits_(articleKey_(r))]||null);
    if(q && !articleMatchesSearch_(merged,q))return;
    rows.push({
      articleKey:merged.articleKey,
      barcode:merged.barCodeId,
      pmvApplication:merged.pmvApplicationNumber,
      artisan:merged.artisanName,
      pin:merged.pinCode,
      presentStatus:merged.presentStatus,
      masterStatus:merged.masterStatus,
      statusSource:merged.statusSource,
      reviewStatus:merged.reviewStatus,
      updatedBy:merged.spmId,
      updatedAt:merged.updatedAt
    });
  });
  return {date:date||today_(),masterRows:master.length,statusRows:status.length,matchedStatusRows:rows.filter(r=>r.statusSource==='ARTICLE_STATUS').length,rows:rows.slice(0,100)};
}
function testArticleStatus(){const rows=readSheetObjects_(CONFIG.SHEETS.ARTICLE_STATUS,true);return {success:true,total:rows.length,sample:rows.slice(0,5)};}
function setupPMVSheets(){
  const ss=getSS_(),defs={DAILY_DATA:DAILY_HEADERS_(),ARTICLE_STATUS:ARTICLE_STATUS_HEADERS_(),SESSIONS:['TOKEN','USER_ID','ROLE','OFFICE_NAME','OFFICE_CODE','ASSIGNED_PINS','CREATED_AT','LAST_ACTIVE'],ARTICLE_AUDIT:['TIMESTAMP','ACTION','USER_ID','ROLE','OFFICE_NAME','ARTICLE_KEY','STATUS','DATE']};
  Object.keys(defs).forEach(n=>{let sh=ss.getSheetByName(n);if(!sh)sh=ss.insertSheet(n);ensureHeaders_(sh,defs[n]);});
  return {success:true,message:'PMV sheets initialised successfully.'};
}

/* ---------- HTTP ---------- */
function doGet(e){
  try{
    const p=e&&e.parameter?e.parameter:{},a=clean_(p.action);
    if(!a)return json_({status:'OK',service:'PMV Toolkit Tracker',version:'V12 Corrected PIN + Article Master Fix',date:today_()});
    if(a==='login')return handleLogin_(clean_(p.userId),clean_(p.mobile));
    const s=parseSession_(p.session);authenticate_(s);
    switch(a){
      case 'logout': return json_(logout_(s));
      case 'getPmvOpeningBalance': return json_(getPmvOpeningBalance_(s,clean_(p.date)||today_()));
      case 'getOwnPmvDashboard': return json_(getOwnPmvDashboard_(s,clean_(p.date)||today_()));
      case 'getAdminPmvDashboard': requireAdmin_(s); return json_(getAdminPmvDashboard_(s,clean_(p.date)||today_()));
      case 'submitPmvReport': return json_(submitPmvReport_(s,JSON.parse(p.record||'{}')));
      case 'getSpmArticles': requireRole_(s,[CONFIG.ROLES.SPM,CONFIG.ROLES.DPS,CONFIG.ROLES.ADMIN]); return json_(getSpmArticles_(s,clean_(p.date)||today_(),clean_(p.search||p.q),number_(p.limit)||10000));
      case 'getAdminArticleStatus': requireAdmin_(s); return json_(getAdminArticleStatus_(s,clean_(p.date)||today_(),clean_(p.search||p.q),number_(p.limit)||10000));
      case 'updateArticleStatus': return json_(updateArticleStatus_(s,JSON.parse(p.record||'{}')));
      case 'pushArticleStatusToMaster': requireAdmin_(s); return json_(pushArticleStatusToMaster_(s,JSON.parse(p.record||'{}')));
      case 'updateArticleMaster': requireAdmin_(s); return json_(updateArticleMaster_(s,JSON.parse(p.record||'{}')));
      case 'diagnoseArticleMaster': return json_(diagnoseArticleMaster_(s));
      case 'diagnosePinAccess': return json_(diagnosePinAccess_(s));
      case 'diagnoseArticleStatus': return json_(diagnoseArticleStatus_(s,clean_(p.date)||today_()));
      default: throw new Error('Unknown action: '+a);
    }
  }catch(err){return error_(err.message||err);}
}
function doPost(e){
  try{
    const b=parseBody_(e),a=clean_(b.action);if(a==='login')return handleLogin_(clean_(b.userId),clean_(b.mobile));
    const s=b.session||b.sessionData;authenticate_(s);
    switch(a){
      case 'logout':return json_(logout_(s));
      case 'submitPmvReport':return json_(submitPmvReport_(s,b.record||{}));
      case 'updateArticleStatus':return json_(updateArticleStatus_(s,b.record||{}));
      case 'pushArticleStatusToMaster':requireAdmin_(s);return json_(pushArticleStatusToMaster_(s,b.record||{}));
      case 'updateArticleMaster':requireAdmin_(s);return json_(updateArticleMaster_(s,b.record||{}));
      case 'diagnoseArticleMaster':return json_(diagnoseArticleMaster_(s));
      case 'diagnosePinAccess':return json_(diagnosePinAccess_(s));
      case 'diagnoseArticleStatus':return json_(diagnoseArticleStatus_(s,clean_(b.date)||today_()));
      default:throw new Error('Unknown action: '+a);
    }
  }catch(err){return error_(err.message||err);}
}
/**
 * PMV Toolkit Tracker V15 - Article status reliability fixes
 *
 * Add this file to the SAME Apps Script project as Code.gs.
 * File name should sort after Code.gs (for example ZZZ_V15_ArticleStatusFixes.gs).
 *
 * Fixes:
 * 1. Robust barcode/PMV/article-number matching.
 * 2. Safe numeric getRange() arguments; eliminates getRange(..., null).
 * 3. ARTICLE_STATUS is the live/pending status source.
 * 4. ARTICLE_MASTER is changed only after Admin/DPS authorisation.
 * 5. SPM updates are written even when an older master identifier format differs.
 */

function v15Text_(v){ return String(v == null ? '' : v).trim(); }
function v15Norm_(v){ return v15Text_(v).toUpperCase().replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim(); }
function v15Key_(v){ return v15Norm_(v).replace(/[\u200B-\u200D\uFEFF]/g,''); }

function v15KeyVariants_(v){
  const s=v15Key_(v), out=[];
  if(s) out.push(s);
  const compact=s.replace(/[^A-Z0-9]/g,'');
  if(compact && !out.includes(compact)) out.push(compact);
  const digits=s.replace(/\D/g,'');
  if(digits && !out.includes(digits)) out.push(digits);
  return out;
}

function v15RowKeys_(r){
  const vals=[
    articleField_(r,'ARTICLE_KEY'),
    articleField_(r,'BARCODE_ID'),
    articleField_(r,'PMV_APPLICATION_NUMBER'),
    r.ARTICLE_NUMBER,r.ARTICLE_NO,r.ARTICLE_ID,r.TRACKING_NUMBER,r.TRACKING_NO,
    r.BARCODE,r.BAR_CODE_ID,r.PMV_APPLICATION,r.APPLICATION_NUMBER,r.APPLICATION_NO
  ];
  const out=[];
  vals.forEach(v=>v15KeyVariants_(v).forEach(k=>{if(k&&!out.includes(k))out.push(k);}));
  return out;
}

function v15FindMaster_(key){
  const wanted=new Set(v15KeyVariants_(key));
  if(!wanted.size) return null;
  return readSheetObjects_(CONFIG.SHEETS.ARTICLE_MASTER)
    .find(r=>v15RowKeys_(r).some(k=>wanted.has(k))) || null;
}

function v15FindMasterRow_(key){
  const wanted=new Set(v15KeyVariants_(key));
  if(!wanted.size) return 0;
  const sh=getSheet_(CONFIG.SHEETS.ARTICLE_MASTER);
  const data=sh.getDataRange().getValues();
  if(data.length<2) return 0;
  const headers=data[0].map(normHeader_);
  for(let i=1;i<data.length;i++){
    const row={};
    for(let c=0;c<headers.length;c++) row[headers[c]]=data[i][c];
    if(v15RowKeys_(row).some(k=>wanted.has(k))) return i+1;
  }
  return 0;
}

function v15FindStatusRow_(key,date){
  const wanted=new Set(v15KeyVariants_(key));
  const sh=getSheet_(CONFIG.SHEETS.ARTICLE_STATUS);
  const data=sh.getDataRange().getValues();
  if(data.length<2) return 0;
  const headers=data[0].map(normHeader_);
  for(let i=data.length-1;i>=1;i--){
    const row={};
    for(let c=0;c<headers.length;c++) row[headers[c]]=data[i][c];
    const rd=articleStatusDate_(row);
    if(v15RowKeys_(row).some(k=>wanted.has(k)) && (!date || !rd || rd===date)) return i+1;
  }
  return 0;
}

function v15StatusMap_(date){
  const rows=readSheetObjects_(CONFIG.SHEETS.ARTICLE_STATUS,true), map={};
  rows.forEach((r,idx)=>{
    const rd=articleStatusDate_(r);
    if(date && rd && rd!==date) return;
    const keys=v15RowKeys_(r); if(!keys.length) return;
    const stamp=v15Text_(r.UPDATED_AT||r.STATUS_UPDATED_AT||r.AUTHORISED_AT)||String(idx).padStart(10,'0');
    const item={
      presentStatus:v15Text_(r.PRESENT_STATUS||r.STATUS||r.ARTICLE_STATUS||r.CURRENT_STATUS||r.DELIVERY_STATUS),
      remarks:v15Text_(r.REMARKS||r.STATUS_REMARKS||r.REMARK||r.COMMENTS),
      spmId:v15Text_(r.UPDATED_BY||r.SPM_ID||r.USER_ID||r.UPDATED_BY_USER),
      officeName:v15Text_(r.OFFICE_NAME||r.OFFICE),
      updatedAt:v15Text_(r.UPDATED_AT||r.STATUS_UPDATED_AT),
      reviewStatus:v15Text_(r.REVIEW_STATUS||r.AUTHORIZATION_STATUS||r.AUTHORISATION_STATUS||r.REVIEW),
      authorisedBy:v15Text_(r.AUTHORISED_BY||r.AUTHORIZED_BY),
      authorisedAt:v15Text_(r.AUTHORISED_AT||r.AUTHORIZED_AT),
      _stamp:stamp,_row:idx
    };
    keys.forEach(k=>{
      const old=map[k];
      if(!old || item._stamp>old._stamp || (item._stamp===old._stamp && item._row>old._row)) map[k]=item;
    });
  });
  return map;
}

function v15SafeRange_(sh,row,col,numRows,numCols){
  row=Number(row); col=Number(col); numRows=Number(numRows); numCols=Number(numCols);
  if(!sh || ![row,col,numRows,numCols].every(Number.isFinite) ||
     row<1 || col<1 || numRows<1 || numCols<1){
    throw new Error('Invalid spreadsheet range parameters.');
  }
  return sh.getRange(row,col,numRows,numCols);
}

function v15MasterView_(master,status){
  const r=mergeArticle_(master,status||null);
  r.articleKey=articleKey_(master);
  r.barCodeId=v15Text_(articleField_(master,'BARCODE_ID'));
  r.pmvApplicationNumber=v15Text_(articleField_(master,'PMV_APPLICATION_NUMBER'));
  r.artisanName=v15Text_(articleField_(master,'ARTISAN_NAME'));
  r.mobileNumber=v15Text_(articleField_(master,'MOBILE_NUMBER'));
  r.address=v15Text_(articleField_(master,'ADDRESS'));
  r.circleName=v15Text_(articleField_(master,'CIRCLE_NAME'));
  r.divisionName=v15Text_(articleField_(master,'DIVISION_NAME'));
  r.pinCode=articlePin_(master);
  r.deliveryStaff=v15Text_(articleField_(master,'DELIVERY_STAFF'));
  r.presentStatus=canonicalStatus_(status&&status.presentStatus || articleField_(master,'PRESENT_STATUS') || 'Pending');
  r.masterStatus=canonicalStatus_(articleField_(master,'PRESENT_STATUS') || 'Pending');
  r.statusSource=status?'ARTICLE_STATUS':'ARTICLE_MASTER';
  r.remarks=status ? status.remarks : v15Text_(articleField_(master,'REMARKS'));
  r.spmId=status ? status.spmId : '';
  r.spmName=status ? status.spmId : '';
  r.officeName=status ? status.officeName : v15Text_(master.OFFICE_NAME||master.OFFICE);
  r.updatedAt=status ? status.updatedAt : '';
  r.reviewStatus=status ? status.reviewStatus : '';
  r.authorisedBy=status ? status.authorisedBy : '';
  r.authorisedAt=status ? status.authorisedAt : '';
  return r;
}

function getSpmArticles_(s,date,search,limit){
  authenticate_(s);
  if(![CONFIG.ROLES.SPM,CONFIG.ROLES.ADMIN,CONFIG.ROLES.DPS].includes(s.role))
    throw new Error('Article access is not authorised.');
  const master=readSheetObjects_(CONFIG.SHEETS.ARTICLE_MASTER);
  const map=v15StatusMap_(date);
  const isAdmin=s.role===CONFIG.ROLES.ADMIN||s.role===CONFIG.ROLES.DPS;
  const pins=getEffectivePins_(s);
  if(!master.length) throw new Error('ARTICLE_MASTER contains no data rows.');
  if(!isAdmin && !pins.length) throw new Error('No PIN codes are configured for this SPM.');

  const out=[];
  const max=Number(limit)>0?Number(limit):10000;
  for(const row of master){
    const pin=articlePin_(row);
    if(!isAdmin && !pins.includes(pin)) continue;
    if(!articleKey_(row)) continue;
    let st=null;
    for(const k of v15RowKeys_(row)){ if(map[k]){st=map[k];break;} }
    const item=v15MasterView_(row,st);
    if(search && !articleMatchesSearch_(item,search)) continue;
    out.push(item);
    if(out.length>=max) break;
  }
  return {
    date,officeName:s.officeName,assignedPins:pins,articles:out,
    total:out.length,count:out.length,counts:countArticleStatuses_(out),
    diagnostics:{masterRows:master.length,statusRows:readSheetObjects_(CONFIG.SHEETS.ARTICLE_STATUS,true).length}
  };
}

function getAdminArticleStatus_(s,date,search,limit){
  requireAdmin_(s);
  const master=readSheetObjects_(CONFIG.SHEETS.ARTICLE_MASTER),map=v15StatusMap_(date),out=[];
  const max=Number(limit)>0?Number(limit):10000;
  for(const row of master){
    if(!articleKey_(row)) continue;
    let st=null;
    for(const k of v15RowKeys_(row)){if(map[k]){st=map[k];break;}}
    const item=v15MasterView_(row,st);
    if(search && !articleMatchesSearch_(item,search)) continue;
    out.push(item);
    if(out.length>=max) break;
  }
  const statusRows=readSheetObjects_(CONFIG.SHEETS.ARTICLE_STATUS,true);
  return {
    date,articles:out,total:out.length,count:out.length,
    counts:countArticleStatuses_(out),
    diagnostics:{masterRows:master.length,statusRows:statusRows.length,
      matchedStatusRows:out.filter(x=>x.statusSource==='ARTICLE_STATUS').length}
  };
}

function updateArticleStatus_(s,r){
  authenticate_(s);
  if(s.role!==CONFIG.ROLES.SPM) throw new Error('Only SPM users can change article status.');
  r=r||{};
  const date=clean_(r.date)||today_();
  const key=clean_(r.articleKey||r.barCodeId||r.barcode||r.pmvApplicationNumber||r.applicationNumber);
  if(!key) throw new Error('Article key/barcode is required.');

  const master=v15FindMaster_(key);
  if(!master) throw new Error('Article not found in ARTICLE_MASTER: '+key);

  const pin=articlePin_(master),pins=getEffectivePins_(s);
  if(!pins.includes(pin))
    throw new Error('You are not authorised to update this article. Article PIN '+pin+' is outside your assigned PIN codes.');

  const status=canonicalStatus_(r.status||r.presentStatus),remarks=clean_(r.remarks);
  const sh=getSheet_(CONFIG.SHEETS.ARTICLE_STATUS);
  const required=ARTICLE_STATUS_HEADERS_();
  const h=ensureHeaders_(sh,required);

  const values=[
    date,articleKey_(master),articleField_(master,'BARCODE_ID'),
    articleField_(master,'PMV_APPLICATION_NUMBER'),articleField_(master,'ARTISAN_NAME'),
    articleField_(master,'MOBILE_NUMBER'),articleField_(master,'ADDRESS'),
    articleField_(master,'CIRCLE_NAME'),articleField_(master,'DIVISION_NAME'),
    pin,articleField_(master,'DELIVERY_STAFF'),status,remarks,s.userId,s.officeName,
    now_(),'PENDING_REVIEW','',''
  ];

  const width=Math.max(Number(h.length)||0,values.length);
  while(values.length<width) values.push('');

  const row=v15FindStatusRow_(key,date);
  if(row) v15SafeRange_(sh,row,1,1,values.length).setValues([values]);
  else v15SafeRange_(sh,sh.getLastRow()+1,1,1,values.length).setValues([values]);

  writeAudit_('ARTICLE_STATUS_UPDATE',s,key,status,date);
  return {saved:true,articleKey:articleKey_(master),status,date,reviewStatus:'PENDING_REVIEW'};
}

function pushArticleStatusToMaster_(s,r){
  requireAdmin_(s); r=r||{};
  const date=clean_(r.date)||today_();
  let keys=r.articleKeys||r.keys||[];
  if(!Array.isArray(keys)) keys=[keys];
  keys=keys.map(clean_).filter(Boolean);
  if(!keys.length) throw new Error('No article records selected.');

  const master=getSheet_(CONFIG.SHEETS.ARTICLE_MASTER);
  const statusSheet=getSheet_(CONFIG.SHEETS.ARTICLE_STATUS);
  const map=v15StatusMap_(date);
  const last=Number(master.getLastColumn());
  if(!Number.isFinite(last)||last<1) throw new Error('ARTICLE_MASTER has no columns.');

  const mh=headerMap_(master.getRange(1,1,1,last).getValues()[0]);
  const sc=firstHeader_(mh,['PRESENT_STATUS','STATUS','ARTICLE_STATUS','CURRENT_STATUS','TOOLKIT_DELIVERY_STATUS']);
  const rc=firstHeader_(mh,['REMARKS','STATUS_REMARKS','REMARK']);
  const ub=firstHeader_(mh,['STATUS_UPDATED_BY','UPDATED_BY']);
  const ua=firstHeader_(mh,['STATUS_UPDATED_AT','UPDATED_AT']);
  if(sc===-1) throw new Error('ARTICLE_MASTER has no status column. Add PRESENT_STATUS or TOOLKIT_DELIVERY_STATUS.');

  let pushed=0,skipped=0;
  for(const key of keys){
    let st=null;
    for(const k of v15KeyVariants_(key)){if(map[k]){st=map[k];break;}}
    if(!st||!st.presentStatus){skipped++;continue;}

    const review=v15Norm_(st.reviewStatus);
    if(review && review!=='PENDING_REVIEW' && review!=='AUTHORISED'){skipped++;continue;}

    const row=v15FindMasterRow_(key);
    if(!row){skipped++;continue;}

    const sv=canonicalStatus_(st.presentStatus);
    master.getRange(row,sc+1).setValue(sv);
    if(rc!==-1) master.getRange(row,rc+1).setValue(st.remarks||'');
    if(ub!==-1) master.getRange(row,ub+1).setValue(s.userId);
    if(ua!==-1) master.getRange(row,ua+1).setValue(now_());

    const sr=v15FindStatusRow_(key,date);
    if(sr){
      const sh=headerMap_(statusSheet.getRange(1,1,1,statusSheet.getLastColumn()).getValues()[0]);
      const rr=firstHeader_(sh,['REVIEW_STATUS','AUTHORIZATION_STATUS','AUTHORISATION_STATUS']);
      const ab=firstHeader_(sh,['AUTHORISED_BY','AUTHORIZED_BY']);
      const at=firstHeader_(sh,['AUTHORISED_AT','AUTHORIZED_AT']);
      if(rr!==-1) statusSheet.getRange(sr,rr+1).setValue('AUTHORISED');
      if(ab!==-1) statusSheet.getRange(sr,ab+1).setValue(s.userId);
      if(at!==-1) statusSheet.getRange(sr,at+1).setValue(now_());
    }
    writeAudit_('MASTER_PUSH',s,key,sv,date);
    pushed++;
  }
  return {pushed,skipped,date};
}

function updateArticleMaster_(s,r){
  requireAdmin_(s); r=r||{};
  const key=clean_(r.articleKey||r.barCodeId||r.pmvApplicationNumber);
  if(!key) throw new Error('Article key is required.');
  const row=v15FindMasterRow_(key);
  if(!row) throw new Error('Article not found in ARTICLE_MASTER: '+key);

  const sh=getSheet_(CONFIG.SHEETS.ARTICLE_MASTER);
  const last=Number(sh.getLastColumn());
  if(!Number.isFinite(last)||last<1) throw new Error('ARTICLE_MASTER has no columns.');

  const h=headerMap_(sh.getRange(1,1,1,last).getValues()[0]),fields=r.fields||r;
  Object.keys(fields).forEach(k=>{
    const c=firstHeader_(h,[k]);
    if(c!==-1 && !['ARTICLEKEY','BARCODEID'].includes(normHeader_(k).replace(/_/g,'')))
      sh.getRange(row,c+1).setValue(fields[k]);
  });
  writeAudit_('DIRECT_MASTER_UPDATE',s,key,'',today_());
  return {updated:true,articleKey:key};
}

function diagnoseV15Article_(key){
  const master=v15FindMaster_(key);
  return {
    query:key,found:!!master,masterRow:v15FindMasterRow_(key),
    statusRow:v15FindStatusRow_(key,today_()),master:master||null
  };
}
/*
 PMV TOOLKIT TRACKER V16 - SESSION RELIABILITY FIX
 Add this file to the SAME Google Apps Script project as Code.gs.
 Name: ZZZ_V16_SessionFix.gs

 Why:
 - V15 sends a JSON session object, but older deployments may only read one
   representation of the session.
 - V16 sends both JSON session + scalar token/userId.
 - These overrides accept either representation and refresh LAST_ACTIVE.
 - Daily report/article functions remain unchanged.
*/

function v16SessionObject_(s){
  if(!s) return null;
  if(typeof s==='string'){
    try{s=JSON.parse(s)}catch(_){return null}
  }
  if(s.session) return v16SessionObject_(s.session);
  if(s.sessionData) return v16SessionObject_(s.sessionData);
  if(!s.token && s.TOKEN)s.token=s.TOKEN;
  if(!s.userId && s.USER_ID)s.userId=s.USER_ID;
  return (s.token&&s.userId)?s:null;
}

function v16Authenticate_(s){
  s=v16SessionObject_(s);
  if(!s||!clean_(s.token)||!clean_(s.userId))
    throw new Error('Not authenticated. Please sign in again.');

  const sh=getSheet_(CONFIG.SHEETS.SESSIONS);
  const data=sh.getDataRange().getValues();
  if(data.length<2)throw new Error('Invalid session. Please sign in again.');

  const h=headerMap_(data[0]);
  const tokenCol=firstHeader_(h,['TOKEN']);
  const uidCol=firstHeader_(h,['USER_ID']);
  const createdCol=firstHeader_(h,['CREATED_AT']);
  const activeCol=firstHeader_(h,['LAST_ACTIVE']);

  if(tokenCol===-1||uidCol===-1)
    throw new Error('SESSIONS sheet is missing TOKEN or USER_ID headers.');

  let foundRow=0,foundUid='';
  for(let i=1;i<data.length;i++){
    if(clean_(data[i][tokenCol])===clean_(s.token)){
      foundRow=i+1;
      foundUid=clean_(data[i][uidCol]);
      break;
    }
  }
  if(!foundRow)throw new Error('Invalid session. Please sign in again.');

  if(foundUid && upper_(foundUid)!==upper_(s.userId))
    throw new Error('Invalid session. Please sign in again.');

  if(createdCol!==-1){
    const created=new Date(data[foundRow-1][createdCol]).getTime();
    if(!isNaN(created)&&Date.now()-created>CONFIG.SESSION_DAYS*86400000)
      throw new Error('Session expired. Please sign in again.');
  }

  const u=findUser_(foundUid||s.userId,'');
  if(!u||!u.active)throw new Error('Account is inactive.');

  s.userId=u.userId;
  s.role=u.role;
  s.officeName=u.officeName;
  s.officeCode=u.officeCode;
  s.assignedPins=normalizePins_(u.assignedPins);
  if(!s.assignedPins.length)s.assignedPins=getEffectivePins_(s);

  if(activeCol!==-1){
    try{sh.getRange(foundRow,activeCol+1).setValue(new Date())}catch(_){}
  }
  return s;
}

/* Replace the public HTTP handlers so both session formats are accepted. */
function doGet(e){
  try{
    const p=e&&e.parameter?e.parameter:{},a=clean_(p.action);
    if(!a)return json_({
      status:'OK',service:'PMV Toolkit Tracker',
      version:'V16 Session Reliability Fix',date:today_()
    });

    if(a==='login')return handleLogin_(clean_(p.userId),clean_(p.mobile));

    const supplied=p.session||p.sessionData||{
      token:clean_(p.token),
      userId:clean_(p.userId)
    };
    const s=v16Authenticate_(supplied);

    switch(a){
      case 'logout':return json_(logout_(s));
      case 'getPmvOpeningBalance':return json_(getPmvOpeningBalance_(s,clean_(p.date)||today_()));
      case 'getOwnPmvDashboard':return json_(getOwnPmvDashboard_(s,clean_(p.date)||today_()));
      case 'getAdminPmvDashboard':requireAdmin_(s);return json_(getAdminPmvDashboard_(s,clean_(p.date)||today_()));
      case 'submitPmvReport':return json_(submitPmvReport_(s,JSON.parse(p.record||'{}')));
      case 'getSpmArticles':return json_(getSpmArticles_(s,clean_(p.date)||today_(),clean_(p.search||p.q),number_(p.limit)||10000));
      case 'getAdminArticleStatus':return json_(getAdminArticleStatus_(s,clean_(p.date)||today_(),clean_(p.search||p.q),number_(p.limit)||10000));
      case 'updateArticleStatus':return json_(updateArticleStatus_(s,JSON.parse(p.record||'{}')));
      case 'pushArticleStatusToMaster':return json_(pushArticleStatusToMaster_(s,JSON.parse(p.record||'{}')));
      case 'updateArticleMaster':return json_(updateArticleMaster_(s,JSON.parse(p.record||'{}')));
      case 'diagnoseArticleMaster':return json_(diagnoseArticleMaster_(s));
      case 'diagnosePinAccess':return json_(diagnosePinAccess_(s));
      case 'diagnoseArticleStatus':return json_(diagnoseArticleStatus_(s,clean_(p.date)||today_()));
      default:throw new Error('Unknown action: '+a);
    }
  }catch(err){return error_(err.message||err);}
}

function doPost(e){
  try{
    const b=parseBody_(e),a=clean_(b.action);
    if(a==='login')return handleLogin_(clean_(b.userId),clean_(b.mobile));

    const s=v16Authenticate_(b.session||b.sessionData||{
      token:clean_(b.token),userId:clean_(b.userId)
    });

    switch(a){
      case 'logout':return json_(logout_(s));
      case 'submitPmvReport':return json_(submitPmvReport_(s,b.record||{}));
      case 'updateArticleStatus':return json_(updateArticleStatus_(s,b.record||{}));
      case 'pushArticleStatusToMaster':return json_(pushArticleStatusToMaster_(s,b.record||{}));
      case 'updateArticleMaster':return json_(updateArticleMaster_(s,b.record||{}));
      case 'diagnoseArticleMaster':return json_(diagnoseArticleMaster_(s));
      case 'diagnosePinAccess':return json_(diagnosePinAccess_(s));
      case 'diagnoseArticleStatus':return json_(diagnoseArticleStatus_(s,clean_(b.date)||today_()));
      default:throw new Error('Unknown action: '+a);
    }
  }catch(err){return error_(err.message||err);}
}

/* Make requireRole/Admin use the same V16 authentication routine. */
function requireAdmin_(s){
  s=v16Authenticate_(s);
  if(s.role!==CONFIG.ROLES.ADMIN&&s.role!==CONFIG.ROLES.DPS)
    throw new Error('Administrator/DPS authorisation required.');
}
function requireRole_(s,roles){
  s=v16Authenticate_(s);
  if(!roles.includes(s.role))
    throw new Error('You are not authorised for this operation.');
}
