(()=>{
  const $=id=>document.getElementById(id);
  const show=(id,v)=>$(id)?.classList.toggle('hidden',!v);
  window.toast=(t,b)=>{let x=$('toast');if(!x)return;x.textContent=t;x.className='toast show '+(b?'bad':'good');clearTimeout(window.__t);window.__t=setTimeout(()=>x.classList.remove('show'),4500)};
  function showLogin(message){
    PMVApi.clearSession();
    show('loginView',true);show('spmView',false);show('adminView',false);
    if($('uid'))$('uid').focus();
    if(message)toast(message,1);
  }
  async function afterLogin(){
    let s=PMVApi.getSession();
    if(!s)throw Error('Please sign in again.');
    $('who').textContent=`${s.name||s.userId} · ${s.role}${s.officeName?' · '+s.officeName:''}`;
    show('loginView',false);show('spmView',s.role==='SPM');show('adminView',s.role==='ADMIN'||s.role==='DPS');
    if(s.role==='SPM'){PMVSpm.setToday();await PMVSpm.load($('spm-date').value)}
    else{PMVAdmin.setToday();await PMVAdmin.load($('admin-date').value)}
  }
  async function boot(){
    $('login').onclick=PMVAuth.login;$('logout').onclick=PMVAuth.logout;
    PMVSpm.bind();PMVAdmin.bind();
    window.addEventListener('pmv-session-expired',e=>showLogin(e.detail?.message||'Session expired. Please sign in again.'));
    let s=PMVApi.getSession();
    if(s)try{await afterLogin()}catch(e){showLogin('Your session is no longer valid. Please sign in again.')}
  }
  window.App={afterLogin,showLogin};document.addEventListener('DOMContentLoaded',boot)
})();
