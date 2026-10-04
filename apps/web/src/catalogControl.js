const labels={planRequests:"Users may request plans",didRequests:"Users may request DIDs",
  adminPlans:"Tenant admins may edit plans",adminPricing:"Tenant admins may edit DID pricing",
  adminInventory:"Tenant admins may manage in-house inventory",adminUsers:"Tenant admins may manage users and groups"};
export function setupCatalogControl() {
  const form=document.querySelector("#catalog-policy-form"),status=document.querySelector("#catalog-policy-status");
  for (const [key,label] of Object.entries(labels)) {
    const line=document.createElement("label"),check=document.createElement("input");
    check.type="checkbox";check.name=key;line.append(check," "+label);form.insertBefore(line,form.lastElementChild);
  }
  async function refresh() {
    try {
      const response=await fetch("/api/admin/catalog-policy",{credentials:"same-origin"});
      const data=await response.json();if (!response.ok) throw new Error(data.error);
      for (const key of Object.keys(labels)) form.elements[key].checked=data.policy[key];
      form.hidden=!data.editable;
      const can=(key)=>data.editable || data.policy[key];
      document.querySelector("#create-plan button").disabled=!can("adminPlans");
      document.querySelector("#pricing-rule button").disabled=!can("adminPricing");
      document.querySelector("#inhouse-admin").hidden=!can("adminInventory");
      document.querySelector("#tenant-user-create button").disabled=!can("adminUsers");
      for(const button of document.querySelectorAll("#group-admin button")) button.disabled=!can("adminUsers");
      for(const button of document.querySelectorAll("#admin-plans button")) button.disabled=!can("adminPlans");
      status.textContent=`Tenant ${data.tenantId}: ${Object.entries(data.policy).map(([key,value])=>`${labels[key]} ${value?"on":"off"}`).join("; ")}.`;
    } catch(error) {status.textContent=error.message;}
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    try {
      const policy=Object.fromEntries(Object.keys(labels).map(key=>[key,form.elements[key].checked]));
      const response=await fetch("/api/admin/catalog-policy",{method:"PUT",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},body:JSON.stringify(policy)});
      const data=await response.json();if (!response.ok) throw new Error(data.error);
      await refresh();status.textContent+=" Saved.";
    } catch(error) {status.textContent=error.message;}
  });
  return {refresh};
}
