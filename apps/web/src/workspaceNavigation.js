export function fragmentTarget(hash){
  try{return decodeURIComponent(hash.replace(/^#/,''));}catch{return null;}
}
export function setupWorkspaceNavigation({navigate,isSignedIn}){
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');
    if(!link||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||link.hasAttribute('download')||link.target==='_blank'||!isSignedIn())return;
    const url=new URL(link.href,location.href);
    if(url.origin!==location.origin||!(link.getAttribute('href').startsWith('#')||((url.pathname==='/'||url.pathname==='/admin')&&(url.hash||url.pathname==='/admin'))))return;
    const id=fragmentTarget(url.hash)||(url.pathname==='/admin'?'admin':null);
    if(!id)return;
    event.preventDefault();
    if(navigate(id)){if(!link.closest('[data-grouped-admin="true"]'))link.closest('#app-nav details')?.removeAttribute('open');}
  });
  function restore(){
    if(!isSignedIn())return;
    const formPage=/^\/(?:admin\/)?pages\//.test(location.pathname);
    if(formPage&&!location.hash)return;
    navigate(fragmentTarget(location.hash)||(location.pathname==='/admin'?'admin':'chat'),{historyMode:formPage?'replace':'none'});
  }
  window.addEventListener('hashchange',restore);
  window.addEventListener('popstate',restore);
  return {restore};
}
