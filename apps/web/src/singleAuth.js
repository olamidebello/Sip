const loginAliases=new Set(['user-login','admin-login','super-admin-login','superadmin-login','ldap-login']);
export function canonicalAuthPage(id){return loginAliases.has(id)?'login':id;}
export function isAuthCompanion(page,form){return page==='login'&&form.id==='ldap-login'||form.dataset.authCompanion===page;}
export function setupSingleAuth(document){
 const login=document.getElementById('account-login-group'),directory=document.getElementById('account-directory-group');
 if(login&&directory){login.append(directory);directory.open=false;const label=directory.querySelector('summary');if(label)label.textContent='Organization directory (optional)';}
 const title=login?.querySelector(':scope > summary');if(title)title.textContent='Sign in';
 // Old form-group indexes can otherwise reintroduce another public sign-in entry.
 document.querySelectorAll('#account .section-index').forEach(nav=>nav.remove());
}
