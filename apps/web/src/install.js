export function setupInstall() {
  const button=document.querySelector("#install-app");
  const status=document.querySelector("#install-help");
  let promptEvent;
  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
    status.textContent="Olamide is running as an installed app.";
  } else {
    status.textContent="On iPhone or iPad, use Safari Share → Add to Home Screen. On desktop or Android, use your browser's Install app menu if no button appears.";
  }
  window.addEventListener("beforeinstallprompt",event=>{
    event.preventDefault();promptEvent=event;button.hidden=false;
    status.textContent="Install Olamide for a standalone window and home-screen icon.";
  });
  button.onclick=async()=>{
    if (!promptEvent) return;
    const event=promptEvent;promptEvent=undefined;button.hidden=true;
    await event.prompt();
    const choice=await event.userChoice;
    status.textContent=choice.outcome==="accepted"?"Installation started.":"You can install later from your browser menu.";
  };
  window.addEventListener("appinstalled",()=>{button.hidden=true;status.textContent="Olamide installed.";});
  if ("serviceWorker" in navigator && window.isSecureContext)
    window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
}
