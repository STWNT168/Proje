const SPREADSHEET_ID='1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8',TZ='Asia/Kolkata';
const S={U:'USER_MASTER',O:'OFFICE_MASTER',R:'PMV_REPORTS',SS:'SESSIONS',A:'AUDIT_LOG',P:'PINCODE_MASTER',M:'ARTICLE_MASTER',AS:'ARTICLE_STATUS'};
const ROLE={SPM:'SPM',DPS:'DPS',ADMIN:'ADMIN'};

function setupSpreadsheet(){
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID), headers={
    USER_MASTER:['USER_ID','NAME','MOBILE','ROLE','OFFICE_ID','OFFICE_NAME','ACTIVE'],
    OFFICE_MASTER:['OFFICE_ID','OFFICE_NAME','DIVISION','ACTIVE','PINCODES'],
    PMV_REPORTS:['ID','DATE','OFFICE_ID','OFFICE_NAME','SPM_ID','SPM_NAME','OPENING_KITS','NEW_KITS','REDIRECTED_KITS','RTS_KITS','DELIVERED_KITS','INVALID_MOBILE_KITS','TORN_KITS','DELIVERABLE_KITS','INCOMPLETE_KITS','CLOSING_PENDING_KITS','OPENING_ARTICLES','NEW_ARTICLES','REDIRECTED_ARTICLES','RTS_ARTICLES','DELIVERED_ARTICLES','INVALID_MOBILE_ARTICLES','TORN_ARTICLES','DELIVERABLE_ARTICLES','INCOMPLETE_ARTICLES','CLOSING_PENDING_ARTICLES','SUBMITTED_AT','UPDATED_AT','STATUS'],
    SESSIONS:['TOKEN','USER_ID','CREATED_AT','EXPIRES_AT','ACTIVE'],
    AUDIT_LOG:['TIMESTAMP','USER_ID','ACTION','DETAILS'],
    PINCODE_MASTER:['PINCODE','OFFICE_ID','OFFICE_NAME','ACTIVE'],
    ARTICLE_MASTER:['BAR_CODE_ID','PMV_APPLICATION_NUMBER','ARTISAN_NAME','MOBILE_NUMBER','ARTISAN_CURRENT_ADDRESS','CIRCLE_NAME','DIVISION_NAME','ARTISAN_PIN_CODE','DELIVERY_STAFF_ASSIGNED_UNASSIGNED','TOOLKIT_DELIVERY_STATUS'],
    ARTICLE_STATUS:['DATE','ARTICLE_KEY','BAR_CODE_ID','PMV_APPLICATION_NUMBER','OFFICE_ID','OFFICE_NAME','SPM_ID','SPM_NAME','STATUS','REMARKS','UPDATED_AT']
  };
  Object.keys(headers).forEach(n=>{const sh=ss.getSheetByName(n)||ss.insertSheet(n),h=headers[n];if(!sh.getLastRow())sh.getRange(1,1,1,h.length).setValues([h]);sh.setFrozenRows(1)});
  return out({ready:true},'Setup complete. Populate PINCODE_MASTER and ARTICLE_MASTER.');
}

function doGet(e){
  try{const p=e.parameter||{},s=parseSession(p.session);
    if(p.action==='getPmvOpeningBalance')return out(opening(p.date,s));
    if(p.action==='getOwnPmvDashboard')return out(own(p.date,s));
    if(p.action==='getAdminPmvDashboard')return out(admin(p.date,s));
    if(p.action==='getSpmArticles')return out(spmArticles(p,s));
    if(p.action==='getAdminArticleStatus')return out(adminArticleStatus(p,s));
    if(p.action==='getArticleSourceDiagnostic')return out(articleSourceDiagnostic(p,s));
    return out(err('Unknown GET action.'));
  }catch(e){return out(err(e.message))}
}
function doPost(e){
  try{const b=JSON.parse(e.postData?.contents||'{}'),s=parseSession(b.session);
    if(b.action==='login')return out(login(b.userId,b.mobile));
    if(b.action==='logout')return out(logout(s));
    if(b.action==='submitPmvReport')return out(submit(b.record,s));
    if(b.action==='updateArticleStatus')return out(updateArticleStatus(b.record,s));
    if(b.action==='updateArticleMasterStatus')return out(updateArticleMasterStatus(b.record,s));
    return out(err('Unknown POST action.'));
  }catch(e){return out(err(e.message))}
}

function login(id,mobile){
  const u=findUser(id);if(!u)throw Error('User ID not found.');if(!act(u.ACTIVE))throw Error('This account is inactive.');
  if(mob(u.MOBILE)!==mob(mobile))throw Error('Registered mobile number does not match.');
  const role=String(u.ROLE||'').toUpperCase();if(![ROLE.SPM,ROLE.DPS,ROLE.ADMIN].includes(role))throw Error('Invalid user role.');
  const token=Utilities.getUuid(),now=new Date(),ex=new Date(now.getTime()+7*86400000);
  sheet(S.SS).appendRow([token,String(u.USER_ID),now,ex,true]);
  audit(u.USER_ID,'LOGIN','Successful login');
  return ok({userId:String(u.USER_ID),name:String(u.NAME||''),role,officeId:String(u.OFFICE_ID||''),officeName:String(u.OFFICE_NAME||''),token,expiresAt:ex.toISOString()});
}
function logout(s){if(!s)return ok(null,'Logged out.');const sh=sheet(S.SS);read(S.SS).forEach(r=>{if(String(r.TOKEN)===String(s.token))sh.getRange(r.__row,5).setValue(false)});return ok(null,'Logged out.')}
function auth(s){
  if(!s?.token)throw Error('Not authenticated. Please sign in again.');
  const r=read(S.SS).find(x=>String(x.TOKEN)===String(s.token)&&act(x.ACTIVE)&&new Date(x.EXPIRES_AT)>new Date());if(!r)throw Error('Session expired. Please sign in again.');
  const u=findUser(r.USER_ID);if(!u||!act(u.ACTIVE))throw Error('Account is inactive.');return {user:u,role:String(u.ROLE||'').toUpperCase()};
}

function submit(x,s){
  const a=auth(s);if(a.role!==ROLE.SPM)throw Error('Only SPM users can submit daily reports.');
  const r=norm(x),oid=String(a.user.OFFICE_ID||'');r.ok=prev(oid,r.date,'K');r.oa=prev(oid,r.date,'A');
  r.ck=r.ok+r.nk-r.rk-r.rt-r.dk;r.ca=r.oa+r.na-r.ra-r.rta-r.da;
  const pk=r.ik+r.tk+r.delk+r.incK,pa=r.ia+r.ta+r.dela+r.incA;
  if(r.ck<0||r.ca<0)throw Error('Movement exceeds available stock.');
  if(r.ck!==pk)throw Error('Kit validation failed: closing balance must equal remaining classification.');
  if(r.ca!==pa)throw Error('Article validation failed: closing balance must equal remaining classification.');
  const row=[r.id,r.date,oid,String(a.user.OFFICE_NAME||''),String(a.user.USER_ID),String(a.user.NAME||''),r.ok,r.nk,r.rk,r.rt,r.dk,r.ik,r.tk,r.delk,r.incK,r.ck,r.oa,r.na,r.ra,r.rta,r.da,r.ia,r.ta,r.dela,r.incA,r.ca,new Date(),new Date(),'FINAL'];
  const old=findReport(a.user.USER_ID,r.date);if(old)sheet(S.R).getRange(old.__row,1,1,row.length).setValues([row]);else sheet(S.R).appendRow(row);
  audit(a.user.USER_ID,'SUBMIT',r.date);return ok({closingPendingKits:r.ck,closingPendingArticles:r.ca},'Report saved successfully.');
}
function opening(d,s){const a=auth(s);if(a.role!==ROLE.SPM)throw Error('Only SPM users can access opening balance.');d=String(d||today());return ok({openingKits:prev(a.user.OFFICE_ID,d,'K'),openingArticles:prev(a.user.OFFICE_ID,d,'A')})}
function own(d,s){const a=auth(s);if(a.role!==ROLE.SPM)throw Error('Only SPM users can access own report.');const r=findReport(a.user.USER_ID,String(d||today()));return ok(r?client(r):emptyClient(String(d||today())))}
function admin(d,s){
  const a=auth(s);if(![ROLE.ADMIN,ROLE.DPS].includes(a.role))throw Error('Only DPS/Admin users can access the consolidated dashboard.');
  d=String(d||today());const us=read(S.U).filter(u=>act(u.ACTIVE)&&String(u.ROLE).toUpperCase()===ROLE.SPM),rs=read(S.R).filter(r=>date(r.DATE)===d),by={};rs.forEach(r=>by[String(r.SPM_ID)]=r);
  const os={};read(S.O).filter(o=>act(o.ACTIVE)).forEach(o=>os[String(o.OFFICE_ID)]=officeBase(o));const pending=[],spmWise=[];
  us.forEach(u=>{const oid=String(u.OFFICE_ID||''),o=os[oid]||(os[oid]=officeBase(u)),r=by[String(u.USER_ID)];o.totalSpms++;
    if(r){o.updatedSpms++;spmWise.push({...client(r),spmId:String(u.USER_ID),spmName:String(u.NAME||''),officeId:oid,officeName:o.officeName,status:'Updated'})}
    else{pending.push({spmName:String(u.NAME||''),spmId:String(u.USER_ID),officeName:o.officeName});spmWise.push({date:d,spmId:String(u.USER_ID),spmName:String(u.NAME||''),officeId:oid,officeName:o.officeName,status:'Not Updated',...emptyClient(d)})}
  });
  const z={newKits:0,newArticles:0,redirectedKits:0,redirectedArticles:0,rtsKits:0,rtsArticles:0,deliveredKitsToday:0,deliveredArticlesToday:0,closingPendingKits:0,closingPendingArticles:0,invalidMobileKits:0,invalidMobileArticles:0,tornKits:0,tornArticles:0,deliverableKits:0,deliverableArticles:0,incompleteKits:0,incompleteArticles:0};
  rs.forEach(r=>{['NEW_KITS','NEW_ARTICLES','REDIRECTED_KITS','REDIRECTED_ARTICLES','RTS_KITS','RTS_ARTICLES','DELIVERED_KITS','DELIVERED_ARTICLES','CLOSING_PENDING_KITS','CLOSING_PENDING_ARTICLES','INVALID_MOBILE_KITS','INVALID_MOBILE_ARTICLES','TORN_KITS','TORN_ARTICLES','DELIVERABLE_KITS','DELIVERABLE_ARTICLES','INCOMPLETE_KITS','INCOMPLETE_ARTICLES'].forEach(k=>z[key(k)]+=num(r[k]));const o=os[String(r.OFFICE_ID)]||(os[String(r.OFFICE_ID)]=officeBase(r));['OPENING_KITS','NEW_KITS','REDIRECTED_KITS','RTS_KITS','DELIVERED_KITS','CLOSING_PENDING_KITS','OPENING_ARTICLES','NEW_ARTICLES','REDIRECTED_ARTICLES','RTS_ARTICLES','DELIVERED_ARTICLES','CLOSING_PENDING_ARTICLES'].forEach(k=>o[key(k)]+=num(r[k]))});
  return ok({date:d,summary:z,officeWise:Object.values(os).map(o=>({...o,status:o.totalSpms&&o.updatedSpms===o.totalSpms?'Updated':'Pending'})),spmWise,pendingSpms:pending,spmsUpdatedToday:rs.length,activeSpms:us.length,spmsPendingUpdate:pending.length});
}
function officeBase(o){return {officeId:String(o.OFFICE_ID||''),officeName:String(o.OFFICE_NAME||''),totalSpms:0,updatedSpms:0,openingKits:0,newKits:0,redirectedKits:0,rtsKits:0,deliveredKits:0,closingPendingKits:0,openingArticles:0,newArticles:0,redirectedArticles:0,rtsArticles:0,deliveredArticles:0,closingPendingArticles:0}}
function key(k){return ({NEW_KITS:'newKits',NEW_ARTICLES:'newArticles',REDIRECTED_KITS:'redirectedKits',REDIRECTED_ARTICLES:'redirectedArticles',RTS_KITS:'rtsKits',RTS_ARTICLES:'rtsArticles',DELIVERED_KITS:'deliveredKits',DELIVERED_ARTICLES:'deliveredArticles',CLOSING_PENDING_KITS:'closingPendingKits',CLOSING_PENDING_ARTICLES:'closingPendingArticles',INVALID_MOBILE_KITS:'invalidMobileKits',INVALID_MOBILE_ARTICLES:'invalidMobileArticles',TORN_KITS:'tornKits',TORN_ARTICLES:'tornArticles',DELIVERABLE_KITS:'deliverableKits',DELIVERABLE_ARTICLES:'deliverableArticles',INCOMPLETE_KITS:'incompleteKits',INCOMPLETE_ARTICLES:'incompleteArticles',OPENING_KITS:'openingKits',OPENING_ARTICLES:'openingArticles'})[k]||k}

function spmArticles(p,s){
  const a=auth(s);if(a.role!==ROLE.SPM)throw Error('Only SPM users can access articles.');
  const d=String(p.date||today()),q=String(p.q||'').toLowerCase(),limit=Math.min(1000,Math.max(1,Number(p.limit||1000)));
  const rows=read(S.M),statuses=read(S.AS),pins=read(S.P);
  const ownPins=pins.filter(x=>act(x.ACTIVE)&&String(x.OFFICE_ID)===String(a.user.OFFICE_ID)).map(x=>String(x.PINCODE).trim());
  const result=[];
  rows.forEach(r=>{const pin=String(r.ARTISAN_PIN_CODE||'').trim();if(!ownPins.includes(pin))return;const base=articleBase(r,pin,pins),st=statusFor(r,d,statuses);
    const obj=mergeArticle(base,st);if(q&&!articleSearch(obj).includes(q))return;result.push(obj)});
  return ok(result.slice(0,limit));
}
function adminArticleStatus(p,s){
  const a=auth(s);if(![ROLE.ADMIN,ROLE.DPS].includes(a.role))throw Error('Only DPS/Admin users can access article status.');
  const d=String(p.date||today()),q=String(p.q||'').toLowerCase(),limit=Math.min(2000,Math.max(1,Number(p.limit||2000))),pins=read(S.P),statuses=read(S.AS);
  const result=read(S.M).map(r=>{const pin=String(r.ARTISAN_PIN_CODE||'').trim();return mergeArticle(articleBase(r,pin,pins),statusFor(r,d,statuses))}).filter(x=>!q||articleSearch(x).includes(q));
  return ok(result.slice(0,limit));
}
function articleSourceDiagnostic(p,s){
  const a=auth(s);if(![ROLE.ADMIN,ROLE.DPS].includes(a.role))throw Error('Only DPS/Admin users can run diagnostics.');
  const m=read(S.M),pincodes=read(S.P),status=read(S.AS);return ok({articleMasterRows:m.length,pincodeRows:pincodes.length,articleStatusRows:status.length,articleMasterExists:!!SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(S.M),columns:m.length?Object.keys(m[0]).filter(k=>k!=='__row'):[]});
}
function articleBase(r,pin,pins){const o=pins.find(x=>act(x.ACTIVE)&&String(x.PINCODE).trim()===pin)||{};return {articleKey:articleKey(r),barCodeId:String(r.BAR_CODE_ID||''),pmvApplicationNumber:String(r.PMV_APPLICATION_NUMBER||''),artisanName:String(r.ARTISAN_NAME||''),mobileNumber:String(r.MOBILE_NUMBER||''),address:String(r.ARTISAN_CURRENT_ADDRESS||''),circleName:String(r.CIRCLE_NAME||''),divisionName:String(r.DIVISION_NAME||''),pinCode:pin,deliveryStaff:String(r.DELIVERY_STAFF_ASSIGNED_UNASSIGNED||''),sourceStatus:String(r.TOOLKIT_DELIVERY_STATUS||''),officeId:String(o.OFFICE_ID||''),officeName:String(o.OFFICE_NAME||'')}}
function mergeArticle(b,s){return {...b,status:String(s?.STATUS||''),presentStatus:String(s?.STATUS||b.sourceStatus||'Pending')||'Pending',remarks:String(s?.REMARKS||''),spmId:String(s?.SPM_ID||''),spmName:String(s?.SPM_NAME||''),updatedAt:s?.UPDATED_AT?String(s.UPDATED_AT):''}}
function statusFor(r,d,rows){const k=articleKey(r);return rows.filter(x=>date(x.DATE)===d&&(String(x.ARTICLE_KEY)===k||String(x.BAR_CODE_ID)===String(r.BAR_CODE_ID)||String(x.PMV_APPLICATION_NUMBER)===String(r.PMV_APPLICATION_NUMBER))).sort((a,b)=>String(b.UPDATED_AT).localeCompare(String(a.UPDATED_AT)))[0]||null}
function articleSearch(x){return [x.barCodeId,x.pmvApplicationNumber,x.artisanName,x.mobileNumber,x.pinCode,x.officeName,x.presentStatus].join(' ').toLowerCase()}
function articleKey(r){return String(r.BAR_CODE_ID||r.PMV_APPLICATION_NUMBER||Utilities.getUuid()).trim()}

function updateArticleStatus(x,s){
  const a=auth(s);if(a.role!==ROLE.SPM)throw Error('Only SPM users can update article status.');
  const key=String(x?.articleKey||x?.barCodeId||x?.pmvApplicationNumber||'').trim();if(!key)throw Error('Article key is required.');
  const r=read(S.M).find(z=>articleKey(z)===key||String(z.BAR_CODE_ID)===String(x.barCodeId)||String(z.PMV_APPLICATION_NUMBER)===String(x.pmvApplicationNumber));if(!r)throw Error('Article not found.');
  const pin=String(r.ARTISAN_PIN_CODE||'').trim(),p=read(S.P).find(z=>act(z.ACTIVE)&&String(z.PINCODE).trim()===pin&&String(z.OFFICE_ID)===String(a.user.OFFICE_ID));if(!p)throw Error('Article is not assigned to your office PIN code.');
  const allowed=['Pending','Delivered','Redirected','RTS / Return','Not Received','Other'];const st=String(x.status||'Pending');if(!allowed.includes(st))throw Error('Invalid article status.');
  const sh=sheet(S.AS),rows=read(S.AS),d=String(x.date||today()),old=rows.find(z=>date(z.DATE)===d&&String(z.ARTICLE_KEY)===articleKey(r)&&String(z.SPM_ID)===String(a.user.USER_ID));
  const row=[d,articleKey(r),String(r.BAR_CODE_ID||''),String(r.PMV_APPLICATION_NUMBER||''),String(a.user.OFFICE_ID||''),String(a.user.OFFICE_NAME||''),String(a.user.USER_ID),String(a.user.NAME||''),st,String(x.remarks||''),new Date()];
  if(old)sh.getRange(old.__row,1,1,row.length).setValues([row]);else sh.appendRow(row);
  audit(a.user.USER_ID,'ARTICLE_STATUS',articleKey(r)+' => '+st);return ok({articleKey:articleKey(r),presentStatus:st,message:'Article status updated successfully.'});
}
function updateArticleMasterStatus(x,s){
  const a=auth(s);if(![ROLE.ADMIN,ROLE.DPS].includes(a.role))throw Error('Only Admin/DPS can update master article status.');
  const r=read(S.M).find(z=>String(z.BAR_CODE_ID)===String(x?.barCodeId||'')||String(z.PMV_APPLICATION_NUMBER)===String(x?.pmvApplicationNumber||'')||articleKey(z)===String(x?.articleKey||''));if(!r)throw Error('Article not found in ARTICLE_MASTER.');
  const allowed=['Pending','Delivered','Redirected','RTS / Return','Not Received','Other'];const st=String(x.status||'Pending');if(!allowed.includes(st))throw Error('Invalid master status.');
  const headers=header(S.M),idx=headers.indexOf('TOOLKIT_DELIVERY_STATUS');if(idx<0)throw Error('ARTICLE_MASTER is missing TOOLKIT_DELIVERY_STATUS column.');
  sheet(S.M).getRange(r.__row,idx+1).setValue(st);audit(a.user.USER_ID,'ARTICLE_MASTER_STATUS',articleKey(r)+' => '+st);
  return ok({articleKey:articleKey(r),presentStatus:st,message:'ARTICLE_MASTER status updated successfully.'});
}

/* CSV helper: paste CSV text into Apps Script editor and run once, or call from an admin utility. */
function importArticleMasterCsv(csvText){
  const rows=Utilities.parseCsv(String(csvText||''));if(!rows.length)throw Error('CSV is empty.');
  const sh=sheet(S.M);sh.clearContents();sh.getRange(1,1,1,10).setValues([['BAR_CODE_ID','PMV_APPLICATION_NUMBER','ARTISAN_NAME','MOBILE_NUMBER','ARTISAN_CURRENT_ADDRESS','CIRCLE_NAME','DIVISION_NAME','ARTISAN_PIN_CODE','DELIVERY_STAFF_ASSIGNED_UNASSIGNED','TOOLKIT_DELIVERY_STATUS']]);
  if(rows.length>1)sh.getRange(2,1,rows.length-1,10).setValues(rows.slice(1).map(r=>Array.from({length:10},(_,i)=>r[i]??'')));
  return {rowsImported:Math.max(0,rows.length-1)};
}

function prev(oid,d,t){const q=read(S.R).filter(r=>String(r.OFFICE_ID)===String(oid)&&date(r.DATE)<d).sort((a,b)=>date(b.DATE).localeCompare(date(a.DATE)));return q.length?(t==='K'?num(q[0].CLOSING_PENDING_KITS):num(q[0].CLOSING_PENDING_ARTICLES)):0}
function norm(x){const r={id:x?.id||Utilities.getUuid(),date:String(x?.date||today())},m={newKits:'nk',newArticles:'na',redirectedKits:'rk',redirectedArticles:'ra',rtsKits:'rt',rtsArticles:'rta',deliveredKits:'dk',deliveredArticles:'da',invalidMobileKits:'ik',invalidMobileArticles:'ia',tornKits:'tk',tornArticles:'ta',deliverableKits:'delk',deliverableArticles:'dela',incompleteKits:'incK',incompleteArticles:'incA'};Object.keys(m).forEach(k=>r[m[k]]=Math.max(0,Math.floor(num(x?.[k]))));if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date))throw Error('Invalid report date.');r.ok=r.oa=r.ck=r.ca=0;return r}
function client(r){return {date:date(r.DATE),openingKits:num(r.OPENING_KITS),openingArticles:num(r.OPENING_ARTICLES),newKits:num(r.NEW_KITS),newArticles:num(r.NEW_ARTICLES),redirectedKits:num(r.REDIRECTED_KITS),redirectedArticles:num(r.REDIRECTED_ARTICLES),rtsKits:num(r.RTS_KITS),rtsArticles:num(r.RTS_ARTICLES),deliveredKits:num(r.DELIVERED_KITS),deliveredArticles:num(r.DELIVERED_ARTICLES),invalidMobileKits:num(r.INVALID_MOBILE_KITS),invalidMobileArticles:num(r.INVALID_MOBILE_ARTICLES),tornKits:num(r.TORN_KITS),tornArticles:num(r.TORN_ARTICLES),deliverableKits:num(r.DELIVERABLE_KITS),deliverableArticles:num(r.DELIVERABLE_ARTICLES),incompleteKits:num(r.INCOMPLETE_KITS),incompleteArticles:num(r.INCOMPLETE_ARTICLES),closingPendingKits:num(r.CLOSING_PENDING_KITS),closingPendingArticles:num(r.CLOSING_PENDING_ARTICLES)}}
function emptyClient(d){return {date:d,openingKits:0,openingArticles:0,newKits:0,newArticles:0,redirectedKits:0,redirectedArticles:0,rtsKits:0,rtsArticles:0,deliveredKits:0,deliveredArticles:0,invalidMobileKits:0,invalidMobileArticles:0,tornKits:0,tornArticles:0,deliverableKits:0,deliverableArticles:0,incompleteKits:0,incompleteArticles:0,closingPendingKits:0,closingPendingArticles:0}}
function findUser(id){return read(S.U).find(r=>String(r.USER_ID)===String(id))}
function findReport(uid,d){return read(S.R).find(r=>String(r.SPM_ID)===String(uid)&&date(r.DATE)===String(d))}
function sheet(n){const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(n);if(!sh)throw Error('Sheet '+n+' not found. Run setupSpreadsheet().');return sh}
function read(n){const sh=sheet(n),v=sh.getDataRange().getValues();if(v.length<2)return [];const h=v[0].map(String);return v.slice(1).map((r,i)=>{const o={__row:i+2};h.forEach((k,j)=>o[k]=r[j]);return o})}
function header(n){return sheet(n).getRange(1,1,1,sheet(n).getLastColumn()).getValues()[0].map(String)}
function date(v){if(v instanceof Date)return Utilities.formatDate(v,TZ,'yyyy-MM-dd');return String(v||'').slice(0,10)}
function today(){return Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd')}
function num(v){const n=Number(v);return isNaN(n)?0:n}
function mob(v){return String(v??'').replace(/\D/g,'')}
function act(v){return v===true||String(v).toUpperCase()==='TRUE'||String(v)==='1'||String(v).toUpperCase()==='YES'}
function parseSession(v){if(!v)return null;try{return typeof v==='string'?JSON.parse(v):v}catch(e){return null}}
function audit(uid,action,details){try{sheet(S.A).appendRow([new Date(),String(uid||''),action,String(details||'')])}catch(e){}}
function ok(data,message){return {success:true,data:data===undefined?null:data,message:message||''}}
function err(message){return {success:false,data:null,message:String(message||'Request failed.')}}
function out(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON)}
