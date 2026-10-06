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
  function fillQuick(preference) {
    const form=$("quick-locale");if(!form) return;
    for(const field of ["language","currency"]) {
      const select=form.elements[field];
      select.replaceChildren(...catalog[field==="language"?"languages":"currencies"].map(item=>new Option(`${item.name} (${item.code})`,item.code)));
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
    fillQuick(data.effective);
    document.documentElement.lang=data.effective.language;
    $("locale-status").textContent=`Active: ${data.effective.language}, ${data.effective.country}; preferred ${data.effective.currency}. Existing billing remains in its recorded currency.`;
  }
  const fields=form=>Object.fromEntries(new FormData(form));
  $("locale-user-form").onsubmit=async event=>{
    event.preventDefault();
    try {await request("/api/locales",fields(event.currentTarget),"PUT");await refresh(!$("admin").hidden);$("locale-status").textContent="Preferences saved. Existing billing remains in its recorded currency.";}
    catch(error){$("locale-status").textContent=error.message;}
  };
  document.addEventListener("submit",async event=>{
    if(event.target.id!=="quick-locale") return;
    event.preventDefault();
    const form=event.target,status=$("quick-locale-status");
    const current=$("locale-user-form");
    try {
      await request("/api/locales",{language:form.elements.language.value,country:current.elements.country.value,currency:form.elements.currency.value},"PUT");
      await refresh(!$("admin").hidden);
      status.textContent="Preferences saved. Billing amounts retain their original currency.";
    } catch(error) {status.textContent=error.message;}
  });
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
