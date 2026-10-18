export const userNavigationGroups=[
 {label:'Chats & contacts',items:[['chat','Chats'],['contact-directory','Find & import contacts'],['messenger-groups','Groups & communities'],['messenger-updates','Status updates'],['messenger-broadcast','Broadcast lists'],['messenger-starred','Starred messages'],['external-sms','Text messages']]},
 {label:'Calls & meetings',items:[['calling-workspace','Calls & dialpad'],['meetings','Video meetings'],['outbound-rates','Calling rates'],['geo','Calling area'],['agent-panel','Call center']]},
 {label:'Money & services',items:[['money','Send & request money'],['billing','Plans, numbers & billing'],['dialplan-marketplace','Dial plan marketplace']]},
 {label:'Marketplace',items:[['product-store','Shop products & services'],['marketplace-my-orders','My orders & subscriptions']]},
 {label:'Social & daily tools',items:[['social','Social feed'],['dashboard','Dashboard'],['campaign-inbox-panel','Announcements'],['planner','Events & tasks'],['search-panel','Search']]},
 {label:'Account & preferences',items:[['messenger-settings','Messenger settings'],['account','Account & security'],['location-history-settings','Location history'],['contact-presence-settings','Privacy & presence'],['messenger-sessions','Linked devices'],['messenger-storage','Storage & data'],['locale-settings','Language, country & currency'],['background-user','Appearance'],['messenger-accessibility','Accessibility'],['activity-monitor','Activity monitor']]},
 {label:'Help & downloads',items:[['support','Support tickets'],['help','Help & tutorials'],['downloads','Download apps']]}
];
export function setupUserNavigation({document,nav,target}){
 const controller=new document.defaultView.AbortController(),signal=controller.signal;
 nav.dataset.groupedUser='true';
 const panel=document.createElement('div');panel.id='user-tools-panel';panel.className='user-tools-panel';panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label','Explore Olamide');
 const header=document.createElement('div');header.className='user-tools-heading';const title=document.createElement('strong');title.textContent='Explore Olamide';const close=document.createElement('button');close.type='button';close.textContent='Close';close.setAttribute('aria-label','Close navigation menu');header.append(title,close);panel.append(header);
 const nodes=[...nav.querySelectorAll(':scope>.menu-search,:scope>.menu-groups,:scope>.menu-empty,:scope>.nav-signout,:scope>.locale-menu')];for(const node of nodes)panel.append(node);
 nav.append(panel);const search=panel.querySelector('.menu-search');search.placeholder='Search menus…';search.setAttribute('aria-label','Search menus');
 let opener;
 function hide(restore=false){panel.hidden=true;nav.classList.remove('show-user-tools');if(opener)opener.setAttribute('aria-expanded','false');if(restore)opener?.focus();}
 function open(trigger){opener=trigger||nav.querySelector('.user-menu-trigger');panel.hidden=false;nav.classList.add('show-user-tools');opener?.setAttribute('aria-expanded','true');search.focus();}
 close.onclick=()=>hide(true);
 panel.addEventListener('click',event=>{if(event.target.closest('.menu-links a'))hide();},{signal});
 document.addEventListener('click',event=>{if(!panel.hidden&&!nav.contains(event.target))hide();},{signal});
 panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();hide(true);}},{signal});
 const filter=search.oninput;search.oninput=()=>{filter();const query=search.value.trim().toLocaleLowerCase();if(!query)return;for(const group of panel.querySelectorAll('.menu-groups>.menu-group'))if(group.querySelector('summary').textContent.toLocaleLowerCase().includes(query)){group.hidden=false;group.open=true;for(const link of group.querySelectorAll('a'))link.hidden=false;}panel.querySelector('.menu-empty').hidden=!!panel.querySelector('.menu-groups>.menu-group:not([hidden])');};
 for(const group of panel.querySelectorAll('.menu-groups>.menu-group')){group.open=!!group.querySelector(`a[href="/#${target}"]`);}
 return {open,close:hide,dispose(){controller.abort();panel.remove();}};
}
