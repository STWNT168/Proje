(() => {
'use strict';
async function login(){
  const userId=document.getElementById('uid').value.trim();
  const mobile=document.getElementById('mobile').value.trim();
  const b=document.getElementById('login');
  if(!userId||!mobile){
    return msg('Enter User ID and registered mobile number.',true);
  }
  b.disabled=true;b.textContent='VERIFYING…';
  try{
    await PMVApi.login(userId,mobile);
    await App.afterLogin();
  }catch(e){
    msg(e.message,true);
  }finally{
    b.disabled=false;b.textContent='SIGN IN';
  }
}
function msg(t,b){
  const x=document.getElementById('loginMsg');
  if(x){x.textContent=t;x.className='msg '+(b?'bad':'')}
}
async function logout(){
  try{await PMVApi.logout()}catch(_){}
  PMVApi.clearSession();
  location.reload();
}
window.PMVAuth={login,logout};
})();