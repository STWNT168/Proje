const SPREADSHEET_ID="1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8";
const S={U:"USER_MASTER",O:"OFFICE_MASTER",R:"PMV_REPORTS",S:"SESSIONS",A:"AUDIT_LOG"};
const ROLES={SPM:"SPM",DPS:"DPS",ADMIN:"ADMIN"},TZ="Asia/Kolkata";

function setupSpreadsheet(){
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
  const d={
    USER_MASTER:["USER_ID","NAME","MOBILE","ROLE","OFFICE_ID","OFFICE_NAME","ACTIVE"],
    OFFICE_MASTER:["OFFICE_ID","OFFICE_NAME","DIVISION","ACTIVE"],
    PMV_REPORTS:["ID","DATE","OFFICE_ID","OFFICE_NAME","SPM_ID","SPM_NAME","OPENING_KITS","NEW_KITS","REDIRECTED_KITS","RTS_KITS","DELIVERED_KITS","INVALID_MOBILE_KITS","TORN_KITS","DELIVERABLE_KITS","INCOMPLETE_KITS","CLOSING_PENDING_KITS","OPENING_ARTICLES","NEW_ARTICLES","REDIRECTED_ARTICLES","RTS_ARTICLES","DELIVERED_ARTICLES","INVALID_MOBILE_ARTICLES","TORN_ARTICLES","DELIVERABLE_ARTICLES","INCOMPLETE_ARTICLES","CLOSING_PENDING_ARTICLES","SUBMITTED_AT","UPDATED_AT","STATUS"],
    SESSIONS:["TOKEN","USER_ID","CREATED_AT","EXPIRES_AT","ACTIVE"],
    AUDIT_LOG:["TIMESTAMP","USER_ID","ACTION","DETAILS"]
  };
  Object.keys(d).forEach(n=>{
    const sh=ss.getSheetByName(n)||ss.insertSheet(n);
    if(sh.getLastRow()===0)sh.appendRow(d[n]);
    sh.setFrozenRows(1);
  });
  return "Setup complete";
}

function doGet(e){
  try{
    const p=e.parameter||{};
    if(p.action==="getAdminPmvDashboard")return out(admin(p.date,p.session));
    if(p.action==="getPmvOpeningBalance")return out(opening(p.date,p.session));
    if(p.action==="getOwnPmvDashboard")return out(own(p.date,p.session));
    return out(err("Unknown GET action."));
  }catch(x){return out(err(x.message))}
}

function doPost(e){
  try{
    const b=JSON.parse(e.postData&&e.postData.contents||"{}");
    if(b.action==="login")return out(login(b.userId,b.mobile));
    if(b.action==="logout")return out(logout(b.session));
    if(b.action==="submitPmvReport")return out(submit(b.record,b.session));
    return out(err("Unknown POST action."));
  }catch(x){return out(err(x.message))}
}

function login(id,mobile){
  const u=findUser(id);
  if(!u)return err("User not found.");
  if(String(u.MOBILE).trim()!==String(mobile).trim())return err("Mobile number does not match our records.");
  if(!act(u.ACTIVE))return err("This account is inactive.");
  const role=String(u.ROLE||"").toUpperCase();
  if(![ROLES.SPM,ROLES.DPS,ROLES.ADMIN].includes(role))return err("Invalid user role.");
  const token=Utilities.getUuid(),now=new Date(),expires=new Date(now.getTime()+7*86400000);
  sheet(S.S).appendRow([token,String(u.USER_ID),now,expires,true]);
  audit(u.USER_ID,"LOGIN","Successful login");
  return ok({userId:String(u.USER_ID),name:String(u.NAME||""),role,officeId:String(u.OFFICE_ID||""),officeName:String(u.OFFICE_NAME||""),token,expiresAt:expires.toISOString()});
}

function logout(session){
  const a=auth(session);
  const rowsS=rows(S.S);
  rowsS.forEach(r=>{if(String(r.TOKEN)===String(session.token))sheet(S.S).getRange(r.__row,5).setValue(false)});
  audit(a.user.USER_ID,"LOGOUT","User logged out");
  return ok(null,"Logged out.");
}

function submit(record,session){
  const a=auth(session);
  if(a.role!==ROLES.SPM)throw Error("Only SPM users can submit.");
  const r=norm(record),o=office(a.user.OFFICE_ID);

  // Opening balance is ALWAYS the previous report's CLOSING balance.
  r.officeId=String(a.user.OFFICE_ID);
  r.officeName=String(o.OFFICE_NAME||a.user.OFFICE_NAME||"");
  r.spmId=String(a.user.USER_ID);
  r.spmName=String(a.user.NAME||"");
  r.openingKits=previousClosing(r.officeId,r.date,"K");
  r.openingArticles=previousClosing(r.officeId,r.date,"A");

  r.closingPendingKits=r.openingKits+r.newKits-r.redirectedKits-r.rtsKits-r.deliveredKits;
  r.closingPendingArticles=r.openingArticles+r.newArticles-r.redirectedArticles-r.rtsArticles-r.deliveredArticles;

  const kitCategories=r.invalidMobileKits+r.tornKits+r.deliverableKits+r.incompleteKits;
  const articleCategories=r.invalidMobileArticles+r.tornArticles+r.deliverableArticles+r.incompleteArticles;

  if(r.closingPendingKits<0||r.closingPendingArticles<0)throw Error("Movement exceeds available stock.");
  if(r.closingPendingKits!==kitCategories)throw Error("Kit validation failed: Opening + New - Redirected - RTS - Delivered must equal Invalid Mobile + Torn/Without Proper Details + Deliverable + Incomplete.");
  if(r.closingPendingArticles!==articleCategories)throw Error("Article validation failed: Opening + New - Redirected - RTS - Delivered must equal Invalid Mobile + Torn/Without Proper Details + Deliverable + Incomplete.");

  const old=findReport(r.spmId,r.date);
  const now=new Date();
  const row=[
    r.id,r.date,r.officeId,r.officeName,r.spmId,r.spmName,
    r.openingKits,r.newKits,r.redirectedKits,r.rtsKits,r.deliveredKits,r.invalidMobileKits,r.tornKits,r.deliverableKits,r.incompleteKits,r.closingPendingKits,
    r.openingArticles,r.newArticles,r.redirectedArticles,r.rtsArticles,r.deliveredArticles,r.invalidMobileArticles,r.tornArticles,r.deliverableArticles,r.incompleteArticles,r.closingPendingArticles,
    now,now,"FINAL"
  ];
  if(old)sheet(S.R).getRange(old.__row,1,1,row.length).setValues([row]);
  else sheet(S.R).appendRow(row);
  audit(r.spmId,"SUBMIT",r.date+" report saved");
  return ok({recordId:r.id,closingPendingKits:r.closingPendingKits,closingPendingArticles:r.closingPendingArticles},"Report saved successfully.");
}

function admin(date,session){
  const a=auth(session);
  if(a.role!==ROLES.ADMIN&&a.role!==ROLES.DPS)throw Error("Only DPS/Admin users can access this function.");
  date=String(date||today());

  const us=rows(S.U).filter(x=>act(x.ACTIVE)&&String(x.ROLE).toUpperCase()===ROLES.SPM);
  const rs=rows(S.R).filter(x=>dateOf(x.DATE)===date);
  const bySpm={};rs.forEach(r=>bySpm[String(r.SPM_ID)]=r);

  const om={};
  rows(S.O).filter(x=>act(x.ACTIVE)).forEach(o=>om[String(o.OFFICE_ID)]=baseOffice(o));

  const pending=[];
  us.forEach(u=>{
    const id=String(u.USER_ID),oid=String(u.OFFICE_ID||"");
    const o=om[oid]||(om[oid]=baseOffice(u));
    o.totalSpms++;
    if(bySpm[id])o.updatedSpms++;
    else{ o.pendingSpms++; pending.push({spmName:String(u.NAME||""),spmId:id,officeName:String(o.officeName||u.OFFICE_NAME||"")});}
  });

  const sum={
    newKits:0,newArticles:0,redirectedKits:0,redirectedArticles:0,
    rtsKits:0,rtsArticles:0,deliveredKitsToday:0,deliveredArticlesToday:0,
    closingPendingKits:0,closingPendingArticles:0,invalidMobileKits:0,incompleteKits:0,
    invalidMobileArticles:0,incompleteArticles:0
  };

  rs.forEach(r=>{
    sum.newKits+=num(r.NEW_KITS);sum.newArticles+=num(r.NEW_ARTICLES);
    sum.redirectedKits+=num(r.REDIRECTED_KITS);sum.redirectedArticles+=num(r.REDIRECTED_ARTICLES);
    sum.rtsKits+=num(r.RTS_KITS);sum.rtsArticles+=num(r.RTS_ARTICLES);
    sum.deliveredKitsToday+=num(r.DELIVERED_KITS);sum.deliveredArticlesToday+=num(r.DELIVERED_ARTICLES);
    sum.closingPendingKits+=num(r.CLOSING_PENDING_KITS);sum.closingPendingArticles+=num(r.CLOSING_PENDING_ARTICLES);
    sum.invalidMobileKits+=num(r.INVALID_MOBILE_KITS);sum.invalidMobileArticles+=num(r.INVALID_MOBILE_ARTICLES);
    sum.incompleteKits+=num(r.INCOMPLETE_KITS);sum.incompleteArticles+=num(r.INCOMPLETE_ARTICLES);

    const oid=String(r.OFFICE_ID||""),o=om[oid]||(om[oid]=baseOffice(r));
    o.openingKits+=num(r.OPENING_KITS);o.newKits+=num(r.NEW_KITS);o.redirectedKits+=num(r.REDIRECTED_KITS);o.rtsKits+=num(r.RTS_KITS);o.deliveredKits+=num(r.DELIVERED_KITS);o.closingPendingKits+=num(r.CLOSING_PENDING_KITS);
    o.openingArticles+=num(r.OPENING_ARTICLES);o.newArticles+=num(r.NEW_ARTICLES);o.redirectedArticles+=num(r.REDIRECTED_ARTICLES);o.rtsArticles+=num(r.RTS_ARTICLES);o.deliveredArticles+=num(r.DELIVERED_ARTICLES);o.closingPendingArticles+=num(r.CLOSING_PENDING_ARTICLES);
  });

  return ok({
    date,summary:sum,
    officeWise:Object.values(om).map(o=>({...o,status:o.totalSpms>0&&o.updatedSpms===o.totalSpms?"Updated":"Pending"})),
    pendingSpms:pending,spmsUpdatedToday:rs.length,activeSpms:us.length,spmsPendingUpdate:pending.length
  });
}

function opening(date,session){
  const a=auth(session);
  if(a.role!==ROLES.SPM)throw Error("Only SPM users can access opening balance.");
  date=String(date||today());
  return ok({openingKits:previousClosing(String(a.user.OFFICE_ID),date,"K"),openingArticles:previousClosing(String(a.user.OFFICE_ID),date,"A")});
}

function own(date,session){
  const a=auth(session);
  if(a.role!==ROLES.SPM)throw Error("Only SPM users can access own report.");
  const r=findReport(a.user.USER_ID,String(date||today()));
  return ok(r?reportToClient(r):null);
}

function previousClosing(officeId,date,type){
  const q=rows(S.R).filter(r=>String(r.OFFICE_ID)===String(officeId)&&dateOf(r.DATE)<String(date))
    .sort((a,b)=>dateOf(b.DATE).localeCompare(dateOf(a.DATE)));
  if(!q.length)return 0;
  return type==="K"?num(q[0].CLOSING_PENDING_KITS):num(q[0].CLOSING_PENDING_ARTICLES);
}

function norm(x){
  const r={...(x||{})};
  ["newKits","newArticles","redirectedKits","redirectedArticles","rtsKits","rtsArticles","deliveredKits","deliveredArticles","invalidMobileKits","invalidMobileArticles","tornKits","tornArticles","deliverableKits","deliverableArticles","incompleteKits","incompleteArticles"].forEach(k=>r[k]=Math.max(0,Math.floor(num(r[k]))));
  r.id=r.id||Utilities.getUuid();r.date=String(r.date||today());
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date))throw Error("Invalid report date.");
  return r;
}

function reportToClient(r){
  return {
    date:dateOf(r.DATE),newKits:num(r.NEW_KITS),newArticles:num(r.NEW_ARTICLES),
    redirectedKits:num(r.REDIRECTED_KITS),redirectedArticles:num(r.REDIRECTED_ARTICLES),
    rtsKits:num(r.RTS_KITS),rtsArticles:num(r.RTS_ARTICLES),
    deliveredKits:num(r.DELIVERED_KITS),deliveredArticles:num(r.DELIVERED_ARTICLES),
    invalidMobileKits:num(r.INVALID_MOBILE_KITS),invalidMobileArticles:num(r.INVALID_MOBILE_ARTICLES),
    tornKits:num(r.TORN_KITS),tornArticles:num(r.TORN_ARTICLES),
    deliverableKits:num(r.DELIVERABLE_KITS),deliverableArticles:num(r.DELIVERABLE_ARTICLES),
    incompleteKits:num(r.INCOMPLETE_KITS),incompleteArticles:num(r.INCOMPLETE_ARTICLES),
    openingKits:num(r.OPENING_KITS),openingArticles:num(r.OPENING_ARTICLES),
    closingPendingKits:num(r.CLOSING_PENDING_KITS),closingPendingArticles:num(r.CLOSING_PENDING_ARTICLES)
  };
}

function baseOffice(x){
  return {officeId:String(x.OFFICE_ID||""),officeName:String(x.OFFICE_NAME||""),totalSpms:0,updatedSpms:0,pendingSpms:0,
    openingKits:0,newKits:0,redirectedKits:0,rtsKits:0,deliveredKits:0,closingPendingKits:0,
    openingArticles:0,newArticles:0,redirectedArticles:0,rtsArticles:0,deliveredArticles:0,closingPendingArticles:0};
}
function findReport(id,d){return rows(S.R).find(r=>String(r.SPM_ID)===String(id)&&dateOf(r.DATE)===String(d))}
function findUser(id){return rows(S.U).find(r=>String(r.USER_ID).trim()===String(id).trim())}
function office(id){const o=rows(S.O).find(r=>String(r.OFFICE_ID)===String(id));if(!o)throw Error("Office not found.");return o}
function auth(s){
  if(!s||!s.userId||!s.token)throw Error("Not authenticated.");
  const r=rows(S.S).find(x=>String(x.TOKEN)===String(s.token)&&String(x.USER_ID)===String(s.userId)&&act(x.ACTIVE));
  if(!r)throw Error("Session expired or invalid. Please log in again.");
  if(new Date(r.EXPIRES_AT)<=new Date())throw Error("Session expired. Please log in again.");
  const u=findUser(s.userId);if(!u||!act(u.ACTIVE))throw Error("Account is inactive.");
  return {user:u,role:String(u.ROLE||"").toUpperCase()};
}
function rows(n){const sh=sheet(n),v=sh.getDataRange().getValues(),h=v.shift()||[];return v.map((r,i)=>{const o={__row:i+2};h.forEach((k,j)=>o[k]=r[j]);return o})}
function sheet(n){const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(n);if(!sh)throw Error("Missing sheet "+n+". Run setupSpreadsheet() once.");return sh}
function dateOf(v){return v instanceof Date?Utilities.formatDate(v,TZ,"yyyy-MM-dd"):String(v||"").slice(0,10)}
function today(){return Utilities.formatDate(new Date(),TZ,"yyyy-MM-dd")}
function num(v){const n=Number(v);return isFinite(n)?n:0}
function act(v){return v===true||["true","yes","1","active","y"].includes(String(v).toLowerCase().trim())}
function audit(uid,action,details){try{sheet(S.A).appendRow([new Date(),uid,action,details])}catch(e){}}
function ok(data,message){return{success:true,data:data===undefined?null:data,message:message||"OK"}}
function err(message){return{success:false,message:String(message||"Request failed.")}}
function out(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON)}
