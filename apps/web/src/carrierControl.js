export function setupCarrierControl(capacitor=window.Capacitor) {
  const control=document.querySelector("#carrier-control");
  if (!control || capacitor?.getPlatform?.()!=="android" || !capacitor.registerPlugin) return;
  const carrier=capacitor.registerPlugin("CarrierBrand");
  const status=document.querySelector("#carrier-status");
  const apply=document.querySelector("#carrier-apply");
  const clear=document.querySelector("#carrier-clear");
  control.hidden=false;
  async function refresh() {
    apply.hidden=true;clear.hidden=true;
    try {
      const result=await carrier.status();
      status.textContent=!result.supported?"This device has no supported SIM telephony.":result.authorized?"This APK has carrier authorization for the default SIM. Choose an action below.":"This APK is not authorized by the default SIM's carrier. No network settings can be changed.";
      apply.hidden=clear.hidden=!result.authorized;
    } catch { status.textContent="Carrier control is unavailable in this Android build."; }
  }
  document.querySelector("#carrier-check").onclick=refresh;
  async function change(method,success) {
    try { await carrier[method]();await refresh();status.textContent=success; }
    catch(error) { status.textContent=error?.message||"The carrier change was not applied."; }
  }
  apply.onclick=()=>change("setOlamideBrand","The device applied the Olamide carrier display name.");
  clear.onclick=()=>change("clearBrand","The carrier display name was restored.");
  refresh();
}
