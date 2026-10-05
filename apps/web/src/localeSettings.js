const $=id=>document.getElementById(id);
export function setupLocaleSettings({get,request}) {
  let catalog,epoch=0;
  function fill(formId,preference) {
    const form=$(formId);
    for(const [field,items] of [["language",catalog.languages],["country",catalog.countries],["currency",catalog.currencies]]) {
      const select=form.elements[field];
      if(!select.options.length) select.replaceChildren(...items.map(item=>new Option(`${item.name} (${item.code})`,item.code)));
      select.value=preference[field];
    }
  }
  async function refresh(admin=false) {
    const token=++epoch;
    const [data,options]=await Promise.all([get("/api/locales"),catalog?Promise.resolve(catalog):get("/api/locales/catalog")]);
    if(token!==epoch) return;
    catalog=options;
    $("locale-admin").hidden=!admin;
    fill("locale-user-form",data.effective);fill("locale-admin-form",data.tenant);
    document.documentElement.lang=data.effective.language;
    $("locale-status").textContent=`Active: ${data.effective.language}, ${data.effective.country}; preferred ${data.effective.currency}. Existing billing remains in its recorded currency.`;
  }
  const fields=form=>Object.fromEntries(new FormData(form));
  $("locale-user-form").onsubmit=async event=>{
    event.preventDefault();
    try {await request("/api/locales",fields(event.currentTarget),"PUT");await refresh(!$("admin").hidden);$("locale-status").textContent="Preferences saved. Existing billing remains in its recorded currency.";}
    catch(error){$("locale-status").textContent=error.message;}
  };
  $("locale-reset").onclick=async()=>{
    try {await request("/api/locales",{},"DELETE");await refresh(!$("admin").hidden);$("locale-status").textContent="Tenant defaults restored.";}
    catch(error){$("locale-status").textContent=error.message;}
  };
  $("locale-admin-form").onsubmit=async event=>{
    event.preventDefault();
    try {await request("/api/admin/locales",fields(event.currentTarget),"PUT");await refresh(true);$("locale-admin-status").textContent="Tenant defaults saved.";}
    catch(error){$("locale-admin-status").textContent=error.message;}
  };
  function clear() {++epoch;document.documentElement.lang="en";$("locale-status").textContent="";}
  return {refresh,clear};
}
