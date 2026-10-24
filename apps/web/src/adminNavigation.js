import {advancedTelecomGroups} from './advancedTelecomNavigation.js';
const admins=['admin','super_admin'];
const superOnly=['super_admin'];
export const adminNavigationGroups=[
 {label:'Overview & reports',roles:admins,items:[['admin','Overview & SIP server'],['telecom-features-admin','Telecom feature catalog'],['report-admin','Reports'],['cdr-admin','Call records']]},
 {label:'Users & access',roles:admins,items:[['system-admin-group','Admin group access',superOnly],['delegated-admin-panel','Admin workspace',['admin']],['group-admin','Users & groups'],['tenant-admin','Tenants & roles',superOnly],['user-session-admin','User sessions',superOnly],['navigation-policy-admin','End-user navigation',superOnly],['sip-profile-admin','SIP profile access',superOnly]]},
 {label:'SIP & carriers',roles:admins,items:[['trunk-super-admin','SIP trunks',superOnly],['carrier-console','Carriers & termination'],['native-console-admin','Native Community'],['switch-admin','Kamailio services'],['pbx-admin','PBX'],['inhouse-admin','DID inventory'],['carrier-admin','Carrier providers'],['provider-credentials-admin','Carrier credentials',superOnly],['carrier-adapter-admin','Carrier adapters',superOnly],['didww-admin','DIDWW API',superOnly],['nigeria-admin','Nigeria interconnect']]},
 {label:'Rates & billing',roles:admins,items:[['operator-admin','Wholesale tariffs'],['flowroute-rate-admin','Carrier rate deck'],['pricing-admin','Pricing'],['charging-admin','Charging operations'],['catalog-controls','Plans & access']]},
 {label:'Marketplace & payments',roles:admins,items:[['payment-admin','Marketplace dashboard'],['marketplace-stores-admin','Reseller stores & authorization'],['product-store-admin','Product catalog'],['marketplace-orders-admin','Orders & fulfillment'],['marketplace-plans-admin','Recommended plans'],['marketplace-gateways-admin','Payment gateways'],['marketplace-reconciliation-admin','Payment reconciliation'],['marketplace-stripe-admin','Stripe settings']]},
 {label:'Payments & wallets',roles:admins,items:[['wallet-providers-admin','Dwolla & Flutterwave API',superOnly]]},
 {label:'Security & integrations',roles:admins,items:[['auth-providers-admin','Authentication'],['ldap-admin','LDAP groups'],['passkey-policy-admin','Passkey requirements'],['geofence-admin','Geofencing'],['google-oauth-admin','Google Contacts OAuth',superOnly],['provider-webhook-admin','Provider callbacks',superOnly],['messaging-webhooks','Messaging webhooks']]},
 {label:'Appearance & communication',roles:admins,items:[['background-admin','Tenant appearance'],['locale-admin','Locale defaults'],['dashboard-admin','Dashboard defaults'],['campaign-admin','Campaigns & alerts'],['mobile-admin','App releases']]},
 {label:'System & operations',roles:admins,items:[['cluster-admin','API capacity'],['fleet-admin','Server & network operations']]},
 ...advancedTelecomGroups.map(group=>({...group,parent:'Operator'}))
];
export function syncAdminNavigation(nav,target){
 if(nav.dataset.groupedAdmin!=='true')return;
 let current;
 for(const link of nav.querySelectorAll('.menu-links>a')){
  const selected=link.hash===`#${target}`;
  if(selected){link.setAttribute('aria-current','page');current=link;}else link.removeAttribute('aria-current');
 }
 const crumb=nav.querySelector('.admin-location');
 if(current){for(let parent=current.parentElement;parent&&parent!==nav;parent=parent.parentElement){if(parent.tagName==='DETAILS')parent.open=true;}const operator=current.closest('.menu-parent');crumb.textContent=(operator?'Operator / ':'')+`${current.closest('details').querySelector('summary').textContent} / ${current.textContent}`;}
}
export function renderAdminNavigation({document,nav,role,target,allowed,logout}){
 nav.dataset.groupedAdmin='true';nav.setAttribute('aria-label','Administration navigation');
 const toggle=document.createElement('button');toggle.type='button';toggle.className='admin-menu-toggle';toggle.textContent='Administration menu';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','admin-menu-content');nav.append(toggle);
 const crumb=document.createElement('p');crumb.className='admin-location';crumb.setAttribute('aria-live','polite');nav.append(crumb);
 const content=document.createElement('div');content.id='admin-menu-content';content.className='admin-menu-content';nav.append(content);
 const search=document.createElement('input');search.type='search';search.className='menu-search';search.placeholder='Search admin menus…';search.setAttribute('aria-label','Search admin menus');content.append(search);
 const groups=document.createElement('div');groups.className='menu-groups';content.append(groups);
 const parents=new Map();
 for(const group of adminNavigationGroups){
  if(!group.roles.includes(role))continue;
  const items=group.items.filter(([id,,roles])=>(!roles||roles.includes(role))&&allowed(id)&&document.getElementById(id)&&!document.getElementById(id).closest('[hidden]'));
  if(!items.length)continue;
  const details=document.createElement('details');details.className='menu-group';details.open=items.some(([id])=>id===target)||group.label==='Overview & reports';
  const summary=document.createElement('summary');summary.textContent=group.label;details.append(summary);
  const links=document.createElement('div');links.className='menu-links';
  for(const [id,label] of items){const link=document.createElement('a');link.href=`/admin#${id}`;link.textContent=label;links.append(link);}
  details.append(links);
  let container=groups;
  if(group.parent){if(!parents.has(group.parent)){const parent=document.createElement('details');parent.className='menu-parent';const heading=document.createElement('summary');heading.textContent=group.parent;parent.append(heading);const children=document.createElement('div');children.className='operator-menu-groups';parent.append(children);groups.append(parent);parents.set(group.parent,{parent,children});}container=parents.get(group.parent).children;}
  container.append(details);
 }
 const empty=document.createElement('p');empty.className='menu-empty';empty.hidden=true;empty.textContent='No admin menus found.';empty.setAttribute('role','status');content.append(empty);
 const footer=document.createElement('div');footer.className='admin-nav-footer';const back=document.createElement('a');back.href='/#chat';back.textContent='Back to chats';const signout=document.createElement('button');signout.type='button';signout.className='nav-signout';signout.textContent='Sign out';signout.onclick=logout;footer.append(back,signout);content.append(footer);
 toggle.onclick=()=>{const open=nav.classList.toggle('admin-menu-open');toggle.setAttribute('aria-expanded',String(open));if(open)search.focus();};
 nav.onkeydown=event=>{if(event.key==='Escape'){nav.classList.remove('admin-menu-open');toggle.setAttribute('aria-expanded','false');toggle.focus();}};
 const openBeforeSearch=new Map();
 search.oninput=()=>{
  const query=search.value.trim().toLocaleLowerCase();let visible=0;
  for(const group of groups.querySelectorAll('.menu-group')){if(query&&!openBeforeSearch.has(group))openBeforeSearch.set(group,group.open);let count=0;const label=((group.closest('.menu-parent')?.querySelector('summary').textContent||'')+' '+group.querySelector('summary').textContent).toLocaleLowerCase();
   for(const link of group.querySelectorAll('a')){link.hidden=!!query&&!`${label} ${link.textContent}`.toLocaleLowerCase().includes(query);if(!link.hidden)count++;}
   group.hidden=!count;visible+=count;if(query&&count)group.open=true;else if(!query&&openBeforeSearch.has(group)){group.open=openBeforeSearch.get(group);openBeforeSearch.delete(group);}
  }for(const {parent,children} of parents.values()){if(query&&!openBeforeSearch.has(parent))openBeforeSearch.set(parent,parent.open);parent.hidden=![...children.children].some(child=>!child.hidden);if(query&&!parent.hidden)parent.open=true;else if(!query&&openBeforeSearch.has(parent)){parent.open=openBeforeSearch.get(parent);openBeforeSearch.delete(parent);}}empty.hidden=!query||visible>0;
 };
 nav.onclick=event=>{if(event.target.closest('.menu-links>a,.admin-nav-footer>a')){nav.classList.remove('admin-menu-open');toggle.setAttribute('aria-expanded','false');}};
 syncAdminNavigation(nav,target);
}
