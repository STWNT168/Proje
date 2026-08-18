/***************************************
 PMV TOOLKIT TRACKER - FROM SCRATCH
 Version: 6.0.0
 Google Apps Script backend
****************************************/

const SPREADSHEET_ID = "1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8";
const API_URL = "https://script.google.com/macros/s/AKfycbz99tuShcZP2e4cPYKObZU0SGbckHL6uw68wRfZCwmRO9xAQuPNpinC0LisHvEDWxxC/exec";

const SHEETS = {
  OFFICE_MASTER: "OFFICE_MASTER",
  USER_MASTER: "USER_MASTER",
  PMV_REPORTS: "PMV_REPORTS",
  SESSIONS: "SESSIONS",
  AUDIT_LOG: "AUDIT_LOG"
};
const ROLES = { SPM: "SPM", DPS: "DPS", ADMIN: "ADMIN" };
const SESSION_DAYS = 7;

const HEADERS = {
  OFFICE_MASTER: ["OFFICE_ID","OFFICE_NAME","DIVISION","ACTIVE","INITIAL_OPENING_KITS","INITIAL_OPENING_ARTICLES"],
  USER_MASTER: ["USER_ID","NAME","MOBILE","ROLE","OFFICE_ID","OFFICE_NAME","ACTIVE"],
  PMV_REPORTS: [
    "ID","DATE","OFFICE_ID","OFFICE_NAME","SPM_ID","SPM_NAME",
    "OPENING_KITS","OPENING_ARTICLES","RECEIVED_KITS","RECEIVED_ARTICLES",
    "REDIRECTED_KITS","REDIRECTED_ARTICLES","RTS_KITS","RTS_ARTICLES",
    "DELIVERED_KITS","DELIVERED_ARTICLES",
    "INVALID_MOBILE_KITS","INVALID_MOBILE_ARTICLES","TORN_KITS","TORN_ARTICLES",
    "IMPROPER_DETAILS_KITS","IMPROPER_DETAILS_ARTICLES",
    "DELIVERABLE_KITS","DELIVERABLE_ARTICLES","INCOMPLETE_KITS","INCOMPLETE_ARTICLES",
    "PENDING_KITS","PENDING_ARTICLES","STATUS","SUBMITTED_AT","UPDATED_AT"
  ],
  SESSIONS: ["TOKEN","USER_ID","CREATED_AT","EXPIRES_AT","ACTIVE"],
  AUDIT_LOG: ["TIMESTAMP","USER_ID","ACTION","RECORD_ID","DETAILS"]
};

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = String(p.action || "");
    if (action === "health") return out(ok({version:"6.0.0",api:API_URL},"OK"));
    const s = requireSession(p.session);
    switch (action) {
      case "getOfficeList": return out(getOfficeList(s));
      case "getOpeningBalance": return out(getOpeningBalance(s,p.officeId,p.date));
      case "getOwnPmvDashboard": return out(getOwnPmvDashboard(s,p.date || todayISO()));
      case "getAdminPmvDashboard": return out(getAdminPmvDashboard(s,p.date || todayISO()));
      default: return out(err("Unknown GET action."));
    }
  } catch (e2) { return out(err(e2.message || String(e2))); }
}

function doPost(e) {
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    switch (String(b.action || "")) {
      case "setupSpreadsheet": return out(setupSpreadsheet());
      case "login": return out(login(b.userId,b.mobile));
      case "logout": return out(logout(b.session));
      case "submitPmvReport": return out(submitPmvReport(b.record,b.session));
      case "deleteOwnPmvReport": return out(deleteOwnPmvReport(b.session,b.date));
      default: return out(err("Unknown POST action."));
    }
  } catch (e2) { return out(err(e2.message || String(e2))); }
}

/* ---------- SETUP ---------- */

function setupSpreadsheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.keys(HEADERS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = HEADERS[name];
    if (sh.getLastRow() === 0) {
      sh.getRange(1,1,1,headers.length).setValues([headers]);
    } else {
      headers.forEach((h,i) => {
        const current = sh.getRange(1,i+1).getValue();
        if (String(current || "").trim() !== h) sh.getRange(1,i+1).setValue(h);
      });
    }
    sh.setFrozenRows(1);
  });
  return ok({spreadsheetId:SPREADSHEET_ID,sheets:Object.keys(HEADERS)},"Spreadsheet setup completed.");
}

/* ---------- AUTH ---------- */

function login(userId,mobile) {
  const u=findUser(userId);
  if(!u) return err("User not found.");
  if(!active(u.ACTIVE)) return err("This account is inactive.");
  if(!/^\d{10}$/.test(String(mobile||"").trim())) return err("Invalid mobile number. Enter exactly 10 digits.");
  if(String(u.MOBILE||"").replace(/\D/g,"") !== String(mobile).replace(/\D/g,"")) return err("Mobile number does not match our records.");
  const role=normRole(u.ROLE);
  if(!role) return err("Invalid user role.");

  const token=Utilities.getUuid()+"-"+Utilities.getUuid();
  const now=new Date(), expires=new Date(now.getTime()+SESSION_DAYS*86400000);
  getSheet(SHEETS.SESSIONS).appendRow([token,u.USER_ID,now,expires,true]);

  return ok({
    userId:String(u.USER_ID),name:String(u.NAME||""),role,
    officeId:String(u.OFFICE_ID||""),officeName:officeName(u.OFFICE_ID,u.OFFICE_NAME),
    token,expiresAt:expires.toISOString()
  },"Login successful.");
}

function logout(s) {
  const a=auth(s);
  invalidate(a.token);
  return ok(null,"Logged out.");
}

function requireSession(raw) {
  if(!raw) throw new Error("Not authenticated.");
  let s; try{s=JSON.parse(raw);}catch(_){throw new Error("Invalid session.");}
  auth(s); return s;
}

function auth(s) {
  if(!s || !s.userId || !s.token) throw new Error("Not authenticated.");
  const row=read(SHEETS.SESSIONS).find(r =>
    String(r.TOKEN).trim()===String(s.token).trim() &&
    String(r.USER_ID).trim()===String(s.userId).trim() &&
    active(r.ACTIVE)
  );
  if(!row) throw new Error("Session expired or invalid.");
  if(new Date(row.EXPIRES_AT).getTime()<=Date.now()){invalidate(s.token);throw new Error("Session expired. Please log in again.");}
  const u=findUser(s.userId);
  if(!u || !active(u.ACTIVE)) throw new Error("Account is inactive.");
  const role=normRole(u.ROLE);
  if(!role) throw new Error("Invalid user role.");
  return {user:u,role,token:s.token};
}

/* ---------- MASTER DATA ---------- */

function getOfficeList(s) {
  auth(s);
  return ok(read(SHEETS.OFFICE_MASTER).filter(r=>active(r.ACTIVE)).map(r=>({
    officeId:String(r.OFFICE_ID||""),officeName:String(r.OFFICE_NAME||""),division:String(r.DIVISION||"")
  })));
}

function getOpeningBalance(s,officeId,date) {
  const a=auth(s); assertOffice(a,officeId);
  const d=validateDate(date), b=openingBalance(officeId,d);
  return ok({date:d,openingKits:b.kits,openingArticles:b.articles,source:b.source});
}

/* ---------- REPORT ---------- */

function submitPmvReport(record,s) {
  const a=auth(s);
  if(a.role!==ROLES.SPM) throw new Error("Only SPM users can submit PMV reports.");

  const r=normalizeReport(record);
  if(String(a.user.OFFICE_ID)!==String(r.officeId)) return err("You are not authorized to submit data for this office.","FORBIDDEN");

  const office=getOffice(r.officeId);
  r.officeName=String(office.OFFICE_NAME||"");
  r.spmId=String(a.user.USER_ID);
  r.spmName=String(a.user.NAME||"");

  const opening=openingBalance(r.officeId,r.date);
  r.openingKits=opening.kits;
  r.openingArticles=opening.articles;

  const v=validateReport(r);
  if(!v.valid) return {success:false,code:"VALIDATION",message:v.errors[0],errors:v.errors};

  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if(findReportById(r.id)) return ok({recordId:r.id,alreadyProcessed:true},"Report already saved.");
    if(findReport(r.spmId,r.date)) return err("A report for this SPM and date already exists.","DUPLICATE");
    const now=new Date();
    getSheet(SHEETS.PMV_REPORTS).appendRow(reportRow(r,now,now));
    audit(r.spmId,"SUBMIT",r.id,JSON.stringify({date:r.date,officeId:r.officeId,pendingKits:r.pendingKits,pendingArticles:r.pendingArticles}));
  } finally { lock.releaseLock(); }

  return ok({recordId:r.id,pendingKits:r.pendingKits,pendingArticles:r.pendingArticles},"PMV report saved successfully.");
}

function getOwnPmvDashboard(s,date) {
  const a=auth(s);
  if(a.role!==ROLES.SPM) throw new Error("Only SPM users can access this dashboard.");
  const d=validateDate(date), r=latestReport(a.user.USER_ID,d);
  return ok({date:d,report:r?mapReport(r):null});
}

function getAdminPmvDashboard(s,date) {
  const a=auth(s);
  if(a.role!==ROLES.DPS && a.role!==ROLES.ADMIN) throw new Error("Only DPS/Admin users can access this dashboard.");
  const d=validateDate(date);
  const offices=read(SHEETS.OFFICE_MASTER).filter(r=>active(r.ACTIVE));
  const users=read(SHEETS.USER_MASTER).filter(r=>active(r.ACTIVE)&&normRole(r.ROLE)===ROLES.SPM);
  const reports=dedupeReports().filter(r=>dateOf(r.DATE)===d);

  const blank=()=>({
    officeId:"",officeName:"",spmStatus:"Not updated",
    kitsCameToday:0,articlesCameToday:0,redirectedKits:0,redirectedArticles:0,
    rtsKits:0,rtsArticles:0,deliveredKits:0,deliveredArticles:0,
    pendingKits:0,pendingArticles:0,invalidMobileKits:0,invalidMobileArticles:0,
    tornKits:0,tornArticles:0,improperDetailsKits:0,improperDetailsArticles:0,
    deliverableKits:0,deliverableArticles:0,incompleteKits:0,incompleteArticles:0
  });

  const byOffice={};
  offices.forEach(o=>{
    const x=blank(); x.officeId=String(o.OFFICE_ID); x.officeName=String(o.OFFICE_NAME||""); byOffice[x.officeId]=x;
  });

  const detailed=users.map(u=>{
    const r=reports.find(x=>String(x.SPM_ID)===String(u.USER_ID));
    if(r) return Object.assign(mapReport(r),{status:"Updated"});
    return Object.assign(blank(),{
      officeId:String(u.OFFICE_ID||""),officeName:officeName(u.OFFICE_ID,u.OFFICE_NAME),
      spmId:String(u.USER_ID||""),spmName:String(u.NAME||""),status:"Not updated"
    });
  });

  detailed.forEach(r=>{
    const oid=String(r.officeId||"");
    if(!byOffice[oid]){const x=blank();x.officeId=oid;x.officeName=r.officeName||oid;byOffice[oid]=x;}
    const o=byOffice[oid]; o.spmStatus=r.status;
    [
      "kitsCameToday","articlesCameToday","redirectedKits","redirectedArticles","rtsKits","rtsArticles",
      "deliveredKits","deliveredArticles","pendingKits","pendingArticles","invalidMobileKits","invalidMobileArticles",
      "tornKits","tornArticles","improperDetailsKits","improperDetailsArticles",
      "deliverableKits","deliverableArticles","incompleteKits","incompleteArticles"
    ].forEach(k=>o[k]+=num(r[k]));
  });

  const updated=users.filter(u=>reports.some(r=>String(r.SPM_ID)===String(u.USER_ID))).length;
  const pendingSpms=users.filter(u=>!reports.some(r=>String(r.SPM_ID)===String(u.USER_ID))).map(u=>({
    spmName:String(u.NAME||""),spmId:String(u.USER_ID||""),officeId:String(u.OFFICE_ID||""),
    officeName:officeName(u.OFFICE_ID,u.OFFICE_NAME)
  }));
  const sum=k=>detailed.reduce((n,r)=>n+num(r[k]),0);

  return ok({
    date:d,activeSpms:users.length,spmsUpdatedToday:updated,spmsPendingUpdate:pendingSpms.length,
    completionPercentage:users.length?round(updated/users.length*100):0,
    pendingSpms,detailedSpmData:detailed,officeWise:Object.keys(byOffice).map(k=>byOffice[k]),
    totals:{
      kitsCameToday:sum("kitsCameToday"),articlesCameToday:sum("articlesCameToday"),
      redirectedKits:sum("redirectedKits"),redirectedArticles:sum("redirectedArticles"),
      rtsKits:sum("rtsKits"),rtsArticles:sum("rtsArticles"),
      deliveredKits:sum("deliveredKits"),deliveredArticles:sum("deliveredArticles"),
      pendingKits:sum("pendingKits"),pendingArticles:sum("pendingArticles"),
      invalidMobileKits:sum("invalidMobileKits"),invalidMobileArticles:sum("invalidMobileArticles"),
      tornKits:sum("tornKits"),tornArticles:sum("tornArticles"),
      improperDetailsKits:sum("improperDetailsKits"),improperDetailsArticles:sum("improperDetailsArticles"),
      deliverableKits:sum("deliverableKits"),deliverableArticles:sum("deliverableArticles"),
      incompleteKits:sum("incompleteKits"),incompleteArticles:sum("incompleteArticles")
    }
  });
}

function deleteOwnPmvReport(s,date) {
  const a=auth(s);
  if(a.role!==ROLES.SPM) throw new Error("Only SPM users can delete their own report.");
  const d=validateDate(date||todayISO()), r=latestReport(a.user.USER_ID,d);
  if(!r) return err("No report found for that date.","NOT_FOUND");
  getSheet(SHEETS.PMV_REPORTS).deleteRow(Number(r.__row));
  audit(a.user.USER_ID,"DELETE",String(r.ID),"Deleted report for "+d);
  return ok({deleted:true},"Report deleted.");
}

/* ---------- VALIDATION / BALANCE ---------- */

/*
 Closing pending formula used by this project:

 Closing Pending =
   Opening Balance
 + New Received/Taken Today
 - Redirected
 - RTS/Returned
 - Delivered Today

 The five pending-status buckets must exactly equal Closing Pending:
   Invalid Mobile
 + Torn
 + Without Proper Address/Details
 + Deliverable
 + Incomplete

 Therefore:
 Opening + Received - Redirected - RTS - Delivered
 =
 Invalid Mobile + Torn + Without Address + Deliverable + Incomplete

 The previous date's closing pending becomes the next date's opening balance.
*/

function normalizeReport(x) {
  x=JSON.parse(JSON.stringify(x||{}));
  const f=[
    "openingKits","openingArticles","receivedKits","receivedArticles","redirectedKits","redirectedArticles",
    "rtsKits","rtsArticles","deliveredKits","deliveredArticles","invalidMobileKits","invalidMobileArticles",
    "tornKits","tornArticles","improperDetailsKits","improperDetailsArticles",
    "deliverableKits","deliverableArticles","incompleteKits","incompleteArticles"
  ];
  f.forEach(k=>x[k]=toInt(x[k]));
  x.id=String(x.id||"").trim(); x.date=String(x.date||"").trim(); x.officeId=String(x.officeId||"").trim();
  return x;
}

function validateReport(r) {
  const e=[];
  if(!r.id)e.push("Report ID is required.");
  if(!r.date)e.push("Date is required.");
  else {
    try{if(validateDate(r.date)>todayISO())e.push("Future dates are not allowed.");}
    catch(x){e.push(x.message);}
  }
  if(!getOffice(r.officeId))e.push("Office is invalid.");

  const f=[
    "openingKits","openingArticles","receivedKits","receivedArticles","redirectedKits","redirectedArticles",
    "rtsKits","rtsArticles","deliveredKits","deliveredArticles","invalidMobileKits","invalidMobileArticles",
    "tornKits","tornArticles","improperDetailsKits","improperDetailsArticles",
    "deliverableKits","deliverableArticles","incompleteKits","incompleteArticles"
  ];
  f.forEach(k=>{if(!isInt(r[k]))e.push(k+" must be a non-negative integer.");});

  const kitAvailable=r.openingKits+r.receivedKits-r.redirectedKits-r.rtsKits-r.deliveredKits;
  const artAvailable=r.openingArticles+r.receivedArticles-r.redirectedArticles-r.rtsArticles-r.deliveredArticles;
  const kitStatus=r.invalidMobileKits+r.tornKits+r.improperDetailsKits+r.deliverableKits+r.incompleteKits;
  const artStatus=r.invalidMobileArticles+r.tornArticles+r.improperDetailsArticles+r.deliverableArticles+r.incompleteArticles;

  if(r.redirectedKits+r.rtsKits+r.deliveredKits>r.openingKits+r.receivedKits)
    e.push("Kits: Redirected + RTS/Returned + Delivered cannot exceed Opening + Received.");
  if(r.redirectedArticles+r.rtsArticles+r.deliveredArticles>r.openingArticles+r.receivedArticles)
    e.push("Articles: Redirected + RTS/Returned + Delivered cannot exceed Opening + Received.");

  if(kitAvailable<0)e.push("Kits closing pending cannot be negative.");
  if(artAvailable<0)e.push("Articles closing pending cannot be negative.");

  if(kitStatus!==kitAvailable)
    e.push("Kits mismatch: Invalid Mobile + Torn + Without Address + Deliverable + Incomplete must equal Opening + Received - Redirected - RTS - Delivered.");
  if(artStatus!==artAvailable)
    e.push("Articles mismatch: Invalid Mobile + Torn + Without Address + Deliverable + Incomplete must equal Opening + Received - Redirected - RTS - Delivered.");

  r.pendingKits=kitAvailable; r.pendingArticles=artAvailable;
  return {valid:e.length===0,errors:e};
}

function openingBalance(officeId,date) {
  const prev=shift(date,-1), r=latestOfficeReport(officeId,prev);
  if(r)return {kits:num(r.PENDING_KITS),articles:num(r.PENDING_ARTICLES),source:"PREVIOUS_DATE"};
  const o=getOffice(officeId);
  return {kits:toInt(o.INITIAL_OPENING_KITS),articles:toInt(o.INITIAL_OPENING_ARTICLES),source:"OFFICE_INITIAL_BALANCE"};
}

/* ---------- MAPPING ---------- */

function reportRow(r,submitted,updated) {
  return [
    r.id,r.date,r.officeId,r.officeName,r.spmId,r.spmName,
    r.openingKits,r.openingArticles,r.receivedKits,r.receivedArticles,
    r.redirectedKits,r.redirectedArticles,r.rtsKits,r.rtsArticles,
    r.deliveredKits,r.deliveredArticles,r.invalidMobileKits,r.invalidMobileArticles,
    r.tornKits,r.tornArticles,r.improperDetailsKits,r.improperDetailsArticles,
    r.deliverableKits,r.deliverableArticles,r.incompleteKits,r.incompleteArticles,
    r.pendingKits,r.pendingArticles,"FINAL",submitted,updated
  ];
}

function mapReport(r) {
  return {
    id:String(r.ID||""),date:dateOf(r.DATE),officeId:String(r.OFFICE_ID||""),officeName:String(r.OFFICE_NAME||""),
    spmId:String(r.SPM_ID||""),spmName:String(r.SPM_NAME||""),
    openingKits:num(r.OPENING_KITS),openingArticles:num(r.OPENING_ARTICLES),
    kitsCameToday:num(r.RECEIVED_KITS),articlesCameToday:num(r.RECEIVED_ARTICLES),
    redirectedKits:num(r.REDIRECTED_KITS),redirectedArticles:num(r.REDIRECTED_ARTICLES),
    rtsKits:num(r.RTS_KITS),rtsArticles:num(r.RTS_ARTICLES),
    deliveredKits:num(r.DELIVERED_KITS),deliveredArticles:num(r.DELIVERED_ARTICLES),
    invalidMobileKits:num(r.INVALID_MOBILE_KITS),invalidMobileArticles:num(r.INVALID_MOBILE_ARTICLES),
    tornKits:num(r.TORN_KITS),tornArticles:num(r.TORN_ARTICLES),
    improperDetailsKits:num(r.IMPROPER_DETAILS_KITS),improperDetailsArticles:num(r.IMPROPER_DETAILS_ARTICLES),
    deliverableKits:num(r.DELIVERABLE_KITS),deliverableArticles:num(r.DELIVERABLE_ARTICLES),
    incompleteKits:num(r.INCOMPLETE_KITS),incompleteArticles:num(r.INCOMPLETE_ARTICLES),
    pendingKits:num(r.PENDING_KITS),pendingArticles:num(r.PENDING_ARTICLES),status:String(r.STATUS||"")
  };
}

function latestReport(spmId,date){return dedupeReports().find(r=>String(r.SPM_ID)===String(spmId)&&dateOf(r.DATE)===date)||null;}
function latestOfficeReport(officeId,date){return dedupeReports().find(r=>String(r.OFFICE_ID)===String(officeId)&&dateOf(r.DATE)===date)||null;}
function findReport(spmId,date){return read(SHEETS.PMV_REPORTS).find(r=>String(r.SPM_ID)===String(spmId)&&dateOf(r.DATE)===date)||null;}
function findReportById(id){return read(SHEETS.PMV_REPORTS).find(r=>String(r.ID).trim()===String(id||"").trim())||null;}
function dedupeReports(){
  const m={};
  read(SHEETS.PMV_REPORTS).forEach(r=>{
    const k=String(r.SPM_ID).trim()+"|"+dateOf(r.DATE);
    if(!m[k]||Number(r.__row)>Number(m[k].__row))m[k]=r;
  });
  return Object.keys(m).map(k=>m[k]);
}

/* ---------- UTILITIES ---------- */

function getSheet(name){
  const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if(!sh)throw new Error("Sheet "+name+" does not exist. Run setupSpreadsheet().");
  return sh;
}
function read(name){
  const sh=getSheet(name), values=sh.getDataRange().getValues();
  if(values.length<2)return [];
  const headers=values[0].map(String);
  return values.slice(1).map((row,i)=>{
    const o={__row:i+2}; headers.forEach((h,j)=>o[h]=row[j]); return o;
  });
}
function findUser(id){return read(SHEETS.USER_MASTER).find(r=>String(r.USER_ID).trim()===String(id||"").trim())||null;}
function getOffice(id){
  const o=read(SHEETS.OFFICE_MASTER).find(r=>String(r.OFFICE_ID).trim()===String(id||"").trim());
  if(!o)throw new Error("Office not found in OFFICE_MASTER.");
  if(!active(o.ACTIVE))throw new Error("Office is inactive.");
  return o;
}
function assertOffice(a,id){
  const o=getOffice(id);
  if(a.role===ROLES.SPM&&String(a.user.OFFICE_ID)!==String(o.OFFICE_ID))throw new Error("Not authorized for this office.");
}
function officeName(id,fallback){
  const o=read(SHEETS.OFFICE_MASTER).find(r=>String(r.OFFICE_ID).trim()===String(id||"").trim());
  return o?String(o.OFFICE_NAME||""):String(fallback||"");
}
function normRole(v){const x=String(v||"").trim().toUpperCase();return Object.values(ROLES).includes(x)?x:"";}
function active(v){if(v===true)return true;return ["TRUE","1","YES","Y","ACTIVE"].includes(String(v||"").trim().toUpperCase());}
function toInt(v){if(v===""||v==null)return 0;const n=Number(v);return Number.isFinite(n)&&n>=0&&Math.floor(n)===n?n:-1;}
function isInt(v){return Number.isInteger(v)&&v>=0;}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function round(v){return Math.round(Number(v)||0);}
function todayISO(){return Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyy-MM-dd");}
function validateDate(s){
  const x=String(s||"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(x))throw new Error("Invalid date.");
  const d=new Date(x+"T00:00:00"); if(isNaN(d.getTime()))throw new Error("Invalid date."); return x;
}
function shift(iso,days){
  const d=new Date(validateDate(iso)+"T00:00:00"); d.setDate(d.getDate()+days);
  return Utilities.formatDate(d,Session.getScriptTimeZone(),"yyyy-MM-dd");
}
function dateOf(v){
  if(v instanceof Date)return Utilities.formatDate(v,Session.getScriptTimeZone(),"yyyy-MM-dd");
  const s=String(v||"").trim(); return /^\d{4}-\d{2}-\d{2}/.test(s)?s.substring(0,10):"";
}
function invalidate(token){
  const sh=getSheet(SHEETS.SESSIONS), rows=sh.getDataRange().getValues();
  for(let i=1;i<rows.length;i++)if(String(rows[i][0])===String(token))sh.getRange(i+1,5).setValue(false);
}
function audit(userId,action,recordId,details){getSheet(SHEETS.AUDIT_LOG).appendRow([new Date(),userId,action,recordId,details]);}
function ok(data,message){return {success:true,data:data,message:message||""};}
function err(message,code){return {success:false,code:code||"ERROR",message:String(message||"Error")};}
function out(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
