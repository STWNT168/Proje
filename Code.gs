const SPREADSHEET_ID='1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8',TZ='Asia/Kolkata';const S={U:'USER_MASTER',O:'OFFICE_MASTER',R:'PMV_REPORTS',SS:'SESSIONS',A:'AUDIT_LOG',P:'PINCODE_MASTER',AS:'ARTICLE_STATUS'};const ROLE={SPM:'SPM',DPS:'DPS',ADMIN:'ADMIN'};
function setupSpreadsheet(){let ss=SpreadsheetApp.openById(SPREADSHEET_ID),h={USER_MASTER:['USER_ID','NAME','MOBILE','ROLE','OFFICE_ID','OFFICE_NAME','ACTIVE'],OFFICE_MASTER:['OFFICE_ID','OFFICE_NAME','DIVISION','ACTIVE','PINCODES'],PMV_REPORTS:['ID','DATE','OFFICE_ID','OFFICE_NAME','SPM_ID','SPM_NAME','OPENING_KITS','NEW_KITS','REDIRECTED_KITS','RTS_KITS','DELIVERED_KITS','INVALID_MOBILE_KITS','TORN_KITS','DELIVERABLE_KITS','INCOMPLETE_KITS','CLOSING_PENDING_KITS','OPENING_ARTICLES','NEW_ARTICLES','REDIRECTED_ARTICLES','RTS_ARTICLES','DELIVERED_ARTICLES','INVALID_MOBILE_ARTICLES','TORN_ARTICLES','DELIVERABLE_ARTICLES','INCOMPLETE_ARTICLES','CLOSING_PENDING_ARTICLES','SUBMITTED_AT','UPDATED_AT','STATUS'],SESSIONS:['TOKEN','USER_ID','CREATED_AT','EXPIRES_AT','ACTIVE'],AUDIT_LOG:['TIMESTAMP','USER_ID','ACTION','DETAILS'],PINCODE_MASTER:['PINCODE','OFFICE_ID','OFFICE_NAME','ACTIVE'],ARTICLE_MASTER:['BAR_CODE_ID','PMV_APPLICATION_NUMBER','ARTISAN_NAME','MOBILE_NUMBER','ARTISAN_CURRENT_ADDRESS','CIRCLE_NAME','DIVISION_NAME','ARTISAN_PIN_CODE','DELIVERY_STAFF_ASSIGNED_UNASSIGNED','TOOLKIT_DELIVERY_STATUS'],ARTICLE_STATUS:['DATE','ARTICLE_KEY','BAR_CODE_ID','PMV_APPLICATION_NUMBER','OFFICE_ID','OFFICE_NAME','SPM_ID','SPM_NAME','STATUS','REMARKS','UPDATED_AT']};Object.keys(h).forEach(n=>{let sh=ss.getSheetByName(n)||ss.insertSheet(n),need=h[n];if(!sh.getLastRow())sh.appendRow(need);else{let cur=sh.getRange(1,1,1,Math.max(sh.getLastColumn(),need.length)).getValues()[0];need.forEach((v,i)=>{if(cur[i]!==v&&cur.indexOf(v)<0)sh.getRange(1,i+1).setValue(v)})}sh.setFrozenRows(1)});return out(1,'Setup complete. Import ARTICLE_MASTER_IMPORT.csv into ARTICLE_MASTER and populate PINCODE_MASTER (PINCODE → OFFICE_ID).')}
function doGet(e){try{let p=e.parameter||{},s=parse(p.session);if(p.action==='getPmvOpeningBalance')return out(opening(p.date,s));if(p.action==='getOwnPmvDashboard')return out(own(p.date,s));if(p.action==='getAdminPmvDashboard')return out(admin(p.date,s));if(p.action==='getSpmArticles')return out(spmArticles(p,s));if(p.action==='getAdminArticleStatus')return out(adminArticleStatus(p,s));return out(err('Unknown GET action.'))}catch(x){return out(err(x.message))}}
function doPost(e){try{let b=JSON.parse(e.postData?.contents||'{}');if(b.action==='login')return out(login(b.userId,b.mobile));if(b.action==='logout')return out(logout(parse(b.session)));if(b.action==='submitPmvReport')return out(submit(b.record,parse(b.session)));if(b.action==='updateArticleStatus')return out(updateArticleStatus(b.record,parse(b.session)));return out(err('Unknown POST action.'))}catch(x){return out(err(x.message))}}
function login(id,m){let u=findUser(id);if(!u)return err('User ID not found.');if(!act(u.ACTIVE))return err('This account is inactive.');if(mob(u.MOBILE)!==mob(m))return err('Registered mobile number does not match.');let role=String(u.ROLE||'').toUpperCase();if(![ROLE.SPM,ROLE.DPS,ROLE.ADMIN].includes(role))return err('Invalid user role.');let t=Utilities.getUuid(),now=new Date(),ex=new Date(now.getTime()+604800000);sheet(S.SS).appendRow([t,String(u.USER_ID),now,ex,true]);audit(u.USER_ID,'LOGIN','Successful login');return ok({userId:String(u.USER_ID),name:String(u.NAME||''),role,officeId:String(u.OFFICE_ID||''),officeName:String(u.OFFICE_NAME||''),token:t,expiresAt:ex.toISOString()})}
function logout(s){if(!s)return ok(null,'Logged out.');read(S.SS).forEach(r=>{if(String(r.TOKEN)===String(s.token))sheet(S.SS).getRange(r.__row,5).setValue(false)});return ok(null,'Logged out.')}
function submit(x,s){let a=auth(s);if(a.role!==ROLE.SPM)throw Error('Only SPM users can submit daily reports.');let r=norm(x),oid=String(a.user.OFFICE_ID||'');r.ok=prev(oid,r.date,'K');r.oa=prev(oid,r.date,'A');r.ck=r.ok+r.nk-r.rk-r.rt-r.dk;r.ca=r.oa+r.na-r.ra-r.rta-r.da;let pk=r.ik+r.tk+r.delk+r.incK,pa=r.ia+r.ta+r.dela+r.incA;if(r.ck<0||r.ca<0)throw Error('Movement exceeds available stock.');if(r.ck!==pk)throw Error('Kit validation failed: Opening + New - Redirected - RTS - Delivered must equal Invalid Mobile + Torn/Without Proper Details + Deliverable + Incomplete.');if(r.ca!==pa)throw Error('Article validation failed: Opening + New - Redirected - RTS - Delivered must equal Invalid Mobile + Torn/Without Proper Details + Deliverable + Incomplete.');let row=[r.id,r.date,oid,String(a.user.OFFICE_NAME||''),String(a.user.USER_ID),String(a.user.NAME||''),r.ok,r.nk,r.rk,r.rt,r.dk,r.ik,r.tk,r.delk,r.incK,r.ck,r.oa,r.na,r.ra,r.rta,r.da,r.ia,r.ta,r.dela,r.incA,r.ca,new Date(),new Date(),'FINAL'],old=findReport(a.user.USER_ID,r.date);if(old)sheet(S.R).getRange(old.__row,1,1,row.length).setValues([row]);else sheet(S.R).appendRow(row);audit(a.user.USER_ID,'SUBMIT',r.date);return ok({closingPendingKits:r.ck,closingPendingArticles:r.ca},'Report saved successfully.')}
function opening(d,s){let a=auth(s);if(a.role!==ROLE.SPM)throw Error('Only SPM users can access opening balance.');d=String(d||today());return ok({openingKits:prev(a.user.OFFICE_ID,d,'K'),openingArticles:prev(a.user.OFFICE_ID,d,'A')})}
function own(d,s){let a=auth(s);if(a.role!==ROLE.SPM)throw Error('Only SPM users can access own report.');let r=findReport(a.user.USER_ID,String(d||today()));return ok(r?client(r):emptyClient(String(d||today())))}
function admin(d,s){let a=auth(s);if(![ROLE.ADMIN,ROLE.DPS].includes(a.role))throw Error('Only DPS/Admin users can access the consolidated dashboard.');d=String(d||today());let us=read(S.U).filter(u=>act(u.ACTIVE)&&String(u.ROLE).toUpperCase()===ROLE.SPM),rs=read(S.R).filter(r=>date(r.DATE)===d),by={};rs.forEach(r=>by[String(r.SPM_ID)]=r);let os={};read(S.O).filter(o=>act(o.ACTIVE)).forEach(o=>os[o.OFFICE_ID]=bo(o));let pending=[],spmWise=[];us.forEach(u=>{let oid=String(u.OFFICE_ID||''),o=os[oid]||(os[oid]=bo(u)),r=by[String(u.USER_ID)];o.totalSpms++;if(r){o.updatedSpms++;spmWise.push({...client(r),spmId:String(u.USER_ID||''),spmName:String(u.NAME||''),officeId:oid,officeName:String(o.officeName||u.OFFICE_NAME||''),status:'Updated'})}else{pending.push({spmName:String(u.NAME||''),spmId:String(u.USER_ID),officeName:o.officeName});o.pendingSpms++;spmWise.push({date:d,spmId:String(u.USER_ID||''),spmName:String(u.NAME||''),officeId:oid,officeName:String(o.officeName||u.OFFICE_NAME||''),status:'Not Updated',openingKits:0,openingArticles:0,newKits:0,newArticles:0,redirectedKits:0,redirectedArticles:0,rtsKits:0,rtsArticles:0,deliveredKits:0,deliveredArticles:0,invalidMobileKits:0,invalidMobileArticles:0,tornKits:0,tornArticles:0,deliverableKits:0,deliverableArticles:0,incompleteKits:0,incompleteArticles:0,closingPendingKits:0,closingPendingArticles:0})}});let z={newKits:0,newArticles:0,redirectedKits:0,redirectedArticles:0,rtsKits:0,rtsArticles:0,deliveredKitsToday:0,deliveredArticlesToday:0,closingPendingKits:0,closingPendingArticles:0,invalidMobileKits:0,invalidMobileArticles:0,tornKits:0,tornArticles:0,deliverableKits:0,deliverableArticles:0,incompleteKits:0,incompleteArticles:0};rs.forEach(r=>{z.newKits+=num(r.NEW_KITS);z.newArticles+=num(r.NEW_ARTICLES);z.redirectedKits+=num(r.REDIRECTED_KITS);z.redirectedArticles+=num(r.REDIRECTED_ARTICLES);z.rtsKits+=num(r.RTS_KITS);z.rtsArticles+=num(r.RTS_ARTICLES);z.deliveredKitsToday+=num(r.DELIVERED_KITS);z.deliveredArticlesToday+=num(r.DELIVERED_ARTICLES);z.closingPendingKits+=num(r.CLOSING_PENDING_KITS);z.closingPendingArticles+=num(r.CLOSING_PENDING_ARTICLES);z.invalidMobileKits+=num(r.INVALID_MOBILE_KITS);z.invalidMobileArticles+=num(r.INVALID_MOBILE_ARTICLES);z.incompleteKits+=num(r.INCOMPLETE_KITS);z.incompleteArticles+=num(r.INCOMPLETE_ARTICLES);z.tornKits=(z.tornKits||0)+num(r.TORN_KITS);z.tornArticles=(z.tornArticles||0)+num(r.TORN_ARTICLES);z.deliverableKits=(z.deliverableKits||0)+num(r.DELIVERABLE_KITS);z.deliverableArticles=(z.deliverableArticles||0)+num(r.DELIVERABLE_ARTICLES);let o=os[r.OFFICE_ID]||(os[r.OFFICE_ID]=bo(r));['OPENING_KITS','NEW_KITS','REDIRECTED_KITS','RTS_KITS','DELIVERED_KITS','CLOSING_PENDING_KITS'].forEach(k=>o[key(k,'K')]+=num(r[k]));['OPENING_ARTICLES','NEW_ARTICLES','REDIRECTED_ARTICLES','RTS_ARTICLES','DELIVERED_ARTICLES','CLOSING_PENDING_ARTICLES'].forEach(k=>o[key(k,'A')]+=num(r[k]))});return ok({date:d,summary:z,officeWise:Object.values(os).map(o=>({...o,status:o.totalSpms&&o.updatedSpms===o.totalSpms?'Updated':'Pending'})),spmWise,pendingSpms:pending,spmsUpdatedToday:rs.length,activeSpms:us.length,spmsPendingUpdate:pending.length})}
function key(k,t){return({OPENING_KITS:'openingKits',NEW_KITS:'newKits',REDIRECTED_KITS:'redirectedKits',RTS_KITS:'rtsKits',DELIVERED_KITS:'deliveredKits',CLOSING_PENDING_KITS:'closingPendingKits',OPENING_ARTICLES:'openingArticles',NEW_ARTICLES:'newArticles',REDIRECTED_ARTICLES:'redirectedArticles',RTS_ARTICLES:'rtsArticles',DELIVERED_ARTICLES:'deliveredArticles',CLOSING_PENDING_ARTICLES:'closingPendingArticles'})[k]}
function prev(oid,d,t){let q=read(S.R).filter(r=>String(r.OFFICE_ID)===String(oid)&&date(r.DATE)<d).sort((a,b)=>date(b.DATE).localeCompare(date(a.DATE)));return q.length?(t==='K'?num(q[0].CLOSING_PENDING_KITS):num(q[0].CLOSING_PENDING_ARTICLES)):0}
function norm(x){let r={id:x?.id||Utilities.getUuid(),date:String(x?.date||today())};let ks=['nk','na','rk','ra','rt','rta','dk','da','ik','ia','tk','ta','delk','dela','incK','incA'];let map={newKits:'nk',newArticles:'na',redirectedKits:'rk',redirectedArticles:'ra',rtsKits:'rt',rtsArticles:'rta',deliveredKits:'dk',deliveredArticles:'da',invalidMobileKits:'ik',invalidMobileArticles:'ia',tornKits:'tk',tornArticles:'ta',deliverableKits:'delk',deliverableArticles:'dela',incompleteKits:'incK',incompleteArticles:'incA'};Object.keys(map).forEach(k=>r[map[k]]=Math.max(0,Math.floor(num(x?.[k]))));if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date))throw Error('Invalid report date.');return r}
function emptyClient(d){return{date:d,openingKits:0,openingArticles:0,newKits:0,newArticles:0,redirectedKits:0,redirectedArticles:0,rtsKits:0,rtsArticles:0,deliveredKits:0,deliveredArticles:0,invalidMobileKits:0,invalidMobileArticles:0,tornKits:0,tornArticles:0,deliverableKits:0,deliverableArticles:0,incompleteKits:0,incompleteArticles:0,closingPendingKits:0,closingPendingArticles:0}}
function client(r){return{date:date(r.DATE),openingKits:num(r.OPENING_KITS),openingArticles:num(r.OPENING_ARTICLES),newKits:num(r.NEW_KITS),newArticles:num(r.NEW_ARTICLES),redirectedKits:num(r.REDIRECTED_KITS),redirectedArticles:num(r.REDIRECTED_ARTICLES),rtsKits:num(r.RTS_KITS),rtsArticles:num(r.RTS_ARTICLES),deliveredKits:num(r.DELIVERED_KITS),deliveredArticles:num(r.DELIVERED_ARTICLES),invalidMobileKits:num(r.INVALID_MOBILE_KITS),invalidMobileArticles:num(r.INVALID_MOBILE_ARTICLES),tornKits:num(r.TORN_KITS),tornArticles:num(r.TORN_ARTICLES),deliverableKits:num(r.DELIVERABLE_KITS),deliverableArticles:num(r.DELIVERABLE_ARTICLES),incompleteKits:num(r.INCOMPLETE_KITS),incompleteArticles:num(r.INCOMPLETE_ARTICLES),closingPendingKits:num(r.CLOSING_PENDING_KITS),closingPendingArticles:num(r.CLOSING_PENDING_ARTICLES)}}
function bo(x){return{officeId:String(x.OFFICE_ID||''),officeName:String(x.OFFICE_NAME||''),totalSpms:0,updatedSpms:0,pendingSpms:0,openingKits:0,newKits:0,redirectedKits:0,rtsKits:0,deliveredKits:0,closingPendingKits:0,openingArticles:0,newArticles:0,redirectedArticles:0,rtsArticles:0,deliveredArticles:0,closingPendingArticles:0}}


function articleNormalize(v){
  return String(v == null ? '' : v).trim();
}

function articlePin(v){
  return articleNormalize(v).replace(/\D/g,'');
}

function articleKey(r){
  return articleNormalize(r.PMV_APPLICATION_NUMBER) ||
         articleNormalize(r.BAR_CODE_ID);
}

function articleReadSheet(name){
  var sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if(!sh || sh.getLastRow()<2) return [];
  var values=sh.getDataRange().getValues();
  var headers=values.shift().map(articleNormalize);
  return values.map(function(row,i){
    var o={__row:i+2};
    headers.forEach(function(h,j){if(h)o[h]=row[j];});
    return o;
  });
}

function articleMasterRows(){
  return articleReadSheet('ARTICLE_MASTER').filter(function(r){
    return articleKey(r)!=='';
  });
}

function articleAuditRows(){
  return articleReadSheet('AUDIT_LOG').filter(function(r){
    return articleKey(r)!=='';
  });
}

/* Compatibility: normal article source is ARTICLE_MASTER. */
function articleRows(){
  return articleMasterRows();
}

function articleAssignedPins(officeId){
  var pins=[];
  read(S.P).forEach(function(r){
    if(act(r.ACTIVE) && articleNormalize(r.OFFICE_ID)===articleNormalize(officeId)){
      var p=articlePin(r.PINCODE);
      if(p) pins.push(p);
    }
  });

  if(!pins.length){
    var o=read(S.O).find(function(r){
      return articleNormalize(r.OFFICE_ID)===articleNormalize(officeId);
    });
    if(o){
      articleNormalize(o.PINCODES).split(/[,;\s]+/).forEach(function(v){
        var p=articlePin(v);
        if(p) pins.push(p);
      });
    }
  }
  return Array.from(new Set(pins));
}

function articleStatusMap(d){
  var m={};
  read(S.AS).forEach(function(r){
    if(date(r.DATE)===String(d)){
      var k=articleNormalize(r.ARTICLE_KEY);
      if(k)m[k]=r;
    }
  });
  return m;
}

function articleClient(r,st,source){
  return {
    articleKey:articleKey(r),
    barCodeId:articleNormalize(r.BAR_CODE_ID),
    pmvApplicationNumber:articleNormalize(r.PMV_APPLICATION_NUMBER),
    artisanName:articleNormalize(r.ARTISAN_NAME),
    mobileNumber:articleNormalize(r.MOBILE_NUMBER),
    address:articleNormalize(r.ARTISAN_CURRENT_ADDRESS),
    circleName:articleNormalize(r.CIRCLE_NAME),
    divisionName:articleNormalize(r.DIVISION_NAME),
    pinCode:articlePin(r.ARTISAN_PIN_CODE),
    deliveryStaff:articleNormalize(r.DELIVERY_STAFF_ASSIGNED_UNASSIGNED),
    sourceStatus:articleNormalize(r.TOOLKIT_DELIVERY_STATUS),
    presentStatus:articleNormalize(st && st.STATUS) ||
                   articleNormalize(r.TOOLKIT_DELIVERY_STATUS) ||
                   'Pending',
    remarks:articleNormalize(st && st.REMARKS),
    updatedAt:st && st.UPDATED_AT ? String(st.UPDATED_AT) : '',
    dataSource:source || 'master'
  };
}

function articleRowsForSource(source){
  source=articleNormalize(source || 'master').toLowerCase();

  if(source==='audit') return articleAuditRows();

  var master=articleMasterRows();

  if(source==='both'){
    var seen={};
    master.forEach(function(r){seen[articleKey(r)]=true;});
    articleAuditRows().forEach(function(r){
      var k=articleKey(r);
      if(k && !seen[k]){
        r.__auditFallback=true;
        master.push(r);
        seen[k]=true;
      }
    });
  }

  return master;
}

function spmArticles(p,s){
  var a=auth(s);
  if(a.role!==ROLE.SPM)
    throw Error('Only SPM users can access article details.');

  var source=articleNormalize(p && p.source || 'master').toLowerCase();
  if(['master','audit','both'].indexOf(source)<0) source='master';

  var d=articleNormalize(p && p.date || today());
  var q=articleNormalize(p && p.q).toLowerCase();
  var limit=Math.min(Math.max(Number(p && p.limit || 300),1),1000);
  var officeId=articleNormalize(a.user.OFFICE_ID);
  var pins=articleAssignedPins(officeId);
  var status=articleStatusMap(d);
  var rows=articleRowsForSource(source);
  var articles=[];
  var matched=0;

  rows.forEach(function(r){
    if(articles.length>=limit)return;

    var pin=articlePin(r.ARTISAN_PIN_CODE);
    if(!pins.includes(pin))return;

    matched++;

    var searchable=[
      r.BAR_CODE_ID,
      r.PMV_APPLICATION_NUMBER,
      r.ARTISAN_NAME,
      r.MOBILE_NUMBER,
      r.ARTISAN_PIN_CODE
    ].join(' ').toLowerCase();

    if(q && searchable.indexOf(q)<0)return;

    var key=articleKey(r);
    articles.push(articleClient(
      r,
      status[key],
      r.__auditFallback ? 'audit-fallback' :
      source==='audit' ? 'audit' : 'master'
    ));
  });

  return ok({
    date:d,
    officeId:officeId,
    officeName:articleNormalize(a.user.OFFICE_NAME),
    source:source,
    pincodes:pins,
    articles:articles,
    totalVisible:matched,
    returned:articles.length,
    masterCount:articleMasterRows().length,
    auditArticleCount:articleAuditRows().length,
    diagnostic:
      rows.length===0 ?
        (source==='audit'
          ? 'AUDIT_LOG has no compatible article records.'
          : 'ARTICLE_MASTER has no article records.') :
      pins.length===0 ?
        'No active PIN codes are assigned to this SPM office.' :
      matched===0 ?
        'Records exist, but none match the SPM assigned PIN codes.' :
        'Article records loaded successfully.'
  });
}

function updateArticleStatus(x,s){
  var a=auth(s);
  if(a.role!==ROLE.SPM)
    throw Error('Only SPM users can update article status.');

  var d=articleNormalize(x && x.date || today());
  var key=articleNormalize(
    x && (x.articleKey || x.pmvApplicationNumber || x.barCodeId)
  );
  var status=articleNormalize(x && x.status);
  var remarks=articleNormalize(x && x.remarks);

  var allowed=['Pending','Delivered','Redirected','RTS / Return','Not Received','Other'];
  if(allowed.indexOf(status)<0)
    throw Error('Invalid article status.');

  /* Updates always require the authoritative ARTICLE_MASTER record. */
  var r=articleMasterRows().find(function(z){return articleKey(z)===key;});
  if(!r)throw Error('Article not found in ARTICLE_MASTER.');

  var officeId=articleNormalize(a.user.OFFICE_ID);
  if(articleAssignedPins(officeId).indexOf(articlePin(r.ARTISAN_PIN_CODE))<0)
    throw Error('This article is outside your assigned pincode list.');

  var sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('ARTICLE_STATUS');
  if(!sh)throw Error('Missing sheet ARTICLE_STATUS. Run setupSpreadsheet() once.');

  var existing=read(S.AS).find(function(z){
    return date(z.DATE)===d && articleNormalize(z.ARTICLE_KEY)===key;
  });

  var row=[
    d,key,
    articleNormalize(r.BAR_CODE_ID),
    articleNormalize(r.PMV_APPLICATION_NUMBER),
    officeId,
    articleNormalize(a.user.OFFICE_NAME),
    articleNormalize(a.user.USER_ID),
    articleNormalize(a.user.NAME),
    status,remarks,new Date()
  ];

  if(existing)sh.getRange(existing.__row,1,1,row.length).setValues([row]);
  else sh.appendRow(row);

  audit(a.user.USER_ID,'ARTICLE_STATUS',d+' | '+key+' | '+status);
  return ok({articleKey:key,status:status,date:d,source:'ARTICLE_MASTER'},'Article status updated.');
}

function adminArticleStatus(p,s){
  var a=auth(s);
  if(![ROLE.ADMIN,ROLE.DPS].includes(a.role))
    throw Error('Only DPS/Admin users can access article status.');

  var d=articleNormalize(p && p.date || today());
  var source=articleNormalize(p && p.source || 'master').toLowerCase();
  if(['master','audit','both'].indexOf(source)<0)source='master';

  var q=articleNormalize(p && p.q).toLowerCase();
  var office=articleNormalize(p && p.officeId);
  var limit=Math.min(Math.max(Number(p && p.limit || 500),1),2000);
  var status=articleStatusMap(d);
  var rows=articleRowsForSource(source);
  var outRows=[];

  rows.forEach(function(r){
    if(outRows.length>=limit)return;

    var st=status[articleKey(r)];
    var c=articleClient(
      r,st,
      r.__auditFallback ? 'audit-fallback' :
      source==='audit' ? 'audit' : 'master'
    );

    var rowOffice=articleNormalize(st && st.OFFICE_ID);
    if(office && rowOffice!==office)return;

    var hay=[
      c.barCodeId,c.pmvApplicationNumber,c.artisanName,
      c.pinCode,c.presentStatus,rowOffice
    ].join(' ').toLowerCase();

    if(q && hay.indexOf(q)<0)return;

    outRows.push(Object.assign({},c,{
      officeId:rowOffice,
      officeName:articleNormalize(st && st.OFFICE_NAME),
      spmId:articleNormalize(st && st.SPM_ID),
      spmName:articleNormalize(st && st.SPM_NAME)
    }));
  });

  return ok({
    date:d,
    source:source,
    articles:outRows,
    total:outRows.length,
    masterCount:articleMasterRows().length,
    auditArticleCount:articleAuditRows().length
  });
}

function testDualSourceArticles(){
  var master=articleMasterRows();
  var audit=articleAuditRows();
  var result={
    masterArticleCount:master.length,
    auditArticleCount:audit.length,
    masterFirst:master.length?articleClient(master[0],null,'master'):null,
    auditFirst:audit.length?articleClient(audit[0],null,'audit'):null
  };
  Logger.log(JSON.stringify(result,null,2));
  return result;
}
function findUser(id){return read(S.U).find(r=>String(r.USER_ID).trim()===String(id).trim())}function findReport(id,d){return read(S.R).find(r=>String(r.SPM_ID)===String(id)&&date(r.DATE)===d)}function auth(s){if(!s?.userId||!s?.token)throw Error('Not authenticated. Please sign in again.');let x=read(S.SS).find(r=>String(r.TOKEN)===String(s.token)&&String(r.USER_ID)===String(s.userId)&&act(r.ACTIVE));if(!x)throw Error('Session expired or invalid. Please log in again.');if(new Date(x.EXPIRES_AT).getTime()<=Date.now())throw Error('Session expired. Please log in again.');let u=findUser(s.userId);if(!u||!act(u.ACTIVE))throw Error('Account is inactive.');return{user:u,role:String(u.ROLE||'').toUpperCase()}}
function parse(s){if(!s)return null;if(typeof s==='object')return s;try{return JSON.parse(s)}catch(e){return null}}function read(n){let sh=sheet(n),v=sh.getDataRange().getValues(),h=v.shift()||[];return v.map((r,i)=>{let o={__row:i+2};h.forEach((k,j)=>o[k]=r[j]);return o})}function sheet(n){let sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(n);if(!sh)throw Error('Missing sheet '+n+'. Run setupSpreadsheet() once.');return sh}function date(v){return v instanceof Date?Utilities.formatDate(v,TZ,'yyyy-MM-dd'):String(v||'').slice(0,10)}function today(){return Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd')}function num(v){let n=Number(v);return Number.isFinite(n)?n:0}function act(v){return v===true||['true','yes','1','active','y'].includes(String(v).toLowerCase().trim())}function mob(v){return String(v||'').replace(/\D/g,'')}function audit(u,a,d){try{sheet(S.A).appendRow([new Date(),u,a,d])}catch(e){}}function ok(d,m){return{success:true,data:d,message:m||'OK'}}function err(m){return{success:false,data:null,message:String(m||'Request failed.')}}function out(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON)}
