/***************************************
 PMV TOOLKIT TRACKER v6.1
 Google Apps Script backend
***************************************/
const SPREADSHEET_ID="1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8";
const API_URL="https://script.google.com/macros/s/AKfycbz99tuShcZP2e4cPYKObZU0SGbckHL6uw68wRfZCwmRO9xAQuPNpinC0LisHvEDWxxC/exec";
const SHEETS={OFFICE_MASTER:"OFFICE_MASTER",USER_MASTER:"USER_MASTER",PMV_REPORTS:"PMV_REPORTS",SESSIONS:"SESSIONS",AUDIT_LOG:"AUDIT_LOG"};
const ROLES={SPM:"SPM",DPS:"DPS",ADMIN:"ADMIN"},SESSION_DAYS=7;
const HEADERS={
 OFFICE_MASTER:["OFFICE_ID","OFFICE_NAME","DIVISION","ACTIVE","INITIAL_OPENING_KITS","INITIAL_OPENING_ARTICLES"],
 USER_MASTER:["USER_ID","NAME","MOBILE","ROLE","OFFICE_ID","OFFICE_NAME","ACTIVE"],
 PMV_REPORTS:["ID","DATE","OFFICE_ID","OFFICE_NAME","SPM_ID","SPM_NAME","OPENING_KITS","OPENING_ARTICLES","RECEIVED_KITS","RECEIVED_ARTICLES","REDIRECTED_KITS","REDIRECTED_ARTICLES","RTS_KITS","RTS_ARTICLES","DELIVERED_KITS","DELIVERED_ARTICLES","INVALID_MOBILE_KITS","INVALID_MOBILE_ARTICLES","TORN_KITS","TORN_ARTICLES","IMPROPER_DETAILS_KITS","IMPROPER_DETAILS_ARTICLES","DELIVERABLE_KITS","DELIVERABLE_ARTICLES","INCOMPLETE_KITS","INCOMPLETE_ARTICLES","PENDING_KITS","PENDING_ARTICLES","STATUS","SUBMITTED_AT","UPDATED_AT"],
 SESSIONS:["TOKEN","USER_ID","CREATED_AT","EXPIRES_AT","ACTIVE"],
 AUDIT_LOG:["TIMESTAMP","USER_ID","ACTION","RECORD_ID","DETAILS"]
};

function doGet(e){
 try{
  const p=(e&&e.parameter)||{},a=String(p.action||"");
  if(a==="health")return out(ok({version:"6.1.0",api:API_URL},"OK"));
  const s=requireSession(p.session);
  if(a==="getOfficeList")return out(getOfficeList(s));
  if(a==="getOpeningBalance")return out(getOpeningBalance(s,p.officeId,p.date));
  if(a==="getOwnPmvDashboard")return out(getOwnPmvDashboard(s,p.date||todayISO()));
  if(a==="getAdminPmvDashboard")return out(getAdminPmvDashboard(s,p.date||todayISO()));
  return out(err("Unknown GET action."));
 }catch(x){return out(err(x.message||String(x)));}
}
function doPost(e){
 try{
  const b=JSON.parse((e&&e.postData&&e.postData.contents)||"{}"),a=String(b.action||"");
  if(a==="setupSpreadsheet")return out(setupSpreadsheet());
  if(a==="login")return out(login(b.userId,b.mobile));
  if(a==="logout")return out(logout(b.session));
  if(a==="submitPmvReport")return out(submitPmvReport(b.record,b.session));
  if(a==="deleteOwnPmvReport")return out(deleteOwnPmvReport(b.session,b.date));
  return out(err("Unknown POST action."));
 }catch(x){return out(err(x.message||String(x)));}
}

function setupSpreadsheet(){
 const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
 Object.keys(HEADERS).forEach(n=>{
  let sh=ss.getSheetByName(n);if(!sh)sh=ss.insertSheet(n);
  const h=HEADERS[n];
  if(sh.getLastRow()===0)sh.getRange(1,1,1,h.length).setValues([h]);
  else h.forEach((v,i)=>{if(String(sh.getRange(1,i+1).getValue()||"").trim()!==v)sh.getRange(1,i+1).setValue(v);});
  sh.setFrozenRows(1);
 });
 return ok({spreadsheetId:SPREADSHEET_ID,sheets:Object.keys(HEADERS)},"Spreadsheet setup completed.");
}

function login(id,mobile){
 const u=findUser(id);if(!u)return err("User not found.");
 if(!active(u.ACTIVE))return err("This account is inactive.");
 if(!/^\d{10}$/.test(String(mobile||"").trim()))return err("Invalid mobile number. Enter exactly 10 digits.");
 if(String(u.MOBILE||"").replace(/\D/g,"")!==String(mobile).replace(/\D/g,""))return err("Mobile number does not match our records.");
 const role=normRole(u.ROLE);if(!role)return err("Invalid user role.");
 const token=Utilities.getUuid()+"-"+Utilities.getUuid(),now=new Date(),ex=new Date(now.getTime()+SESSION_DAYS*86400000);
 getSheet(SHEETS.SESSIONS).appendRow([token,u.USER_ID,now,ex,true]);
 return ok({userId:String(u.USER_ID),name:String(u.NAME||""),role,officeId:String(u.OFFICE_ID||""),officeName:officeName(u.OFFICE_ID,u.OFFICE_NAME),token,expiresAt:ex.toISOString()},"Login successful.");
}
function logout(s){const a=auth(s);invalidate(a.token);return ok(null,"Logged out.");}
function requireSession(raw){if(!raw)throw new Error("Not authenticated.");let s;try{s=JSON.parse(raw)}catch(_){throw new Error("Invalid session.");}auth(s);return s;}
function auth(s){
 if(!s||!s.userId||!s.token)throw new Error("Not authenticated.");
 const r=read(SHEETS.SESSIONS).find(x=>String(x.TOKEN).trim()===String(s.token).trim()&&String(x.USER_ID).trim()===String(s.userId).trim()&&active(x.ACTIVE));
 if(!r)throw new Error("Session expired or invalid.");
 if(new Date(r.EXPIRES_AT).getTime()<=Date.now()){invalidate(s.token);throw new Error("Session expired. Please log in again.");}
 const u=findUser(s.userId);if(!u||!active(u.ACTIVE))throw new Error("Account is inactive.");
 const role=normRole(u.ROLE);if(!role)throw new Error("Invalid user role.");return {user:u,role,token:s.token};
}

function getOfficeList(s){auth(s);return ok(read(SHEETS.OFFICE_MASTER).filter(x=>active(x.ACTIVE)).map(x=>({officeId:String(x.OFFICE_ID||""),officeName:String(x.OFFICE_NAME||""),division:String(x.DIVISION||"")})));}
function getOpeningBalance(s,officeId,date){const a=auth(s);assertOffice(a,officeId);const d=validateDate(date),b=openingBalance(officeId,d);return ok({date:d,openingKits:b.kits,openingArticles:b.articles,source:b.source});}

function submitPmvReport(record,s){
 const a=auth(s);if(a.role!==ROLES.SPM)throw new Error("Only SPM users can submit PMV reports.");
 const r=normalizeReport(record);if(String(a.user.OFFICE_ID)!==String(r.officeId))return err("You are not authorized to submit data for this office.","FORBIDDEN");
 const o=getOffice(r.officeId);r.officeName=String(o.OFFICE_NAME||"");r.spmId=String(a.user.USER_ID);r.spmName=String(a.user.NAME||"");
 const b=openingBalance(r.officeId,r.date);r.openingKits=b.kits;r.openingArticles=b.articles;
 const v=validateReport(r);if(!v.valid)return {success:false,code:"VALIDATION",message:v.errors[0],errors:v.errors};
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  if(findReportById(r.id))return ok({recordId:r.id,alreadyProcessed:true},"Report already saved.");
  if(findReport(r.spmId,r.date))return err("A report for this SPM and date already exists.","DUPLICATE");
  const now=new Date();getSheet(SHEETS.PMV_REPORTS).appendRow(reportRow(r,now,now));
  audit(r.spmId,"SUBMIT",r.id,JSON.stringify({date:r.date,officeId:r.officeId,pendingKits:r.pendingKits,pendingArticles:r.pendingArticles}));
 }finally{lock.releaseLock();}
 return ok({recordId:r.id,pendingKits:r.pendingKits,pendingArticles:r.pendingArticles},"PMV report saved successfully.");
}

function getOwnPmvDashboard(s,date){
 const a=auth(s);if(a.role!==ROLES.SPM)throw new Error("Only SPM users can access this dashboard.");
 const d=validateDate(date),r=latestReport(a.user.USER_ID,d);return ok({date:d,report:r?mapReport(r):null});
}
function getAdminPmvDashboard(s,date){
 const a=auth(s);if(a.role!==ROLES.DPS&&a.role!==ROLES.ADMIN)throw new Error("Only DPS/Admin users can access this dashboard.");
 const d=validateDate(date),users=read(SHEETS.USER_MASTER).filter(x=>active(x.ACTIVE)&&normRole(x.ROLE)===ROLES.SPM),reports=dedupeReports().filter(x=>dateOf(x.DATE)===d),offices=read(SHEETS.OFFICE_MASTER).filter(x=>active(x.ACTIVE));
 const detailed=users.map(u=>{const r=reports.find(x=>String(x.SPM_ID)===String(u.USER_ID));return r?Object.assign(mapReport(r),{status:"Updated"}):{officeId:String(u.OFFICE_ID||""),officeName:officeName(u.OFFICE_ID,u.OFFICE_NAME),spmId:String(u.USER_ID||""),spmName:String(u.NAME||""),status:"Not updated"};});
 const pendingSpms=detailed.filter(x=>x.status!=="Updated").map(x=>({spmName:x.spmName,spmId:x.spmId,officeId:x.officeId,officeName:x.officeName}));
 const officeWise=offices.map(o=>{
  const rs=detailed.filter(x=>String(x.officeId)===String(o.OFFICE_ID)),z={officeId:String(o.OFFICE_ID),officeName:String(o.OFFICE_NAME||""),spmStatus:rs.some(x=>x.status==="Updated")?"Updated":"Not updated"};
  ["kitsCameToday","articlesCameToday","redirectedKits","redirectedArticles","rtsKits","rtsArticles","deliveredKits","deliveredArticles","pendingKits","pendingArticles","invalidMobileKits","invalidMobileArticles","tornKits","tornArticles","improperDetailsKits","improperDetailsArticles","deliverableKits","deliverableArticles","incompleteKits","incompleteArticles"].forEach(k=>z[k]=rs.reduce((n,x)=>n+num(x[k]),0));return z;
 });
 const sum=k=>detailed.reduce((n,x)=>n+num(x[k]),0),updated=detailed.filter(x=>x.status==="Updated").length;
 return ok({date:d,activeSpms:users.length,spmsUpdatedToday:updated,spmsPendingUpdate:pendingSpms.length,completionPercentage:users.length?round(updated/users.length*100):0,pendingSpms,detailedSpmData:detailed,officeWise,totals:{
  kitsCameToday:sum("kitsCameToday"),articlesCameToday:sum("articlesCameToday"),redirectedKits:sum("redirectedKits"),redirectedArticles:sum("redirectedArticles"),
  rtsKits:sum("rtsKits"),rtsArticles:sum("rtsArticles"),deliveredKits:sum("deliveredKits"),deliveredArticles:sum("deliveredArticles"),
  pendingKits:sum("pendingKits"),pendingArticles:sum("pendingArticles"),invalidMobileKits:sum("invalidMobileKits"),invalidMobileArticles:sum("invalidMobileArticles"),
  tornKits:sum("tornKits"),tornArticles:sum("tornArticles"),improperDetailsKits:sum("improperDetailsKits"),improperDetailsArticles:sum("improperDetailsArticles"),
  deliverableKits:sum("deliverableKits"),deliverableArticles:sum("deliverableArticles"),incompleteKits:sum("incompleteKits"),incompleteArticles:sum("incompleteArticles")
 }});
}

function deleteOwnPmvReport(s,date){
 const a=auth(s);if(a.role!==ROLES.SPM)throw new Error("Only SPM users can delete their own report.");
 const d=validateDate(date||todayISO()),r=latestReport(a.user.USER_ID,d);if(!r)return err("No report found for that date.","NOT_FOUND");
 getSheet(SHEETS.PMV_REPORTS).deleteRow(Number(r.__row));audit(a.user.USER_ID,"DELETE",String(r.ID),"Deleted report for "+d);return ok({deleted:true},"Report deleted.");
}

function normalizeReport(x){
 x=JSON.parse(JSON.stringify(x||{}));
 ["openingKits","openingArticles","receivedKits","receivedArticles","redirectedKits","redirectedArticles","rtsKits","rtsArticles","deliveredKits","deliveredArticles","invalidMobileKits","invalidMobileArticles","tornKits","tornArticles","improperDetailsKits","improperDetailsArticles","deliverableKits","deliverableArticles","incompleteKits","incompleteArticles"].forEach(k=>x[k]=toInt(x[k]));
 x.id=String(x.id||"").trim();x.date=String(x.date||"").trim();x.officeId=String(x.officeId||"").trim();return x;
}
function validateReport(r){
 const e=[];if(!r.id)e.push("Report ID is required.");if(!r.date)e.push("Date is required.");else{try{if(validateDate(r.date)>todayISO())e.push("Future dates are not allowed.");}catch(x){e.push(x.message);}}
 if(!getOffice(r.officeId))e.push("Office is invalid.");
 ["openingKits","openingArticles","receivedKits","receivedArticles","redirectedKits","redirectedArticles","rtsKits","rtsArticles","deliveredKits","deliveredArticles","invalidMobileKits","invalidMobileArticles","tornKits","tornArticles","improperDetailsKits","improperDetailsArticles","deliverableKits","deliverableArticles","incompleteKits","incompleteArticles"].forEach(k=>{if(!isInt(r[k]))e.push(k+" must be a non-negative integer.");});
 const ak=r.openingKits+r.receivedKits-r.redirectedKits-r.rtsKits-r.deliveredKits,aa=r.openingArticles+r.receivedArticles-r.redirectedArticles-r.rtsArticles-r.deliveredArticles;
 const sk=r.invalidMobileKits+r.tornKits+r.improperDetailsKits+r.deliverableKits+r.incompleteKits,sa=r.invalidMobileArticles+r.tornArticles+r.improperDetailsArticles+r.deliverableArticles+r.incompleteArticles;
 if(r.redirectedKits+r.rtsKits+r.deliveredKits>r.openingKits+r.receivedKits)e.push("Kits: Redirected + RTS/Returned + Delivered cannot exceed Opening + Received.");
 if(r.redirectedArticles+r.rtsArticles+r.deliveredArticles>r.openingArticles+r.receivedArticles)e.push("Articles: Redirected + RTS/Returned + Delivered cannot exceed Opening + Received.");
 if(ak<0)e.push("Kits closing pending cannot be negative.");if(aa<0)e.push("Articles closing pending cannot be negative.");
 if(sk!==ak)e.push("Kits mismatch: Invalid Mobile + Torn + Without Address + Deliverable + Incomplete must equal Opening + Received - Redirected - RTS - Delivered.");
 if(sa!==aa)e.push("Articles mismatch: Invalid Mobile + Torn + Without Address + Deliverable + Incomplete must equal Opening + Received - Redirected - RTS - Delivered.");
 r.pendingKits=ak;r.pendingArticles=aa;return {valid:!e.length,errors:e};
}
function openingBalance(officeId,date){const r=latestOfficeReport(officeId,shift(date,-1));if(r)return {kits:num(r.PENDING_KITS),articles:num(r.PENDING_ARTICLES),source:"PREVIOUS_DATE"};const o=getOffice(officeId);return {kits:toInt(o.INITIAL_OPENING_KITS),articles:toInt(o.INITIAL_OPENING_ARTICLES),source:"OFFICE_INITIAL_BALANCE"};}
function reportRow(r,s,u){return [r.id,r.date,r.officeId,r.officeName,r.spmId,r.spmName,r.openingKits,r.openingArticles,r.receivedKits,r.receivedArticles,r.redirectedKits,r.redirectedArticles,r.rtsKits,r.rtsArticles,r.deliveredKits,r.deliveredArticles,r.invalidMobileKits,r.invalidMobileArticles,r.tornKits,r.tornArticles,r.improperDetailsKits,r.improperDetailsArticles,r.deliverableKits,r.deliverableArticles,r.incompleteKits,r.incompleteArticles,r.pendingKits,r.pendingArticles,"FINAL",s,u];}
function mapReport(r){return {id:String(r.ID||""),date:dateOf(r.DATE),officeId:String(r.OFFICE_ID||""),officeName:String(r.OFFICE_NAME||""),spmId:String(r.SPM_ID||""),spmName:String(r.SPM_NAME||""),openingKits:num(r.OPENING_KITS),openingArticles:num(r.OPENING_ARTICLES),kitsCameToday:num(r.RECEIVED_KITS),articlesCameToday:num(r.RECEIVED_ARTICLES),redirectedKits:num(r.REDIRECTED_KITS),redirectedArticles:num(r.REDIRECTED_ARTICLES),rtsKits:num(r.RTS_KITS),rtsArticles:num(r.RTS_ARTICLES),deliveredKits:num(r.DELIVERED_KITS),deliveredArticles:num(r.DELIVERED_ARTICLES),invalidMobileKits:num(r.INVALID_MOBILE_KITS),invalidMobileArticles:num(r.INVALID_MOBILE_ARTICLES),tornKits:num(r.TORN_KITS),tornArticles:num(r.TORN_ARTICLES),improperDetailsKits:num(r.IMPROPER_DETAILS_KITS),improperDetailsArticles:num(r.IMPROPER_DETAILS_ARTICLES),deliverableKits:num(r.DELIVERABLE_KITS),deliverableArticles:num(r.DELIVERABLE_ARTICLES),incompleteKits:num(r.INCOMPLETE_KITS),incompleteArticles:num(r.INCOMPLETE_ARTICLES),pendingKits:num(r.PENDING_KITS),pendingArticles:num(r.PENDING_ARTICLES),status:String(r.STATUS||"")};}
function latestReport(id,d){return dedupeReports().find(r=>String(r.SPM_ID)===String(id)&&dateOf(r.DATE)===d)||null;}
function latestOfficeReport(id,d){return dedupeReports().find(r=>String(r.OFFICE_ID)===String(id)&&dateOf(r.DATE)===d)||null;}
function findReport(id,d){return read(SHEETS.PMV_REPORTS).find(r=>String(r.SPM_ID)===String(id)&&dateOf(r.DATE)===d)||null;}
function findReportById(id){return read(SHEETS.PMV_REPORTS).find(r=>String(r.ID).trim()===String(id||"").trim())||null;}
function dedupeReports(){const m={};read(SHEETS.PMV_REPORTS).forEach(r=>{const k=String(r.SPM_ID).trim()+"|"+dateOf(r.DATE);if(!m[k]||Number(r.__row)>Number(m[k].__row))m[k]=r;});return Object.values(m);}
function getSheet(n){const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(n);if(!sh)throw new Error("Sheet "+n+" does not exist. Run setupSpreadsheet().");return sh;}
function read(n){const sh=getSheet(n),v=sh.getDataRange().getValues();if(v.length<2)return [];const h=v[0].map(String);return v.slice(1).map((r,i)=>{const o={__row:i+2};h.forEach((x,j)=>o[x]=r[j]);return o;});}
function findUser(id){return read(SHEETS.USER_MASTER).find(r=>String(r.USER_ID).trim()===String(id||"").trim())||null;}
function getOffice(id){const o=read(SHEETS.OFFICE_MASTER).find(r=>String(r.OFFICE_ID).trim()===String(id||"").trim());if(!o)throw new Error("Office not found in OFFICE_MASTER.");if(!active(o.ACTIVE))throw new Error("Office is inactive.");return o;}
function assertOffice(a,id){const o=getOffice(id);if(a.role===ROLES.SPM&&String(a.user.OFFICE_ID)!==String(o.OFFICE_ID))throw new Error("Not authorized for this office.");}
function officeName(id,f){const o=read(SHEETS.OFFICE_MASTER).find(r=>String(r.OFFICE_ID).trim()===String(id||"").trim());return o?String(o.OFFICE_NAME||""):String(f||"");}
function normRole(v){const x=String(v||"").trim().toUpperCase();return Object.values(ROLES).includes(x)?x:"";}
function active(v){return v===true||["TRUE","1","YES","Y","ACTIVE"].includes(String(v||"").trim().toUpperCase());}
function toInt(v){if(v===""||v==null)return 0;const n=Number(v);return Number.isFinite(n)&&n>=0&&Math.floor(n)===n?n:-1;}
function isInt(v){return Number.isInteger(v)&&v>=0;}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function round(v){return Math.round(Number(v)||0);}
function todayISO(){return Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyy-MM-dd");}
function validateDate(s){const x=String(s||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(x))throw new Error("Invalid date.");const d=new Date(x+"T00:00:00");if(isNaN(d.getTime()))throw new Error("Invalid date.");return x;}
function shift(iso,days){const d=new Date(validateDate(iso)+"T00:00:00");d.setDate(d.getDate()+days);return Utilities.formatDate(d,Session.getScriptTimeZone(),"yyyy-MM-dd");}
function dateOf(v){if(v instanceof Date)return Utilities.formatDate(v,Session.getScriptTimeZone(),"yyyy-MM-dd");const s=String(v||"").trim();return /^\d{4}-\d{2}-\d{2}/.test(s)?s.substring(0,10):"";}
function invalidate(t){const sh=getSheet(SHEETS.SESSIONS),r=sh.getDataRange().getValues();for(let i=1;i<r.length;i++)if(String(r[i][0])===String(t))sh.getRange(i+1,5).setValue(false);}
function audit(u,a,id,d){getSheet(SHEETS.AUDIT_LOG).appendRow([new Date(),u,a,id,d]);}
function ok(data,message){return {success:true,data,message:message||""};}
function err(message,code){return {success:false,code:code||"ERROR",message:String(message||"Error")};}
function out(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
