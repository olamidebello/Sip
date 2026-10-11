// Contextual navigation uses existing panels and their role visibility.
const related={
  'didww-admin':['provider-credentials-admin','carrier-admin','provider-webhook-admin'],
  'provider-credentials-admin':['didww-admin','carrier-admin','tenant-admin'],
  'carrier-admin':['provider-credentials-admin','pbx-admin','carrier-adapter-admin','operator-admin'],
  'calling-workspace':['account','geo','admin','carrier-admin'],
  'product-store':['billing','support','product-store-admin'],
  'product-store-admin':['pricing-admin','catalog-controls','report-admin'],
  'billing':['account','payment-admin','pricing-admin'],
  'payment-admin':['billing','report-admin'],
  'external-sms':['messaging-webhooks','carrier-admin'],
  'switch-admin':['fleet-admin','carrier-adapter-admin','sip-profile-admin'],
  'fleet-admin':['cluster-admin','switch-admin'],
  'operator-admin':['carrier-admin','flowroute-rate-admin','pricing-admin'],
  'tenant-admin':['group-admin','sip-profile-admin'],
  'group-admin':['auth-providers-admin','sip-profile-admin'],
  'account':['auth-providers-admin','locale-settings','background-user'],
  'dashboard':['dashboard-admin','account'],
  'meetings':['account','support'],
  'planner':['campaign-inbox-panel','support'],
  'chat':['account','support']
};
export function setupConfigurationLinks({show}){
  function refresh(){
    const panels=[...document.querySelectorAll('section[id]')];
    for(const panel of panels){
      let nav=panel.querySelector(':scope > .configuration-links');
      if(panel.closest('[hidden]')){nav?.remove();continue;}
      const ids=[...new Set([...(related[panel.id]||['account','help','support']),'provider-credentials-admin','payment-admin','auth-providers-admin','activity-monitor'])];
      const targets=ids.map(id=>document.getElementById(id)).filter(target=>target&&target!==panel&&!target.closest('[hidden]'));
      if(!targets.length){nav?.remove();continue;}
      if(!nav){nav=document.createElement('nav');nav.className='configuration-links';nav.setAttribute('aria-label','Related settings and help');
        const heading=panel.querySelector(':scope > h2,:scope > h3,:scope > h4');if(!heading)continue;heading.after(nav);}
      nav.replaceChildren();
      for(const target of targets){
        const link=document.createElement('a');link.href='#'+target.id;
        const heading=target.querySelector('h2,h3,h4');link.textContent=heading?.textContent||target.id.replaceAll('-',' ');
        link.onclick=event=>{event.preventDefault();show(target.id);location.hash=target.id;
          const focus=target.querySelector('input:not([type="hidden"]),select,button,a');focus?.focus({preventScroll:true});};nav.append(link);
      }
    }
  }
  document.getElementById('didww-manage-config').onclick=()=>show('provider-credentials-admin');
  return {refresh};
}
