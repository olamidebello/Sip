export function setupContactManagerLayout(document){
 const directory=document.getElementById('contact-directory');if(!directory)return;
 directory.querySelector('summary').textContent='Contacts';
 const nodes=[...directory.children].filter(n=>n.tagName!=='SUMMARY');
 const groups=new Map();
 for(const [key,label]of [['find','Find people'],['add','New contact'],['import','Import contacts'],['privacy','Privacy and forwarding']]){const details=document.createElement('details');details.className='contact-manager-group';details.dataset.contactGroup=key;const summary=document.createElement('summary');summary.textContent=label;details.append(summary);groups.set(key,details);}
 let importing=false;
 for(const node of nodes){
 if(node.id==='contact-directory-status')continue;
 if(node.id==='user-directory-search'||node.id==='user-directory-results')groups.get('find').append(node);
 else if(node.id==='contact-presence-settings'||node.id==='contact-settings-refresh')groups.get('privacy').append(node);
 else if(node.id==='add-contact')groups.get('add').append(node);
 else{if(node.tagName==='H3')importing=true;if(importing||node.classList.contains('bulk-controls'))groups.get('import').append(node);}
 }
 const shortcuts=document.createElement('nav');shortcuts.className='contact-manager-shortcuts';shortcuts.setAttribute('aria-label','Contact actions');
 function open(key){directory.open=true;for(const [id,group]of groups)group.open=id===key;groups.get(key).querySelector('input:not([type=checkbox]),button')?.focus();}
 for(const [key,label]of [['find','Find people'],['add','New contact'],['import','Import contacts']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>open(key);shortcuts.append(button);}
 directory.querySelector('summary').after(shortcuts);for(const group of groups.values())directory.append(group);groups.get('find').open=true;
 const search=directory.querySelector('#user-directory-search input');if(search){search.placeholder='Name, email or +country phone number';search.type='search';search.autocomplete='off';}
 const csv=document.getElementById('contacts-file')?.closest('.bulk-controls');if(csv){const advanced=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Import/export workspace contacts CSV';advanced.append(summary);csv.before(advanced);advanced.append(csv);}
 return {open};
}
