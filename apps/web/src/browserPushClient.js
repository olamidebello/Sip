export function createBrowserPushClient({request,onStatus,window:win=globalThis.window,document:doc=globalThis.document}) {
  let button,generation=0,active=false;
  const supported=()=>win?.isSecureContext&&win.navigator?.serviceWorker&&win.PushManager&&win.Notification;
  async function register(ask=false) {
    const current=generation;
    if(!active||!supported())return;
    const permission=ask?await win.Notification.requestPermission():win.Notification.permission;
    if(permission!=='granted') {
      if(ask)onStatus('Enable notifications in browser settings to receive incoming-call alerts.');
      return;
    }
    const config=await request('/api/native-push/web-config',undefined,'GET');
    if(!config.configured){onStatus('Browser incoming-call notifications are not configured.');return;}
    const registration=await win.navigator.serviceWorker.register('/sw.js');
    await win.navigator.serviceWorker.ready;
    if(current!==generation||!active)return;
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription) {
      const key=Uint8Array.from(win.atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
      subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    }
    if(current!==generation||!active)return;
    await request('/api/native-push/web-device',subscription.toJSON());
    if(current!==generation||!active) {
      await request('/api/native-push/web-device',subscription.toJSON(),'DELETE').catch(()=>{});
      return;
    }
    if(button){button.textContent='Incoming-call notifications enabled';button.disabled=true;}
    onStatus('Incoming-call notifications enabled. Tap an alert to reopen the softphone.');
  }
  return {
    async start() {
      active=true;
      if(!supported())return;
      if(!button) {
        button=doc.createElement('button');button.type='button';button.id='enable-browser-call-alerts';
        button.textContent='Enable incoming-call notifications';
        button.onclick=()=>{void register(true).catch(error=>onStatus(error.message));};
        doc.querySelector('#sip-account-status')?.insertAdjacentElement('afterend',button);
      }
      button.hidden=false;
      await register();
    },
    async stop() {
      active=false;generation++;if(button)button.hidden=true;
      // Server delivery is tied to the authenticated session and stops at logout.
    }
  };
}
