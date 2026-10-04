const presets=["midnight","ocean","aurora","sunrise","slate"];
const defaults={dayPreset:"ocean",nightPreset:"midnight",schedule:false,animate:false};

export function activePreset(config,hour) {
  if (!config || !presets.includes(config.dayPreset) || !presets.includes(config.nightPreset)) return "midnight";
  return config.schedule && (hour<6 || hour>=18)?config.nightPreset:config.dayPreset;
}

export function setupBackground() {
  const userForm=document.querySelector("#background-user-form");
  const adminForm=document.querySelector("#background-admin-form");
  const userStatus=document.querySelector("#background-user-status");
  const adminStatus=document.querySelector("#background-admin-status");
  let effective=defaults;
  let active=false;
  let generation=0;
  function apply() {
    if (!active) return;
    document.documentElement.dataset.background=activePreset(effective,new Date().getHours());
    document.documentElement.dataset.backgroundAnimated=effective.animate?"true":"false";
  }
  setInterval(apply,60000);
  async function request(path,method="GET",body) {
    const response=await fetch(path,{method,credentials:"same-origin",
      headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
    const data=await response.json();
    if (!response.ok) throw new Error(data.error||"Background request failed");
    return data;
  }
  function fill(form,config) {
    form.elements.dayPreset.value=config.dayPreset;
    form.elements.nightPreset.value=config.nightPreset;
    form.elements.schedule.checked=config.schedule;
    form.elements.animate.checked=config.animate;
  }
  function values(form) {return {
    dayPreset:form.elements.dayPreset.value,nightPreset:form.elements.nightPreset.value,
    schedule:form.elements.schedule.checked,animate:form.elements.animate.checked
  };}
  async function refresh(isAdmin=false) {
    active=true;
    const requestGeneration=++generation;
    try {
      const data=await request("/api/background");
      if (!active || requestGeneration!==generation) return;
      effective=data.effective;apply();fill(userForm,data.user||data.effective);
      userForm.querySelectorAll("select,input,button").forEach(element=>{element.disabled=!data.canOverride;});
      document.querySelector("#background-reset").disabled=!data.canOverride;
      userStatus.textContent=data.allowUserOverride?"Your background is saved to your account.":
        "The administrator has locked the tenant background.";
      document.querySelector("#background-admin").hidden=!isAdmin;
      if (isAdmin) {fill(adminForm,data.tenant);adminForm.elements.allowUserOverride.checked=data.allowUserOverride;}
    } catch(error) {userStatus.textContent=error.message;}
  }
  userForm.onsubmit=async(event)=>{
    event.preventDefault();
    try {
      const data=await request("/api/background","PUT",values(userForm));
      effective=data.effective;apply();userStatus.textContent="Personal background saved.";
    } catch(error) {userStatus.textContent=error.message;}
  };
  document.querySelector("#background-reset").onclick=async()=>{
    try {await request("/api/background","DELETE");await refresh(!document.querySelector("#background-admin").hidden);
      userStatus.textContent="Tenant background restored.";
    } catch(error) {userStatus.textContent=error.message;}
  };
  adminForm.onsubmit=async(event)=>{
    event.preventDefault();
    try {
      await request("/api/admin/background","PUT",{config:values(adminForm),
        allowUserOverride:adminForm.elements.allowUserOverride.checked});
      await refresh(true);adminStatus.textContent="Tenant background and user policy saved.";
    } catch(error) {adminStatus.textContent=error.message;}
  };
  return {refresh,clear(){generation++;active=false;effective=defaults;delete document.documentElement.dataset.background;
    delete document.documentElement.dataset.backgroundAnimated;
    document.querySelector("#background-admin").hidden=true;}};
}
