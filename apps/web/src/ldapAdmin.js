export function setupLdapAdmin() {
  const $=selector=>document.querySelector(selector);
  const status=message=>{$("#ldap-status").textContent=message;};
  async function call(path,method="GET",body) {
    const response=await fetch(path,{method,credentials:"same-origin",
      headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
    const data=await response.json();
    if (!response.ok) throw new Error(data.error||"LDAP request failed");
    return data;
  }
  async function refresh() {
    try {
      const data=await call("/api/admin/ldap");
      $("#ldap-config-state").textContent=data.configured?
        "Secure server connection configured. Directory passwords stay on the server.":
        "Server LDAPS connection is not configured yet. See README deployment steps.";
      $("#ldap-enabled").checked=data.enabled;
      $("#ldap-enabled").disabled=!data.configured;
      $("#ldap-save-enabled").disabled=!data.configured;
      const select=$("#ldap-app-group");
      select.replaceChildren(...data.groups.map(group=>{
        const option=document.createElement("option");option.value=group.id;option.textContent=group.name;return option;
      }));
      $("#ldap-mappings").replaceChildren(...data.mappings.map(mapping=>{
        const item=document.createElement("li"),remove=document.createElement("button");
        item.append(document.createTextNode(`${mapping.group_dn} → ${mapping.app_group} `));
        remove.textContent="Remove mapping";remove.type="button";
        remove.onclick=async()=>{
          try {await call(`/api/admin/ldap/mappings/${mapping.id}`,"DELETE");await refresh();status("Mapping removed; LDAP sessions revoked.");}
          catch(error) {status(error.message);}
        };
        item.append(remove);return item;
      }));
    } catch(error) {status(error.message);}
  }
  $("#ldap-save-enabled").onclick=async()=>{
    try {const enabled=$("#ldap-enabled").checked;
      await call("/api/admin/ldap","PUT",{enabled});await refresh();
      status(enabled?"LDAP sign-in enabled.":"LDAP sign-in disabled and directory sessions revoked.");
    } catch(error) {status(error.message);}
  };
  $("#ldap-map-form").onsubmit=async(event)=>{
    event.preventDefault();
    try {await call("/api/admin/ldap/mappings","POST",Object.fromEntries(new FormData(event.currentTarget)));
      event.currentTarget.reset();await refresh();status("Directory group mapped to app features.");}
    catch(error) {status(error.message);}
  };
  return {refresh};
}
