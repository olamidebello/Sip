const navigationHints = {
  dashboard:'Your account summary and saved views.',
  'campaign-inbox-panel':'Read announcements and acknowledge updates.',
  planner:'Schedule, park and share events or tasks.',
  'search-panel':'Find records visible to your account.',
  support:'Open tickets and follow replies.',
  help:'Guides, FAQs and support tools.',
  'calling-workspace':'Place calls and manage your active call.',
  geo:'Set or check the permitted calling area.',
  chat:'Send messages to other accounts.',
  'external-sms':'Send and review text messages.',
  'outbound-rates':'Check the price before calling.',
  meetings:'Create or join an online meeting.',
  'agent-panel':'Manage call center work.',
  billing:'Plans, wallet and number inventory.',
  'dialplan-marketplace':'Browse and publish dial plans.',
  account:'Profile, password and sign-in security.',
  'locale-settings':'Your language and currency preferences.',
  'background-user':'Personalize your workspace.',
  downloads:'Get available desktop and mobile apps.',
  admin:'Account and SIP server overview.',
  'group-admin':'Manage access groups and users.',
  'catalog-controls':'Control plans and feature access.',
  'inhouse-admin':'Manage owned DID number inventory.',
  'pricing-admin':'Configure plans and prices.',
  'pbx-admin':'Configure extensions and call policies.',
  'carrier-admin':'Stage provider profiles and trunk links; activation requires verification.',
  'operator-admin':'Tariffs, routing priorities and fraud blocks.',
  'switch-admin':'SIP domains, gateways and readiness checks.',
  'flowroute-rate-admin':'Import and review a carrier rate deck.',
  'messaging-webhooks':'Manage messaging callback settings.',
  'charging-admin':'Inspect charging and balances.',
  'payment-admin':'Configure payment provider settings.',
  'cluster-admin':'Review node capacity and scaling controls.',
  'report-admin':'View operational and account reports.',
  'live-calls-admin':'Monitor signed switch call events, timelines and investigation notes.',
  'cdr-admin':'Review call detail records.',
  'nigeria-admin':'Configure Nigerian network interconnect.',
  'ldap-admin':'Map directory groups to access.',
  'auth-providers-admin':'Configure sign-in providers.',
  'geofence-admin':'Manage calling location rules.',
  'background-admin':'Set tenant appearance defaults.',
  'locale-admin':'Set tenant language and currency defaults.',
  'dashboard-admin':'Publish default dashboard views.',
  'campaign-admin':'Manage announcements and campaigns.',
  'mobile-admin':'Review mobile release records.',
  'fleet-admin':'Inspect servers, jobs and network inventory.',
  'tenant-admin':'Manage tenants, roles and membership.',
  'sip-profile-admin':'Control who can manage SIP profiles.',
  'provider-webhook-admin':'Set provider callback endpoints.',
  'didww-admin':'Manage DIDWW account integration.',
  'carrier-adapter-admin':'Manage carrier provisioning adapters.'
};

const formHints = {
  'provider-credentials-form':'Store API credentials for inventory and account operations. These do not authenticate a SIP trunk.',
  'carrier-profile-form':'Link a carrier to a trunk and set routing intent. Save first, then verify the real SIP path before activation.',
  'flowroute-auto-form':'Create a draft Flowroute point of presence trunk. Confirm the endpoint assigned to your account.',
  'switch-config':'Set the tenant SIP domain and tariff. Saving this does not start Kamailio.',
  'switch-gateway-form':'Map an enabled carrier to a gateway name. Verify that the host configuration uses the same gateway.',
  'adapter-create':'Register a provisioning adapter target. Check health before enabling or assigning it.',
  'operator-quote-form':'Preview the ranked route and price. A quote does not prove the carrier will accept the call.',
  'server-config':'Set connection defaults shown to clients. Verify the endpoint before publishing it.',
  'sip-profile-create':'Save a SIP connection profile for authorized users. The endpoint must already be reachable.',
  'login':'Enter your assigned account credentials. Available menus follow your role and permissions.',
  'signup':'Create an account, then complete email verification to sign in.',
  'signup-verify':'Use the verification code sent to your email address.',
  'ldap-login':'Use the directory credentials supplied by your organization.',
  'support-create':'Describe the issue and include a useful way to reproduce it. Do not paste passwords.',
  'port-form':'Enter the full international number and review the porting details before submitting.',
  'flowroute-rate-import':'Upload a carrier rate CSV and review the effective prices before activation.'
};

const clean = value => String(value || '').replace(/\s+/g,' ').trim();
const adminGuide = id => /admin|carrier|switch|operator|cluster|fleet|pricing|charging|payment|ldap|webhook|didww|adapter|server/.test(id);

export function guideFor(id,form){
  const heading=clean(form?.querySelector(':scope > h2, :scope > h3, :scope > h4')?.textContent);
  const action=clean(form?.querySelector('button[type="submit"],button:not([type])')?.textContent);
  const title=heading||clean(form?.getAttribute('aria-label'))||id.replaceAll('-',' ');
  const description=formHints[id]||navigationHints[id]||'Review this page and its available controls before making changes.';
  const fields=form?[...form.querySelectorAll('input:not([type="hidden"]),select,textarea')]
    .map(input=>clean(input.closest('label')?.childNodes[0]?.textContent)).filter(Boolean).slice(0,8):[];
  return {title,description,fields,action,related:adminGuide(id)?'help-admin':'help-user'};
}

function addGuideControl(link,id){
  if(link.dataset.guideReady||!id||id==='help-context')return;
  link.dataset.guideReady='true';
  const guide=document.createElement('button');guide.type='button';guide.className='contextual-guide-link';
  guide.dataset.guideTarget=id;guide.textContent='Guide';
  guide.setAttribute('aria-label',`Open guide for ${clean(link.childNodes[0]?.textContent)||id.replaceAll('-',' ')}`);
  link.after(guide);
}

export function describeNavigation(nav) {
  for(const link of nav.querySelectorAll('.menu-links a[href^="#"]')) {
    const id=link.hash.slice(1),hint=navigationHints[id];
    if(!hint || link.querySelector('.nav-hint')) continue;
    const small=document.createElement('small');small.className='nav-hint';small.textContent=hint;
    link.append(small);
    link.title=hint;
  }
  for(const link of nav.querySelectorAll('a[href^="#"]'))addGuideControl(link,link.hash.slice(1));
  for(const link of nav.querySelectorAll('.page-links a[href^="/pages/"]')) {
    if(link.querySelector('.nav-hint')) continue;
    const id=decodeURIComponent(link.getAttribute('href').slice('/pages/'.length));
    const hint=formHints[id] || 'Open this form to review its fields and action.';
    const small=document.createElement('small');small.className='nav-hint';small.textContent=hint;
    link.append(small);link.title=hint;
  }
  for(const link of nav.querySelectorAll('.page-links a[href^="/pages/"]'))
    addGuideControl(link,decodeURIComponent(link.getAttribute('href').slice('/pages/'.length)));
  for(const group of nav.querySelectorAll('.menu-group')) {
    const summary=group.querySelector('summary');
    if(summary && !summary.title) summary.title=`Open ${clean(summary.textContent)} navigation`;
  }
}

function describeForm(form) {
  if(form.dataset.hintsReady) return;
  form.dataset.hintsReady='true';
  if(form.id==='quick-locale'){
    const guide=document.createElement('button');guide.type='button';guide.className='contextual-guide-link';
    guide.dataset.guideTarget=form.id;guide.textContent='Guide';form.append(guide);return;
  }
  const button=form.querySelector('button[type="submit"],button:not([type])');
  const action=clean(button?.textContent).replace(/[.!]+$/,'');
  const hint=formHints[form.id] ||
    (action ? `Review the fields, then choose “${action}”. Required fields are checked before submission.` :
      'Review the fields and required values before saving.');
  const p=document.createElement('p');p.className='form-hint';p.id=`${form.id}-hint`;p.textContent=hint;
  const guide=document.createElement('button');guide.type='button';guide.className='contextual-guide-link';
  guide.dataset.guideTarget=form.id;guide.textContent='Open form guide';p.append(' ',guide);
  const heading=form.querySelector(':scope > h2, :scope > h3, :scope > h4');
  if(heading) heading.after(p); else form.prepend(p);
  const prior=form.getAttribute('aria-describedby');
  form.setAttribute('aria-describedby',[prior,p.id].filter(Boolean).join(' '));
  for(const input of form.querySelectorAll('input,select,textarea')) {
    if(input.type==='hidden' || input.title || input.closest('label')?.querySelector('.field-hint')) continue;
    const label=input.closest('label');
    if(!label) continue;
    const name=clean(label.childNodes[0]?.textContent);
    let guidance='';
    if(input.type==='email') guidance='Use an email address you can access.';
    else if(input.type==='url') guidance='Include the protocol, such as https:// or wss://.';
    else if(input.type==='tel') guidance='Include the country code, such as +1.';
    else if(input.required) guidance='Required.';
    if(!guidance) continue;
    const small=document.createElement('small');small.className='field-hint';small.textContent=guidance;
    label.append(small);
    input.title=name?`${name}: ${guidance}`:guidance;
  }
}

export function setupUiHints(root=document,{openGuide}={}) {
  root.querySelectorAll('form[id]').forEach(describeForm);
  const nav=root.querySelector('#app-nav');if(nav) describeNavigation(nav);
  root.addEventListener('click',event=>{
    const button=event.target.closest?.('.contextual-guide-link[data-guide-target]');
    if(!button||!root.contains(button))return;
    openGuide?.(button.dataset.guideTarget);
  });
  const observer=new MutationObserver(records=>{
    for(const record of records) for(const node of record.addedNodes) {
      if(node.nodeType!==1) continue;
      if(node.matches?.('form[id]')) describeForm(node);
      node.querySelectorAll?.('form[id]').forEach(describeForm);
      if(node.closest?.('#app-nav') || node.id==='app-nav') describeNavigation(nav);
    }
  });
  observer.observe(root.body || root,{childList:true,subtree:true});
  return ()=>observer.disconnect();
}
