export const pagePath = (id,admin=false) => `${admin?'/admin':''}/pages/${encodeURIComponent(id)}`;

export function pageId(pathname) {
  const match = /^\/(?:admin\/)?pages\/([a-z][a-z0-9-]*)\/?$/.exec(pathname);
  return match?.[1] || null;
}

export function setupPageRoutes({ showWorkspace, isSignedIn, isAdminTarget=()=>false,canNavigate=()=>true }) {
  const forms = [...document.querySelectorAll('form[id]:not(#quick-locale)')];
  const index = new Map(forms.map(form => [form.id, form]));
  const auth = new Set(['signup', 'signup-verify', 'login', 'ldap-login']);
  const navigation = document.getElementById('app-nav');
  function refresh() {
    navigation.querySelectorAll('.page-links').forEach(list=>list.remove());
    for(const group of navigation.querySelectorAll('.menu-links')) {
      for(const sectionLink of group.querySelectorAll(':scope > a')) {
        const section=document.getElementById(sectionLink.hash.slice(1));
        if(!section)continue;
        const sectionForms=forms.filter(form=>form.closest('section[id]')===section&&!auth.has(form.id)&&!form.closest('[hidden]'));
        if(!sectionForms.length)continue;
        const list=document.createElement('div');list.className='page-links';
        for(const form of sectionForms){
          const link=document.createElement('a');link.href=pagePath(form.id,isAdminTarget(form.id));
          link.textContent=form.querySelector('h3,h4')?.textContent||form.querySelector('button[type=submit],button:not([type])')?.textContent||form.id.replaceAll('-',' ');
          if(pageId(location.pathname)===form.id)link.setAttribute('aria-current','page');
          list.append(link);
        }
        sectionLink.after(list);
      }
    }
  }
  refresh();
  function render() {
    const id = pageId(location.pathname);
    document.querySelectorAll('.page-route-hidden').forEach(node => node.classList.remove('page-route-hidden'));
    document.body.classList.remove('public-form-page');
    if (!id) { document.title='Olamide'; return; }
    const form = index.get(id);
    if (!form) { history.replaceState(null, '', isSignedIn()?'/#dashboard':pagePath('login')); if(isSignedIn())showWorkspace('dashboard',{historyMode:'none'}); return render(); }
    if (!isSignedIn() && !auth.has(id)) { history.replaceState(null, '', pagePath('login')); return render(); }
    if (isSignedIn() && form.closest('[hidden]')) { history.replaceState(null, '', '/#dashboard'); showWorkspace('dashboard',{historyMode:'none'}); return render(); }
    if(isAdminTarget(id)&&!location.pathname.startsWith('/admin/'))history.replaceState(null,'',pagePath(id,true));
    const section = form.closest('section[id]');
    if (!section) return;
    if(isSignedIn()&&!canNavigate(section.id)){history.replaceState(null,'','/#chat');showWorkspace('chat',{historyMode:'none'});return render();}
    if (isSignedIn()) showWorkspace(section.id,{preserveForm:true});
    else {
      document.body.classList.add('workspace-mode', 'public-form-page');
      document.getElementById('account')?.classList.remove('workspace-inactive');
    }
    for (const sibling of section.querySelectorAll('form[id]')) {
      if (sibling !== form) sibling.classList.add('page-route-hidden');
    }
    for (const group of section.querySelectorAll('details.form-group'))
      if (!group.contains(form)) group.classList.add('page-route-hidden');
    for (let parent = form.parentElement; parent && parent !== section; parent = parent.parentElement)
      if (parent.tagName === 'DETAILS') parent.open = true;
    for(const link of navigation.querySelectorAll('.page-links a')){
      if(pageId(new URL(link.href,location.href).pathname)===id)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    }
    document.title = `${form.querySelector('h3,h4')?.textContent || id.replaceAll('-', ' ')} · Olamide`;
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="/pages/"],a[href^="/admin/pages/"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const form=index.get(pageId(new URL(link.href,location.href).pathname));
    if(isSignedIn()&&(!form||form.closest('[hidden]')))return;
    history.pushState(null, '', link.href);
    render();
    window.scrollTo(0, 0);
  });
  window.addEventListener('popstate', render);
  render();
  return { render, refresh, go(id) { history.pushState(null, '', pagePath(id,isAdminTarget(id))); render(); window.scrollTo(0, 0); } };
}
