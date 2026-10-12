export function setupSessionAdmin(document){
  const panel=document.getElementById('user-session-admin'),select=document.getElementById('session-policy-user'),form=document.getElementById('session-policy-form'),status=document.getElementById('session-policy-status');
  let users=[],role=null;
  async function request(path,body){
    const response=await fetch(path,body===undefined?{}:{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Session policy request failed');return data;
  }
  function selected(){const user=users.find(u=>u.id===select.value);form.elements.maxSessions.value=user?.max_sessions??1;document.getElementById('session-policy-count').textContent=user?`${user.active_sessions} active session(s). Default limit: 1.`:'';}
  async function refresh(user){
    role=user?.role;panel.hidden=role!=='super_admin';if(panel.hidden)return;
    const chosen=select.value;users=(await request('/api/admin/user-sessions')).users;select.replaceChildren();
    for(const user of users){const option=document.createElement('option');option.value=user.id;option.textContent=`${user.display_name} (${user.email})`;select.append(option);}
    if(users.some(u=>u.id===chosen))select.value=chosen;selected();
  }
  select.onchange=selected;
  document.getElementById('session-policy-refresh').onclick=()=>refresh({role}).catch(error=>status.textContent=error.message);
  form.onsubmit=async event=>{
    event.preventDefault();const button=form.querySelector('button[type=submit]');button.disabled=true;
    try{const data=await request('/api/admin/user-sessions/'+encodeURIComponent(select.value),{maxSessions:Number(form.elements.maxSessions.value)});await refresh({role});status.textContent=`Saved limit ${data.maxSessions}; ${data.revokedSessions} earlier session(s) ended.`;}catch(error){status.textContent=error.message;}finally{button.disabled=false;}
  };
  return {refresh};
}
