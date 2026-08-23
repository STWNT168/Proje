/**
 * PMV Toolkit Tracker - Article Status Engine v2
 *
 * Add this file to the same Apps Script project as Code.gs.
 * It intentionally keeps the existing PMV reporting functions intact while
 * replacing the article functions called by the existing doGet/doPost routes.
 *
 * IMPORTANT:
 * - ARTICLE_STATUS is the source of PRESENT STATUS.
 * - ARTICLE_MASTER is the master destination.
 * - Only ADMIN/DPS can push reviewed SPM changes into ARTICLE_MASTER.
 * - SPMs are restricted to assigned PIN codes.
 */

var ARTICLE_ENGINE_STATUSES = [
  'Pending','Delivered','Redirected','Return',
  'Torn/Without Address','Invalid OTP'
];

function aeText(v){return String(v==null?'':v).trim();}
function aeNorm(v){return aeText(v).toUpperCase().replace(/\s+/g,' ').trim();}
function aeStatus(v){
  var s=aeNorm(v);
  if(!s)return 'Pending';
  if(/DELIVER/.test(s))return 'Delivered';
  if(/REDIRECT/.test(s))return 'Redirected';
  if(/RTS|RETURN|RETUR/.test(s))return 'Return';
  if(/TORN|WITHOUT\s*(ADDRESS|PROPER|DETAIL)|WITHOUT\s*ADDR/.test(s))return 'Torn/Without Address';
  if(/INVALID\s*(OTP|MOBILE|PHONE)|OTP/.test(s))return 'Invalid OTP';
  if(/PENDING|NOT\s*RECEIVED|NOT\s*DELIVER/.test(s))return 'Pending';
  return aeText(v)||'Pending';
}
function aeValue(row,names){
  for(var i=0;i<names.length;i++){
    var k=normalizeHeader(names[i]);
    if(row[k]!==undefined&&row[k]!=='')return row[k];
  }
  return '';
}
function aeArticleKey(row){
  return aeText(aeValue(row,['ARTICLE_KEY','BAR_CODE_ID','PMV_APPLICATION_NUMBER','ARTICLE_NUMBER']));
}
function aeSearchRows(rows,query){
  var q=aeNorm(query);
  if(!q)return rows;
  var terms=q.split(/\s+/).filter(Boolean);
  return rows.filter(function(r){
    var hay=Object.keys(r).filter(function(k){return k.indexOf('__')!==0;})
      .map(function(k){return aeNorm(r[k]);}).join(' ');
    return terms.every(function(t){return hay.indexOf(t)!==-1;});
  });
}
function aeLatestStatusMap(dateValue){
  var rows=readSheet(S.AS),wanted=dateOnly(dateValue||today()),map={};
  rows.forEach(function(r){
    if(dateOnly(r.DATE)!==wanted)return;
    var key=aeArticleKey(r);if(!key)return;
    var old=map[key],stamp=r.UPDATED_AT?new Date(r.UPDATED_AT).getTime():0,oldStamp=old&&old.UPDATED_AT?new Date(old.UPDATED_AT).getTime():-1;
    if(!old||stamp>=oldStamp||r.__row>old.__row)map[key]=r;
  });
  return map;
}
function aeAssignedPinsForUser(user){
  var raw=assignedPincodes(user.OFFICE_ID)||[],set={};
  raw.forEach(function(p){var n=normalizePin(p);if(n)set[n]=true;});
  if(!Object.keys(set).length){
    var office=readSheet(S.O).find(function(o){return normalizeId(o.OFFICE_ID)===normalizeId(user.OFFICE_ID);});
    if(office)String(office.PINCODES||'').split(/[,;\s]+/).forEach(function(p){var n=normalizePin(p);if(n)set[n]=true;});
  }
  return Object.keys(set);
}
function aeMasterRows(){return readSheet(S.AM).filter(function(r){return aeArticleKey(r)!=='';});}
function aeArticleView(row,statusRow){
  return {
    articleKey:aeArticleKey(row),
    barCodeId:aeText(aeValue(row,['BAR_CODE_ID'])),
    pmvApplicationNumber:aeText(aeValue(row,['PMV_APPLICATION_NUMBER'])),
    artisanName:aeText(aeValue(row,['ARTISAN_NAME'])),
    mobileNumber:aeText(aeValue(row,['MOBILE_NUMBER','MOBILE'])),
    address:aeText(aeValue(row,['ARTISAN_CURRENT_ADDRESS','ADDRESS'])),
    circleName:aeText(aeValue(row,['CIRCLE_NAME','CIRCLE'])),
    divisionName:aeText(aeValue(row,['DIVISION_NAME','DIVISION'])),
    pinCode:normalizePin(aeValue(row,['ARTISAN_PIN_CODE','PIN_CODE','PINCODE'])),
    deliveryStaff:aeText(aeValue(row,['DELIVERY_STAFF_ASSIGNED_UNASSIGNED','DELIVERY_STAFF'])),
    sourceStatus:statusRow?aeStatus(statusRow.STATUS):'Pending',
    presentStatus:statusRow?aeStatus(statusRow.STATUS):'Pending',
    remarks:statusRow?aeText(statusRow.REMARKS):'',
    updatedAt:statusRow?aeText(statusRow.UPDATED_AT):'',
    spmId:statusRow?aeText(statusRow.SPM_ID):'',
    spmName:statusRow?aeText(statusRow.SPM_NAME):'',
    officeId:statusRow?normalizeId(statusRow.OFFICE_ID):'',
    officeName:statusRow?aeText(statusRow.OFFICE_NAME):'',
    masterStatus:aeText(aeValue(row,['TOOLKIT_DELIVERY_STATUS']))
  };
}
function aeCounts(rows){
  var c={Pending:0,Delivered:0,Redirected:0,Return:0,'Torn/Without Address':0,'Invalid OTP':0};
  rows.forEach(function(r){var s=aeStatus(r.presentStatus);c[s]=(c[s]||0)+1;});
  return c;
}

function getSpmArticles(params,session){
  var a=auth(session);
  if(a.role!==ROLE.SPM)throw new Error('SPM access required.');
  params=params||{};
  var pins=aeAssignedPinsForUser(a.user),set={};
  pins.forEach(function(p){set[normalizePin(p)]=true;});
  var statusMap=aeLatestStatusMap(params.date||today());
  var rows=aeMasterRows().filter(function(r){
    return !!set[normalizePin(aeValue(r,['ARTISAN_PIN_CODE','PIN_CODE','PINCODE']))];
  }).map(function(r){
    var v=aeArticleView(r,statusMap[aeArticleKey(r)]);
    v.officeId=normalizeId(a.user.OFFICE_ID);v.officeName=aeText(a.user.OFFICE_NAME);
    return v;
  });
  rows=aeSearchRows(rows,params.search||params.q||'');
  var limit=Math.min(Math.max(Number(params.limit||10000),1),10000);
  rows=rows.slice(0,limit);
  return ok({
    date:dateOnly(params.date||today()),officeId:normalizeId(a.user.OFFICE_ID),
    officeName:aeText(a.user.OFFICE_NAME),pincodes:pins,total:rows.length,count:rows.length,
    statusCounts:aeCounts(rows),articles:rows
  });
}

function getAdminArticleStatus(params,session){
  var a=auth(session);
  if(a.role!==ROLE.ADMIN&&a.role!==ROLE.DPS)throw new Error('Admin/DPS access required.');
  params=params||{};var dateValue=dateOnly(params.date||today()),map=aeLatestStatusMap(dateValue);
  var rows=aeMasterRows().map(function(r){return aeArticleView(r,map[aeArticleKey(r)]);});
  rows=aeSearchRows(rows,params.search||params.q||'');
  var limit=Math.min(Math.max(Number(params.limit||10000),1),10000);rows=rows.slice(0,limit);
  var sync={Synced:0,'Pending Sync':0};
  rows.forEach(function(r){if(map[r.articleKey]&&aeStatus(r.presentStatus)===aeStatus(r.masterStatus))sync.Synced++;else sync['Pending Sync']++;});
  return ok({date:dateValue,total:rows.length,count:rows.length,statusCounts:aeCounts(rows),syncCounts:sync,articles:rows});
}

function updateArticleStatus(record,session){
  var a=auth(session);
  if(a.role!==ROLE.SPM)throw new Error('Only SPM can update article status.');
  record=record||{};
  var key=aeText(record.articleKey||record.ARTICLE_KEY||record.pmvApplicationNumber||record.barCodeId);
  if(!key)throw new Error('Article key is required.');
  var dateValue=dateOnly(record.date||today()),status=aeStatus(record.status||record.presentStatus);
  var pins=aeAssignedPinsForUser(a.user);
  var master=aeMasterRows().find(function(r){return aeArticleKey(r)===key;});
  if(!master)throw new Error('Article not found in ARTICLE_MASTER.');
  var pin=normalizePin(aeValue(master,['ARTISAN_PIN_CODE','PIN_CODE','PINCODE']));
  if(pins.indexOf(pin)===-1)throw new Error('This article is outside your assigned PIN codes.');
  var ws=sh(S.AS),rows=readSheet(S.AS);
  var old=rows.find(function(r){return dateOnly(r.DATE)===dateValue&&aeArticleKey(r)===key&&normalizeId(r.OFFICE_ID)===normalizeId(a.user.OFFICE_ID);});
  var values=[dateValue,key,aeText(aeValue(master,['BAR_CODE_ID'])),aeText(aeValue(master,['PMV_APPLICATION_NUMBER'])),normalizeId(a.user.OFFICE_ID),aeText(a.user.OFFICE_NAME),normalizeId(a.user.USER_ID),aeText(a.user.NAME),status,aeText(record.remarks),new Date()];
  if(old)ws.getRange(old.__row,1,1,values.length).setValues([values]);else ws.appendRow(values);
  audit(a.user.USER_ID,'ARTICLE_STATUS_UPDATE',key+' = '+status+' on '+dateValue);
  return ok({articleKey:key,status:status,date:dateValue},'Article status saved.');
}

function pushArticleStatusToMaster(record,session){
  var a=auth(session);
  if(a.role!==ROLE.ADMIN&&a.role!==ROLE.DPS)throw new Error('Admin/DPS authorisation required.');
  record=record||{};var dateValue=dateOnly(record.date||today());
  var keys=Array.isArray(record.articleKeys)?record.articleKeys.map(aeText).filter(Boolean):[];
  if(!keys.length)throw new Error('Select at least one article to push.');
  var set={};keys.forEach(function(k){set[k]=true;});
  var latest={},statuses=readSheet(S.AS).filter(function(r){return dateOnly(r.DATE)===dateValue&&set[aeArticleKey(r)];});
  statuses.forEach(function(r){var k=aeArticleKey(r);if(!latest[k]||r.__row>latest[k].__row)latest[k]=r;});
  var ws=sh(S.AM),headers=ws.getRange(1,1,1,ws.getLastColumn()).getValues()[0].map(normalizeHeader),col=headers.indexOf('TOOLKIT_DELIVERY_STATUS')+1;
  if(!col)throw new Error('ARTICLE_MASTER is missing TOOLKIT_DELIVERY_STATUS column.');
  var pushed=0,skipped=0,details=[];
  aeMasterRows().forEach(function(r){
    var k=aeArticleKey(r);if(!set[k])return;
    if(!latest[k]){skipped++;details.push({articleKey:k,result:'No SPM update'});return;}
    var st=aeStatus(latest[k].STATUS);ws.getRange(r.__row,col).setValue(st);
    pushed++;details.push({articleKey:k,status:st,spmId:latest[k].SPM_ID,spmName:latest[k].SPM_NAME,result:'Pushed'});
  });
  audit(a.user.USER_ID,'PUSH_ARTICLE_STATUS_TO_MASTER',dateValue+' pushed='+pushed+' skipped='+skipped);
  return ok({date:dateValue,pushed:pushed,skipped:skipped,details:details},pushed+' article status update(s) pushed to ARTICLE_MASTER.');
}

function updateArticleMaster(record,session){
  var a=auth(session);
  if(a.role!==ROLE.ADMIN&&a.role!==ROLE.DPS)throw new Error('Admin/DPS authorisation required.');
  record=record||{};var key=aeText(record.articleKey||record.ARTICLE_KEY);
  if(!key)throw new Error('Article key is required.');
  var master=aeMasterRows().find(function(r){return aeArticleKey(r)===key;});
  if(!master)throw new Error('Article not found in ARTICLE_MASTER.');
  var headers=sh(S.AM).getRange(1,1,1,sh(S.AM).getLastColumn()).getValues()[0].map(normalizeHeader),col=headers.indexOf('TOOLKIT_DELIVERY_STATUS')+1;
  if(!col)throw new Error('ARTICLE_MASTER is missing TOOLKIT_DELIVERY_STATUS column.');
  var status=aeStatus(record.status||record.presentStatus);sh(S.AM).getRange(master.__row,col).setValue(status);
  audit(a.user.USER_ID,'ARTICLE_MASTER_UPDATE',key+' = '+status);
  return ok({articleKey:key,newStatus:status},'ARTICLE_MASTER updated.');
}
