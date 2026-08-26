/**
 * PMV Toolkit Tracker V10 - robust SPM PIN resolution.
 *
 * Purpose:
 * Fixes "Assigned PIN codes: Not configured Â· 0 articles visible".
 * It reads PIN assignments from USER_MASTER and OFFICE_MASTER using
 * many common header spellings, including PINCODE/PIN_CODES.
 *
 * It also supports PINCODE_MASTER/PIN_CODE_MASTER if those sheets exist.
 *
 * IMPORTANT:
 * Keep your existing Code.gs. This file is an additive patch.
 * Replace Code_WebGetBridge.gs with the V10 bridge supplied in this ZIP.
 */

function v10Clean_(v){return String(v==null?'':v).trim();}
function v10Upper_(v){return v10Clean_(v).toUpperCase();}
function v10Digits_(v){return v10Clean_(v).replace(/\D/g,'');}
function v10Pins_(v){
  if(Array.isArray(v)) return [...new Set(v.flatMap(v10Pins_))];
  return [...new Set(v10Clean_(v).split(/[,;\s|]+/).map(v10Digits_).filter(x=>x.length>=4))];
}

function v10OfficePins_(officeName,officeCode){
  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheetNames=[CONFIG.SHEETS.OFFICE,'OFFICE_MASTER','PINCODE_MASTER','PIN_CODE_MASTER'];
  const pinAliases=[
    'ASSIGNED_PINS','ASSIGNED_PIN_CODES','PIN_CODES','PINCODES','PINCODE',
    'PIN_CODE','PIN','DELIVERY_PINS','DELIVERY_PIN_CODES',
    'DELIVERY_PINCODE','DELIVERY_PIN'
  ];
  const out=[];
  const wantedName=v10Upper_(officeName), wantedCode=v10Upper_(officeCode);
  const seen={};

  for(const sheetName of sheetNames){
    if(!sheetName||seen[sheetName]) continue;
    seen[sheetName]=true;
    const sh=ss.getSheetByName(sheetName);
    if(!sh) continue;

    const values=sh.getDataRange().getDisplayValues();
    if(values.length<2) continue;

    const headers=values[0].map(normHeader_);
    const idx={};
    headers.forEach((h,i)=>{if(h&&!Object.prototype.hasOwnProperty.call(idx,h))idx[h]=i;});

    const get=(row,aliases)=>{
      for(const a of aliases){
        const k=normHeader_(a);
        if(idx[k]!==undefined && v10Clean_(row[idx[k]])) return row[idx[k]];
      }
      return '';
    };

    for(let r=1;r<values.length;r++){
      const row=values[r];
      const code=v10Upper_(get(row,['OFFICE_CODE','SOL_ID','SOLID','OFFICE_ID','CODE']));
      const name=v10Upper_(get(row,['OFFICE_NAME','OFFICE','POST_OFFICE','POST OFFICE','NAME']));

      if(!((wantedCode && code===wantedCode)||(wantedName && name===wantedName))) continue;

      for(const alias of pinAliases){
        const k=normHeader_(alias);
        if(idx[k]!==undefined) out.push(...v10Pins_(row[idx[k]]));
      }
    }
  }
  return [...new Set(out)];
}

function v10EffectivePins_(session){
  let pins=v10Pins_(session&&session.assignedPins);
  if(!pins.length) pins=v10OfficePins_(session&&session.officeName,session&&session.officeCode);
  return [...new Set(pins)];
}

/*
 * Replacement article retrieval used by the V10 GET bridge.
 * It retains the existing ARTICLE_STATUS overlay and all-field search.
 */
function getSpmArticlesV10_(session,date,search,limit){
  const master=readSheetObjects_(CONFIG.SHEETS.ARTICLE_MASTER);
  const status=readSheetObjects_(CONFIG.SHEETS.ARTICLE_STATUS,true);
  const statusMap=buildArticleStatusMap_(status,date);

  const role=String(session.role||'').toUpperCase();
  const isAdmin=role===CONFIG.ROLES.ADMIN||role===CONFIG.ROLES.DPS;
  const pins=v10EffectivePins_(session);

  const diagnostics={
    version:'V10',
    masterRows:master.length,
    statusRows:status.length,
    assignedPins:pins,
    officeName:session.officeName||'',
    officeCode:session.officeCode||'',
    masterSheet:CONFIG.SHEETS.ARTICLE_MASTER
  };

  if(!master.length)
    throw new Error('ARTICLE_MASTER contains no data rows. '+JSON.stringify(diagnostics));

  if(!isAdmin&&!pins.length)
    throw new Error(
      'PIN mapping not found for '+(session.officeName||session.userId)+
      '. Add PINCODE/PIN_CODES/ASSIGNED_PINS to OFFICE_MASTER or USER_MASTER. '+
      JSON.stringify(diagnostics)
    );

  const pinSet=new Set(pins.map(String));
  const articles=[];

  for(const row of master){
    const pin=articlePin_(row);
    if(!isAdmin&&!pinSet.has(pin)) continue;

    const key=articleKey_(row);
    if(!key) continue;

    const merged=mergeArticle_(row,statusMap[upper_(key)]||null);
    if(search&&!articleMatchesSearch_(merged,search)) continue;

    articles.push(merged);
    if(limit>0&&articles.length>=limit) break;
  }

  return {
    date,
    articles,
    total:articles.length,
    counts:countArticleStatuses_(articles),
    assignedPins:pins,
    diagnostics
  };
}

function diagnoseArticleAccessV10(session){
  const pins=v10EffectivePins_(session);
  const master=readSheetObjects_(CONFIG.SHEETS.ARTICLE_MASTER);
  const counts={};
  master.forEach(r=>{
    const p=articlePin_(r);
    if(p) counts[p]=(counts[p]||0)+1;
  });
  const matching=master.filter(r=>pins.includes(articlePin_(r))).length;

  return {
    version:'V10',
    userId:session.userId,
    officeName:session.officeName,
    officeCode:session.officeCode,
    assignedPins:pins,
    masterRows:master.length,
    matchingArticles:matching,
    matchingByPin:pins.reduce((o,p)=>(o[p]=counts[p]||0,o),{})
  };
}
