export function setupAuthProviders() {
  const form=document.querySelector("#auth-providers-form");
  const status=document.querySelector("#auth-providers-status");
  async function request(method="GET",body) {
    const response=await fetch("/api/admin/auth-providers",{method,credentials:"same-origin",
      headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
    const data=await response.json();
    if (!response.ok) throw new Error(data.error||"Authentication policy request failed");
    return data;
  }
  async function refresh() {
    try {
      const data=await request();
      status.textContent=`Local: ${data.localEnabled?"enabled":"disabled"}; LDAP: ${data.ldapEnabled?"enabled":"disabled"}, ${data.ldapConfigured?"server configured":"server not configured"}. Tenant admin LDAP controls: ${data.ldapAdminManaged?"allowed":"super admin only"}.`;
      form.hidden=!data.superAdmin;
      form.elements.localEnabled.checked=data.localEnabled;
      form.elements.ldapAdminManaged.checked=data.ldapAdminManaged;
    } catch(error) {status.textContent=error.message;}
  }
  form.onsubmit=async(event)=>{
    event.preventDefault();
    try {
      await request("PUT",{localEnabled:form.elements.localEnabled.checked,
        ldapAdminManaged:form.elements.ldapAdminManaged.checked});
      await refresh();status.textContent+=" Policy saved.";
    } catch(error) {status.textContent=error.message;}
  };
  return {refresh};
}
