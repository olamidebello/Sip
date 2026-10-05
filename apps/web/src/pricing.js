export function setupPricing() {
  const form=document.querySelector("#pricing-rule");
  const result=document.querySelector("#pricing-result");
  let rules=[];
  async function request(path,method="GET",body) {
    const response=await fetch(path,{method,credentials:"same-origin",
      headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
    const data=await response.json();
    if (!response.ok) throw new Error(data.error||"Pricing request failed");
    return data;
  }
  function selected() {
    const rule=rules.find(item=>item.provider===form.elements.provider.value);
    if (!rule) return;
    form.elements.mode.value=rule.mode;
    form.elements.setupValue.value=rule.setupValue;
    form.elements.monthlyValue.value=rule.monthlyValue;
  }
  async function refresh() {
    try {({rules}=await request("/api/admin/pricing"));selected();}
    catch(error) {result.textContent=error.message;}
  }
  form.elements.provider.onchange=selected;
  form.onsubmit=async(event)=>{
    event.preventDefault();
    try {
      const data=Object.fromEntries(new FormData(form));
      await request(`/api/admin/pricing/${data.provider}`,"PUT",{
        mode:data.mode,setupValue:Number(data.setupValue),monthlyValue:Number(data.monthlyValue)});
      await refresh();result.textContent=`${data.provider} rule saved for subsequent price calculations.`;
    } catch(error) {result.textContent=error.message;}
  };
  document.querySelector("#pricing-preview").onsubmit=async(event)=>{
    event.preventDefault();
    try {
      const rule={...Object.fromEntries(new FormData(form)),...Object.fromEntries(new FormData(event.currentTarget))};
      const calculated=await request("/api/admin/pricing/preview","POST",{
        mode:rule.mode,setupValue:Number(rule.setupValue),monthlyValue:Number(rule.monthlyValue),
        buySetup:Number(rule.buySetup),buyMonthly:Number(rule.buyMonthly)});
      result.textContent=`Preview ${rule.provider}: setup ${calculated.setupCents} cents, monthly ${calculated.monthlyCents} cents. Save the rule to apply it.`;
    } catch(error) {result.textContent=error.message;}
  };
  return {refresh};
}
