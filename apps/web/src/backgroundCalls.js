export function setupBackgroundCalls({document,window,isSignedIn,wake,push}){
 const parent=document.getElementById('account');if(!parent)return;
 const panel=document.createElement('details');panel.id='background-calls-settings';panel.innerHTML=`<summary>Background incoming calls</summary><p>On Android, enable incoming-call notifications and allow background battery use. Stay signed in. Force-stopping the app prevents incoming notifications until you reopen it. A browser tab may be suspended; use the native app for background call notifications.</p><button type="button" data-enable>Enable / refresh background calls</button><button type="button" data-app>Open app notification settings</button><button type="button" data-battery>Open battery settings</button><p data-status role="status"></p>`;parent.prepend(panel);const $=s=>panel.querySelector(s);const plugin=()=>window.Capacitor?.Plugins?.NativePush;
 let generation=0,was=false;
 async function refresh(){const seq=++generation;if(!isSignedIn())return;try{const native=plugin();if(!native?.getBackgroundStatus){$('[data-status]').textContent='This app build has no native background-call status support. Use an updated Android app with Firebase configured.';return;}const s=await native.getBackgroundStatus();if(seq!==generation||!isSignedIn())return;$('[data-status]').textContent=`Notifications: ${s.notificationsEnabled?'allowed':'blocked'}. Battery optimization: ${s.batteryUnrestricted?'unrestricted':'enabled'}. Background activity: ${s.backgroundRestricted?'restricted':'allowed'}. Push delivery also requires server configuration and a registered device.`;}catch(e){if(seq===generation)$('[data-status]').textContent=e.message;}}
 $('[data-enable]').onclick=async()=>{if(!isSignedIn())return;await push.start();wake();await refresh();};
 for(const [key,page] of [['app','app'],['battery','battery']])$('[data-'+key+']').onclick=async()=>{try{await plugin()?.openBackgroundSettings?.({page});}catch(e){$('[data-status]').textContent=e.message;}};
 panel.ontoggle=()=>{if(panel.open)void refresh();};
 function resume(){if(!isSignedIn())return;wake();void push.start();if(panel.open)void refresh();}
 const visible=()=>{if(document.visibilityState==='visible')resume();};
 window.addEventListener('pageshow',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',visible);
 function visibility(){const signed=isSignedIn();if(panel.hidden===signed)panel.hidden=!signed;if(was&&!signed){generation++;panel.open=false;$('[data-status]').textContent='';}was=signed;}
 const observer=new window.MutationObserver(visibility);observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','hidden']});visibility();
 return {dispose(){generation++;observer.disconnect();window.removeEventListener('pageshow',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',visible);panel.remove();}};
}
