const Api = (() => {
  const base = () => window.PMV_CONFIG.API_URL;
  async function post(action,payload={}) {
    const res=await fetch(base(),{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,...payload})});
    const data=await res.json(); if(!data.success) throw new Error(data.message||"Request failed."); return data;
  }
  async function get(action,params={}) {
    const q=new URLSearchParams({action,...params}); const res=await fetch(base()+"?"+q.toString());
    const data=await res.json(); if(!data.success) throw new Error(data.message||"Request failed."); return data;
  }
  return {
    login:(userId,mobile)=>post("login",{userId,mobile}),
    logout:session=>post("logout",{session}),
    offices:session=>get("getOfficeList",{session:JSON.stringify(session)}),
    opening:(session,officeId,date)=>get("getOpeningBalance",{session:JSON.stringify(session),officeId,date}),
    submit:(session,record)=>post("submitPmvReport",{session,record}),
    ownDashboard:(session,date)=>get("getOwnPmvDashboard",{session:JSON.stringify(session),date}),
    adminDashboard:(session,date)=>get("getAdminPmvDashboard",{session:JSON.stringify(session),date})
  };
})();
