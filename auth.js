(() => {
'use strict';
const $=id=>document.getElementById(id);
async function login(){
  const userId=$('uid').value.trim(), mobile=$('mobile').value.trim(), b=$('login');
  if(!userId||!mobile)return msg('Enter User ID and registered mobile number.',1);
  b.disabled=true;b.textContent='VERIFYING…';
  try{
    const s=await PMVApi.login(userId,mobile);
    // PMVApi.login already stores the V14 session; this is idempotent.
    PMVApi.saveSession(s);
    await App.afterLogin();
  }catch(e){
    PMVApi.clearSession();
    msg(e.message,1);
  }finally{b.disabled=false;b.textContent='SIGN IN'}
}
function msg(t,b){$('loginMsg').textContent=t;$('loginMsg').className='msg '+(b?'bad':'')}
async function logout(){try{await PMVApi.logout()}catch(e){}PMVApi.clearSession();location.reload()}
window.PMVAuth={login,logout};
})();
