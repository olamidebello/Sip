const $ = (selector) => document.querySelector(selector);
async function call(path, method = "GET", body) {
  const response = await fetch(path,{method,headers:body ? {"Content-Type":"application/json"} : {},
    credentials:"same-origin",body:body ? JSON.stringify(body) : undefined});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Tenant request failed");
  return data;
}
export function setupTenants() {
  const status = $("#tenant-status");
  let current;
  async function refresh(user) {
    current = user;
    const superAdmin = user.role === "super_admin";
    $("#tenant-super").hidden = !superAdmin;
    $("#tenant-switch").hidden = !superAdmin;
    $("#tenant-suspend").hidden = !superAdmin;
    $("#tenant-activate").hidden = !superAdmin;
    const selector = $("#tenant-select");
    selector.replaceChildren();
    if (superAdmin) {
      const {tenants} = await call("/api/admin/tenants");
      for (const tenant of tenants) {
        const option = document.createElement("option");
        option.value = tenant.id;
        option.textContent = `${tenant.name} (${tenant.slug}, ${tenant.status})`;
        selector.append(option);
      }
      selector.value = user.tenantId;
    } else {
      const option = document.createElement("option");
      option.value = user.tenantId;
      option.textContent = "Your tenant";
      selector.append(option);
    }
  }
  $("#tenant-create").addEventListener("submit",async (event) => {
    event.preventDefault();
    try {
      const form = event.currentTarget;
      const tenant = await call("/api/admin/tenants","POST",Object.fromEntries(new FormData(form)));
      form.reset(); await refresh(current);
      $("#tenant-select").value = tenant.id;
      status.textContent = `Tenant ${tenant.name} created.`;
    } catch (error) {status.textContent = error.message;}
  });
  $("#tenant-user-create").addEventListener("submit",async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const data = await call("/api/admin/tenant-users","POST",{
        ...Object.fromEntries(new FormData(form)),tenantId:$("#tenant-select").value
      });
      form.reset(); status.textContent = `User created in tenant ${data.tenantId}. Share the initial password privately and change it before production use.`;
    } catch (error) {status.textContent = error.message;}
  });
  $("#tenant-switch").addEventListener("click",async () => {
    try {
      await call(`/api/admin/tenants/${$("#tenant-select").value}/switch`,"POST",{});
      window.location.reload();
    } catch (error) {status.textContent = error.message;}
  });
  $("#tenant-suspend").addEventListener("click",async () => {
    try {
      const id = $("#tenant-select").value;
      await call(`/api/admin/tenants/${id}/status`,"PUT",{status:"suspended"});
      await refresh(current); status.textContent = "Tenant suspended; its sessions can no longer authenticate.";
    } catch (error) {status.textContent = error.message;}
  });
  $("#tenant-activate").addEventListener("click",async () => {
    try {
      const id = $("#tenant-select").value;
      await call(`/api/admin/tenants/${id}/status`,"PUT",{status:"active"});
      await refresh(current); status.textContent = "Tenant activated.";
    } catch (error) {status.textContent = error.message;}
  });
  return {refresh};
}
