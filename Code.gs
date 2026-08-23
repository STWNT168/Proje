const SPREADSHEET_ID='1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8',TZ='Asia/Kolkata';
const S={U:'USER_MASTER',O:'OFFICE_MASTER',R:'PMV_REPORTS',SS:'SESSIONS',A:'AUDIT_LOG',P:'PINCODE_MASTER',AS:'ARTICLE_STATUS'};
const ROLE={SPM:'SPM',DPS:'DPS',ADMIN:'ADMIN'};

/* =========================================================
   SETUP
   ========================================================= */

function setupSpreadsheet(){
  let ss=SpreadsheetApp.openById(SPREADSHEET_ID),h={
    USER_MASTER:['USER_ID','NAME','MOBILE','ROLE','OFFICE_ID','OFFICE_NAME','ACTIVE'],
    OFFICE_MASTER:['OFFICE_ID','OFFICE_NAME','DIVISION','ACTIVE','PINCODES'],
    PMV_REPORTS:['ID','DATE','OFFICE_ID','OFFICE_NAME','SPM_ID','SPM_NAME','OPENING_KITS','NEW_KITS','REDIRECTED_KITS','RTS_KITS','DELIVERED_KITS','INVALID_MOBILE_KITS','TORN_KITS','DELIVERABLE_KITS','INCOMPLETE_KITS','CLOSING_PENDING_KITS','OPENING_ARTICLES','NEW_ARTICLES','REDIRECTED_ARTICLES','RTS_ARTICLES','DELIVERED_ARTICLES','INVALID_MOBILE_ARTICLES','TORN_ARTICLES','DELIVERABLE_ARTICLES','INCOMPLETE_ARTICLES','CLOSING_PENDING_ARTICLES','SUBMITTED_AT','UPDATED_AT','STATUS'],
    SESSIONS:['TOKEN','USER_ID','CREATED_AT','EXPIRES_AT','ACTIVE'],
    AUDIT_LOG:['TIMESTAMP','USER_ID','ACTION','DETAILS'],
    PINCODE_MASTER:['PINCODE','OFFICE_ID','OFFICE_NAME','ACTIVE'],
    ARTICLE_MASTER:['BAR_CODE_ID','PMV_APPLICATION_NUMBER','ARTISAN_NAME','MOBILE_NUMBER','ARTISAN_CURRENT_ADDRESS','CIRCLE_NAME','DIVISION_NAME','ARTISAN_PIN_CODE','DELIVERY_STAFF_ASSIGNED_UNASSIGNED','TOOLKIT_DELIVERY_STATUS'],
    ARTICLE_STATUS:['DATE','ARTICLE_KEY','BAR_CODE_ID','PMV_APPLICATION_NUMBER','OFFICE_ID','OFFICE_NAME','SPM_ID','SPM_NAME','STATUS','REMARKS','UPDATED_AT']
  };
  Object.keys(h).forEach(n=>{
    let sh=ss.getSheetByName(n)||ss.insertSheet(n),need=h[n];
    if(!sh.getLastRow()) sh.appendRow(need);
    else{
      let cur=sh.getRange(1,1,1,Math.max(sh.getLastColumn(),need.length)).getValues()[0];
      need.forEach((v,i)=>{
        if(cur[i]!==v&&cur.indexOf(v)<0) sh.getRange(1,i+1).setValue(v);
      });
    }
    sh.setFrozenRows(1);
  });
  return out(1,'Setup complete. Import article data into ARTICLE_MASTER or any compatible article-data sheet. Populate PINCODE_MASTER (PINCODE → OFFICE_ID).');
}

/* =========================================================
   API ROUTING
   ========================================================= */

function doGet(e){
  try{
    let p=e.parameter||{},s=parse(p.session);
    if(p.action==='getPmvOpeningBalance') return out(opening(p.date,s));
    if(p.action==='getOwnPmvDashboard') return out(own(p.date,s));
    if(p.action==='getAdminPmvDashboard') return out(admin(p.date,s));
    if(p.action==='getSpmArticles') return out(spmArticles(p,s));
    if(p.action==='getAdminArticleStatus') return out(adminArticleStatus(p,s));
    if(p.action==='getArticleSourceDiagnostic') return out(articleSourceDiagnostic(p,s));
    return out(err('Unknown GET action.'));
  }catch(x){
    return out(err(x.message));
  }
}

function doPost(e){
  try{
    let b=JSON.parse(e.postData?.contents||'{}');

    if(b.action==='login')
      return out(login(b.userId,b.mobile));

    if(b.action==='logout')
      return out(logout(parse(b.session)));

    if(b.action==='submitPmvReport')
      return out(submit(b.record,parse(b.session)));

    if(b.action==='updateArticleStatus')
      return out(updateArticleStatus(
        b.record,
        parse(b.session)
      ));

    if(b.action==='updateArticleMasterStatus')
      return out(updateArticleMasterStatus(
        b.record,
        parse(b.session)
      ));

    return out(err('Unknown POST action.'));

  }catch(x){
    return out(err(x.message));
  }
}

/* =========================================================
   AUTH / LOGIN
   ========================================================= */

function login(id,m){
  let u=findUser(id);
  if(!u) return err('User ID not found.');
  if(!act(u.ACTIVE)) return err('This account is inactive.');
  if(mob(u.MOBILE)!==mob(m)) return err('Registered mobile number does not match.');
  let role=String(u.ROLE||'').toUpperCase();
  if(![ROLE.SPM,ROLE.DPS,ROLE.ADMIN].includes(role)) return err('Invalid user role.');
  let t=Utilities.getUuid(),now=new Date(),ex=new Date(now.getTime()+604800000);
  sheet(S.SS).appendRow([t,String(u.USER_ID),now,ex,true]);
  audit(u.USER_ID,'LOGIN','Successful login');
  return ok({
    userId:String(u.USER_ID),
    name:String(u.NAME||''),
    role,
    officeId:String(u.OFFICE_ID||''),
    officeName:String(u.OFFICE_NAME||''),
    token:t,
    expiresAt:ex.toISOString()
  });
}

function logout(s){
  if(!s) return ok(null,'Logged out.');
  read(S.SS).forEach(r=>{
    if(String(r.TOKEN)===String(s.token))
      sheet(S.SS).getRange(r.__row,5).setValue(false);
  });
  return ok(null,'Logged out.');
}

/* =========================================================
   PMV REPORT
   ========================================================= */

function submit(x,s){
  let a=auth(s);
  if(a.role!==ROLE.SPM) throw Error('Only SPM users can submit daily reports.');
  let r=norm(x),oid=String(a.user.OFFICE_ID||'');
  r.ok=prev(oid,r.date,'K');
  r.oa=prev(oid,r.date,'A');
  r.ck=r.ok+r.nk-r.rk-r.rt-r.dk;
  r.ca=r.oa+r.na-r.ra-r.rta-r.da;
  let pk=r.ik+r.tk+r.delk+r.incK,pa=r.ia+r.ta+r.dela+r.incA;
  if(r.ck<0||r.ca<0) throw Error('Movement exceeds available stock.');
  if(r.ck!==pk) throw Error('Kit validation failed: Opening + New - Redirected - RTS - Delivered must equal Invalid Mobile + Torn/Without Proper Details + Deliverable + Incomplete.');
  if(r.ca!==pa) throw Error('Article validation failed: Opening + New - Redirected - RTS - Delivered must equal Invalid Mobile + Torn/Without Proper Details + Deliverable + Incomplete.');
  let row=[r.id,r.date,oid,String(a.user.OFFICE_NAME||''),String(a.user.USER_ID),String(a.user.NAME||''),r.ok,r.nk,r.rk,r.rt,r.dk,r.ik,r.tk,r.delk,r.incK,r.ck,r.oa,r.na,r.ra,r.rta,r.da,r.ia,r.ta,r.dela,r.incA,r.ca,new Date(),new Date(),'FINAL'];
  let old=findReport(a.user.USER_ID,r.date);
  if(old) sheet(S.R).getRange(old.__row,1,1,row.length).setValues([row]);
  else sheet(S.R).appendRow(row);
  audit(a.user.USER_ID,'SUBMIT',r.date);
  return ok({closingPendingKits:r.ck,closingPendingArticles:r.ca},'Report saved successfully.');
}

function opening(d,s){
  let a=auth(s);
  if(a.role!==ROLE.SPM) throw Error('Only SPM users can access opening balance.');
  d=String(d||today());
  return ok({openingKits:prev(a.user.OFFICE_ID,d,'K'),openingArticles:prev(a.user.OFFICE_ID,d,'A')});
}

function own(d,s){
  let a=auth(s);
  if(a.role!==ROLE.SPM) throw Error('Only SPM users can access own report.');
  let r=findReport(a.user.USER_ID,String(d||today()));
  return ok(r?client(r):emptyClient(String(d||today())));
}

function admin(d,s){
  let a=auth(s);
  if(![ROLE.ADMIN,ROLE.DPS].includes(a.role)) throw Error('Only DPS/Admin users can access the consolidated dashboard.');
  d=String(d||today());
  let us=read(S.U).filter(u=>act(u.ACTIVE)&&String(u.ROLE).toUpperCase()===ROLE.SPM),
      rs=read(S.R).filter(r=>date(r.DATE)===d),
      by={};
  rs.forEach(r=>by[String(r.SPM_ID)]=r);
  let os={};
  read(S.O).filter(o=>act(o.ACTIVE)).forEach(o=>os[o.OFFICE_ID]=bo(o));
  let pending=[],spmWise=[];
  us.forEach(u=>{
    let oid=String(u.OFFICE_ID||''),o=os[oid]||(os[oid]=bo(u)),r=by[String(u.USER_ID)];
    o.totalSpms++;
    if(r){
      o.updatedSpms++;
      spmWise.push({...client(r),spmId:String(u.USER_ID||''),spmName:String(u.NAME||''),officeId:oid,officeName:String(o.officeName||u.OFFICE_NAME||''),status:'Updated'});
    }else{
      pending.push({spmName:String(u.NAME||''),spmId:String(u.USER_ID),officeName:o.officeName});
      o.pendingSpms++;
      spmWise.push({
        date:d,spmId:String(u.USER_ID||''),spmName:String(u.NAME||''),officeId:oid,
        officeName:String(o.officeName||u.OFFICE_NAME||''),status:'Not Updated',
        openingKits:0,openingArticles:0,newKits:0,newArticles:0,redirectedKits:0,redirectedArticles:0,
        rtsKits:0,rtsArticles:0,deliveredKits:0,deliveredArticles:0,invalidMobileKits:0,
        invalidMobileArticles:0,tornKits:0,tornArticles:0,deliverableKits:0,deliverableArticles:0,
        incompleteKits:0,incompleteArticles:0,closingPendingKits:0,closingPendingArticles:0
      });
    }
  });
  let z={
    newKits:0,newArticles:0,redirectedKits:0,redirectedArticles:0,rtsKits:0,rtsArticles:0,
    deliveredKitsToday:0,deliveredArticlesToday:0,closingPendingKits:0,closingPendingArticles:0,
    invalidMobileKits:0,invalidMobileArticles:0,tornKits:0,tornArticles:0,
    deliverableKits:0,deliverableArticles:0,incompleteKits:0,incompleteArticles:0
  };
  rs.forEach(r=>{
    z.newKits+=num(r.NEW_KITS); z.newArticles+=num(r.NEW_ARTICLES);
    z.redirectedKits+=num(r.REDIRECTED_KITS); z.redirectedArticles+=num(r.REDIRECTED_ARTICLES);
    z.rtsKits+=num(r.RTS_KITS); z.rtsArticles+=num(r.RTS_ARTICLES);
    z.deliveredKitsToday+=num(r.DELIVERED_KITS); z.deliveredArticlesToday+=num(r.DELIVERED_ARTICLES);
    z.closingPendingKits+=num(r.CLOSING_PENDING_KITS); z.closingPendingArticles+=num(r.CLOSING_PENDING_ARTICLES);
    z.invalidMobileKits+=num(r.INVALID_MOBILE_KITS); z.invalidMobileArticles+=num(r.INVALID_MOBILE_ARTICLES);
    z.incompleteKits+=num(r.INCOMPLETE_KITS); z.incompleteArticles+=num(r.INCOMPLETE_ARTICLES);
    z.tornKits+=num(r.TORN_KITS); z.tornArticles+=num(r.TORN_ARTICLES);
    z.deliverableKits+=num(r.DELIVERABLE_KITS); z.deliverableArticles+=num(r.DELIVERABLE_ARTICLES);
    let o=os[r.OFFICE_ID]||(os[r.OFFICE_ID]=bo(r));
    ['OPENING_KITS','NEW_KITS','REDIRECTED_KITS','RTS_KITS','DELIVERED_KITS','CLOSING_PENDING_KITS'].forEach(k=>o[key(k,'K')]+=num(r[k]));
    ['OPENING_ARTICLES','NEW_ARTICLES','REDIRECTED_ARTICLES','RTS_ARTICLES','DELIVERED_ARTICLES','CLOSING_PENDING_ARTICLES'].forEach(k=>o[key(k,'A')]+=num(r[k]));
  });
  return ok({
    date:d,summary:z,
    officeWise:Object.values(os).map(o=>({...o,status:o.totalSpms&&o.updatedSpms===o.totalSpms?'Updated':'Pending'})),
    spmWise,pendingSpms:pending,spmsUpdatedToday:rs.length,activeSpms:us.length,spmsPendingUpdate:pending.length
  });
}

function key(k,t){
  return ({
    OPENING_KITS:'openingKits',NEW_KITS:'newKits',REDIRECTED_KITS:'redirectedKits',
    RTS_KITS:'rtsKits',DELIVERED_KITS:'deliveredKits',CLOSING_PENDING_KITS:'closingPendingKits',
    OPENING_ARTICLES:'openingArticles',NEW_ARTICLES:'newArticles',REDIRECTED_ARTICLES:'redirectedArticles',
    RTS_ARTICLES:'rtsArticles',DELIVERED_ARTICLES:'deliveredArticles',CLOSING_PENDING_ARTICLES:'closingPendingArticles'
  })[k];
}

function prev(oid,d,t){
  let q=read(S.R).filter(r=>String(r.OFFICE_ID)===String(oid)&&date(r.DATE)<d).sort((a,b)=>date(b.DATE).localeCompare(date(a.DATE)));
  return q.length?(t==='K'?num(q[0].CLOSING_PENDING_KITS):num(q[0].CLOSING_PENDING_ARTICLES)):0;
}

function norm(x){
  let r={id:x?.id||Utilities.getUuid(),date:String(x?.date||today())};
  let map={
    newKits:'nk',newArticles:'na',redirectedKits:'rk',redirectedArticles:'ra',
    rtsKits:'rt',rtsArticles:'rta',deliveredKits:'dk',deliveredArticles:'da',
    invalidMobileKits:'ik',invalidMobileArticles:'ia',tornKits:'tk',tornArticles:'ta',
    deliverableKits:'delk',deliverableArticles:'dela',incompleteKits:'incK',incompleteArticles:'incA'
  };
  Object.keys(map).forEach(k=>r[map[k]]=Math.max(0,Math.floor(num(x?.[k]))));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw Error('Invalid report date.');
  return r;
}

function emptyClient(d){
  return {
    date:d,openingKits:0,openingArticles:0,newKits:0,newArticles:0,redirectedKits:0,redirectedArticles:0,
    rtsKits:0,rtsArticles:0,deliveredKits:0,deliveredArticles:0,invalidMobileKits:0,invalidMobileArticles:0,
    tornKits:0,tornArticles:0,deliverableKits:0,deliverableArticles:0,incompleteKits:0,incompleteArticles:0,
    closingPendingKits:0,closingPendingArticles:0
  };
}

function client(r){
  return {
    date:date(r.DATE),openingKits:num(r.OPENING_KITS),openingArticles:num(r.OPENING_ARTICLES),
    newKits:num(r.NEW_KITS),newArticles:num(r.NEW_ARTICLES),redirectedKits:num(r.REDIRECTED_KITS),
    redirectedArticles:num(r.REDIRECTED_ARTICLES),rtsKits:num(r.RTS_KITS),rtsArticles:num(r.RTS_ARTICLES),
    deliveredKits:num(r.DELIVERED_KITS),deliveredArticles:num(r.DELIVERED_ARTICLES),
    invalidMobileKits:num(r.INVALID_MOBILE_KITS),invalidMobileArticles:num(r.INVALID_MOBILE_ARTICLES),
    tornKits:num(r.TORN_KITS),tornArticles:num(r.TORN_ARTICLES),deliverableKits:num(r.DELIVERABLE_KITS),
    deliverableArticles:num(r.DELIVERABLE_ARTICLES),incompleteKits:num(r.INCOMPLETE_KITS),
    incompleteArticles:num(r.INCOMPLETE_ARTICLES),closingPendingKits:num(r.CLOSING_PENDING_KITS),
    closingPendingArticles:num(r.CLOSING_PENDING_ARTICLES)
  };
}

function bo(x){
  return {
    officeId:String(x.OFFICE_ID||''),officeName:String(x.OFFICE_NAME||''),totalSpms:0,updatedSpms:0,pendingSpms:0,
    openingKits:0,newKits:0,redirectedKits:0,rtsKits:0,deliveredKits:0,closingPendingKits:0,
    openingArticles:0,newArticles:0,redirectedArticles:0,rtsArticles:0,deliveredArticles:0,closingPendingArticles:0
  };
}

/* =========================================================
   ARTICLE ENGINE - AUTO DISCOVERY / DUAL SOURCE
   ========================================================= */

function normalizePin(v){
  return String(v==null?'':v).replace(/\D/g,'').trim();
}

function articleKey(r){
  return String(r.PMV_APPLICATION_NUMBER||r.BAR_CODE_ID||'').trim();
}

function normalizeHeader(v){
  return String(v==null?'':v).trim().toUpperCase().replace(/\s+/g,'_');
}

/*
 * Reads a sheet without requiring exact column order.
 */
function articleReadSheet(name){
  let sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if(!sh||sh.getLastRow()<2) return [];
  let values=sh.getDataRange().getValues();
  let headers=values.shift().map(normalizeHeader);
  return values.map((row,i)=>{
    let o={__row:i+2,__sheet:name};
    headers.forEach((h,j)=>{if(h)o[h]=row[j];});
    return o;
  });
}

/*
 * Header aliases. This is the key fix for imported CSVs whose
 * headers differ slightly from ARTICLE_MASTER.
 */
const ARTICLE_HEADER_ALIASES={
  BAR_CODE_ID:['BAR_CODE_ID','BARCODE_ID','BARCODE','BAR_CODE','ARTICLE_BARCODE','ARTICLE_BAR_CODE','BAR_CODE_NO'],
  PMV_APPLICATION_NUMBER:['PMV_APPLICATION_NUMBER','PMV_APPLICATION_NO','PMV_APP_NUMBER','PMV_APPLICATION','APPLICATION_NUMBER','PMV_NO','PMV_NUMBER'],
  ARTISAN_NAME:['ARTISAN_NAME','ARTISAN','NAME_OF_ARTISAN','BENEFICIARY_NAME'],
  MOBILE_NUMBER:['MOBILE_NUMBER','MOBILE','MOBILE_NO','PHONE','PHONE_NUMBER'],
  ARTISAN_CURRENT_ADDRESS:['ARTISAN_CURRENT_ADDRESS','CURRENT_ADDRESS','ADDRESS','ARTISAN_ADDRESS'],
  CIRCLE_NAME:['CIRCLE_NAME','CIRCLE'],
  DIVISION_NAME:['DIVISION_NAME','DIVISION'],
  ARTISAN_PIN_CODE:['ARTISAN_PIN_CODE','ARTISAN_PINCODE','PIN_CODE','PINCODE','PIN','ARTISAN_PIN'],
  DELIVERY_STAFF_ASSIGNED_UNASSIGNED:['DELIVERY_STAFF_ASSIGNED_UNASSIGNED','DELIVERY_STAFF','DELIVERY_STAFF_ASSIGNED','DELIVERY_STAFF_STATUS'],
  TOOLKIT_DELIVERY_STATUS:['TOOLKIT_DELIVERY_STATUS','DELIVERY_STATUS','STATUS','PRESENT_STATUS']
};

function getAliasValue(row,canonical){
  let aliases=ARTICLE_HEADER_ALIASES[canonical]||[canonical];
  for(let i=0;i<aliases.length;i++){
    let v=row[aliases[i]];
    if(v!==undefined&&v!==null&&String(v).trim()!=='') return v;
  }
  return '';
}

function canonicalArticleRow(row){
  let o={
    __row:row.__row,
    __sheet:row.__sheet,
    BAR_CODE_ID:getAliasValue(row,'BAR_CODE_ID'),
    PMV_APPLICATION_NUMBER:getAliasValue(row,'PMV_APPLICATION_NUMBER'),
    ARTISAN_NAME:getAliasValue(row,'ARTISAN_NAME'),
    MOBILE_NUMBER:getAliasValue(row,'MOBILE_NUMBER'),
    ARTISAN_CURRENT_ADDRESS:getAliasValue(row,'ARTISAN_CURRENT_ADDRESS'),
    CIRCLE_NAME:getAliasValue(row,'CIRCLE_NAME'),
    DIVISION_NAME:getAliasValue(row,'DIVISION_NAME'),
    ARTISAN_PIN_CODE:getAliasValue(row,'ARTISAN_PIN_CODE'),
    DELIVERY_STAFF_ASSIGNED_UNASSIGNED:getAliasValue(row,'DELIVERY_STAFF_ASSIGNED_UNASSIGNED'),
    TOOLKIT_DELIVERY_STATUS:getAliasValue(row,'TOOLKIT_DELIVERY_STATUS')
  };
  o.__articleKey=articleKey(o);
  return o;
}

function isArticleDataSheet(name){
  let rows=articleReadSheet(name);
  if(!rows.length) return false;
  let sample=rows.slice(0,Math.min(rows.length,10));
  let hasKey=sample.some(r=>String(getAliasValue(r,'BAR_CODE_ID')||getAliasValue(r,'PMV_APPLICATION_NUMBER')).trim()!=='');
  let hasPin=sample.some(r=>normalizePin(getAliasValue(r,'ARTISAN_PIN_CODE'))!=='');
  return hasKey&&hasPin;
}

function articleSourceSheetNames(){
  let ss=SpreadsheetApp.openById(SPREADSHEET_ID);
  let names=ss.getSheets().map(sh=>sh.getName());

  let preferred=[
    'ARTICLE_MASTER',
    'ARTICLE_MASTER_IMPORT',
    'ARTICLES',
    'ARTICLE_DATA',
    'ARTICLE_LIST',
    'PMV_ARTICLES'
  ];

  let ordered=[];
  preferred.forEach(n=>{if(names.includes(n)&&!ordered.includes(n))ordered.push(n);});

  names.forEach(n=>{
    if(ordered.includes(n)) return;
    if([S.U,S.O,S.R,S.SS,S.A,S.P,S.AS].includes(n)) return;
    try{
      if(isArticleDataSheet(n)) ordered.push(n);
    }catch(e){}
  });

  return ordered;
}

function articleRowsFromSheet(name){
  return articleReadSheet(name)
    .map(canonicalArticleRow)
    .filter(r=>String(r.__articleKey||'').trim()!=='');
}

/*
 * source:
 * master  = ARTICLE_MASTER only
 * import  = ARTICLE_MASTER_IMPORT / first discovered secondary source
 * both    = all compatible article sheets, deduplicated
 * auto    = all compatible article sheets, deduplicated
 *
 * Normal SPM frontend does not send source, therefore AUTO is used.
 */
function articleRowsForSource(source){
  source=String(source||'auto').trim().toLowerCase();
  let sheets=articleSourceSheetNames();

  if(!sheets.length) return [];

  if(source==='master'){
    return sheets.includes('ARTICLE_MASTER')
      ? articleRowsFromSheet('ARTICLE_MASTER')
      : [];
  }

  if(source==='import'){
    let n=sheets.find(x=>x==='ARTICLE_MASTER_IMPORT')||sheets.find(x=>x!=='ARTICLE_MASTER');
    return n?articleRowsFromSheet(n):[];
  }

  /*
   * both / auto:
   * Read every compatible source and keep first occurrence.
   * ARTICLE_MASTER has priority because it is listed first.
   */
  let seen={},out=[];

  sheets.forEach(sheetName=>{
    articleRowsFromSheet(sheetName).forEach(r=>{
      let k=articleKey(r);
      if(!k) return;
      if(!seen[k]){
        seen[k]=true;
        out.push(r);
      }
    });
  });

  return out;
}

function articleMasterRows(){
  return articleRowsForSource('master');
}

function articleAuditRows(){
  /*
   * Kept only for backward compatibility. AUDIT_LOG is not
   * treated as an article source because its schema is audit-only.
   */
  return [];
}

function assignedPincodes(officeId){
  let pins=[];
  read(S.P).forEach(r=>{
    if(act(r.ACTIVE)&&String(r.OFFICE_ID||'').trim()===String(officeId||'').trim()){
      let p=normalizePin(r.PINCODE);
      if(p) pins.push(p);
    }
  });

  if(!pins.length){
    let o=read(S.O).find(r=>String(r.OFFICE_ID||'').trim()===String(officeId||'').trim());
    if(o){
      String(o.PINCODES||'').split(/[,;\s]+/).map(normalizePin).filter(Boolean).forEach(p=>pins.push(p));
    }
  }

  return [...new Set(pins)];
}

function statusMap(d){
  let m={};
  read(S.AS).filter(r=>date(r.DATE)===String(d)).forEach(r=>{
    let key=String(r.ARTICLE_KEY||'').trim();
    if(key) m[key]=r;
  });
  return m;
}

function articleClient(r,st,source){
  return {
    articleKey:articleKey(r),
    barCodeId:String(r.BAR_CODE_ID||''),
    pmvApplicationNumber:String(r.PMV_APPLICATION_NUMBER||''),
    artisanName:String(r.ARTISAN_NAME||''),
    mobileNumber:String(r.MOBILE_NUMBER||''),
    address:String(r.ARTISAN_CURRENT_ADDRESS||''),
    circleName:String(r.CIRCLE_NAME||''),
    divisionName:String(r.DIVISION_NAME||''),
    pinCode:normalizePin(r.ARTISAN_PIN_CODE),
    deliveryStaff:String(r.DELIVERY_STAFF_ASSIGNED_UNASSIGNED||''),
    sourceStatus:String(r.TOOLKIT_DELIVERY_STATUS||''),
    presentStatus:String(st?.STATUS||r.TOOLKIT_DELIVERY_STATUS||'Pending'),
    remarks:String(st?.REMARKS||''),
    updatedAt:st?.UPDATED_AT?String(st.UPDATED_AT):'',
    dataSource:String(source||r.__sheet||'unknown')
  };
}

function spmArticles(p,s){
  let a=auth(s);
  if(a.role!==ROLE.SPM) throw Error('Only SPM users can access article details.');

  /*
   * Frontend currently does not send source.
   * AUTO therefore checks all compatible article sources.
   */
  let source=String(p?.source||'auto').trim().toLowerCase();
  if(!['auto','master','import','both'].includes(source)) source='auto';

  let d=String(p?.date||today());
  let q=String(p?.q||'').trim().toLowerCase();
  let limit=Math.min(Math.max(Number(p?.limit||500),1),2000);
  let officeId=String(a.user.OFFICE_ID||'').trim();
  let pins=assignedPincodes(officeId);
  let rows=articleRowsForSource(source);
  let sm=statusMap(d);
  let out=[],matchedByPincode=0;

  rows.forEach(r=>{
    if(out.length>=limit) return;
    let pin=normalizePin(r.ARTISAN_PIN_CODE);
    if(!pins.includes(pin)) return;

    matchedByPincode++;

    let hay=[
      r.BAR_CODE_ID,r.PMV_APPLICATION_NUMBER,r.ARTISAN_NAME,
      r.MOBILE_NUMBER,pin,r.ARTISAN_CURRENT_ADDRESS
    ].join(' ').toLowerCase();

    if(q&&!hay.includes(q)) return;

    let key=articleKey(r);
    out.push(articleClient(r,sm[key],r.__sheet));
  });

  let sourceSheets=articleSourceSheetNames();
  let diagnostic='Article records loaded successfully.';
  if(!sourceSheets.length) diagnostic='No compatible article-data sheet was detected.';
  else if(!pins.length) diagnostic='No active PIN codes are assigned to this SPM office.';
  else if(rows.length===0) diagnostic='Compatible article sheets exist, but contain no article rows.';
  else if(matchedByPincode===0) diagnostic='Article records exist, but none match the SPM assigned PIN codes.';

  return ok({
    date:d,
    officeId:officeId,
    officeName:String(a.user.OFFICE_NAME||''),
    source:source,
    sourceSheets:sourceSheets,
    pincodes:pins,
    articles:out,
    totalVisible:matchedByPincode,
    returned:out.length,
    totalSourceArticles:rows.length,
    diagnostic:diagnostic
  });
}

function updateArticleStatus(x,s){
  let a=auth(s);
  if(a.role!==ROLE.SPM) throw Error('Only SPM users can update article status.');

  let d=String(x?.date||today());
  let key=String(x?.articleKey||x?.pmvApplicationNumber||x?.barCodeId||'').trim();
  let status=String(x?.status||'').trim();
  let remarks=String(x?.remarks||'').trim();

  let allowed=['Pending','Delivered','Redirected','RTS / Return','Not Received','Other'];
  if(!allowed.includes(status)) throw Error('Invalid article status.');

  /*
   * Find in AUTO source so status can also be updated for an
   * article coming from ARTICLE_MASTER_IMPORT or another
   * compatible source.
   */
  let r=articleRowsForSource('auto').find(z=>articleKey(z)===key);
  if(!r) throw Error('Article not found in the detected article sources.');

  let pins=assignedPincodes(a.user.OFFICE_ID);
  if(!pins.includes(normalizePin(r.ARTISAN_PIN_CODE)))
    throw Error('This article is outside your assigned pincode list.');

  let sh=sheet(S.AS);
  let old=read(S.AS).find(z=>date(z.DATE)===d&&String(z.ARTICLE_KEY||'')===key);

  let row=[
    d,key,String(r.BAR_CODE_ID||''),String(r.PMV_APPLICATION_NUMBER||''),
    String(a.user.OFFICE_ID||''),String(a.user.OFFICE_NAME||''),
    String(a.user.USER_ID||''),String(a.user.NAME||''),status,remarks,new Date()
  ];

  if(old) sh.getRange(old.__row,1,1,row.length).setValues([row]);
  else sh.appendRow(row);

  audit(a.user.USER_ID,'ARTICLE_STATUS',d+' | '+key+' | '+status);
  return ok({
    articleKey:key,status,remarks,date:d,dataSource:String(r.__sheet||'')
  },'Article status updated.');
}
function updateArticleMasterStatus(x,s){

  let a=auth(s);

  if(![ROLE.ADMIN,ROLE.DPS].includes(a.role)){
    throw Error('Only Admin/DPS can update ARTICLE_MASTER.');
  }

  let key=String(
    x?.articleKey ||
    x?.pmvApplicationNumber ||
    x?.barCodeId ||
    ''
  ).trim();

  let status=String(
    x?.status || ''
  ).trim();

  if(!key){
    throw Error('Article key is required.');
  }

  if(!status){
    throw Error('Status is required.');
  }

  let allowed=[
    'Pending',
    'Delivered',
    'Redirected',
    'RTS / Return',
    'Not Received',
    'Other'
  ];

  if(!allowed.includes(status)){
    throw Error('Invalid article status.');
  }

  let sh=sheet('ARTICLE_MASTER');

  let rows=read('ARTICLE_MASTER');

  let row=rows.find(r =>
    String(r.PMV_APPLICATION_NUMBER||'').trim()===key ||
    String(r.BAR_CODE_ID||'').trim()===key
  );

  if(!row){
    throw Error(
      'Article not found in ARTICLE_MASTER.'
    );
  }

  let oldStatus=String(
    row.TOOLKIT_DELIVERY_STATUS||''
  );

  let headers=sh
    .getRange(
      1,
      1,
      1,
      sh.getLastColumn()
    )
    .getValues()[0];

  let statusCol=
    headers.indexOf(
      'TOOLKIT_DELIVERY_STATUS'
    )+1;

  if(statusCol<=0){
    throw Error(
      'TOOLKIT_DELIVERY_STATUS column not found in ARTICLE_MASTER.'
    );
  }

  sh.getRange(
    row.__row,
    statusCol
  ).setValue(status);

  audit(
    a.user.USER_ID,
    'ARTICLE_MASTER_STATUS_UPDATE',
    key+
    ' | Previous: '+oldStatus+
    ' | New: '+status
  );

  return ok({
    articleKey:key,
    previousStatus:oldStatus,
    newStatus:status,
    updatedBy:String(a.user.USER_ID),
    updatedAt:new Date().toISOString()
  },'ARTICLE_MASTER updated successfully.');
}
function adminArticleStatus(p,s){
  let a=auth(s);
  if(![ROLE.ADMIN,ROLE.DPS].includes(a.role))
    throw Error('Only DPS/Admin users can access article status.');

  let d=String(p?.date||today());
  let source=String(p?.source||'auto').trim().toLowerCase();
  if(!['auto','master','import','both'].includes(source)) source='auto';

  let q=String(p?.q||'').trim().toLowerCase();
  let office=String(p?.officeId||'').trim();
  let limit=Math.min(Math.max(Number(p?.limit||1000),1),5000);
  let sm=statusMap(d);
  let rows=articleRowsForSource(source);
  let out=[];

  rows.forEach(r=>{
    if(out.length>=limit) return;

    let key=articleKey(r),st=sm[key],c=articleClient(r,st,r.__sheet);
    let rowOffice=String(st?.OFFICE_ID||'').trim();

    if(office&&rowOffice!==office) return;

    let hay=[
      c.barCodeId,c.pmvApplicationNumber,c.artisanName,
      c.pinCode,c.presentStatus,rowOffice
    ].join(' ').toLowerCase();

    if(q&&!hay.includes(q)) return;

    out.push({
      ...c,
      officeId:rowOffice,
      officeName:String(st?.OFFICE_NAME||''),
      spmId:String(st?.SPM_ID||''),
      spmName:String(st?.SPM_NAME||'')
    });
  });

  return ok({
    date:d,
    source:source,
    sourceSheets:articleSourceSheetNames(),
    articles:out,
    total:out.length,
    totalSourceArticles:rows.length,
    updatedCount:read(S.AS).filter(r=>
      date(r.DATE)===d&&(!office||String(r.OFFICE_ID)===office)
    ).length
  });
}

/* =========================================================
   ARTICLE DIAGNOSTIC
   ========================================================= */

function articleSourceDiagnostic(p,s){
  let a=auth(s);
  if(![ROLE.ADMIN,ROLE.DPS,ROLE.SPM].includes(a.role))
    throw Error('Not authorized.');

  let sheets=articleSourceSheetNames();
  let detail=sheets.map(name=>{
    let rows=articleRowsFromSheet(name);
    let pins={};
    rows.forEach(r=>{
      let p=normalizePin(r.ARTISAN_PIN_CODE);
      if(p) pins[p]=(pins[p]||0)+1;
    });
    return {
      sheet:name,
      articleCount:rows.length,
      firstArticle:rows.length?articleClient(rows[0],null,name):null,
      pinCounts:pins
    };
  });

  let officeId=String(a.user.OFFICE_ID||'');
  let assigned=assignedPincodes(officeId);
  let autoRows=articleRowsForSource('auto');
  let matching=autoRows.filter(r=>assigned.includes(normalizePin(r.ARTISAN_PIN_CODE)));

  return ok({
    officeId:officeId,
    officeName:String(a.user.OFFICE_NAME||''),
    assignedPincodes:assigned,
    detectedSheets:sheets,
    sheetDetails:detail,
    autoArticleCount:autoRows.length,
    matchingAssignedPinArticles:matching.length,
    matchingExamples:matching.slice(0,10).map(r=>articleClient(r,null,r.__sheet))
  });
}

/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function findUser(id){
  return read(S.U).find(r=>String(r.USER_ID).trim()===String(id).trim());
}

function findReport(id,d){
  return read(S.R).find(r=>String(r.SPM_ID)===String(id)&&date(r.DATE)===d);
}

function auth(s){
  if(!s?.userId||!s?.token)
    throw Error('Not authenticated. Please sign in again.');

  let x=read(S.SS).find(r=>
    String(r.TOKEN)===String(s.token)&&
    String(r.USER_ID)===String(s.userId)&&
    act(r.ACTIVE)
  );

  if(!x) throw Error('Session expired or invalid. Please log in again.');
  if(new Date(x.EXPIRES_AT).getTime()<=Date.now())
    throw Error('Session expired. Please log in again.');

  let u=findUser(s.userId);
  if(!u||!act(u.ACTIVE)) throw Error('Account is inactive.');

  return {user:u,role:String(u.ROLE||'').toUpperCase()};
}

function parse(s){
  if(!s) return null;
  if(typeof s==='object') return s;
  try{return JSON.parse(s)}catch(e){return null;}
}

function read(n){
  let sh=sheet(n),v=sh.getDataRange().getValues(),h=v.shift()||[];
  return v.map((r,i)=>{
    let o={__row:i+2};
    h.forEach((k,j)=>o[k]=r[j]);
    return o;
  });
}

function sheet(n){
  let sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(n);
  if(!sh) throw Error('Missing sheet '+n+'. Run setupSpreadsheet() once.');
  return sh;
}

function date(v){
  return v instanceof Date?Utilities.formatDate(v,TZ,'yyyy-MM-dd'):String(v||'').slice(0,10);
}

function today(){
  return Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd');
}

function num(v){
  let n=Number(v);
  return Number.isFinite(n)?n:0;
}

function act(v){
  return v===true||['true','yes','1','active','y'].includes(String(v).toLowerCase().trim());
}

function mob(v){
  return String(v||'').replace(/\D/g,'');
}

function audit(u,a,d){
  try{sheet(S.A).appendRow([new Date(),u,a,d]);}catch(e){}
}

function ok(d,m){
  return {success:true,data:d,message:m||'OK'};
}

function err(m){
  return {success:false,data:null,message:String(m||'Request failed.')};
}

function out(x){
  return ContentService
    .createTextOutput(JSON.stringify(x))
    .setMimeType(ContentService.MimeType.JSON);
}
