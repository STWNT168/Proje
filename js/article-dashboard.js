(() => {
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STATUSES=['Pending','Delivered','Redirected','Return','Torn/Without Address','Invalid OTP'];
let rows=[],adminRows=[];
const norm=v=>{const s=String(v||'').toLowerCase();if(s.includes('deliver'))return'Delivered';if(s.includes('redirect'))return'Redirected';if(s.includes('return')||s.includes('rts'))return'Return';if(s.includes('torn')||s.includes('without'))return'Torn/Without Address';if(s.includes('otp')||s.includes('invalid mobile'))return'Invalid OTP';return'Pending'};
const matches=(r,q)=>{q=String(q||'').trim().toLowerCase();if(!q)return true;const hay=Object.values(r||{}).join(' ').toLowerCase();return q.split(/\s+/).filter(Boolean).every(x=>hay.includes(x))};
const selected=id=>[...($(id)?.querySelectorAll('.article-check:checked')||[])].map(x=>x.dataset.key).filter(Boolean);
function renderSummary(data,id){const c=Object.fromEntries(STATUSES.map(x=>[x,0]));data.forEach(r=>c[norm(r.presentStatus)]++);if($(id))$(id).innerHTML=Object.entries(c).map(([k,v])=>`<span class="pill">${esc(k)}: <b>${v}</b></span>`).join(' ')}
function statusOptions(v){return STATUSES.map(s=>`<option ${norm(v)===s?'selected':''}>${esc(s)}</option>`).join('')}
function renderSpm(){
 const f=$('article-status-filter')?.value||'All',q=$('article-search')?.value||'',data=rows.filter(r=>(f==='All'||norm(r.presentStatus)===f)&&matches(r,q)),t=$('spmArticles');if(!t)return;
 t.innerHTML=`<thead><tr><th><input class="article-select-all" type="checkbox"></th><th>Barcode</th><th>PMV Application</th><th>Artisan</th><th>PIN</th><th>Address</th><th>Circle</th><th>Division</th><th>Present Status</th><th>Remarks</th><th>Action</th></tr></thead><tbody>${data.map(r=>`<tr><td><input class="article-check" data-key="${esc(r.articleKey)}" type="checkbox"></td><td>${esc(r.barCodeId)}</td><td>${esc(r.pmvApplicationNumber)}</td><td>${esc(r.artisanName)}</td><td>${esc(r.pinCode)}</td><td>${esc(r.address)}</td><td>${esc(r.circleName)}</td><td>${esc(r.divisionName)}</td><td><select class="article-status" data-key="${esc(r.articleKey)}">${statusOptions(r.presentStatus)}</select></td><td><input class="article-remarks" data-key="${esc(r.articleKey)}" value="${esc(r.remarks)}"></td><td><button class="article-save" data-key="${esc(r.articleKey)}">SAVE</button></td></tr>`).join('')}</tbody>`;
 bindTable('spmArticles','spm-selected-count');renderSummary(data,'spm-status-summary');
}
function bindTable(id,countId){const t=$(id);if(!t)return;const all=t.querySelector('.article-select-all');all?.addEventListener('change',e=>{t.querySelectorAll('.article-check').forEach(x=>x.checked=e.target.checked);$(countId).textContent=`${selected(id).length} selected`});t.querySelectorAll('.article-check').forEach(x=>x.addEventListener('change',()=>$(countId).textContent=`${selected(id).length} selected`));t.querySelectorAll('.article-save').forEach(b=>b.addEventListener('click',()=>saveOne(b.dataset.key)))}
async function loadSpm(){
 try{const d=await PMVApi.articles($('spm-date').value,$('article-search').value.trim());rows=d.articles||[];window.__spmArticleRows=rows;if($('article-scope'))$('article-scope').textContent=`Office: ${d.officeName||''} · Assigned PIN codes: ${(d.assignedPins||[]).join(', ')||'Not configured'} · ${d.total??rows.length} articles visible`;renderSpm()}
 catch(e){if($('article-scope'))$('article-scope').textContent=e.message;window.toast?toast(e.message,1):alert(e.message)}
}
async function saveOne(key){
 const s=document.querySelector(`.article-status[data-key="${CSS.escape(key)}"]`)?.value||'Pending',r=document.querySelector(`.article-remarks[data-key="${CSS.escape(key)}"]`)?.value||'';
 try{await PMVApi.updateArticleStatus({date:$('spm-date').value,articleKey:key,status:s,remarks:r});await loadSpm()}catch(e){alert(e.message)}
}
async function bulkSpm(){
 const keys=selected('spmArticles');if(!keys.length)return alert('Select article(s) first.');
 const status=$('spm-bulk-status').value,remarksByKey={};keys.forEach(k=>remarksByKey[k]=document.querySelector(`.article-remarks[data-key="${CSS.escape(k)}"]`)?.value||'');
 try{for(const k of keys)await PMVApi.updateArticleStatus({date:$('spm-date').value,articleKey:k,status,remarks:remarksByKey[k]});await loadSpm()}catch(e){alert(e.message)}
}
function renderAdmin(){
 const f=$('admin-article-status-filter')?.value||'All',q=$('admin-article-search')?.value||'',data=adminRows.filter(r=>(f==='All'||norm(r.presentStatus)===f)&&matches(r,q)),t=$('adminArticles');if(!t)return;
 t.innerHTML=`<thead><tr><th><input class="article-select-all" type="checkbox"></th><th>Barcode</th><th>PMV Application</th><th>Artisan</th><th>PIN</th><th>Office</th><th>SPM</th><th>Present</th><th>Master</th><th>Review</th></tr></thead><tbody>${data.map(r=>`<tr><td><input class="article-check" data-key="${esc(r.articleKey)}" type="checkbox"></td><td>${esc(r.barCodeId)}</td><td>${esc(r.pmvApplicationNumber)}</td><td>${esc(r.artisanName)}</td><td>${esc(r.pinCode)}</td><td>${esc(r.officeName)}</td><td>${esc(r.spmId)}</td><td>${esc(norm(r.presentStatus))}</td><td>${esc(norm(r.masterStatus))}</td><td>${esc(r.reviewStatus||'PENDING')}</td></tr>`).join('')}</tbody>`;
 bindTable('adminArticles','admin-selected-count');renderSummary(data,'admin-status-summary');
}
async function loadAdmin(){try{const d=await PMVApi.adminArticles($('admin-date').value,$('admin-article-search').value.trim());adminRows=d.articles||[];renderAdmin();if($('admin-article-status'))$('admin-article-status').textContent=`${d.total??adminRows.length} records · Master rows: ${d.diagnostics?.masterRows??'?'} · Status rows: ${d.diagnostics?.statusRows??'?'}`}catch(e){alert(e.message)}}
async function pushSelected(){const keys=selected('adminArticles');if(!keys.length)return alert('Select article(s) first.');if(!confirm(`Authorise ${keys.length} article(s) into ARTICLE_MASTER?`))return;try{const d=await PMVApi.pushArticleStatusToMaster({date:$('admin-date').value,articleKeys:keys});alert(`${d.pushed} pushed; ${d.skipped} skipped.`);await loadAdmin()}catch(e){alert(e.message)}}
async function diagnostic(){
 try{const p=await PMVApi.diagnosePinAccess(),m=await PMVApi.diagnoseMaster(),s=await PMVApi.diagnoseStatus($('spm-date')?.value||new Date().toISOString().slice(0,10));console.log('PIN',p,'MASTER',m,'STATUS',s);alert(`Office: ${p.officeName||''}\nSession PINs: ${(p.sessionPins||[]).join(', ')||'none'}\nUSER_MASTER PINs: ${(p.userPins||[]).join(', ')||'none'}\nOFFICE_MASTER PINs: ${(p.officePins||[]).join(', ')||'none'}\nEffective PINs: ${(p.effectivePins||[]).join(', ')||'none'}\nMatching articles: ${p.matchingArticles}\nARTICLE_MASTER rows: ${m.totalRows}\nARTICLE_STATUS rows: ${s.totalRows}`)}catch(e){alert(e.message)}
}
window.ArticleDashboard={loadSpm,loadAdmin,bulkSpm,pushSelected,renderSpm,renderAdmin,diagnostic};
document.addEventListener('DOMContentLoaded',()=>{
 $('article-fetch')?.addEventListener('click',loadSpm);$('article-status-filter')?.addEventListener('change',renderSpm);$('article-search')?.addEventListener('input',renderSpm);$('spm-bulk-apply')?.addEventListener('click',bulkSpm);
 $('admin-article-fetch')?.addEventListener('click',loadAdmin);$('admin-article-status-filter')?.addEventListener('change',renderAdmin);$('admin-article-search')?.addEventListener('input',renderAdmin);$('admin-push-selected')?.addEventListener('click',pushSelected);
});
})();