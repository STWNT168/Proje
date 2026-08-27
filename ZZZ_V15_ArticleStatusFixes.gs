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
