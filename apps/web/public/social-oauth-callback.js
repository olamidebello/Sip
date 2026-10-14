const params=new URLSearchParams(location.search);
const result={type:'sip-social-oauth',code:params.get('code'),state:params.get('state'),error:params.get('error')};
history.replaceState(null,'',location.pathname);
if(window.opener){window.opener.postMessage(result,location.origin);document.getElementById('status').textContent='Authorization returned. You can close this window.';}else document.getElementById('status').textContent='Return to Sip and connect again from Social.';
